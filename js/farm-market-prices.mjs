// The Market Square's prices and sale maths, for display. PURE — no DOM, no
// THREE, no storage. The server owns the real prices
// (platform-api/src/services/farm-market-catalog.mts) and the payout; this is
// the same derivation off the client's crop catalog so the merchant's board can
// show them, and platform-api/tests/farm-market.test.mjs holds the two equal.
import { CROP_CATALOG, FARM_DAY_MINUTES } from "./farm-crops.mjs";
/** Ticket margin one productive cell earns per farm day of growth when its crop is sold raw. */
export const MARKET_MARGIN_PER_CELL_DAY = 12;
export const MAX_SALE_QUANTITY = 99;
/** Seed back plus the day margin, over the harvest's yield, rounded up to a whole ticket. */
export function derivedProducePrice(crop) {
    return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (crop.growMinutes / FARM_DAY_MINUTES) + crop.seedPrice) / crop.yield);
}
export const PRODUCE_PRICES = Object.freeze(Object.fromEntries(CROP_CATALOG.map((crop) => [crop.id, derivedProducePrice(crop)])));
export function producePrice(cropId) {
    return Object.prototype.hasOwnProperty.call(PRODUCE_PRICES, cropId) ? PRODUCE_PRICES[cropId] : 0;
}
/**
 * The merchant's board: every crop the player holds any of, in catalog order,
 * with the quantity they have picked to sell (clamped to what they hold).
 */
export function saleLines(produce, picked) {
    return CROP_CATALOG
        .map((crop) => {
        const held = Math.max(0, Math.floor(Number(produce[crop.id]) || 0));
        const quantity = Math.min(held, MAX_SALE_QUANTITY, Math.max(0, Math.floor(Number(picked[crop.id]) || 0)));
        return { cropId: crop.id, title: crop.title, held, quantity, price: producePrice(crop.id) };
    })
        .filter((line) => line.held > 0);
}
export function saleTotal(lines) {
    return lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
}
/** The request body's `items`: only the lines with something picked. */
export function saleItems(lines) {
    return Object.fromEntries(lines.filter((line) => line.quantity > 0).map((line) => [line.cropId, line.quantity]));
}
