// The Market Square's prices and sale maths, for display. PURE — no DOM, no
// THREE, no storage. The server owns the real prices
// (platform-api/src/services/farm-market-catalog.mts) and the payout; this is
// the same derivation off the client's crop catalog so the merchant's board can
// show them, and platform-api/tests/farm-market.test.mjs holds the two equal.

import { CROP_CATALOG, FARM_DAY_MINUTES, type CropDefinition } from "./farm-crops.mjs";
import { FRUIT_TREES, type TreeSpecies } from "./farm-catalog/trees.mjs";

/** Ticket margin one productive cell earns per farm day of growth when its crop is sold raw. */
export const MARKET_MARGIN_PER_CELL_DAY = 12;
export const MAX_SALE_QUANTITY = 99;

/** Seed back plus the day margin, over the harvest's yield, rounded up to a whole ticket. */
export function derivedProducePrice(crop: Pick<CropDefinition, "growMinutes" | "yield" | "seedPrice">): number {
  return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (crop.growMinutes / FARM_DAY_MINUTES) + crop.seedPrice) / crop.yield);
}

/** Fruit per productive slot the same way: a tree's fruiting days at the same margin, over a pick's yield. */
export function derivedFruitPrice(species: Pick<TreeSpecies, "fruitEveryMinutes" | "yield">): number {
  return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (species.fruitEveryMinutes / FARM_DAY_MINUTES)) / species.yield);
}

export const PRODUCE_PRICES: Readonly<Record<string, number>> = Object.freeze(Object.fromEntries([
  ...CROP_CATALOG.map((crop) => [crop.id, derivedProducePrice(crop)]),
  ...FRUIT_TREES.map((species) => [species.fruitId, derivedFruitPrice(species)]),
]));

/** Everything the merchant buys, in the order the counter lists it: the crops, then the fruit. */
const SELLABLE: readonly Readonly<{ id: string; title: string; color: string }>[] = Object.freeze([
  ...CROP_CATALOG.map((crop) => Object.freeze({ id: crop.id, title: crop.title, color: "" })),
  ...FRUIT_TREES.map((species) => Object.freeze({ id: species.fruitId, title: species.fruitTitle, color: species.fruitColor })),
]);

export function producePrice(cropId: string): number {
  return Object.prototype.hasOwnProperty.call(PRODUCE_PRICES, cropId) ? PRODUCE_PRICES[cropId]! : 0;
}

export type SaleLine = Readonly<{ cropId: string; title: string; held: number; quantity: number; price: number; /** Fruit has no crop model to portray; its colour stands in. */ color: string }>;

/**
 * The merchant's board: every crop and fruit the player holds any of, in
 * catalog order, with the quantity they have picked to sell (clamped to what they hold).
 */
export function saleLines(produce: Readonly<Record<string, number>>, picked: Readonly<Record<string, number>>): SaleLine[] {
  return SELLABLE
    .map((item) => {
      const held = Math.max(0, Math.floor(Number(produce[item.id]) || 0));
      const quantity = Math.min(held, MAX_SALE_QUANTITY, Math.max(0, Math.floor(Number(picked[item.id]) || 0)));
      return { cropId: item.id, title: item.title, held, quantity, price: producePrice(item.id), color: item.color };
    })
    .filter((line) => line.held > 0);
}

export function saleTotal(lines: readonly SaleLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
}

/** The request body's `items`: only the lines with something picked. */
export function saleItems(lines: readonly SaleLine[]): Record<string, number> {
  return Object.fromEntries(lines.filter((line) => line.quantity > 0).map((line) => [line.cropId, line.quantity]));
}
