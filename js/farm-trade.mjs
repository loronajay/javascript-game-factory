// Player trading, in the browser: what this farm can put on the table, the
// offer being built, the table as the server last described it, and the words
// for every state and refusal. PURE — no DOM, no THREE, no storage, no fetch.
//
// Nothing here decides a trade. The server holds the table
// (platform-api/src/services/farm-trade-policy.mts): it checks every offer
// against the STORED farm, keeps the revision every lock and confirm must name,
// and runs the exchange. This module mirrors only what the page needs to show
// it — the tradeable stacks (platform-api/tests/farm-trades.test.mjs holds the
// two lists equal) and the shape of the server's view.
import { SELLABLE_DISHES, SELLABLE_FURNITURE, SELLABLE_PRODUCE } from "./farm-market-prices.mjs";
import { TIMBER_TREES } from "./farm-catalog/trees.mjs";
import { PLANK_SPECIES } from "./farm-catalog/carpentry.mjs";
import { furnitureShelf } from "./farm-workshop.mjs";
export const TRADE_STACKS = Object.freeze(["produce", "dishes", "logs", "planks", "furniture"]);
/** Distinct lines one side may put on the table (the server refuses more). */
export const MAX_TRADE_LINES = 12;
export const MAX_TRADE_QUANTITY = 99;
/** Every tradeable thing there is, in the order a list shows them: produce, dishes, logs, planks, furniture. */
export const TRADE_GOODS = Object.freeze([
    ...SELLABLE_PRODUCE.map((item) => Object.freeze({ stack: "produce", id: item.id, title: item.title, itemKey: item.itemKey })),
    ...SELLABLE_DISHES.map((item) => Object.freeze({ stack: "dishes", id: item.id, title: item.title, itemKey: item.itemKey })),
    ...TIMBER_TREES.map((species) => Object.freeze({ stack: "logs", id: species.id, title: `${species.title} logs`, itemKey: `log:${species.id}` })),
    ...PLANK_SPECIES.map((species) => Object.freeze({ stack: "planks", id: species.id, title: species.title, itemKey: `plank:${species.id}` })),
    ...SELLABLE_FURNITURE.map((item) => Object.freeze({ stack: "furniture", id: item.id, title: item.title, itemKey: item.itemKey })),
]);
export function findTradeGood(stack, id) {
    return TRADE_GOODS.find((good) => good.stack === stack && good.id === id);
}
export function emptyOffer() {
    return Object.freeze({ produce: {}, dishes: {}, logs: {}, planks: {}, furniture: {} });
}
/** What this farm can put on the table right now: the server-minted stacks, furniture off the SHELF only. */
export function tradeStock(layout) {
    const inventory = layout.agriculture.inventory;
    return Object.freeze({
        produce: inventory.produce,
        dishes: inventory.dishes,
        logs: inventory.logs,
        planks: inventory.planks,
        furniture: furnitureShelf(inventory.furniture, layout.decor),
    });
}
/** Everything this farm holds that could be offered, in list order. */
export function stockEntries(layout) {
    const stock = tradeStock(layout);
    return Object.freeze(TRADE_GOODS
        .map((good) => Object.freeze({ ...good, held: Math.max(0, Math.floor(Number(stock[good.stack][good.id]) || 0)) }))
        .filter((entry) => entry.held > 0));
}
export function offerCount(offer, stack, id) {
    return Math.max(0, Math.floor(Number(offer[stack]?.[id]) || 0));
}
export function offerLineCount(offer) {
    return TRADE_STACKS.reduce((sum, stack) => sum + Object.values(offer[stack] ?? {}).filter((count) => count > 0).length, 0);
}
export function offerIsEmpty(offer) {
    return offerLineCount(offer) === 0;
}
/**
 * The offer with one line set to `count`, clamped to what is held and to a
 * stack's 99; a new line past MAX_TRADE_LINES is not added. 0 removes the line.
 */
