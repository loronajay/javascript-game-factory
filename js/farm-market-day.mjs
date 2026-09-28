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
function whole(value) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function prices(value) {
    const source = value && typeof value === "object" ? value : {};
    const result = {};
    for (const [key, raw] of Object.entries(source)) {
        const price = whole(raw);
        if (price !== null && price > 0 && /^[a-z0-9-]+(@[a-z]+)?$/.test(key))
            result[key] = price;
    }
    return result;
}
/** The server's day made safe, or null when it is not one. */
export function normalizeMarketDay(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    const day = whole(source.day);
    const endsAt = whole(source.endsAt);
    if (day === null || endsAt === null)
        return null;
    const trends = {};
    for (const [id, raw] of Object.entries(source.trends && typeof source.trends === "object" ? source.trends : {})) {
        if (raw === -1 || raw === 0 || raw === 1)
            trends[id] = raw;
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
export function dayPrice(market, key) {
    return market?.prices[key] ?? producePrice(key);
}
export function trendArrow(trend) {
    return trend === 1 ? "▲" : trend === -1 ? "▼" : "—";
}
/** What a line on the Produce Merchant's counter says beside its price: today's move. */
export function trendNote(market, key) {
    if (!market)
        return "";
    const itemId = key.split("@")[0];
    const trend = market.trends[itemId];
    return trend === 1 ? "▲ up today" : trend === -1 ? "▼ down today" : "— steady";
}
/** The Seed Merchant's shelf: every crop's seed, today's specials first, then catalog order. */
export function seedShelf(market, seeds) {
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
export function turnoverNote(market, now) {
    if (!market)
        return "";
    const minutes = Math.max(0, Math.ceil((market.endsAt - now) / 60_000));
    const hours = Math.floor(minutes / 60);
    return `Prices change in ${hours ? `${hours}h ` : ""}${minutes % 60}m`;
}
