// What the Market Square's Produce Merchant pays for a farm crop. Server-owned:
// the client names crops and counts, never a price (js/farm-market-prices.mts mirrors
// the table for display and tests/farm-market.test.mjs holds the two together).
//
// Prices are DERIVED from each crop's production economics rather than picked:
// a sold harvest returns the seed plus a flat margin for every farm day the cell
// was busy growing it, so no crop is the dominant answer per productive cell.
// A farm day is one real hour of play, so a full starter field (6 cells) tops
// out near 72 tickets an hour of tending — modest beside arcade play, by the
// plan's rule that passive raw farming is the low-value use of a crop.
import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { findFarmSupply } from "./farm-economy-catalog.mjs";
const DAY = 24 * 60;
/** Ticket margin one productive cell earns per farm day of growth when its crop is sold raw. */
export const MARKET_MARGIN_PER_CELL_DAY = 12;
/** The most of one crop a single sale may carry (a produce stack caps at 99). */
export const MAX_SALE_QUANTITY = 99;
/** Seed back plus the day margin, over the harvest's yield, rounded up to a whole ticket. */
export function derivedProducePrice(rule, seedPrice) {
    return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (rule.growMinutes / DAY) + seedPrice) / rule.yield);
}
export const FARM_PRODUCE_PRICES = Object.freeze(Object.fromEntries(Object.entries(FARM_CROP_RULES).map(([cropId, rule]) => {
    const seed = findFarmSupply(`seed.${cropId}`);
    if (!seed)
        throw new Error(`farm-market-catalog: ${cropId} has no seed price`);
    return [cropId, derivedProducePrice(rule, seed.price)];
})));
export function farmProducePrice(cropId) {
    return typeof cropId === "string" && Object.prototype.hasOwnProperty.call(FARM_PRODUCE_PRICES, cropId)
        ? FARM_PRODUCE_PRICES[cropId]
        : 0;
}
/**
 * A sale request made safe: known crops only, whole positive counts, at most
 * MAX_SALE_QUANTITY each, at least one line. `null` for anything else.
 */
export function normalizeSaleLines(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const lines = {};
    for (const [cropId, raw] of Object.entries(value)) {
        const quantity = Number(raw);
        if (!farmProducePrice(cropId))
            return null;
        if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_SALE_QUANTITY)
            return null;
        if (quantity > 0)
            lines[cropId] = quantity;
    }
    return Object.keys(lines).length ? Object.freeze(lines) : null;
}
