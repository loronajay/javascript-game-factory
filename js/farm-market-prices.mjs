// The Market Square's prices and sale maths, for display. PURE — no DOM, no
// THREE, no storage. The server owns the real prices
// (platform-api/src/services/farm-market-catalog.mts) and the payout; this is
// the same derivation off the client's crop catalog so the merchant's board can
// show them, and platform-api/tests/farm-market.test.mjs holds the two equal.
import { CROP_CATALOG, FARM_DAY_MINUTES } from "./farm-crops.mjs";
import { FRUIT_TREES } from "./farm-catalog/trees.mjs";
import { DISH_STARS, RECIPE_CATALOG, dishKey, parseDishKey } from "./farm-catalog/recipes.mjs";
import { starsLabel } from "./farm-kitchen.mjs";
/** Ticket margin one productive cell earns per farm day of growth when its crop is sold raw. */
export const MARKET_MARGIN_PER_CELL_DAY = 12;
export const MAX_SALE_QUANTITY = 99;
/** Seed back plus the day margin, over the harvest's yield, rounded up to a whole ticket. */
export function derivedProducePrice(crop) {
    return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (crop.growMinutes / FARM_DAY_MINUTES) + crop.seedPrice) / crop.yield);
}
/** Fruit per productive slot the same way: a tree's fruiting days at the same margin, over a pick's yield. */
export function derivedFruitPrice(species) {
    return Math.ceil((MARKET_MARGIN_PER_CELL_DAY * (species.fruitEveryMinutes / FARM_DAY_MINUTES)) / species.yield);
}
export const PRODUCE_PRICES = Object.freeze(Object.fromEntries([
    ...CROP_CATALOG.map((crop) => [crop.id, derivedProducePrice(crop)]),
    ...FRUIT_TREES.map((species) => [species.fruitId, derivedFruitPrice(species)]),
]));
/** Everything the Produce Merchant buys, in the order the counter lists it: the crops, then the fruit. */
export const SELLABLE_PRODUCE = Object.freeze([
    ...CROP_CATALOG.map((crop) => Object.freeze({ id: crop.id, title: crop.title, itemKey: `produce:${crop.id}` })),
    ...FRUIT_TREES.map((species) => Object.freeze({ id: species.fruitId, title: species.fruitTitle, itemKey: `produce:${species.fruitId}` })),
]);
export function producePrice(cropId) {
    return Object.prototype.hasOwnProperty.call(PRODUCE_PRICES, cropId) ? PRODUCE_PRICES[cropId] : 0;
}
// ---------------------------------------------------------------- cooked dishes
/** The Kitchen's premium on the ingredients' raw price, by stars (platform-api's farm-market-catalog is the payer). */
export const DISH_PREMIUM = Object.freeze({ 1: 1.25, 2: 1.45, 3: 1.7 });
/** What one cook of a recipe would fetch sold raw at the Produce Merchant. */
export function recipeRawValue(recipeId) {
    const recipe = RECIPE_CATALOG.find((entry) => entry.id === recipeId);
    return recipe ? Object.entries(recipe.ingredients).reduce((sum, [id, count]) => sum + producePrice(id) * count, 0) : 0;
}
export function dishPrice(recipeId, stars) {
    const raw = recipeRawValue(recipeId);
    return raw > 0 ? Math.ceil(raw * DISH_PREMIUM[stars]) : 0;
}
export const DISH_PRICES = Object.freeze(Object.fromEntries(RECIPE_CATALOG.flatMap((recipe) => DISH_STARS.map((stars) => [dishKey(recipe.id, stars), dishPrice(recipe.id, stars)]))));
/** Everything the Kitchen buys: every dish, best stars first within a recipe. */
export const SELLABLE_DISHES = Object.freeze(RECIPE_CATALOG.flatMap((recipe) => [...DISH_STARS].reverse().map((stars) => Object.freeze({
    id: dishKey(recipe.id, stars),
    title: `${recipe.title} ${starsLabel(stars)}`,
    itemKey: `dish:${dishKey(recipe.id, stars)}`,
}))));
/** The price of whatever a sale line names: a crop, a fruit or a dish. */
export function salePrice(id) {
    const dish = parseDishKey(id);
    return dish ? dishPrice(dish.recipe.id, dish.stars) : producePrice(id);
}
/**
 * A stall's board: everything it buys that the player holds any of, in its
 * order, with the quantity they have picked to sell (clamped to what they hold).
 * The Produce Merchant's by default; the Kitchen passes SELLABLE_DISHES and the pantry.
 */
export function saleLines(stock, picked, sellable = SELLABLE_PRODUCE) {
    return sellable
        .map((item) => {
        const held = Math.max(0, Math.floor(Number(stock[item.id]) || 0));
        const quantity = Math.min(held, MAX_SALE_QUANTITY, Math.max(0, Math.floor(Number(picked[item.id]) || 0)));
        return { cropId: item.id, title: item.title, held, quantity, price: salePrice(item.id), itemKey: item.itemKey };
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
