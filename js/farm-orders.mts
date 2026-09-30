// The Order Board, for display. PURE — no DOM, no THREE, no storage.
//
// The server writes the board (platform-api/src/services/farm-order-catalog.mts):
// one set of orders per UTC day for everyone in the square, each filled once
// per player. The page reads it from `GET /games/farm/market/orders`, and this
// module turns that answer plus the player's basket into what each notice
// shows: what is still missing, whether the level gate is met, and whether
// Fill should be pressable. The server re-checks every one of those.
//
// Two kinds of notice share the board: produce orders (the basket, gated on
// Farming) and, since the kitchen opened, dish orders (the pantry, any stars,
// gated on Cooking). Each line names the item model that portrays it.

import { findCrop } from "./farm-crops.mjs";
import { findFruit } from "./farm-catalog/trees.mjs";
import { DISH_KEYS, findRecipe } from "./farm-catalog/recipes.mjs";
import { basketItemTitle, pantryCount } from "./farm-kitchen.mjs";
import { parseProduceKey, produceHeld } from "./farm-quality.mjs";
import { fishHeldForNeed, fishNeedPortraitSpecies, fishNeedTitle, parseFishNeed, pickFishForNeed, type CreelFishLike } from "./farm-fish.mjs";
import { normalizeAnglerFish, type AnglerFish } from "./farm-angler.mjs";
import { findLivestockBasketItem, findLivestockGood } from "./farm-catalog/livestock.mjs";

// The Cove's notices (since fishing): fish from the creel, gated on Fishing.
// A fish line's key is a fish need ("zone=reef,size=large", farm-fish.mts);
// a fill takes the least valuable fish that meet it, never a locked one.

// The herd's notices (since livestock Phase 3): milk and wool from the
// basket, any grade, gated on Husbandry.

export type FarmOrderKind = "produce" | "dish" | "fish" | "goods";
export type FarmOrderSkill = "farming" | "cooking" | "fishing" | "husbandry";

export type FarmOrder = Readonly<{
  id: string;
  tier: string;
  kind: FarmOrderKind;
  skill: FarmOrderSkill;
  minLevel: number;
  customer: string;
  note: string;
  lines: Readonly<Record<string, number>>;
  tickets: number;
  xp: number;
  filled: boolean;
}>;

export type FarmOrderBoard = Readonly<{
  endsAt: number;
  orders: readonly FarmOrder[];
  /** The Farming level; the board's headline. */
  level: number;
  levels: Readonly<Record<FarmOrderSkill, number>>;
  produce: Readonly<Record<string, number>>;
  /** The herd goods in `produce` the farm collected itself: only these fill a herd notice. */
  raised: Readonly<Record<string, number>>;
  dishes: Readonly<Record<string, number>>;
  /** The creel, as the server read it with the board. */
  fish: readonly AnglerFish[];
}>;

function whole(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

/** A basket key: a crop, a livestock good or a meat at any grade, or fruit (which has none). */
function isBasketKey(key: string): boolean {
  const parsed = parseProduceKey(key);
  return Boolean(parsed && (findCrop(parsed.itemId) || findLivestockBasketItem(parsed.itemId) || (parsed.quality === "normal" && findFruit(parsed.itemId))));
}

function counts(value: unknown, known: (id: string) => boolean = isBasketKey): Record<string, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, number> = {};
  for (const [id, raw] of Object.entries(source)) if (known(id)) result[id] = whole(raw);
  return result;
}

/** The farm's raised herd goods (the server's `inventory.raised`), by basket key. */
export function normalizeRaisedGoods(value: unknown): Readonly<Record<string, number>> {
  return Object.freeze(counts(value, (key) => Boolean(findLivestockGood(parseProduceKey(key)?.itemId ?? ""))));
}

const isDishKey = (id: string) => DISH_KEYS.includes(id);
const isRecipe = (id: string) => Boolean(findRecipe(id));
const isFishNeed = (id: string) => Boolean(parseFishNeed(id));
const isGood = (id: string) => Boolean(findLivestockGood(id));
const KINDS: readonly FarmOrderKind[] = Object.freeze(["produce", "dish", "fish", "goods"] as const);
const SKILLS: readonly FarmOrderSkill[] = Object.freeze(["farming", "cooking", "fishing", "husbandry"] as const);
const LINE_KEYS: Readonly<Record<FarmOrderKind, (id: string) => boolean>> = Object.freeze({ produce: isBasketKey, dish: isRecipe, fish: isFishNeed, goods: isGood });

