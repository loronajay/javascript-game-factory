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
import { FARM_TREE_RULES } from "./farm-tree-catalog.mjs";
import { FARM_LIVESTOCK_GOODS, farmLivestockGoodPrice } from "./farm-livestock-catalog.mjs";
import { FARM_RECIPE_RULES, farmRecipeRule, parseFarmDishKey } from "./farm-recipe-catalog.mjs";
import { farmPiecePrice, parseFarmPieceKey } from "./farm-carpentry-catalog.mjs";
import { QUALITY_PRICE, parseFarmProduceKey } from "./farm-quality-catalog.mjs";
import { farmFishNeedValue, parseFishNeed } from "./farm-fish-catalog.mjs";
const DAY = 24 * 60;
/** Ticket margin one productive cell earns per farm day of growth when its crop is sold raw. */
export const MARKET_MARGIN_PER_CELL_DAY = 12;
/** The most of one crop a single sale may carry (a produce stack caps at 99). */
export const MAX_SALE_QUANTITY = 99;
/** Seed back plus the day margin, over the harvest's yield, rounded up to a whole ticket. */
export function derivedProducePrice(rule, seedPrice) {
    return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (rule.growMinutes / DAY) + seedPrice) / rule.yield);
}
/**
 * Fruit is priced the same way, per productive slot: a tree's fruiting days
 * at the same margin, over what a pick yields. The sapling is not in it — a
 * tree fruits for as long as it stands, so its cost is paid back many times.
 */
export function derivedFruitPrice(rule) {
    return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (rule.fruitEveryMinutes / DAY)) / rule.yield);
}
export const FARM_PRODUCE_PRICES = Object.freeze(Object.fromEntries([
    ...Object.entries(FARM_CROP_RULES).map(([cropId, rule]) => {
        const seed = findFarmSupply(`seed.${cropId}`);
        if (!seed)
            throw new Error(`farm-market-catalog: ${cropId} has no seed price`);
        return [cropId, derivedProducePrice(rule, seed.price)];
    }),
    ...Object.entries(FARM_TREE_RULES).filter(([, rule]) => rule.kind === "fruit").map(([fruitId, rule]) => [fruitId, derivedFruitPrice(rule)]),
    ...FARM_LIVESTOCK_GOODS.map((good) => [good.itemId, farmLivestockGoodPrice(good)]),
]));
export function farmProducePrice(cropId) {
    return typeof cropId === "string" && Object.prototype.hasOwnProperty.call(FARM_PRODUCE_PRICES, cropId)
        ? FARM_PRODUCE_PRICES[cropId]
        : 0;
}
// ---------------------------------------------------------------- cooked dishes
/**
 * What the Market's Kitchen pays for a dish: what its ingredients would fetch
 * raw at the Produce Merchant, times a premium for how well it was cooked. The
 * premium is the reason to cook at all — the plan's rule that processed goods
 * are worth more than the crop — and it grows with the stars, so the cooking
 * game is worth playing well.
 */
export const DISH_PREMIUM = Object.freeze({ 1: 1.25, 2: 1.45, 3: 1.7 });
/** The raw value of one cook of a recipe: its produce at the Produce Merchant, its fish at the Fishmonger (the cheapest that would do). */
export function farmRecipeRawValue(recipeId) {
    const rule = farmRecipeRule(recipeId);
    if (!rule)
        return 0;
    const produce = Object.entries(rule.ingredients).reduce((sum, [id, count]) => sum + farmProducePrice(id) * count, 0);
    const need = rule.fish ? parseFishNeed(rule.fish.need) : null;
    return produce + (need ? farmFishNeedValue(need) * rule.fish.count : 0);
}
export function farmDishPrice(recipeId, stars) {
    const raw = farmRecipeRawValue(recipeId);
    return raw > 0 ? Math.ceil(raw * DISH_PREMIUM[stars]) : 0;
}
export const FARM_DISH_PRICES = Object.freeze(Object.fromEntries(Object.keys(FARM_RECIPE_RULES).flatMap((recipeId) => [1, 2, 3].map((stars) => [`${recipeId}@${stars}`, farmDishPrice(recipeId, stars)]))));
/**
 * Whatever a sale line names — a crop or fruit of some grade, a dish or a piece
 * of furniture — at the server's STANDING price, or 0 for anything the market
 * does not buy. Produce sold at the merchant is paid at the day's price
 * instead (services/farm-market-day `farmMarketProducePrice`); this is its
 * Normal-day value, which is what an offer is weighed against.
 */
export function farmSalePrice(itemId) {
    const dish = parseFarmDishKey(itemId);
    if (dish)
        return farmDishPrice(dish.recipeId, dish.stars);
    const piece = parseFarmPieceKey(itemId);
    if (piece)
        return farmPiecePrice(piece.itemId, piece.stars);
    const produce = parseFarmProduceKey(itemId);
    if (!produce)
        return 0;
    return Math.max(1, Math.round(farmProducePrice(produce.itemId) * QUALITY_PRICE[produce.quality]));
}
/**
 * A sale request made safe: known crops (any grade), fruit, dishes and furniture only, whole positive
 * counts, at most MAX_SALE_QUANTITY each, at least one line. `null` for anything else.
 */
export function normalizeSaleLines(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    const lines = {};
    for (const [cropId, raw] of Object.entries(value)) {
        const quantity = Number(raw);
        if (!farmSalePrice(cropId))
            return null;
        if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_SALE_QUANTITY)
            return null;
        if (quantity > 0)
            lines[cropId] = quantity;
    }
    return Object.keys(lines).length ? Object.freeze(lines) : null;
}
