// The Market Square's Order Board: rotating NPC contracts. Server-owned — the
// client reads the board from `GET /games/farm/market/orders` and names an
// order to fill; what it asks for and what it pays are decided here.
//
// ONE BOARD FOR EVERYONE. The board is a pure function of the UTC day, so
// every farmer in the shared square is reading the same three notices (and can
// talk about them), while each fills their own copy once. Nothing is stored
// to rotate it: day N's board is regenerated from N whenever it is asked for,
// and the ticket ledger's `farm:order:<id>` key is what makes a fill once-only.
//
// WHY ORDERS PAY BETTER. A raw sale returns the seed plus a flat margin per
// cell-day (farm-market-catalog). An order pays that same raw value times a
// premium that rises with its size, plus Farming XP — so growing what the town
// asks for, several crops at once, beats growing one crop and dumping it. That
// is the plan's main defence against a single optimal crop.
//
// Tiers gate on Farming level: the large order is a capability a level buys.
//
// THE KITCHEN'S ORDERS (Phase 6). Two more notices go up every day asking for
// cooked dishes rather than produce: a kitchen order at Cooking 1 and a
// banquet at Cooking 10. They only ask for recipes their gate teaches, pay a
// premium on the dishes' two-star Market price, and pay Cooking XP. They are
// drawn from their own seeded stream after the produce notices, so adding
// them left every produce order that was ever posted exactly as it was.
//
// THE HERD'S ORDERS (livestock Phase 3). Two more, last on the board, ask for
// the goods livestock give — milk and wool from the basket, any grade, the
// plainest first — gated on Husbandry and paying Husbandry XP. Their own
// customers (a creamery wants milk, a mill wants wool) and their own stream,
// so every notice before them keeps its id and its lines. The kitchen's pool
// leaves out dishes that need livestock goods for the same reason: adding the
// dairy recipes changed no kitchen notice that was already up. The hens' eggs
// joined both herd tiers with the chicken (2026-09-29), with egg buyers of
// their own (a diner, a bakery); that reshuffled only the herd notices.

import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { farmDishPrice, farmProducePrice } from "./farm-market-catalog.mjs";
import { farmHarvestXp } from "./farm-skill-catalog.mjs";
import { FARM_RECIPE_RULES } from "./farm-recipe-catalog.mjs";
import { farmSeedFor as seedFor, farmSeededRandom as mulberry32 } from "./farm-seeded-random.mjs";
import { farmFishNeedValue, farmFishNeedXp, parseFishNeed } from "./farm-fish-catalog.mjs";
import { AVERAGE_GOODS_PER_COLLECTION, FARM_LIVESTOCK_BASKET_IDS, farmLivestockGood, livestockCollectXp } from "./farm-livestock-catalog.mjs";

export const FARM_ORDER_DAY_MS = 24 * 60 * 60 * 1000;
/** An order's XP is this share of what growing its produce earned. */
export const ORDER_XP_SHARE = 0.5;
const MAX_LINE = 99;

export type FarmOrderTier = Readonly<{
  tier: "small" | "medium" | "large";
  minLevel: number;
  crops: number;
  /** How many harvests' worth of each crop the order asks for, low to high. */
  harvests: readonly [number, number];
  premium: number;
}>;

export const FARM_ORDER_TIERS: readonly FarmOrderTier[] = Object.freeze([
  Object.freeze({ tier: "small", minLevel: 1, crops: 1, harvests: Object.freeze([1, 2]) as readonly [number, number], premium: 1.5 }),
  Object.freeze({ tier: "medium", minLevel: 5, crops: 2, harvests: Object.freeze([1, 2]) as readonly [number, number], premium: 1.6 }),
  Object.freeze({ tier: "large", minLevel: 10, crops: 3, harvests: Object.freeze([2, 3]) as readonly [number, number], premium: 1.75 }),
]);