/** The API's board answer made safe to draw; null when it is not a board. */
export function normalizeOrderBoard(value: unknown): FarmOrderBoard | null {
  const source: any = value && typeof value === "object" ? value : null;
  if (!source || !Array.isArray(source.orders)) return null;
  const orders = source.orders
    .filter((order: any) => order && typeof order === "object" && typeof order.id === "string")
    .map((order: any): FarmOrder => Object.freeze({
      id: text(order.id, 40),
      tier: text(order.tier, 20),
      kind: KINDS.includes(order.kind) ? order.kind as FarmOrderKind : "produce" as const,
      skill: SKILLS.includes(order.skill) ? order.skill as FarmOrderSkill : "farming" as const,
      minLevel: Math.max(1, whole(order.minLevel)),
      customer: text(order.customer, 60),
      note: text(order.note, 160),
      lines: Object.freeze(counts(order.lines, LINE_KEYS[KINDS.includes(order.kind) ? order.kind as FarmOrderKind : "produce"])),
      tickets: whole(order.tickets),
      xp: whole(order.xp),
      filled: order.filled === true,
    }));
  const farming = Math.max(1, whole(source.farming?.level));
  return Object.freeze({
    endsAt: whole(source.endsAt),
    orders: Object.freeze(orders),
    level: farming,
    levels: Object.freeze({
      farming, cooking: Math.max(1, whole(source.cooking?.level)), fishing: Math.max(1, whole(source.fishing?.level)),
      husbandry: Math.max(1, whole(source.husbandry?.level)),
    }),
    produce: Object.freeze(counts(source.produce)),
    raised: normalizeRaisedGoods(source.raised),
    dishes: Object.freeze(counts(source.dishes, isDishKey)),
    fish: Object.freeze((Array.isArray(source.creel) ? source.creel : []).map(normalizeAnglerFish).filter((fish: AnglerFish | null): fish is AnglerFish => Boolean(fish))),
  });
}

export type OrderLineView = Readonly<{
  cropId: string; title: string; need: number; held: number; short: number;
  /** A herd line: pieces in the basket that were bought or traded for, which it will not take. */
  unraised?: number;
  /** The model that portrays it (farm-item-models.mts). */ itemKey: string;
}>;
export type OrderState = "filled" | "locked" | "short" | "ready";
export type OrderView = Readonly<{ order: FarmOrder; state: OrderState; lines: readonly OrderLineView[] }>;

/** What the player holds toward the board's orders: the basket, the pantry, the creel and the levels. */
export type OrderStock = Readonly<{ produce: Readonly<Record<string, number>>; raised?: Readonly<Record<string, number>>; dishes: Readonly<Record<string, number>>; fish?: readonly CreelFishLike[]; levels: Readonly<Record<FarmOrderSkill, number>> }>;

export function orderView(order: FarmOrder, stock: OrderStock): OrderView {
  const dish = order.kind === "dish";
  if (order.kind === "fish") {
    // Each line takes its own fish: a fish counted toward one line is not there for the next.
    const taken = new Set<string>();
    const lines = Object.entries(order.lines).map(([key, need]) => {
      const fishNeed = parseFishNeed(key)!;
      const held = fishHeldForNeed(stock.fish ?? [], fishNeed, taken);
      for (const fish of pickFishForNeed(stock.fish ?? [], fishNeed, Math.min(held, need), taken) ?? []) taken.add(fish.id);
      return Object.freeze({ cropId: key, title: fishNeedTitle(fishNeed), need, held, short: Math.max(0, need - held), itemKey: `fish:${fishNeedPortraitSpecies(fishNeed)}` });
    });
    const state: OrderState = order.filled ? "filled" : (stock.levels[order.skill] ?? 1) < order.minLevel ? "locked" : lines.some((line) => line.short > 0) ? "short" : "ready";
    return Object.freeze({ order, state, lines: Object.freeze(lines) });
  }
  if (order.kind === "goods") {
    // A herd notice takes only goods the farm raised; Marigold's and a trade's stay in the basket.
    const lines = Object.entries(order.lines).map(([id, need]) => {
      const held = whole(produceHeld(stock.raised ?? {}, id));
      const unraised = Math.max(0, whole(produceHeld(stock.produce, id)) - held);
      return Object.freeze({ cropId: id, title: basketItemTitle(id), need, held, short: Math.max(0, need - held), unraised, itemKey: `produce:${id}` });
    });
    const state: OrderState = order.filled ? "filled" : (stock.levels[order.skill] ?? 1) < order.minLevel ? "locked" : lines.some((line) => line.short > 0) ? "short" : "ready";
    return Object.freeze({ order, state, lines: Object.freeze(lines) });
  }
  const lines = Object.entries(order.lines).map(([id, need]) => {
    // An order asks for the crop, not its grade; the server takes the plainest first.
    const held = dish ? pantryCount(stock.dishes, id) : whole(produceHeld(stock.produce, id));
    const title = dish ? findRecipe(id)?.title ?? id : basketItemTitle(id);
    return Object.freeze({ cropId: id, title, need, held, short: Math.max(0, need - held), itemKey: dish ? `dish:${id}@2` : `produce:${id}` });
  });
  const state: OrderState = order.filled ? "filled"
    : stock.levels[order.skill] < order.minLevel ? "locked"
      : lines.some((line) => line.short > 0) ? "short"
        : "ready";
  return Object.freeze({ order, state, lines: Object.freeze(lines) });
}

/** "New orders in 5h 12m" — the board turns over at `endsAt`. */
export function boardTurnoverLabel(endsAt: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((endsAt - now) / 60_000));
  if (minutes <= 1) return "New orders any moment now";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `New orders in ${hours}h ${minutes % 60}m` : `New orders in ${minutes}m`;
}

const TIER_LABELS: Readonly<Record<string, string>> = Object.freeze({ small: "Small order", medium: "Standing order", large: "Large order", kitchen: "Kitchen order", banquet: "Banquet", catch: "Fresh catch", special: "Fishmonger's special", herd: "Herd order", "herd-contract": "Herd contract" });

export const SKILL_TITLES: Readonly<Record<FarmOrderSkill, string>> = Object.freeze({ farming: "Farming", cooking: "Cooking", fishing: "Fishing", husbandry: "Husbandry" });

export function orderTierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? "Order";
}
