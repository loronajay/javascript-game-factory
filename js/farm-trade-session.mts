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

import {
  emptyOffer,
  fitOfferToStock,
  isLive,
  normalizeTradeView,
  sameOffer,
  setOfferLine,
  tradeErrorWords,
  tradeStock,
  type TradeAnimal,
  type TradeFish,
  type TradeOffer,
  type TradeStack,
  type TradeView,
} from "./farm-trade.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

export type TradeApi = Readonly<{
  inviteFarmTrade: (input: { partnerId: string }) => Promise<any>;
  fetchCurrentFarmTrade: () => Promise<any>;
  fetchFarmTrade: (tradeId: string) => Promise<any>;
  actOnFarmTrade: (tradeId: string, action: Record<string, unknown>) => Promise<any>;
}>;

export type TradeTimers = Readonly<{
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}>;

export type TradeSessionDeps = Readonly<{
  api: TradeApi;
  timers: TradeTimers;
  /** The player's farm as the page last had it from the server. */
  farm: () => FarmLayout;
  /** The server answered with the farm as it now stands (a trade landed). */
  onLayout: (layout: unknown) => void;
  onChange: () => void;
  /** The fish in the player's creel (farm-trade.mts `TradeFish`); none when absent. */
  creel?: () => readonly TradeFish[];
  /** The animals in the player's herd, as cards; none when absent. */
  herd?: () => readonly TradeAnimal[];
}>;

/** How often a table being followed is re-read, and how often an idle player looks for invitations. */
export const FOLLOW_POLL_MS = 1000;
export const IDLE_POLL_MS = 3000;
/** How long after the last offer edit the draft goes to the server. */
export const DRAFT_SEND_MS = 350;

export type TradeSnapshot = Readonly<{
  /** The table this player is at (live or just ended and not yet dismissed), or null. */
  view: TradeView | null;
  /** An invitation waiting on this player's answer: the page shows it as a toast, not the table. */
  invitation: TradeView | null;
  /** This player's offer as they are building it: what the table shows on their side. */
  draft: TradeOffer;
  /** Whether the draft has not reached the server yet. */
  sending: boolean;
  busy: boolean;
  message: string;
}>;

export type TradeSession = Readonly<{
  start: () => void;
  stop: () => void;
  invite: (partnerId: string, name: string) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  cancel: () => Promise<void>;
  setLine: (stack: TradeStack, id: string, count: number) => void;
  lock: () => Promise<void>;
  unlock: () => Promise<void>;
  confirm: () => Promise<void>;
  /** Put away a table that has ended. */
  dismiss: () => void;
  snapshot: () => TradeSnapshot;
}>;