/** Who pins orders up. `note` is what their notice says. */
export const FARM_ORDER_CUSTOMERS: readonly Readonly<{ name: string; note: string }>[] = Object.freeze([
  { name: "Martha's Bakery", note: "Baking for the weekend rush. Fresh only, please!" },
  { name: "The Crooked Kettle Inn", note: "The stew pot is empty and the regulars are restless." },
  { name: "Pickle & Preserve Co.", note: "Jarring season. We'll take it by the crate." },
  { name: "Schoolhouse Kitchen", note: "Lunch for forty hungry kids. No pressure." },
  { name: "Harvest Festival Committee", note: "The judges' table needs filling before the parade." },
  { name: "Old Man Hollis", note: "Can't work my own field anymore. I pay fair." },
  { name: "Riverside Soup Kitchen", note: "Anything helps, but this list helps most." },
  { name: "Juniper's Juice Cart", note: "Blending all week. Bring it ripe." },
  { name: "The Mayor's Garden Party", note: "Everything must look perfect. EVERYTHING." },
  { name: "Copperpot Catering", note: "Wedding on Saturday. The bride is very particular." },
].map((entry) => Object.freeze(entry)));

/** A dish order's tier: gated on Cooking, asking for `recipes` different dishes, `dishes` of each. */
export type FarmKitchenOrderTier = Readonly<{
  tier: "kitchen" | "banquet";
  minLevel: number;
  recipes: number;
  dishes: readonly [number, number];
  premium: number;
}>;

export const FARM_KITCHEN_ORDER_TIERS: readonly FarmKitchenOrderTier[] = Object.freeze([
  Object.freeze({ tier: "kitchen", minLevel: 1, recipes: 1, dishes: Object.freeze([1, 2]) as readonly [number, number], premium: 1.3 }),
  Object.freeze({ tier: "banquet", minLevel: 10, recipes: 2, dishes: Object.freeze([2, 3]) as readonly [number, number], premium: 1.4 }),
]);

/** A dish order's Cooking XP is this share of what cooking its dishes earned. */
export const DISH_ORDER_XP_SHARE = 0.5;

/**
 * THE COVE'S ORDERS. Two more notices go up every day asking for fish from the
 * creel: a catch at Fishing 1 and a fishmonger's special at Fishing 10. A line
 * names a fish need (services/farm-fish-catalog `parseFishNeed`) — a kind of
 * fish, a water, a rarity, sometimes a size — and the least valuable fish in
 * the creel that meet it are what a fill takes. They pay a premium on what the
 * cheapest such fish fetch at the Fishmonger, plus Fishing XP, and they are
 * drawn from their own seeded stream after the kitchen's notices, so every
 * order posted before them keeps its id.
 */
export type FarmFishOrderTier = Readonly<{
  tier: "catch" | "special";
  minLevel: number;
  /** The needs this tier draws from, and how many fish a line asks for. */
  needs: readonly string[];
  lines: number;
  count: readonly [number, number];
  premium: number;
}>;

export const FARM_FISH_ORDER_TIERS: readonly FarmFishOrderTier[] = Object.freeze([
  Object.freeze({
    tier: "catch", minLevel: 1, lines: 1, count: Object.freeze([2, 4]) as readonly [number, number], premium: 1.6,
    needs: Object.freeze(["zone=lagoon", "rarity=common", "species=fish.goldfish", "species=fish.tetra", "species=fish.armored-catfish", "zone=lagoon,size=average"]),
  }),
  Object.freeze({
    tier: "special", minLevel: 10, lines: 2, count: Object.freeze([1, 2]) as readonly [number, number], premium: 1.75,
    needs: Object.freeze([
      "zone=reef", "rarity=uncommon", "species=fish.red-snapper", "species=fish.puffer", "species=fish.clownfish",
      "zone=reef,size=large", "species=fish.piranha,size=large", "rarity=rare", "species=fish.koi", "zone=deep",
    ]),
  }),
]);

/** A fish order's Fishing XP is this share of what landing its fish earned. */
export const FISH_ORDER_XP_SHARE = 0.5;

