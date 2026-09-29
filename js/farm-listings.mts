// The Market Square's Exchange Board, for display. PURE — no DOM, no THREE, no
// storage, no fetch.
//
// Players list server-minted goods — and live animals and fish, one to a
// listing — for tickets at a price THEY set, and anyone else buys outright.
// Nothing here decides a listing: the server
// (platform-api/src/services/farm-listing-policy.mts) holds the goods in escrow,
// keeps the Market's fee and the day's caps, and moves goods and tickets
// together. This module mirrors the fee, the price ceiling and the seller's
// price GUIDE (what the Market's counters pay; for an animal, the Dealer's
// price) so the page can show them before asking
// (platform-api/tests/farm-listings.test.mjs holds the two equal), and shapes
// the server's board for the panel.

import { PLANKS_PER_LOG } from "./farm-catalog/carpentry.mjs";
import { plankValue, salePrice } from "./farm-market-prices.mjs";
import { animalTradeGood, fishTradeGood, findTradeGood, normalizeTradeAnimal, type TradeAnimal, type TradeFish, type TradeGood, type TradeStack } from "./farm-trade.mjs";
import { findLivestockSpecies } from "./farm-catalog/livestock.mjs";

export const LISTING_FEE_RATE = 0.1;
export const MAX_LISTING_QUANTITY = 99;
/** The most one unit may ask (a day's spending cap on the board). */
export const MAX_LISTING_UNIT_PRICE = 10_000;
/** The stacks the board takes, and those listed one row at a time. */
export const LISTING_STACKS: readonly TradeStack[] = Object.freeze(["produce", "dishes", "logs", "planks", "furniture", "fish", "livestock"]);
export const SINGLE_ROW_LISTING_STACKS: readonly TradeStack[] = Object.freeze(["fish", "livestock"]);

/**
 * A GUIDE for the seller, never a limit: what the Market's own counters would
 * pay for one on a Normal day (logs and planks: the wood's worth); for an
 * animal, what the Livestock Dealer asks for a young one of its species. 0
 * where there is none (a fish's worth comes from the creel's own read).
 */
export function listingStandingValue(stack: TradeStack, itemId: string, speciesId = ""): number {
  if (stack === "livestock") return findLivestockSpecies(speciesId)?.price ?? 0;
  if (stack === "fish" || !findTradeGood(stack, itemId)) return 0;
  switch (stack) {
    case "logs": return plankValue(itemId) * PLANKS_PER_LOG;
    case "planks": return plankValue(itemId);
    default: return salePrice(itemId);
  }
}

/** A price made listable: a whole number of tickets from 1 to the ceiling. */
export function clampListingPrice(value: number): number {
  return Math.max(1, Math.min(MAX_LISTING_UNIT_PRICE, Math.floor(Number(value)) || 1));
}

export function listingFee(total: number): number {
  return Math.ceil(total * LISTING_FEE_RATE);
}

/** What a seller would take home from selling `quantity` at `unitPrice`. */
export function listingProceeds(unitPrice: number, quantity: number): number {
  const total = unitPrice * quantity;
  return total - listingFee(total);
}

export type ListingStatus = "open" | "sold" | "withdrawn" | "expired";

export type ListingView = TradeGood & Readonly<{
  /** The animal or fish itself, for a single-row listing. */
  animal?: TradeAnimal;
  fish?: TradeFish;
  id: string;
  sellerName: string;
  mine: boolean;
  quantity: number;
  listedQuantity: number;
  unitPrice: number;
  status: ListingStatus;
  expiresAt: number;
}>;

export type ListingLimits = Readonly<{
  maxOpen: number;
  listingsLeftToday: number;
  purchasesLeftToday: number;
  spendLeftToday: number;
  earnLeftToday: number;
}>;

export type ListingBoard = Readonly<{ listings: readonly ListingView[]; mine: readonly ListingView[]; limits: ListingLimits }>;

