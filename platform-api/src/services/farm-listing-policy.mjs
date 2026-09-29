// The Market Square's Exchange Board: player listings for tickets, the rules.
// PURE — no SQL, no clock of its own, no random. The database layer
// (db/farm-listings.mts) loads rows, hands them here with the time, and writes
// back what comes out.
//
// A player puts goods up at a ticket price per unit and anyone else in the
// square may buy some or all of them outright. The plan (§7.1) held this back
// behind barter because tickets crossing between players invite laundering
// (an alt "sells" a turnip for a thousand tickets), alt-account farming and
// exploit amplification.
//
// PLAYERS SET THE PRICE (owner, 2026-09-29): between people, the market decides
// what a thing is worth — a prize-bred cow is not a Dealer calf — so a listing
// asks any whole number of tickets from 1 up to MAX_LISTING_UNIT_PRICE. What
// the Market's own counters would pay (`listingStandingValue`) is offered to the
// seller as a guide and never enforced; NPC prices are untouched. The 0.5–1.5×
// band that used to stand here was the laundering guard; with it gone, the
// daily caps below ARE that guard — at most one day's cap, less the burned
// tenth, can move between two accounts. These are the guards that remain:
//
//   - A FEE: a tenth of every sale (rounded up) is kept by the Market — burned,
//     never paid to anyone — so churning tickets through listings shrinks them.
//   - ESCROW: listed goods leave the seller's farm when the listing goes up
//     and come back only when it is taken down or runs out, so nothing is sold
//     twice and a stale save can never resurrect them (every tradeable stack is
//     one a save cannot raise).
//   - CAPS, per UTC day: tickets earned from listings, tickets spent on them,
//     purchases made, and listings put up; and a cap on listings open at once.
//   - Nobody buys their own listing.
//
// Only what the server mints can be listed — the stacks that can be traded
// (services/farm-trade-policy): produce at any grade, dishes, logs, planks,
// furniture off the shelf, and the single-row goods — a live animal (Phase 6
// of the livestock plan) or a fish from the Cove's creel — one to a listing,
// each waiting on the board as its own `listed` row
// (db/farm-livestock-transfer.mts, db/farm-fish-listing.mts).
import { farmSalePrice } from "./farm-market-catalog.mjs";
import { farmLogValue, farmPlankValue } from "./farm-carpentry-catalog.mjs";
import { tradeableItem } from "./farm-trade-policy.mjs";
import { farmLivestockRule } from "./farm-livestock-catalog.mjs";
/** The stacks the board takes: every stack the table takes. */
export const LISTING_STACKS = Object.freeze(["produce", "dishes", "logs", "planks", "furniture", "fish", "livestock"]);
/** The stacks whose listings are one row each, escrowed as the row itself rather than a count off the farm document. */
export const SINGLE_ROW_LISTING_STACKS = Object.freeze(["fish", "livestock"]);
/** What the Market keeps of every sale, rounded up to a whole ticket. */
export const LISTING_FEE_RATE = 0.1;
/** The highest price one unit may ask: a day's spending cap, so nothing is listed that no one could buy. */
export const MAX_LISTING_UNIT_PRICE = 10_000;
/** A listing comes down (and its goods go home) after three days. */
export const LISTING_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const MAX_LISTING_QUANTITY = 99;
/** Listings one seller may have up at once. */
export const MAX_OPEN_LISTINGS = 8;
/** Per UTC day. */
export const DAILY_LISTINGS_CREATED = 20;
export const DAILY_LISTING_PURCHASES = 30;
/** Big enough for a top-grade animal in one sale; still the bound on what moves between two accounts in a day. */
export const DAILY_LISTING_EARN_LIMIT = 10_000;
export const DAILY_LISTING_SPEND_LIMIT = 10_000;
/** The newest open listings the board shows. */
export const BOARD_PAGE = 60;
export const LISTING_ID = /^listing-[A-Za-z0-9-]{8,64}$/;
export const LISTING_PURCHASE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
export function listingDayStart(now) {
    return Math.floor(now / DAY_MS) * DAY_MS;
}
/**
 * A good's standing value in tickets, as a GUIDE for the seller: what the
 * Market's counters pay for one on a Normal day (the Produce Merchant by
 * grade, the Kitchen, the Sawmill), and for logs and planks the wood's derived
 * worth. An animal's guide is what the Livestock Dealer asks for a young one
 * of its species (`speciesId`). 0 where there is no guide. Never a limit.
 */