/**
 * A herd order's tier: gated on Husbandry, asking for `lines` different goods
 * out of `goods`, `count` pieces of each. The first asks only for what a
 * sheep gives, since sheep are what the Dealer sells at Husbandry 1.
 */
export type FarmHerdOrderTier = Readonly<{
  tier: "herd" | "herd-contract";
  minLevel: number;
  goods: readonly string[];
  lines: number;
  count: readonly [number, number];
  premium: number;
}>;

export const FARM_HERD_ORDER_TIERS: readonly FarmHerdOrderTier[] = Object.freeze([
  Object.freeze({ tier: "herd", minLevel: 1, goods: Object.freeze(["milk-sheep", "wool", "egg"]), lines: 1, count: Object.freeze([3, 6]) as readonly [number, number], premium: 1.6 }),
  Object.freeze({ tier: "herd-contract", minLevel: 10, goods: Object.freeze(["milk", "milk-sheep", "wool", "wool-llama", "egg"]), lines: 2, count: Object.freeze([3, 6]) as readonly [number, number], premium: 1.75 }),
]);

/**
 * Who pins the herd's notices up: dairies want milk, mills want wool, and a
 * fair or a farm shop takes both. A notice is written first and then pinned by
 * someone who would want exactly that, so a cheese cave never asks for fleece.
 */
export type FarmHerdCustomer = Readonly<{ name: string; note: string; wants: "milk" | "wool" | "egg" | "both" }>;
export const FARM_HERD_ORDER_CUSTOMERS: readonly FarmHerdCustomer[] = Object.freeze(([
  { name: "Hollow Creek Creamery", note: "The churns are standing idle. Bring it fresh from the pail.", wants: "milk" },
  { name: "Dunmore Cheese Cave", note: "The wheels won't age themselves.", wants: "milk" },
  { name: "Granny Pim's Tea Room", note: "Scones without cream are a crime in this town.", wants: "milk" },
  { name: "The Spinning Wheel", note: "Knitting circle meets Thursday and the baskets are empty.", wants: "wool" },
  { name: "Fleece & Fiber Mercantile", note: "Winter orders are piling up. Clean fleece only!", wants: "wool" },
  { name: "Brambleford Woollen Mill", note: "The looms eat faster than the flocks can grow it.", wants: "wool" },
  { name: "Sunnyside Diner", note: "Breakfast rush starts at six, and we go through eggs by the crate.", wants: "egg" },
  { name: "Rosehip Bakery", note: "The sponges won't rise on promises. Fresh eggs, please.", wants: "egg" },
  { name: "Thornbury Country Fair", note: "The dairy tent and the fleece tent both need filling by Saturday.", wants: "both" },
  { name: "Old Mill Farmstead Shop", note: "Anything off a farm animal sells out by noon. Bring plenty.", wants: "both" },
] as const).map((entry) => Object.freeze({ ...entry })));

/** Which customers would want these lines: milk only, wool only, eggs only, or a mix. */
function herdWants(lines: Readonly<Record<string, number>>): FarmHerdCustomer["wants"] {
  const kinds = new Set(Object.keys(lines).map((itemId) => (itemId.startsWith("milk") ? "milk" : itemId === "egg" ? "egg" : "wool")));
  return kinds.size === 1 ? [...kinds][0] as "milk" | "wool" | "egg" : "both";
}

/** A herd order's Husbandry XP is this share of what collecting its goods earned. */
export const HERD_ORDER_XP_SHARE = 0.5;

export type FarmOrder = Readonly<{
  id: string;
  day: number;
  slot: number;
  tier: FarmOrderTier["tier"] | FarmKitchenOrderTier["tier"] | FarmFishOrderTier["tier"] | FarmHerdOrderTier["tier"];
  /** What the lines name: produce from the basket, cooked dishes (any stars) from the pantry, fish needs from the creel, or livestock goods from the basket. */
  kind: "produce" | "dish" | "fish" | "goods";
  /** The skill that gates the order and that its XP goes to. */
  skill: "farming" | "cooking" | "fishing" | "husbandry";
  minLevel: number;
  customer: string;
  note: string;
  lines: Readonly<Record<string, number>>;
  tickets: number;
  xp: number;
  /** Real time (ms) the board turns over and this order comes down. */
  endsAt: number;
}>;