function whole(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

/** One listing from the server made safe; null for anything this page cannot draw. */
export function normalizeListing(value: unknown): ListingView | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const stack = source.stack as TradeStack;
  if (!LISTING_STACKS.includes(stack)) return null;
  // An animal or a fish is drawn from the card the listing carries.
  const animal = stack === "livestock" ? normalizeTradeAnimal(source.animal) : null;
  const rawFish = stack === "fish" && source.fish && typeof source.fish === "object" ? source.fish as Record<string, unknown> : null;
  const fish: TradeFish | null = rawFish && typeof rawFish.id === "string"
    ? Object.freeze({ id: rawFish.id, speciesId: String(rawFish.speciesId), weightG: Number(rawFish.weightG) || 0, sizeClass: String(rawFish.sizeClass ?? "average"), variant: String(rawFish.variant ?? "normal") })
    : null;
  const good = animal ? animalTradeGood(animal) : fish ? fishTradeGood(fish) : findTradeGood(stack, String(source.itemId ?? ""));
  const id = typeof source.id === "string" && /^listing-[A-Za-z0-9-]{8,64}$/.test(source.id) ? source.id : "";
  if (!good || !id) return null;
  const status = (["open", "sold", "withdrawn", "expired"] as const).find((entry) => entry === source.status) ?? "withdrawn";
  return Object.freeze({
    ...good,
    ...(animal ? { animal } : {}),
    ...(fish ? { fish } : {}),
    id,
    sellerName: typeof source.sellerName === "string" ? source.sellerName.slice(0, 40) : "A farmer",
    mine: source.mine === true,
    quantity: whole(source.quantity),
    listedQuantity: whole(source.listedQuantity),
    unitPrice: whole(source.unitPrice),
    status,
    expiresAt: whole(source.expiresAt),
  });
}

export function normalizeListingBoard(value: unknown): ListingBoard | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const list = (raw: unknown) => (Array.isArray(raw) ? raw : []).map(normalizeListing).filter((entry): entry is ListingView => Boolean(entry));
  const limits = (source.limits && typeof source.limits === "object" ? source.limits : {}) as Record<string, unknown>;
  return Object.freeze({
    listings: Object.freeze(list(source.listings)),
    mine: Object.freeze(list(source.mine)),
    limits: Object.freeze({
      maxOpen: whole(limits.maxOpen),
      listingsLeftToday: whole(limits.listingsLeftToday),
      purchasesLeftToday: whole(limits.purchasesLeftToday),
      spendLeftToday: whole(limits.spendLeftToday),
      earnLeftToday: whole(limits.earnLeftToday),
    }),
  });
}

/** "2d 4h left", "expired". */
export function listingTimeLeft(listing: Pick<ListingView, "expiresAt" | "status">, now: number): string {
  if (listing.status === "expired" || listing.expiresAt <= now) return "expired";
  const hours = Math.floor((listing.expiresAt - now) / 3_600_000);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h left` : `${Math.max(0, hours)}h left`;
}

/** What each refusal means, in the square's words. */
export const LISTING_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  too_many_listings: "You already have as many listings up as the board allows. Take one down first.",
  daily_listing_limit: "You have put up as many listings as the board takes in a day. Come back tomorrow.",
  farm_not_initialized: "Settle into your farm first — name your dog and step onto the field.",
  not_enough: "Your farm no longer holds that many. Nothing was listed.",
  invalid_price: "Ask a whole number of tickets, from 1 to 10,000 each.",
  invalid_quantity: "An animal or a fish is listed one at a time.",
  died: "That animal has died — it cannot be listed.",
  husbandry_too_low: "Your Husbandry is too low to keep that animal (Hollis's levels: sheep 1, pig 5, cow 10, llama 15). Nothing was bought.",
  herd_full: "Your herd is as big as a farm can keep. Nothing was bought.",
  no_room: "You have no free stall, pen, barn floor or coop place for it. Make room first — nothing was bought.",
  creel_full: "Your creel is full. Sell or let some fish go first — nothing was bought.",
  not_listable: "The board does not take those goods.",
  listing_expired: "That listing has run out. Nothing was bought.",
  listing_closed: "That listing has already come down.",
  own_listing: "That is your own listing.",
  not_enough_listed: "Someone bought some first — there are fewer left than you asked for. Nothing was bought.",
  daily_purchase_limit: "You have bought as much from the board as it allows in a day.",
  daily_spend_limit: "That would pass what you may spend on the board today.",
  seller_daily_limit: "The seller has taken all the board allows them today. Try again tomorrow.",
  inventory_full: "That stack on your farm is full (99). Nothing moved.",
  insufficient_tickets: "Not enough tickets for that.",
  not_found: "That listing is gone.",
});
