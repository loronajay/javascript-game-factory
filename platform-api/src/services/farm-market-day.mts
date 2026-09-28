// The Market Square's day: what the Produce Merchant pays TODAY, and which
// seeds the Seed Merchant has on special. A pure function of the UTC day, like
// the Order Board — one set of prices for everyone in the shared square,
// nothing stored to rotate it. The page reads it from
// `GET /games/farm/market/prices`; a sale or a special-price purchase names the
// day it was priced on, and a day that has turned over is refused rather than
// paid at a price the player never saw.
//
// MILD ON PURPOSE (plan §18.1). A price moves at most MARKET_PRICE_SWING either
// way of its derived Normal price, in MARKET_PRICE_STEP steps, and the middle
// is likelier than the ends. The point is a decision — sell today, or hold the
// basket for a better day — never a speculative market. Orders, dishes and
// furniture keep their fixed prices: only raw produce at the merchant moves.

import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { findFarmSupply } from "./farm-economy-catalog.mjs";
import { farmProducePrice } from "./farm-market-catalog.mjs";
import { FARM_PRODUCE_KEYS, QUALITY_PRICE, parseFarmProduceKey } from "./farm-quality-catalog.mjs";
import { farmSeedFor, farmSeededRandom } from "./farm-seeded-random.mjs";

export const FARM_MARKET_DAY_MS = 24 * 60 * 60 * 1000;
export const MARKET_PRICE_SWING = 0.2;
export const MARKET_PRICE_STEP = 0.05;
/** How many seeds the Seed Merchant has on special each day, and how much off. */
export const SEED_SPECIAL_COUNT = 3;
export const SEED_SPECIAL_DISCOUNT = 0.25;

export function farmMarketDay(now: number): number {
  return Math.floor(now / FARM_MARKET_DAY_MS);
}

/** A crop or fruit's price factor on day `day`: 1 ± up to the swing, in steps, the middle likelier. */
export function farmMarketFactor(itemId: string, day: number): number {
  const random = farmSeededRandom(farmSeedFor(`farm-market:v1:${day}:${itemId}`));
  const steps = Math.round(MARKET_PRICE_SWING / MARKET_PRICE_STEP);
  // The mean of two draws: a triangle over [-1, 1], so the ends are rare.
  const unit = (random() + random()) - 1;
  const step = Math.max(-steps, Math.min(steps, Math.round(unit * steps)));
  return Number((1 + step * MARKET_PRICE_STEP).toFixed(2));
}

/**
 * What the Produce Merchant pays on day `day` for one of a basket key: the
 * derived Normal price, moved by the day, by the grade. Never below one
 * ticket; 0 for anything the merchant does not buy.
 */
export function farmMarketProducePrice(key: unknown, day: number): number {
  const parsed = parseFarmProduceKey(key);
  if (!parsed) return 0;
  const base = farmProducePrice(parsed.itemId);
  if (!base) return 0;
  return Math.max(1, Math.round(base * farmMarketFactor(parsed.itemId, day) * QUALITY_PRICE[parsed.quality]));
}

/** Which way a crop or fruit's Normal price moved since yesterday. */
export function farmMarketTrend(itemId: string, day: number): -1 | 0 | 1 {
  const today = farmMarketFactor(itemId, day);
  const yesterday = farmMarketFactor(itemId, day - 1);
  return today > yesterday ? 1 : today < yesterday ? -1 : 0;
}

/** The seeds on special on day `day`: SEED_SPECIAL_COUNT different crops. */
export function farmSeedSpecials(day: number): readonly string[] {
  const random = farmSeededRandom(farmSeedFor(`farm-seed-specials:v1:${day}`));
  const open = Object.keys(FARM_CROP_RULES);
  const picked: string[] = [];
  while (picked.length < Math.min(SEED_SPECIAL_COUNT, open.length)) {
    picked.push(open.splice(Math.floor(random() * open.length), 1)[0]!);
  }
  return Object.freeze(picked.sort());
}

/**
 * What one seed of a crop costs at the Seed Merchant on day `day`: the
 * standing price, or the special's when it is on special. The farm's own
 * seed shop always charges the standing price — the special is the reason to
 * walk down the road.
 */
export function farmMarketSeedPrice(cropId: string, day: number): number {
  const supply = findFarmSupply(`seed.${cropId}`);
  if (!supply) return 0;
  return farmSeedSpecials(day).includes(cropId) ? Math.max(1, Math.ceil(supply.price * (1 - SEED_SPECIAL_DISCOUNT))) : supply.price;
}

export type FarmMarketBoard = Readonly<{
  day: number;
  endsAt: number;
  /** Today's price for every basket key. */
  prices: Readonly<Record<string, number>>;
  /** Which way each crop and fruit moved since yesterday. */
  trends: Readonly<Record<string, -1 | 0 | 1>>;
  /** The Seed Merchant's specials: crop id → today's price per seed. */
  seedSpecials: Readonly<Record<string, number>>;
}>;

export function farmMarketBoard(day: number): FarmMarketBoard {
  const itemIds = [...new Set(FARM_PRODUCE_KEYS.map((key) => parseFarmProduceKey(key)!.itemId))];
  return Object.freeze({
    day,
    endsAt: (day + 1) * FARM_MARKET_DAY_MS,
    prices: Object.freeze(Object.fromEntries(FARM_PRODUCE_KEYS.map((key) => [key, farmMarketProducePrice(key, day)]))),
    trends: Object.freeze(Object.fromEntries(itemIds.map((itemId) => [itemId, farmMarketTrend(itemId, day)]))),
    seedSpecials: Object.freeze(Object.fromEntries(farmSeedSpecials(day).map((cropId) => [cropId, farmMarketSeedPrice(cropId, day)]))),
  });
}
