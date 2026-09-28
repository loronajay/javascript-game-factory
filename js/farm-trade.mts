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
import type { FarmLayout } from "./farm-layout.mjs";
import { formatWeight, specimenTitle, type FishVariant, type SizeClass } from "./farm-fish.mjs";

// FISH on the table are single specimens from the Cove's creel, keyed by fish
// id with a count of one. They are not in the static goods list (every fish is
// its own), so a table names them through a resolver the page feeds from its
// own creel and from the server's public fish read (the partner's).
export const TRADE_STACKS = Object.freeze(["produce", "dishes", "logs", "planks", "furniture", "fish"] as const);
export type TradeStack = (typeof TRADE_STACKS)[number];
export type TradeOffer = Readonly<Record<TradeStack, Readonly<Record<string, number>>>>;

/** Distinct lines one side may put on the table (the server refuses more). */
export const MAX_TRADE_LINES = 12;
export const MAX_TRADE_QUANTITY = 99;

/** One kind of thing that can go on the table: which stack, its id there, its name and portrait. */
export type TradeGood = Readonly<{ stack: TradeStack; id: string; title: string; itemKey: string }>;

/** Every tradeable thing there is, in the order a list shows them: produce, dishes, logs, planks, furniture. */
export const TRADE_GOODS: readonly TradeGood[] = Object.freeze([
  ...SELLABLE_PRODUCE.map((item) => Object.freeze({ stack: "produce" as const, id: item.id, title: item.title, itemKey: item.itemKey })),
  ...SELLABLE_DISHES.map((item) => Object.freeze({ stack: "dishes" as const, id: item.id, title: item.title, itemKey: item.itemKey })),
  ...TIMBER_TREES.map((species) => Object.freeze({ stack: "logs" as const, id: species.id, title: `${species.title} logs`, itemKey: `log:${species.id}` })),
  ...PLANK_SPECIES.map((species) => Object.freeze({ stack: "planks" as const, id: species.id, title: species.title, itemKey: `plank:${species.id}` })),
  ...SELLABLE_FURNITURE.map((item) => Object.freeze({ stack: "furniture" as const, id: item.id, title: item.title, itemKey: item.itemKey })),
]);

export function findTradeGood(stack: TradeStack, id: string): TradeGood | undefined {
  return TRADE_GOODS.find((good) => good.stack === stack && good.id === id);
}

export function emptyOffer(): TradeOffer {
  return Object.freeze({ produce: {}, dishes: {}, logs: {}, planks: {}, furniture: {}, fish: {} });
}

/** A fish that can go on a table, as a creel or the public fish read describes it. */
export type TradeFish = Readonly<{ id: string; speciesId: string; weightG: number; sizeClass: string; variant: string; locked?: boolean }>;

const TRADE_FISH_ID = /^fish-[A-Za-z0-9-]{8,64}$/;

/** A fish as a line on the table: its name and weight, and its portrait. */
export function fishTradeGood(fish: TradeFish): TradeGood {
  return Object.freeze({
    stack: "fish" as const,
    id: fish.id,
    title: `${specimenTitle(fish.speciesId, fish.variant as FishVariant, fish.sizeClass as SizeClass)} · ${formatWeight(fish.weightG)}`,
    itemKey: `fish:${fish.speciesId}:${fish.variant}`,
  });
}

/** What this farm can put on the table right now: the server-minted stacks, furniture off the SHELF only, unlocked fish in the creel. */
export function tradeStock(layout: FarmLayout, creel: readonly TradeFish[] = []): TradeOffer {
  const inventory = layout.agriculture.inventory;
  return Object.freeze({
    produce: inventory.produce,
    dishes: inventory.dishes,
    logs: inventory.logs,
    planks: inventory.planks,
    furniture: furnitureShelf(inventory.furniture, layout.decor),
    fish: Object.freeze(Object.fromEntries(creel.filter((fish) => !fish.locked).map((fish) => [fish.id, 1]))),
  });
}

export type StockEntry = TradeGood & Readonly<{ held: number }>;

/** Everything this farm holds that could be offered, in list order, the creel's fish last. */
export function stockEntries(layout: FarmLayout, creel: readonly TradeFish[] = []): readonly StockEntry[] {
  const stock = tradeStock(layout, creel);
  return Object.freeze([
    ...TRADE_GOODS
      .map((good) => Object.freeze({ ...good, held: Math.max(0, Math.floor(Number(stock[good.stack][good.id]) || 0)) }))
      .filter((entry) => entry.held > 0),
    ...creel.filter((fish) => !fish.locked).map((fish) => Object.freeze({ ...fishTradeGood(fish), held: 1 })),
  ]);
}

