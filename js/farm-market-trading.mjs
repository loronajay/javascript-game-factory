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
    const session = createTradeSession({
        api: deps.api,
        timers: { set: (run, ms) => setTimeout(run, ms), clear: (handle) => clearTimeout(handle) },
        farm: deps.farm,
        onLayout: deps.takeStock,
        onChange: () => panel?.render(),
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
    }, { session, farm: deps.farm, thumbnail: deps.thumbnail, onClose: deps.onClose });
    return Object.freeze({
        start: () => { if (deps.canTrade)
            session.start(); },
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