export function farmOrderDay(now: number): number {
  return Math.floor(now / FARM_ORDER_DAY_MS);
}

function pick<T>(list: readonly T[], random: () => number, taken: Set<T>): T {
  const open = list.filter((entry) => !taken.has(entry));
  const choice = open[Math.floor(random() * open.length)]!;
  taken.add(choice);
  return choice;
}

/** What the lines would fetch sold raw at the Produce Merchant. */
export function farmOrderRawValue(lines: Readonly<Record<string, number>>): number {
  return Object.entries(lines).reduce((sum, [cropId, quantity]) => sum + farmProducePrice(cropId) * quantity, 0);
}

/** The XP an order pays: a share of what harvesting its produce earned. */
export function farmOrderXp(lines: Readonly<Record<string, number>>): number {
  let xp = 0;
  for (const [cropId, quantity] of Object.entries(lines)) {
    xp += (quantity / FARM_CROP_RULES[cropId]!.yield) * farmHarvestXp(cropId);
  }
  return Math.max(1, Math.round(xp * ORDER_XP_SHARE));
}

/** Day `day`'s board: one order per tier, customers and crops all different. */
export function farmOrderBoard(day: number): readonly FarmOrder[] {
  const random = mulberry32(seedFor(`farm-orders:v1:${day}`));
  const cropIds = Object.keys(FARM_CROP_RULES);
  const customers = new Set<(typeof FARM_ORDER_CUSTOMERS)[number]>();
  return Object.freeze(FARM_ORDER_TIERS.map((tier, slot) => {
    const customer = pick(FARM_ORDER_CUSTOMERS, random, customers);
    const cropsTaken = new Set<string>();
    const lines: Record<string, number> = {};
    for (let index = 0; index < tier.crops; index += 1) {
      const cropId = pick(cropIds, random, cropsTaken);
      // Half-harvest steps between the tier's low and high.
      const steps = Math.round((tier.harvests[1] - tier.harvests[0]) * 2);
      const harvests = tier.harvests[0] + Math.floor(random() * (steps + 1)) / 2;
      lines[cropId] = Math.min(MAX_LINE, Math.max(1, Math.round(FARM_CROP_RULES[cropId]!.yield * harvests)));
    }
    const tickets = Math.ceil((farmOrderRawValue(lines) * tier.premium) / 5) * 5;
    return Object.freeze({
      id: `d${day}-${slot}`,
      day,
      slot,
      tier: tier.tier,
      kind: "produce" as const,
      skill: "farming" as const,
      minLevel: tier.minLevel,
      customer: customer.name,
      note: customer.note,
      lines: Object.freeze(lines),
      tickets,
      xp: farmOrderXp(lines),
      endsAt: (day + 1) * FARM_ORDER_DAY_MS,
    });
  }));
}

/** What the dishes would fetch at two stars at the Market's Kitchen. */
export function farmDishOrderValue(lines: Readonly<Record<string, number>>): number {
  return Object.entries(lines).reduce((sum, [recipeId, count]) => sum + farmDishPrice(recipeId, 2) * count, 0);
}

export function farmDishOrderXp(lines: Readonly<Record<string, number>>): number {
  const xp = Object.entries(lines).reduce((sum, [recipeId, count]) => sum + (FARM_RECIPE_RULES[recipeId]?.xp ?? 0) * count, 0);
  return Math.max(1, Math.round(xp * DISH_ORDER_XP_SHARE));
}