export function createTradeSession(deps: TradeSessionDeps): TradeSession {
  let view: TradeView | null = null;
  let draft: TradeOffer = emptyOffer();
  /** The draft differs from what the server holds for this player. */
  let dirty = false;
  let sendTimer: unknown = null;
  let sendChain: Promise<void> = Promise.resolve();
  let pollTimer: unknown = null;
  let running = false;
  /** Tables this player sat at (not merely was invited to). */
  const seenOpen = new Set<string>();
  let busy = false;
  let message = "";
  /** Tables this player put away, or invitations they let pass: never shown again. */
  const dismissed = new Set<string>();

  const changed = (): void => deps.onChange();

  function adopt(value: unknown, layout?: unknown): void {
    const next = normalizeTradeView(value);
    if (!next) return;
    if (dismissed.has(next.id)) return;
    const newTable = next.id !== view?.id;
    view = next;
    if (layout) deps.onLayout(layout);
    if (next.status === "open") seenOpen.add(next.id);
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

  function schedulePoll(): void {
    if (pollTimer !== null) deps.timers.clear(pollTimer);
    pollTimer = null;
    if (!running) return;
    pollTimer = deps.timers.set(() => void poll(), isLive(view) ? FOLLOW_POLL_MS : IDLE_POLL_MS);
  }

  async function poll(): Promise<void> {
    pollTimer = null;
    try {
      if (view && isLive(view)) {
        const before = `${view.status}:${view.revision}`;
        const result = await deps.api.fetchFarmTrade(view.id);
        if (result?.trade) adopt(result.trade, result.layout);
        // A refusal's words last until the table moves on.
        if (view && `${view.status}:${view.revision}` !== before) message = "";
      } else if (!view) {
        const result = await deps.api.fetchCurrentFarmTrade();
        if (result?.trade) adopt(result.trade);
      }
    } catch {
      // The network blinked; the next poll asks again.
    }
    changed();
    schedulePoll();
  }

  async function act(action: Record<string, unknown>): Promise<any> {
    if (!view) return null;
    const result = await deps.api.actOnFarmTrade(view.id, action).catch(() => null);
    if (result?.trade) adopt(result.trade, result.layout);
    if (!result) message = tradeErrorWords("", view?.them.name);
    else if (!result.ok) message = tradeErrorWords(String(result.error ?? ""), view?.them.name);
    else message = "";
    return result;
  }

  async function withBusy(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    changed();
    try {
      await work();
    } finally {
      busy = false;
      changed();
      schedulePoll();
    }
  }

  /** Send the draft now if the server has not seen it; resolves once the server has answered. */
  function flush(): Promise<void> {
    if (sendTimer !== null) deps.timers.clear(sendTimer);
    sendTimer = null;
    sendChain = sendChain.then(async () => {
      if (!dirty || !view || view.status !== "open") return;
      const sent = draft;
      const result = await act({ type: "offer", offer: sent });
      if (result?.ok) {
        // Edits made while this one was in flight are still unsent.
        dirty = !sameOffer(draft, sent);
        if (!dirty) draft = view!.you.offer;
      } else if (result?.error === "not_enough") {
        draft = fitOfferToStock(draft, tradeStock(deps.farm(), deps.creel?.() ?? [], deps.herd?.() ?? []));
        dirty = !sameOffer(draft, view!.you.offer);
      } else {
        draft = view!.you.offer;
        dirty = false;
      }
      changed();
    });
    return sendChain;
  }

  return Object.freeze({
    start(): void {
      if (running) return;
      running = true;
      void poll();
    },
    stop(): void {
      running = false;
      if (pollTimer !== null) deps.timers.clear(pollTimer);
      if (sendTimer !== null) deps.timers.clear(sendTimer);
      pollTimer = null;
      sendTimer = null;
    },
    async invite(partnerId: string, name: string): Promise<void> {
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
        } else {
          message = tradeErrorWords(String(result?.error ?? ""), name);
        }
      });
    },
    accept: () => withBusy(async () => { await act({ type: "accept" }); }),
    async decline(): Promise<void> {
      await withBusy(async () => {
        await act({ type: "decline" });
        if (view) dismissed.add(view.id);
        view = null;
      });
    },
    cancel: () => withBusy(async () => { await act({ type: "cancel" }); }),
    setLine(stack, id, count): void {
      if (!view || view.status !== "open" || view.you.locked) return;
      const held = Number(tradeStock(deps.farm(), deps.creel?.() ?? [], deps.herd?.() ?? [])[stack][id]) || 0;
      const next = setOfferLine(draft, stack, id, count, held);
      if (next === draft) return;
      draft = next;
      dirty = !sameOffer(draft, view.you.offer);
      changed();
      if (sendTimer !== null) deps.timers.clear(sendTimer);
      sendTimer = deps.timers.set(() => void flush(), DRAFT_SEND_MS);
    },
    lock: () => withBusy(async () => {
      await flush();
      if (view && !dirty) await act({ type: "lock", revision: view.revision });
    }),
    unlock: () => withBusy(async () => { await act({ type: "unlock" }); }),
    confirm: () => withBusy(async () => {
      if (view) await act({ type: "confirm", revision: view.revision });
    }),
    dismiss(): void {
      if (view && isLive(view)) return;
      if (view) dismissed.add(view.id);
      view = null;
      draft = emptyOffer();
      dirty = false;
      message = "";
      changed();
      schedulePoll();
    },
    snapshot(): TradeSnapshot {
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
