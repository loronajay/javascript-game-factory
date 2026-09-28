// One player's side of trading in the Market Square: finding invitations,
// following a table, building an offer and sending the moves. No DOM and no
// clock of its own — the api, the timers and the farm are injected, so the
// whole dance runs under node (js/tests/farm-trade-session.test.mjs). The page
// draws `snapshot()` through farm-trade-panel.mts whenever `onChange` fires.
//
// The server is the table (platform-api/src/db/farm-trades.mts); this is a
// view that polls it. While nobody is trading the session asks every few
// seconds whether someone has invited this player; while a table is live it
// follows that table every second. The player's own offer is a DRAFT: edits
// are sent a moment after the last one (so a row of + clicks is one offer, not
// ten), and until the server has the draft, the table shown keeps the draft
// rather than the server's older copy. A lock or a confirm first sends any
// unsent draft, then names the revision the server answered with, so a player
// is only ever held to the offer they were looking at.
import { emptyOffer, fitOfferToStock, isLive, normalizeTradeView, sameOffer, setOfferLine, tradeErrorWords, tradeStock, } from "./farm-trade.mjs";
/** How often a table being followed is re-read, and how often an idle player looks for invitations. */
export const FOLLOW_POLL_MS = 1000;
export const IDLE_POLL_MS = 3000;
/** How long after the last offer edit the draft goes to the server. */
export const DRAFT_SEND_MS = 350;
export function createTradeSession(deps) {
    let view = null;
    let draft = emptyOffer();
    /** The draft differs from what the server holds for this player. */
    let dirty = false;
    let sendTimer = null;
    let sendChain = Promise.resolve();
    let pollTimer = null;
    let running = false;
    /** Tables this player sat at (not merely was invited to). */
    const seenOpen = new Set();
    let busy = false;
    let message = "";
    /** Tables this player put away, or invitations they let pass: never shown again. */
    const dismissed = new Set();
    const changed = () => deps.onChange();
    function adopt(value, layout) {
        const next = normalizeTradeView(value);
        if (!next)
            return;
        if (dismissed.has(next.id))
            return;
        const newTable = next.id !== view?.id;
        view = next;
        if (layout)
            deps.onLayout(layout);
        if (next.status === "open")
            seenOpen.add(next.id);
        // An invitation withdrawn or lapsed before this player answered it simply goes away.
        if (!isLive(next) && !next.invitedByYou && !seenOpen.has(next.id)) {
            dismissed.add(next.id);
            view = null;
            return;
        }
        // The server's copy of this player's offer wins unless there are edits it has not seen yet.
        if (newTable || !dirty) {
            draft = next.you.offer;
            dirty = false;
        }
    }
    function schedulePoll() {
        if (pollTimer !== null)
            deps.timers.clear(pollTimer);
        pollTimer = null;
        if (!running)
            return;
        pollTimer = deps.timers.set(() => void poll(), isLive(view) ? FOLLOW_POLL_MS : IDLE_POLL_MS);
    }
    async function poll() {
        pollTimer = null;
        try {
            if (view && isLive(view)) {
                const before = `${view.status}:${view.revision}`;
                const result = await deps.api.fetchFarmTrade(view.id);
                if (result?.trade)
                    adopt(result.trade, result.layout);
                // A refusal's words last until the table moves on.
                if (view && `${view.status}:${view.revision}` !== before)
                    message = "";
            }
            else if (!view) {
                const result = await deps.api.fetchCurrentFarmTrade();
                if (result?.trade)
                    adopt(result.trade);
            }
        }
        catch {
            // The network blinked; the next poll asks again.
        }
        changed();
        schedulePoll();
    }
    async function act(action) {
        if (!view)
            return null;
        const result = await deps.api.actOnFarmTrade(view.id, action).catch(() => null);
        if (result?.trade)
            adopt(result.trade, result.layout);
        if (!result)
            message = tradeErrorWords("", view?.them.name);
        else if (!result.ok)
            message = tradeErrorWords(String(result.error ?? ""), view?.them.name);
        else
            message = "";
        return result;
    }
    async function withBusy(work) {
        if (busy)
            return;
        busy = true;
        changed();
        try {
            await work();
        }
        finally {
            busy = false;
            changed();
            schedulePoll();
        }
    }
    /** Send the draft now if the server has not seen it; resolves once the server has answered. */
    function flush() {
        if (sendTimer !== null)
            deps.timers.clear(sendTimer);
        sendTimer = null;
        sendChain = sendChain.then(async () => {
            if (!dirty || !view || view.status !== "open")
                return;
            const sent = draft;
            const result = await act({ type: "offer", offer: sent });
            if (result?.ok) {
                // Edits made while this one was in flight are still unsent.
                dirty = !sameOffer(draft, sent);
                if (!dirty)
                    draft = view.you.offer;
            }
            else if (result?.error === "not_enough") {
                draft = fitOfferToStock(draft, tradeStock(deps.farm()));
                dirty = !sameOffer(draft, view.you.offer);
            }
            else {
                draft = view.you.offer;
                dirty = false;
            }
            changed();
        });
        return sendChain;
    }
    return Object.freeze({
        start() {
            if (running)
                return;
            running = true;
            void poll();
        },
        stop() {
            running = false;
            if (pollTimer !== null)
                deps.timers.clear(pollTimer);
            if (sendTimer !== null)
                deps.timers.clear(sendTimer);
            pollTimer = null;
            sendTimer = null;
        },
        async invite(partnerId, name) {
            if (view && isLive(view)) {
                message = tradeErrorWords("already_trading");
                changed();
                return;
            }
            await withBusy(async () => {
                view = null;
                const result = await deps.api.inviteFarmTrade({ partnerId }).catch(() => null);
                if (result?.ok && result.trade) {
                    adopt(result.trade);
                    message = "";
                }
                else {
                    message = tradeErrorWords(String(result?.error ?? ""), name);
                }
            });
        },
        accept: () => withBusy(async () => { await act({ type: "accept" }); }),
        async decline() {
            await withBusy(async () => {
                await act({ type: "decline" });
                if (view)
                    dismissed.add(view.id);
                view = null;
            });
        },
        cancel: () => withBusy(async () => { await act({ type: "cancel" }); }),
        setLine(stack, id, count) {
            if (!view || view.status !== "open" || view.you.locked)
                return;
            const held = Number(tradeStock(deps.farm())[stack][id]) || 0;
            const next = setOfferLine(draft, stack, id, count, held);
            if (next === draft)
                return;
            draft = next;
            dirty = !sameOffer(draft, view.you.offer);
            changed();
            if (sendTimer !== null)
                deps.timers.clear(sendTimer);
            sendTimer = deps.timers.set(() => void flush(), DRAFT_SEND_MS);
        },
        lock: () => withBusy(async () => {
            await flush();
            if (view && !dirty)
                await act({ type: "lock", revision: view.revision });
        }),
        unlock: () => withBusy(async () => { await act({ type: "unlock" }); }),
        confirm: () => withBusy(async () => {
            if (view)
                await act({ type: "confirm", revision: view.revision });
        }),
        dismiss() {
            if (view && isLive(view))
                return;
            if (view)
                dismissed.add(view.id);
            view = null;
            draft = emptyOffer();
            dirty = false;
            message = "";
            changed();
            schedulePoll();
        },
        snapshot() {
            const invitation = view && view.status === "invited" && !view.invitedByYou ? view : null;
            return Object.freeze({
                view: invitation ? null : view,
                invitation,
                draft,
                sending: dirty,
                busy,
                message,
            });
        },
    });
}