export function setOfferLine(offer, stack, id, count, held) {
    const clamped = Math.max(0, Math.min(Math.floor(count) || 0, Math.max(0, Math.floor(held)), MAX_TRADE_QUANTITY));
    const lines = { ...offer[stack] };
    const isNew = !(lines[id] > 0);
    if (clamped > 0 && isNew && offerLineCount(offer) >= MAX_TRADE_LINES)
        return offer;
    if (clamped > 0)
        lines[id] = clamped;
    else
        delete lines[id];
    return Object.freeze({ ...offer, [stack]: Object.freeze(lines) });
}
/** The offer trimmed to what the stock still holds (after a sale, or a trade that landed). */
export function fitOfferToStock(offer, stock) {
    let next = emptyOffer();
    for (const stack of TRADE_STACKS) {
        for (const [id, count] of Object.entries(offer[stack] ?? {})) {
            next = setOfferLine(next, stack, id, count, Number(stock[stack]?.[id]) || 0);
        }
    }
    return next;
}
export function sameOffer(left, right) {
    return TRADE_STACKS.every((stack) => {
        const a = Object.entries(left[stack] ?? {}).filter(([, count]) => count > 0);
        const b = Object.entries(right[stack] ?? {}).filter(([, count]) => count > 0);
        return a.length === b.length && a.every(([id, count]) => right[stack]?.[id] === count);
    });
}
/** An offer as a list to show, in list order. */
export function offerLines(offer) {
    return Object.freeze(TRADE_GOODS
        .filter((good) => offerCount(offer, good.stack, good.id) > 0)
        .map((good) => Object.freeze({ ...good, count: offerCount(offer, good.stack, good.id) })));
}
const STATUSES = ["invited", "open", "completed", "declined", "cancelled", "expired"];
function normalizeOffer(value) {
    const offer = {};
    for (const stack of TRADE_STACKS) {
        offer[stack] = {};
        for (const [id, count] of Object.entries(value?.[stack] ?? {})) {
            const whole = Math.floor(Number(count) || 0);
            if (whole > 0 && findTradeGood(stack, id))
                offer[stack][id] = Math.min(whole, MAX_TRADE_QUANTITY);
        }
    }
    return Object.freeze(offer);
}
function normalizeSide(value) {
    return Object.freeze({
        playerId: typeof value?.playerId === "string" ? value.playerId : "",
        name: typeof value?.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : "A farmer",
        offer: normalizeOffer(value?.offer),
        locked: value?.locked === true,
        confirmed: value?.confirmed === true,
    });
}
/** The server's view of a table made safe to render, or null. */
export function normalizeTradeView(value) {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || !STATUSES.includes(value.status))
        return null;
    return Object.freeze({
        id: value.id,
        status: value.status,
        revision: Math.max(0, Math.floor(Number(value.revision) || 0)),
        invitedByYou: value.invitedByYou === true,
        you: normalizeSide(value.you),
        them: normalizeSide(value.them),
        notice: typeof value.notice === "string" ? value.notice : "",
        endedByYou: value.endedByYou === true,
        expiresAt: Number(value.expiresAt) || 0,
    });
}
export function isLive(view) {
    return view?.status === "invited" || view?.status === "open";
}
export function tradeStage(view) {
    if (view.you.confirmed)
        return "confirmed";
    if (view.you.locked && view.them.locked)
        return "ready";
    if (view.you.locked)
        return "locked";
    return "editing";
}
/** Whether the confirm button can do anything: both locked, something on the table (a one-sided gift is fine), not already confirmed. */
export function canConfirm(view) {
    return view.status === "open" && view.you.locked && view.them.locked && !view.you.confirmed
        && !(offerIsEmpty(view.you.offer) && offerIsEmpty(view.them.offer));
}
/** One line under the table saying where it stands, from this player's side. */
export function tradeStatusLine(view) {
    const them = view.them.name;
    if (view.status === "open") {
        if (view.notice)
            return noticeWords(view.notice, them);
        if (view.you.confirmed && !view.them.confirmed)
            return `Confirmed. Waiting for ${them} to confirm…`;
        if (view.them.confirmed)
            return `${them} has confirmed. Confirm to make the trade.`;
        if (view.you.locked && view.them.locked) {
            if (offerIsEmpty(view.you.offer) && offerIsEmpty(view.them.offer))
                return "There's nothing on the table. Unlock to add something.";
            if (offerIsEmpty(view.them.offer))
                return `A gift to ${them}: you get nothing back. Confirm if that's what you mean.`;
            if (offerIsEmpty(view.you.offer))
                return `A gift from ${them}: you give nothing. Confirm to accept it.`;
            return "Both offers are locked. Check what you get, then confirm.";
        }
        if (view.you.locked)
            return `Your offer is locked. Waiting for ${them} to lock theirs…`;
        if (view.them.locked)
            return `${them} has locked their offer. Lock yours when you're happy.`;
        return "Put up what you'll trade, then lock your offer.";
    }
    if (view.status === "invited")
        return view.invitedByYou ? `Waiting for ${them} to answer…` : `${them} wants to trade.`;
    return endedWords(view);
}
export function endedWords(view) {
    const them = view.them.name;
    switch (view.status) {
        case "completed": return `Trade complete! You traded with ${them}.`;
        case "declined": return view.endedByYou ? "You turned the trade down." : `${them} turned down the trade.`;
        case "cancelled": return view.endedByYou ? "You walked away from the trade." : `${them} walked away from the trade.`;
        case "expired": return "The trade timed out.";
        default: return "";
    }
}
/** Why the table went back to open, in words. */
export function noticeWords(notice, them) {
    switch (notice) {
        case "offer_gone_you": return "Some of your offer is no longer in your basket, so nothing moved. Fix your offer and lock again.";
        case "offer_gone_them": return `Some of ${them}'s offer is no longer in their basket, so nothing moved. The table is open again.`;
        case "inventory_full_you": return "You can't hold that many — a stack of yours would pass 99. Nothing moved.";
        case "inventory_full_them": return `${them} can't hold that many — a stack of theirs would pass 99. Nothing moved.`;
        case "daily_limit": return "One of you has reached today's trading limit. Nothing moved.";
        case "farm_not_initialized": return "One of the farms isn't ready to trade. Nothing moved.";
        default: return "The table changed. Check both offers and lock again.";
    }
}
/** A refusal from the server, in words. */
export function tradeErrorWords(error, them = "They") {
    switch (error) {
        case "already_trading": return "You're already at a trading table.";
        case "partner_busy": return `${them} is already trading with someone.`;
        case "partner_unavailable": return `${them} can't trade — they need a signed-in account farm.`;
        case "self_trade": return "You can't trade with yourself.";
        case "too_many_invites": return "You've sent a lot of trade requests. Wait a few minutes.";
        case "daily_limit": return "You've reached today's trading limit.";
        case "farm_not_initialized": return "Settle into your farm first — name your dog and step onto the field.";
        case "not_enough": return "You don't have that many — your offer was set back to what you hold.";
        case "stale_revision": return "The table changed while you were looking. Check both offers again.";
        case "empty_offer": return "There's nothing on the table yet.";
        case "too_many_changes": return "This table has changed too many times. Start a new trade.";
        case "trade_expired": return "The trade timed out.";
        case "not_found": return "That trade is gone.";
        default: return error.startsWith("offer_gone") || error.startsWith("inventory_full") ? noticeWords(error, them) : "The trade couldn't be reached. Try again in a moment.";
    }
}