/** Day `day`'s dish notices, in the slots after the produce notices; customers not already on the board. */
function farmKitchenOrders(day: number, firstSlot: number, taken: ReadonlySet<string>): FarmOrder[] {
  const random = mulberry32(seedFor(`farm-orders:kitchen:v1:${day}`));
  const customers = new Set(FARM_ORDER_CUSTOMERS.filter((entry) => taken.has(entry.name)));
  return FARM_KITCHEN_ORDER_TIERS.map((tier, index) => {
    const customer = pick(FARM_ORDER_CUSTOMERS, random, customers);
    const taught = Object.keys(FARM_RECIPE_RULES).filter((recipeId) => {
      const rule = FARM_RECIPE_RULES[recipeId]!;
      // Dishes made with the herd's milk or meat stay off the kitchen notices, so no posted order changed when livestock came.
      return rule.vendorPrice === 0 && rule.minLevel <= tier.minLevel && !Object.keys(rule.ingredients).some((itemId) => FARM_LIVESTOCK_BASKET_IDS.includes(itemId));
    });
    const recipesTaken = new Set<string>();
    const lines: Record<string, number> = {};
    for (let line = 0; line < Math.min(tier.recipes, taught.length); line += 1) {
      const recipeId = pick(taught, random, recipesTaken);
      lines[recipeId] = tier.dishes[0] + Math.floor(random() * (tier.dishes[1] - tier.dishes[0] + 1));
    }
    const slot = firstSlot + index;
    return Object.freeze({
      id: `d${day}-${slot}`,
      day,
      slot,
      tier: tier.tier,
      kind: "dish" as const,
      skill: "cooking" as const,
      minLevel: tier.minLevel,
      customer: customer.name,
      note: customer.note,
      lines: Object.freeze(lines),
      tickets: Math.ceil((farmDishOrderValue(lines) * tier.premium) / 5) * 5,
      xp: farmDishOrderXp(lines),
      endsAt: (day + 1) * FARM_ORDER_DAY_MS,
    });
  });
}

/** What a fish order's lines would fetch at the Fishmonger, at their cheapest. */
export function farmFishOrderValue(lines: Readonly<Record<string, number>>): number {
  return Object.entries(lines).reduce((sum, [key, count]) => {
    const need = parseFishNeed(key);
    return sum + (need ? farmFishNeedValue(need) * count : 0);
  }, 0);
}

export function farmFishOrderXp(lines: Readonly<Record<string, number>>): number {
  const xp = Object.entries(lines).reduce((sum, [key, count]) => {
    const need = parseFishNeed(key);
    return sum + (need ? farmFishNeedXp(need) * count : 0);
  }, 0);
  return Math.max(1, Math.round(xp * FISH_ORDER_XP_SHARE));
}

/** Day `day`'s fish notices, in the slots after the kitchen's; customers not already on the board. */
function farmFishOrders(day: number, firstSlot: number, taken: ReadonlySet<string>): FarmOrder[] {
  const random = mulberry32(seedFor(`farm-orders:cove:v1:${day}`));
  const customers = new Set(FARM_ORDER_CUSTOMERS.filter((entry) => taken.has(entry.name)));
  return FARM_FISH_ORDER_TIERS.map((tier, index) => {
    // Every customer may already be up: then the board's regulars take a second notice.
    const customer = customers.size >= FARM_ORDER_CUSTOMERS.length ? FARM_ORDER_CUSTOMERS[(day + index) % FARM_ORDER_CUSTOMERS.length]! : pick(FARM_ORDER_CUSTOMERS, random, customers);
    const needsTaken = new Set<string>();
    const lines: Record<string, number> = {};
    for (let line = 0; line < Math.min(tier.lines, tier.needs.length); line += 1) {
      const key = pick(tier.needs, random, needsTaken);
      lines[key] = tier.count[0] + Math.floor(random() * (tier.count[1] - tier.count[0] + 1));
    }
    const slot = firstSlot + index;
    return Object.freeze({
      id: `d${day}-${slot}`,
      day,
      slot,
      tier: tier.tier,
      kind: "fish" as const,
      skill: "fishing" as const,
      minLevel: tier.minLevel,
      customer: customer.name,
      note: customer.note,
      lines: Object.freeze(lines),
      tickets: Math.ceil((farmFishOrderValue(lines) * tier.premium) / 5) * 5,
      xp: farmFishOrderXp(lines),
      endsAt: (day + 1) * FARM_ORDER_DAY_MS,
    });
  });
}

