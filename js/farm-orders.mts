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

export type FarmOrderKind = "produce" | "dish";
export type FarmOrderSkill = "farming" | "cooking";

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
  dishes: Readonly<Record<string, number>>;
}>;

function whole(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function counts(value: unknown, known: (id: string) => boolean = (id) => Boolean(findCrop(id) || findFruit(id))): Record<string, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, number> = {};
  for (const [id, raw] of Object.entries(source)) if (known(id)) result[id] = whole(raw);
  return result;
}

const isDishKey = (id: string) => DISH_KEYS.includes(id);
const isRecipe = (id: string) => Boolean(findRecipe(id));

/** The API's board answer made safe to draw; null when it is not a board. */
export function normalizeOrderBoard(value: unknown): FarmOrderBoard | null {
  const source: any = value && typeof value === "object" ? value : null;
  if (!source || !Array.isArray(source.orders)) return null;
  const orders = source.orders
    .filter((order: any) => order && typeof order === "object" && typeof order.id === "string")
    .map((order: any): FarmOrder => Object.freeze({
      id: text(order.id, 40),
      tier: text(order.tier, 20),
      kind: order.kind === "dish" ? "dish" as const : "produce" as const,
      skill: order.skill === "cooking" ? "cooking" as const : "farming" as const,
      minLevel: Math.max(1, whole(order.minLevel)),
      customer: text(order.customer, 60),
      note: text(order.note, 160),
      lines: Object.freeze(counts(order.lines, order.kind === "dish" ? isRecipe : undefined)),
      tickets: whole(order.tickets),
      xp: whole(order.xp),
      filled: order.filled === true,
    }));
  const farming = Math.max(1, whole(source.farming?.level));
  return Object.freeze({
    endsAt: whole(source.endsAt),
    orders: Object.freeze(orders),
    level: farming,
    levels: Object.freeze({ farming, cooking: Math.max(1, whole(source.cooking?.level)) }),
    produce: Object.freeze(counts(source.produce)),
    dishes: Object.freeze(counts(source.dishes, isDishKey)),
  });
}

export type OrderLineView = Readonly<{ cropId: string; title: string; need: number; held: number; short: number; /** The model that portrays it (farm-item-models.mts). */ itemKey: string }>;
export type OrderState = "filled" | "locked" | "short" | "ready";
export type OrderView = Readonly<{ order: FarmOrder; state: OrderState; lines: readonly OrderLineView[] }>;

/** What the player holds toward the board's orders: the basket, the pantry and both levels. */
export type OrderStock = Readonly<{ produce: Readonly<Record<string, number>>; dishes: Readonly<Record<string, number>>; levels: Readonly<Record<FarmOrderSkill, number>> }>;

export function orderView(order: FarmOrder, stock: OrderStock): OrderView {
  const dish = order.kind === "dish";
  const lines = Object.entries(order.lines).map(([id, need]) => {
    const held = dish ? pantryCount(stock.dishes, id) : whole(stock.produce[id]);
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

const TIER_LABELS: Readonly<Record<string, string>> = Object.freeze({ small: "Small order", medium: "Standing order", large: "Large order", kitchen: "Kitchen order", banquet: "Banquet" });

export const SKILL_TITLES: Readonly<Record<FarmOrderSkill, string>> = Object.freeze({ farming: "Farming", cooking: "Cooking" });

export function orderTierLabel(tier: string): string {
  return TIER_LABELS[tier] ?? "Order";
}
