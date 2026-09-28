// Trading in the Market Square, on the page: the session that follows the
// table (farm-trade-session.mts) and the panel that draws it
// (farm-trade-panel.mts), assembled against the square's markup. Kept out of
// the market's composition root (farm-market.mts) like the Sawmill is, so the
// square only asks: is a table up, what does E/T/Y/N/Esc do, and what is the
// player doing for the presence line.
//
// Only an account farm can trade — the goods are the server's — so a
// signed-out visitor never polls and T on a person says why.
import { createTradeSession } from "./farm-trade-session.mjs";
import { createTradePanel } from "./farm-trade-panel.mjs";
import { isLive } from "./farm-trade.mjs";
function required(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Market Square is missing ${selector}`);
    return element;
}
export function createMarketTrading(deps) {
    let panel = null;
    // Fish on the table: the player's own creel, and a cache of every fish seen by id (theirs and the partner's).
    let creel = [];
    const known = new Map();
    const asking = new Set();
    const remember = (fish) => {
        if (!fish || typeof fish.id !== "string")
            return null;
        const entry = Object.freeze({ id: fish.id, speciesId: String(fish.speciesId), weightG: Number(fish.weightG) || 0, sizeClass: String(fish.sizeClass ?? "average"), variant: String(fish.variant ?? "normal"), locked: fish.locked === true });
        known.set(entry.id, entry);
        return entry;
    };
    async function loadCreel() {
        const answer = await deps.fishApi?.fetchFarmFishing().catch(() => null);
        if (!Array.isArray(answer?.creel))
            return;
        creel = answer.creel.map(remember).filter((fish) => Boolean(fish));
        panel?.render();
    }
    /** Fish on the partner's side the page has not seen yet: read them once, then draw them. */
    function lookUpTheirs() {
        const view = session.snapshot().view;
        const unknown = Object.keys(view?.them.offer.fish ?? {}).filter((id) => !known.has(id) && !asking.has(id));
        if (!unknown.length || !deps.fishApi)
            return;
        for (const id of unknown)
            asking.add(id);
        void deps.fishApi.fetchFarmFishDetails(unknown).then((answer) => {
            for (const fish of Array.isArray(answer?.fish) ? answer.fish : [])
                remember(fish);
            panel?.render();
        }).catch(() => undefined);
    }
    const session = createTradeSession({
        api: deps.api,
        timers: { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle) },
        farm: deps.farm,
        // A trade that landed moved fish too: read the creel again.
        onLayout: (layout) => { deps.takeStock(layout); void loadCreel(); },
        onChange: () => { lookUpTheirs(); panel?.render(); },
        creel: () => creel,
    });
    panel = createTradePanel({
        invite: required("#tradeInvite"),
        inviteText: required("#tradeInviteText"),
        acceptButton: required("#acceptTrade"),
        declineButton: required("#declineTrade"),
        root: required("#tradePanel"),
        title: required("#tradeTitle"),
        closeButton: required("#closeTrade"),
        yourState: required("#tradeYourState"),
        theirState: required("#tradeTheirState"),
        yourTitle: required("#tradeYourTitle"),
        theirTitle: required("#tradeTheirTitle"),
        stock: required("#tradeStock"),
        theirs: required("#tradeTheirs"),
        status: required("#tradeStatus"),
        lockButton: required("#lockTrade"),
        confirmButton: required("#confirmTrade"),
    }, { session, farm: deps.farm, thumbnail: deps.thumbnail, onClose: deps.onClose, creel: () => creel, fishDetail: (id) => known.get(id) ?? null });
    return Object.freeze({
        start: () => {
            if (!deps.canTrade)
                return;
            session.start();
            void loadCreel();
        },
        stop: () => session.stop(),
        invite(member) {
            if (!deps.canTrade)
                return "Sign in to trade — only an account farm's goods can change hands.";
            if (!member.playerId)
                return `${member.displayName} can't trade — they aren't signed in.`;
            void session.invite(member.playerId, member.displayName);
            return "";
        },
        isOpen: () => panel.isOpen(),
        escape: () => panel.escape(),
        answer: (yes) => panel.answer(yes),
        activity() {
            const view = session.snapshot().view;
            return view && isLive(view) ? "trading" : "";
        },
    });
}