export function offerCount(offer: TradeOffer, stack: TradeStack, id: string): number {
  return Math.max(0, Math.floor(Number(offer[stack]?.[id]) || 0));
}

export function offerLineCount(offer: TradeOffer): number {
  return TRADE_STACKS.reduce((sum, stack) => sum + Object.values(offer[stack] ?? {}).filter((count) => count > 0).length, 0);
}

export function offerIsEmpty(offer: TradeOffer): boolean {
  return offerLineCount(offer) === 0;
}

/**
 * The offer with one line set to `count`, clamped to what is held and to a
 * stack's 99; a new line past MAX_TRADE_LINES is not added. 0 removes the line.
 */
export function setOfferLine(offer: TradeOffer, stack: TradeStack, id: string, count: number, held: number): TradeOffer {
  const clamped = Math.max(0, Math.min(Math.floor(count) || 0, Math.max(0, Math.floor(held)), MAX_TRADE_QUANTITY));
  const lines = { ...offer[stack] };
  const isNew = !(lines[id]! > 0);
  if (clamped > 0 && isNew && offerLineCount(offer) >= MAX_TRADE_LINES) return offer;
  if (clamped > 0) lines[id] = clamped;
  else delete lines[id];
  return Object.freeze({ ...offer, [stack]: Object.freeze(lines) });
}

/** The offer trimmed to what the stock still holds (after a sale, or a trade that landed). */
export function fitOfferToStock(offer: TradeOffer, stock: TradeOffer): TradeOffer {
  let next = emptyOffer();
  for (const stack of TRADE_STACKS) {
    for (const [id, count] of Object.entries(offer[stack] ?? {})) {
      next = setOfferLine(next, stack, id, count, Number(stock[stack]?.[id]) || 0);
    }
  }
  return next;
}

export function sameOffer(left: TradeOffer, right: TradeOffer): boolean {
  return TRADE_STACKS.every((stack) => {
    const a = Object.entries(left[stack] ?? {}).filter(([, count]) => count > 0);
    const b = Object.entries(right[stack] ?? {}).filter(([, count]) => count > 0);
    return a.length === b.length && a.every(([id, count]) => right[stack]?.[id] === count);
  });
}

export type OfferLine = TradeGood & Readonly<{ count: number }>;

/** An offer as a list to show, in list order; its fish named by `fish` (a stand-in while a fish's details are on their way). */
export function offerLines(offer: TradeOffer, fish: (fishId: string) => TradeFish | null = () => null): readonly OfferLine[] {
  const fishLines = Object.keys(offer.fish ?? {}).map((id) => {
    const known = fish(id);
    return Object.freeze({ ...(known ? fishTradeGood(known) : { stack: "fish" as const, id, title: "A fish from the Cove", itemKey: "fish:fish.goldfish:normal" }), count: 1 });
  });
  return Object.freeze([
    ...TRADE_GOODS
      .filter((good) => offerCount(offer, good.stack, good.id) > 0)
      .map((good) => Object.freeze({ ...good, count: offerCount(offer, good.stack, good.id) })),
    ...fishLines,
  ]);
}

// ---------------------------------------------------------------- the table, as the server describes it

export type TradeStatus = "invited" | "open" | "completed" | "declined" | "cancelled" | "expired";
export type TradeSideView = Readonly<{ playerId: string; name: string; offer: TradeOffer; locked: boolean; confirmed: boolean }>;
export type TradeView = Readonly<{
  id: string;
  status: TradeStatus;
  revision: number;
  invitedByYou: boolean;
  you: TradeSideView;
  them: TradeSideView;
  notice: string;
  endedByYou: boolean;
  expiresAt: number;
}>;

const STATUSES: readonly TradeStatus[] = ["invited", "open", "completed", "declined", "cancelled", "expired"];

function normalizeOffer(value: any): TradeOffer {
  const offer: Record<string, Record<string, number>> = {};
  for (const stack of TRADE_STACKS) {
    offer[stack] = {};
    for (const [id, count] of Object.entries(value?.[stack] ?? {})) {
      const whole = Math.floor(Number(count) || 0);
      if (stack === "fish") {
        if (whole > 0 && TRADE_FISH_ID.test(id)) offer.fish![id] = 1;
        continue;
      }
      if (whole > 0 && findTradeGood(stack, id)) offer[stack]![id] = Math.min(whole, MAX_TRADE_QUANTITY);
    }
  }
  return Object.freeze(offer) as TradeOffer;
}