export function listingStandingValue(stack, itemId, speciesId = "") {
    if (!tradeableItem(stack, itemId))
        return 0;
    switch (stack) {
        case "logs": return farmLogValue(itemId);
        case "planks": return farmPlankValue(itemId);
        case "livestock": return farmLivestockRule(speciesId)?.price ?? 0;
        case "fish": return 0;
        default: return farmSalePrice(itemId);
    }
}
/** What the Market keeps of a sale of `total` tickets. */
export function listingFee(total) {
    return Math.ceil(total * LISTING_FEE_RATE);
}
/** A request to list, made safe; the error names what is wrong with it. */
export function normalizeListingRequest(value) {
    if (!value || typeof value !== "object")
        return { ok: false, error: "invalid_listing" };
    const input = value;
    const stack = input.stack;
    const itemId = typeof input.itemId === "string" ? input.itemId : "";
    if (!LISTING_STACKS.includes(stack) || !tradeableItem(stack, itemId))
        return { ok: false, error: "not_listable" };
    const quantity = Number(input.quantity);
    const unitPrice = Number(input.unitPrice);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LISTING_QUANTITY)
        return { ok: false, error: "invalid_quantity" };
    // An animal or a fish is one of its kind: one to a listing.
    if (SINGLE_ROW_LISTING_STACKS.includes(stack) && quantity !== 1)
        return { ok: false, error: "invalid_quantity" };
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 1 || unitPrice > MAX_LISTING_UNIT_PRICE)
        return { ok: false, error: "invalid_price" };
    return { ok: true, request: Object.freeze({ stack, itemId, quantity, unitPrice }) };
}
/** A stored row made safe, or null. An open listing past its time reads as expired. */
export function normalizeListingRow(row, now) {
    if (!row || typeof row !== "object")
        return null;
    const stack = row.stack;
    const id = String(row.listing_id ?? row.id ?? "");
    if (!LISTING_ID.test(id) || !LISTING_STACKS.includes(stack))
        return null;
    const status = ["open", "sold", "withdrawn", "expired"].find((entry) => entry === row.status) ?? "withdrawn";
    const expiresAt = new Date(row.expires_at ?? row.expiresAt ?? 0).getTime();
    return Object.freeze({
        id,
        sellerId: String(row.seller_id ?? row.sellerId ?? ""),
        sellerName: String(row.seller_name ?? row.sellerName ?? "").slice(0, 40) || "A farmer",
        stack,
        itemId: String(row.item_id ?? row.itemId ?? ""),
        quantity: Math.max(0, Math.floor(Number(row.quantity) || 0)),
        listedQuantity: Math.max(0, Math.floor(Number(row.listed_quantity ?? row.listedQuantity) || 0)),
        unitPrice: Math.max(0, Math.floor(Number(row.unit_price ?? row.unitPrice) || 0)),
        status: status === "open" && Number.isFinite(expiresAt) && expiresAt <= now ? "expired" : status,
        createdAt: new Date(row.created_at ?? row.createdAt ?? 0).getTime(),
        expiresAt,
    });
}
/** A listing as any viewer sees it: never who the seller is by id, only by name, plus whether it is the viewer's own. An animal's or a fish's listing carries its card. */
export function listingView(listing, viewerId, card = null) {
    return Object.freeze({
        ...(listing.stack === "livestock" && card ? { animal: card } : {}),
        ...(listing.stack === "fish" && card ? { fish: card } : {}),
        id: listing.id,
        sellerName: listing.sellerName,
        mine: listing.sellerId === viewerId,
        stack: listing.stack,
        itemId: listing.itemId,
        quantity: listing.quantity,
        listedQuantity: listing.listedQuantity,
        unitPrice: listing.unitPrice,
        status: listing.status,
        expiresAt: listing.expiresAt,
    });
}
/** Whether this purchase may go ahead and what it moves, or why not. */
export function checkListingPurchase(check) {
    const { listing, buyerId, quantity } = check;
    if (listing.status !== "open")
        return { ok: false, error: listing.status === "expired" ? "listing_expired" : "listing_closed" };
    if (listing.sellerId === buyerId)
        return { ok: false, error: "own_listing" };
    if (!Number.isSafeInteger(quantity) || quantity < 1)
        return { ok: false, error: "invalid_quantity" };
    if (quantity > listing.quantity)
        return { ok: false, error: "not_enough_listed" };
    const total = listing.unitPrice * quantity;
    const fee = listingFee(total);
    const proceeds = total - fee;
    if (check.buyerPurchasesToday >= DAILY_LISTING_PURCHASES)
        return { ok: false, error: "daily_purchase_limit" };
    if (check.buyerSpentToday + total > DAILY_LISTING_SPEND_LIMIT)
        return { ok: false, error: "daily_spend_limit" };
    if (check.sellerEarnedToday + proceeds > DAILY_LISTING_EARN_LIMIT)
        return { ok: false, error: "seller_daily_limit" };
    return { ok: true, terms: Object.freeze({ total, fee, proceeds }) };
}
/** A stack's goods off a farm inventory (for escrow), or null when it does not hold them. `shelf` is furniture not standing on the field. */
export function takeListedGoods(inventory, shelf, stack, itemId, quantity) {
    const held = stack === "furniture" ? Number(shelf[itemId]) || 0 : Number(inventory?.[stack]?.[itemId]) || 0;
    if (held < quantity)
        return null;
    return { ...inventory, [stack]: { ...(inventory?.[stack] ?? {}), [itemId]: (Number(inventory?.[stack]?.[itemId]) || 0) - quantity } };
}
/** A stack's goods onto a farm inventory, or null when the stack would pass 99. */
export function addListedGoods(inventory, stack, itemId, quantity) {
    const next = (Number(inventory?.[stack]?.[itemId]) || 0) + quantity;
    if (next > MAX_LISTING_QUANTITY)
        return null;
    return { ...inventory, [stack]: { ...(inventory?.[stack] ?? {}), [itemId]: next } };
}