/** What a herd order's goods would fetch at the Produce Merchant, at Normal. */
export function farmHerdOrderValue(lines: Readonly<Record<string, number>>): number {
  return Object.entries(lines).reduce((sum, [itemId, count]) => sum + farmProducePrice(itemId) * count, 0);
}

/** A share of the XP collecting the goods earned: an average collection's pieces, at no stress. */
export function farmHerdOrderXp(lines: Readonly<Record<string, number>>): number {
  const xp = Object.entries(lines).reduce((sum, [itemId, count]) => {
    const good = farmLivestockGood(itemId);
    return sum + (good ? (count / AVERAGE_GOODS_PER_COLLECTION) * livestockCollectXp(good, 0) : 0);
  }, 0);
  return Math.max(1, Math.round(xp * HERD_ORDER_XP_SHARE));
}

/** Day `day`'s herd notices, in the slots after the Cove's. */
function farmHerdOrders(day: number, firstSlot: number): FarmOrder[] {
  const random = mulberry32(seedFor(`farm-orders:herd:v1:${day}`));
  const customers = new Set<FarmHerdCustomer>();
  return FARM_HERD_ORDER_TIERS.map((tier, index) => {
    const goodsTaken = new Set<string>();
    const lines: Record<string, number> = {};
    for (let line = 0; line < Math.min(tier.lines, tier.goods.length); line += 1) {
      const itemId = pick(tier.goods, random, goodsTaken);
      lines[itemId] = tier.count[0] + Math.floor(random() * (tier.count[1] - tier.count[0] + 1));
    }
    // Every kind has at least two customers and only two herd notices go up a day, so one is always free.
    const wants = herdWants(lines);
    const customer = pick(FARM_HERD_ORDER_CUSTOMERS.filter((entry) => entry.wants === wants), random, customers);
    const slot = firstSlot + index;
    return Object.freeze({
      id: `d${day}-${slot}`,
      day,
      slot,
      tier: tier.tier,
      kind: "goods" as const,
      skill: "husbandry" as const,
      minLevel: tier.minLevel,
      customer: customer.name,
      note: customer.note,
      lines: Object.freeze(lines),
      tickets: Math.ceil((farmHerdOrderValue(lines) * tier.premium) / 5) * 5,
      xp: farmHerdOrderXp(lines),
      endsAt: (day + 1) * FARM_ORDER_DAY_MS,
    });
  });
}

/** Day `day`'s whole board: the produce notices, then the kitchen's, then the Cove's, then the herd's. */
export function farmFullOrderBoard(day: number): readonly FarmOrder[] {
  const produce = farmOrderBoard(day);
  const kitchen = farmKitchenOrders(day, produce.length, new Set(produce.map((order) => order.customer)));
  const upSoFar = [...produce, ...kitchen];
  const withFish = [...upSoFar, ...farmFishOrders(day, upSoFar.length, new Set(upSoFar.map((order) => order.customer)))];
  return Object.freeze([...withFish, ...farmHerdOrders(day, withFish.length)]);
}

const ORDER_ID = /^d(\d{1,7})-(\d)$/;

/** The order an id names, if it is on day `day`'s board. An id from any other day is not. */
export function findFarmOrder(orderId: unknown, day: number): FarmOrder | null {
  const match = typeof orderId === "string" ? ORDER_ID.exec(orderId) : null;
  if (!match || Number(match[1]) !== day) return null;
  return farmFullOrderBoard(day)[Number(match[2])] ?? null;
}

/** An id that is well formed but for another day: the board has turned over. */
export function isStaleFarmOrderId(orderId: unknown, day: number): boolean {
  const match = typeof orderId === "string" ? ORDER_ID.exec(orderId) : null;
  return Boolean(match) && Number(match![1]) !== day;
}

export function farmOrderTransactionKey(orderId: string): string {
  return `farm:order:${orderId}`;
}
