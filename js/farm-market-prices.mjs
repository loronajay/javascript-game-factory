// The Market Square's prices and sale maths, for display. PURE — no DOM, no
// THREE, no storage. The server owns the real prices
// (platform-api/src/services/farm-market-catalog.mts) and the payout; this is
// the same derivation off the client's crop catalog so the merchant's board can
// show them, and platform-api/tests/farm-market.test.mjs holds the two equal.
import { CROP_CATALOG, FARM_DAY_MINUTES } from "./farm-crops.mjs";
import { FRUIT_TREES, TIMBER_TREES } from "./farm-catalog/trees.mjs";
import { DISH_STARS, RECIPE_CATALOG, dishKey, parseDishKey } from "./farm-catalog/recipes.mjs";
import { starsLabel } from "./farm-kitchen.mjs";
import { PATTERN_CATALOG, PIECE_STARS, PLANKS_PER_LOG, parsePieceKey, pieceKey } from "./farm-catalog/carpentry.mjs";
import { QUALITIES, QUALITY_PRICE, gradedTitle, parseProduceKey, produceKey } from "./farm-quality.mjs";
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
/**
 * Everything the Produce Merchant buys, in the order the counter lists it: each
 * crop at every grade, finest first (farm-quality.mts), then the fruit.
 */
export const SELLABLE_PRODUCE = Object.freeze([
    ...CROP_CATALOG.flatMap((crop) => [...QUALITIES].reverse().map((quality) => {
        const id = produceKey(crop.id, quality);
        return Object.freeze({ id, title: gradedTitle(crop.title, quality), itemKey: `produce:${id}` });
    })),
    ...FRUIT_TREES.map((species) => Object.freeze({ id: species.fruitId, title: species.fruitTitle, itemKey: `produce:${species.fruitId}` })),
]);
/**
 * A basket key's STANDING price: its crop's Normal price by its grade. The
 * merchant pays the day's price instead (the server's `/games/farm/market/prices`);
 * this is what an order, a recipe and a Market listing are weighed against.
 */
export function producePrice(key) {
    const parsed = parseProduceKey(key);
    if (!parsed || !Object.prototype.hasOwnProperty.call(PRODUCE_PRICES, parsed.itemId))
        return 0;
    const base = PRODUCE_PRICES[parsed.itemId];
    return parsed.quality === "normal" ? base : Math.max(1, Math.round(base * QUALITY_PRICE[parsed.quality]));
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
// ---------------------------------------------------------------- furniture
/**
 * What the Sawmill pays for a piece: its planks' worth times a premium by
 * stars, and half back of any tickets a fine piece asked for. A log is worth a
 * timber tree's regrowth days at the market's margin over the logs a felling
 * yields; a plank is a third of a log (platform-api's farm-carpentry-catalog pays).
 */
export const PIECE_PREMIUM = Object.freeze({ 1: 2, 2: 2.5, 3: 3.2 });
export const PIECE_TICKET_RESALE = 0.5;
export function plankValue(speciesId) {
    const species = TIMBER_TREES.find((entry) => entry.id === speciesId);
    return species ? (MARKET_MARGIN_PER_CELL_DAY * (species.regrowMinutes / FARM_DAY_MINUTES)) / species.yield / PLANKS_PER_LOG : 0;
}
export function pieceRawValue(itemId) {
    const pattern = PATTERN_CATALOG.find((entry) => entry.id === itemId);
    return pattern ? Object.entries(pattern.planks).reduce((sum, [speciesId, count]) => sum + plankValue(speciesId) * count, 0) : 0;
}
export function piecePrice(itemId, stars) {
    const pattern = PATTERN_CATALOG.find((entry) => entry.id === itemId);
    return pattern ? Math.ceil(pieceRawValue(itemId) * PIECE_PREMIUM[stars] + pattern.tickets * PIECE_TICKET_RESALE) : 0;
}
export const PIECE_PRICES = Object.freeze(Object.fromEntries(PATTERN_CATALOG.flatMap((pattern) => PIECE_STARS.map((stars) => [pieceKey(pattern.id, stars), piecePrice(pattern.id, stars)]))));
/** Everything the Sawmill buys: every piece, finest first within a pattern. */
export const SELLABLE_FURNITURE = Object.freeze(PATTERN_CATALOG.flatMap((pattern) => [...PIECE_STARS].reverse().map((stars) => Object.freeze({
    id: pieceKey(pattern.id, stars),
    title: `${pattern.title} ${starsLabel(stars)}`,
    itemKey: `piece:${pieceKey(pattern.id, stars)}`,
}))));
/** The price of whatever a sale line names: a crop, a fruit, a dish or a piece of furniture. */
export function salePrice(id) {
    const dish = parseDishKey(id);
    if (dish)
        return dishPrice(dish.recipe.id, dish.stars);
    const piece = parsePieceKey(id);
    if (piece)
        return piecePrice(piece.pattern.id, piece.stars);
    return producePrice(id);
}
/**
 * A stall's board: everything it buys that the player holds any of, in its
 * order, with the quantity they have picked to sell (clamped to what they hold).
 * The Produce Merchant's by default; the Kitchen passes SELLABLE_DISHES and the pantry.
 */
export function saleLines(stock, picked, sellable = SELLABLE_PRODUCE, 
/** Today's price for a line, when the counter pays by the day (the Produce Merchant); the standing price otherwise. */
priceOf = salePrice) {
    return sellable
        .map((item) => {
        const held = Math.max(0, Math.floor(Number(stock[item.id]) || 0));
        const quantity = Math.min(held, MAX_SALE_QUANTITY, Math.max(0, Math.floor(Number(picked[item.id]) || 0)));
        return { cropId: item.id, title: item.title, held, quantity, price: priceOf(item.id), itemKey: item.itemKey };
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