function normalizeSide(value: any): TradeSideView {
  return Object.freeze({
    playerId: typeof value?.playerId === "string" ? value.playerId : "",
    name: typeof value?.name === "string" && value.name.trim() ? value.name.trim().slice(0, 40) : "A farmer",
    offer: normalizeOffer(value?.offer),
    locked: value?.locked === true,
    confirmed: value?.confirmed === true,
  });
}

/** The server's view of a table made safe to render, or null. */
export function normalizeTradeView(value: any): TradeView | null {
  if (!value || typeof value !== "object" || typeof value.id !== "string" || !STATUSES.includes(value.status)) return null;
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

export function isLive(view: TradeView | null): boolean {
  return view?.status === "invited" || view?.status === "open";
}

/** Where this player is in the lock → confirm dance, which decides the one button they press next. */
export type TradeStage = "editing" | "locked" | "ready" | "confirmed";

export function tradeStage(view: TradeView): TradeStage {
  if (view.you.confirmed) return "confirmed";
  if (view.you.locked && view.them.locked) return "ready";
  if (view.you.locked) return "locked";
  return "editing";
}

/** Whether the confirm button can do anything: both locked, something on the table (a one-sided gift is fine), not already confirmed. */
export function canConfirm(view: TradeView): boolean {
  return view.status === "open" && view.you.locked && view.them.locked && !view.you.confirmed
    && !(offerIsEmpty(view.you.offer) && offerIsEmpty(view.them.offer));
}

/** One line under the table saying where it stands, from this player's side. */
export function tradeStatusLine(view: TradeView): string {
  const them = view.them.name;
  if (view.status === "open") {
    if (view.notice) return noticeWords(view.notice, them);
    if (view.you.confirmed && !view.them.confirmed) return `Confirmed. Waiting for ${them} to confirm…`;
    if (view.them.confirmed) return `${them} has confirmed. Confirm to make the trade.`;
    if (view.you.locked && view.them.locked) {
      if (offerIsEmpty(view.you.offer) && offerIsEmpty(view.them.offer)) return "There's nothing on the table. Unlock to add something.";
      if (offerIsEmpty(view.them.offer)) return `A gift to ${them}: you get nothing back. Confirm if that's what you mean.`;
      if (offerIsEmpty(view.you.offer)) return `A gift from ${them}: you give nothing. Confirm to accept it.`;
      return "Both offers are locked. Check what you get, then confirm.";
    }
    if (view.you.locked) return `Your offer is locked. Waiting for ${them} to lock theirs…`;
    if (view.them.locked) return `${them} has locked their offer. Lock yours when you're happy.`;
    return "Put up what you'll trade, then lock your offer.";
  }
  if (view.status === "invited") return view.invitedByYou ? `Waiting for ${them} to answer…` : `${them} wants to trade.`;
  return endedWords(view);
}

export function endedWords(view: TradeView): string {
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
export function noticeWords(notice: string, them: string): string {
  switch (notice) {
    case "offer_gone_you": return "Some of your offer is no longer in your basket, so nothing moved. Fix your offer and lock again.";
    case "offer_gone_them": return `Some of ${them}'s offer is no longer in their basket, so nothing moved. The table is open again.`;
    case "inventory_full_you": return "You can't hold that many — a stack of yours would pass 99. Nothing moved.";
    case "inventory_full_them": return `${them} can't hold that many — a stack of theirs would pass 99. Nothing moved.`;
    case "creel_full_you": return "Your creel can't hold that many fish. Sell or let some go first. Nothing moved.";
    case "creel_full_them": return `${them}'s creel can't hold that many fish. Nothing moved.`;
    case "daily_limit": return "One of you has reached today's trading limit. Nothing moved.";
    case "farm_not_initialized": return "One of the farms isn't ready to trade. Nothing moved.";
    default: return "The table changed. Check both offers and lock again.";
  }
}

/** A refusal from the server, in words. */
export function tradeErrorWords(error: string, them = "They"): string {
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
    default: return error.startsWith("offer_gone") || error.startsWith("inventory_full") || error.startsWith("creel_full") ? noticeWords(error, them) : "The trade couldn't be reached. Try again in a moment.";
  }
}
