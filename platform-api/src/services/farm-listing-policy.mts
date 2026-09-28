// The Market Square's Exchange Board: player listings for tickets, the rules.
// PURE — no SQL, no clock of its own, no random. The database layer
// (db/farm-listings.mts) loads rows, hands them here with the time, and writes
// back what comes out.
//
// A player puts goods up at a ticket price per unit and anyone else in the
// square may buy some or all of them outright. The plan (§7.1) held this back
// behind barter because tickets crossing between players invite laundering
// (an alt "sells" a turnip for a thousand tickets), alt-account farming and
// exploit amplification. These are the guards, and each answers one of those:
//
//   - A PRICE BAND around the good's standing value (what the Market's own
//     counters would pay for it on a Normal day). A listing may ask between
//     half and one and a half times that value, so the most tickets one
//     listing can carry beyond the goods' worth is half their worth — moving
//     a wallet between accounts costs the goods to carry it, and the buyer
//     gets goods the merchant would take back for less than they paid.
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
// Only what the server mints can be listed — the same stacks that can be
// traded (services/farm-trade-policy): produce at any grade, dishes, logs,
// planks and furniture off the shelf.

import { farmSalePrice } from "./farm-market-catalog.mjs";
import { farmLogValue, farmPlankValue } from "./farm-carpentry-catalog.mjs";
import { TRADE_STACKS, tradeableItem, type TradeStack } from "./farm-trade-policy.mjs";

/** What the Market keeps of every sale, rounded up to a whole ticket. */
export const LISTING_FEE_RATE = 0.1;
/** The price band around a good's standing value. */
export const LISTING_PRICE_FLOOR = 0.5;
export const LISTING_PRICE_CEILING = 1.5;
/** A listing comes down (and its goods go home) after three days. */
export const LISTING_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const MAX_LISTING_QUANTITY = 99;
/** Listings one seller may have up at once. */
export const MAX_OPEN_LISTINGS = 8;
/** Per UTC day. */
export const DAILY_LISTINGS_CREATED = 20;
export const DAILY_LISTING_PURCHASES = 30;
export const DAILY_LISTING_EARN_LIMIT = 3000;
export const DAILY_LISTING_SPEND_LIMIT = 3000;
/** The newest open listings the board shows. */
export const BOARD_PAGE = 60;

export const LISTING_ID = /^listing-[A-Za-z0-9-]{8,64}$/;
export const LISTING_PURCHASE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ListingStatus = "open" | "sold" | "withdrawn" | "expired";

export type FarmListing = Readonly<{
  id: string;
  sellerId: string;
  sellerName: string;
  stack: TradeStack;
  itemId: string;
  /** Still for sale. */
  quantity: number;
  /** Put up. */
  listedQuantity: number;
  unitPrice: number;
  status: ListingStatus;
  createdAt: number;
  expiresAt: number;
}>;

export function listingDayStart(now: number): number {
  return Math.floor(now / DAY_MS) * DAY_MS;
}

/**
 * A good's standing value in tickets: what the Market's counters pay for one
 * on a Normal day (the Produce Merchant by grade, the Kitchen, the Sawmill),
 * and for logs and planks the wood's derived worth. 0 for what cannot be listed.
 */
export function listingStandingValue(stack: TradeStack, itemId: string): number {
  if (!tradeableItem(stack, itemId)) return 0;
  switch (stack) {
    case "logs": return farmLogValue(itemId);
    case "planks": return farmPlankValue(itemId);
    default: return farmSalePrice(itemId);
  }
}

/** The whole-ticket price range a unit of this good may be listed at; null when it cannot be listed. */
export function listingPriceBand(stack: TradeStack, itemId: string): Readonly<{ min: number; max: number; value: number }> | null {
  const value = listingStandingValue(stack, itemId);
  if (!(value > 0)) return null;
  const min = Math.max(1, Math.floor(value * LISTING_PRICE_FLOOR));
  const max = Math.max(min + 1, Math.ceil(value * LISTING_PRICE_CEILING));
  return Object.freeze({ min, max, value });
}

/** What the Market keeps of a sale of `total` tickets. */
export function listingFee(total: number): number {
  return Math.ceil(total * LISTING_FEE_RATE);
}

export type ListingRequest = Readonly<{ stack: TradeStack; itemId: string; quantity: number; unitPrice: number }>;

