// The Market Square's day, for display. PURE — no DOM, no THREE, no storage.
//
// The server decides what the Produce Merchant pays today and which seeds the
// Seed Merchant has on special (platform-api/src/services/farm-market-day.mts,
// read from `GET /games/farm/market/prices`): one set of prices for everyone
// in the square, turning over at UTC midnight, moving at most a fifth either
// way of each crop's standing price. This module makes that answer safe to
// show and turns it into counter lines. A sale or a special-price purchase
// names the day it was shown; if the day turned over first, the server says
// `prices_changed` and the page reads the new day.

import { CROP_CATALOG } from "./farm-crops.mjs";
import { producePrice } from "./farm-market-prices.mjs";

export type MarketTrend = -1 | 0 | 1;

export type MarketDay = Readonly<{
  day: number;
  endsAt: number;
  /** Today's price for every basket key the merchant buys. */
  prices: Readonly<Record<string, number>>;
  /** Which way each crop and fruit moved since yesterday. */
  trends: Readonly<Record<string, MarketTrend>>;
  /** Crop id → today's price per seed, for the seeds on special. */
  seedSpecials: Readonly<Record<string, number>>;
}>;

function whole(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function prices(value: unknown): Record<string, number> {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(source)) {
    const price = whole(raw);
    if (price !== null && price > 0 && /^[a-z0-9-]+(@[a-z]+)?$/.test(key)) result[key] = price;
  }
  return result;
}

/** The server's day made safe, or null when it is not one. */
export function normalizeMarketDay(value: unknown): MarketDay | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const day = whole(source.day);
  const endsAt = whole(source.endsAt);
  if (day === null || endsAt === null) return null;
  const trends: Record<string, MarketTrend> = {};
  for (const [id, raw] of Object.entries(source.trends && typeof source.trends === "object" ? source.trends as Record<string, unknown> : {})) {
    if (raw === -1 || raw === 0 || raw === 1) trends[id] = raw;
  }
  return Object.freeze({
    day,
    endsAt,
    prices: Object.freeze(prices(source.prices)),
    trends: Object.freeze(trends),
    seedSpecials: Object.freeze(prices(source.seedSpecials)),
  });
}

/** What the merchant pays today for one of a basket key; the standing price until the day has loaded. */
export function dayPrice(market: MarketDay | null, key: string): number {
  return market?.prices[key] ?? producePrice(key);
}

export function trendArrow(trend: MarketTrend | undefined): string {
  return trend === 1 ? "▲" : trend === -1 ? "▼" : "—";
}

/** What a line on the Produce Merchant's counter says beside its price: today's move. */
export function trendNote(market: MarketDay | null, key: string): string {
  if (!market) return "";
  const itemId = key.split("@")[0]!;
  const trend = market.trends[itemId];
  return trend === 1 ? "▲ up today" : trend === -1 ? "▼ down today" : "— steady";
}

export type SeedShelfLine = Readonly<{
  cropId: string;
  title: string;
  /** What one seed costs here today. */
  price: number;
  /** What it costs from the farm's own seed shop. */
  standing: number;
  special: boolean;
  held: number;
}>;

/** The Seed Merchant's shelf: every crop's seed, today's specials first, then catalog order. */
export function seedShelf(market: MarketDay | null, seeds: Readonly<Record<string, number>>): readonly SeedShelfLine[] {
  const lines = CROP_CATALOG.map((crop) => {
    const special = market?.seedSpecials[crop.id];
    return Object.freeze({
      cropId: crop.id,
      title: crop.title,
      price: special ?? crop.seedPrice,
      standing: crop.seedPrice,
      special: special !== undefined,
      held: Math.max(0, Math.floor(Number(seeds[crop.id]) || 0)),
    });
  });
  return Object.freeze([...lines.filter((line) => line.special), ...lines.filter((line) => !line.special)]);
}

/** "Prices change in 3h 12m": when the day turns over, from `now`. */
export function turnoverNote(market: MarketDay | null, now: number): string {
  if (!market) return "";
  const minutes = Math.max(0, Math.ceil((market.endsAt - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return `Prices change in ${hours ? `${hours}h ` : ""}${minutes % 60}m`;
}