/** A request to list, made safe; the error names what is wrong with it. */
export function normalizeListingRequest(value: unknown): { ok: true; request: ListingRequest } | { ok: false; error: string } {
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_listing" };
  const input = value as Record<string, unknown>;
  const stack = input.stack as TradeStack;
  const itemId = typeof input.itemId === "string" ? input.itemId : "";
  if (!(TRADE_STACKS as readonly string[]).includes(stack) || !tradeableItem(stack, itemId)) return { ok: false, error: "not_listable" };
  const quantity = Number(input.quantity);
  const unitPrice = Number(input.unitPrice);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > MAX_LISTING_QUANTITY) return { ok: false, error: "invalid_quantity" };
  if (!Number.isSafeInteger(unitPrice)) return { ok: false, error: "invalid_price" };
  const band = listingPriceBand(stack, itemId)!;
  if (unitPrice < band.min || unitPrice > band.max) return { ok: false, error: "price_out_of_band" };
  return { ok: true, request: Object.freeze({ stack, itemId, quantity, unitPrice }) };
}

/** A stored row made safe, or null. An open listing past its time reads as expired. */
export function normalizeListingRow(row: any, now: number): FarmListing | null {
  if (!row || typeof row !== "object") return null;
  const stack = row.stack as TradeStack;
  const id = String(row.listing_id ?? row.id ?? "");
  if (!LISTING_ID.test(id) || !(TRADE_STACKS as readonly string[]).includes(stack)) return null;
  const status = (["open", "sold", "withdrawn", "expired"] as const).find((entry) => entry === row.status) ?? "withdrawn";
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

/** A listing as any viewer sees it: never who the seller is by id, only by name, plus whether it is the viewer's own. */
export function listingView(listing: FarmListing, viewerId: string) {
  return Object.freeze({
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

export type PurchaseCheck = Readonly<{
  listing: FarmListing;
  buyerId: string;
  quantity: number;
  buyerSpentToday: number;
  buyerPurchasesToday: number;
  sellerEarnedToday: number;
}>;

export type PurchaseTerms = Readonly<{ total: number; fee: number; proceeds: number }>;

/** Whether this purchase may go ahead and what it moves, or why not. */
export function checkListingPurchase(check: PurchaseCheck): { ok: true; terms: PurchaseTerms } | { ok: false; error: string } {
  const { listing, buyerId, quantity } = check;
  if (listing.status !== "open") return { ok: false, error: listing.status === "expired" ? "listing_expired" : "listing_closed" };
  if (listing.sellerId === buyerId) return { ok: false, error: "own_listing" };
  if (!Number.isSafeInteger(quantity) || quantity < 1) return { ok: false, error: "invalid_quantity" };
  if (quantity > listing.quantity) return { ok: false, error: "not_enough_listed" };
  const total = listing.unitPrice * quantity;
  const fee = listingFee(total);
  const proceeds = total - fee;
  if (check.buyerPurchasesToday >= DAILY_LISTING_PURCHASES) return { ok: false, error: "daily_purchase_limit" };
  if (check.buyerSpentToday + total > DAILY_LISTING_SPEND_LIMIT) return { ok: false, error: "daily_spend_limit" };
  if (check.sellerEarnedToday + proceeds > DAILY_LISTING_EARN_LIMIT) return { ok: false, error: "seller_daily_limit" };
  return { ok: true, terms: Object.freeze({ total, fee, proceeds }) };
}

/** A stack's goods off a farm inventory (for escrow), or null when it does not hold them. `shelf` is furniture not standing on the field. */
export function takeListedGoods(inventory: any, shelf: Readonly<Record<string, number>>, stack: TradeStack, itemId: string, quantity: number): any | null {
  const held = stack === "furniture" ? Number(shelf[itemId]) || 0 : Number(inventory?.[stack]?.[itemId]) || 0;
  if (held < quantity) return null;
  return { ...inventory, [stack]: { ...(inventory?.[stack] ?? {}), [itemId]: (Number(inventory?.[stack]?.[itemId]) || 0) - quantity } };
}

/** A stack's goods onto a farm inventory, or null when the stack would pass 99. */
export function addListedGoods(inventory: any, stack: TradeStack, itemId: string, quantity: number): any | null {
  const next = (Number(inventory?.[stack]?.[itemId]) || 0) + quantity;
  if (next > MAX_LISTING_QUANTITY) return null;
  return { ...inventory, [stack]: { ...(inventory?.[stack] ?? {}), [itemId]: next } };
}
