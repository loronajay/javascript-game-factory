// The two NPC shelves in the Market Square. PURE — prices and ids only.
//
// Marigold sells Normal-grade produce at a deliberate retail margin above the
// highest price she can pay on any market day. Basil sells permanent recipe
// cards that do not belong to the automatic Cooking level tree.
import { CROP_CATALOG, PRODUCE_IDS } from "./farm-crops.mjs";
import { FRUIT_TREES } from "./farm-catalog/trees.mjs";
import { VENDOR_RECIPE_CATALOG } from "./farm-catalog/recipes.mjs";
import { producePrice } from "./farm-market-prices.mjs";
function produceTitle(id) {
    return CROP_CATALOG.find((crop) => crop.id === id)?.title
        ?? FRUIT_TREES.find((tree) => tree.fruitId === id)?.fruitTitle
        ?? id;
}
/** Retail is 1.6× standing value: safely above the merchant's +20% best day. */
export function ingredientPrice(id) {
    const value = producePrice(id);
    return value > 0 ? Math.ceil(value * 1.6) : 0;
}
export const INGREDIENT_STOCK = Object.freeze(PRODUCE_IDS.map((id) => Object.freeze({
    id,
    itemId: `ingredient.${id}`,
    title: produceTitle(id),
    price: ingredientPrice(id),
    itemKey: `produce:${id}`,
})));
export const RECIPE_STOCK = Object.freeze(VENDOR_RECIPE_CATALOG.map((recipe) => Object.freeze({
    recipeId: recipe.id,
    itemId: `recipe.${recipe.id}`,
    title: recipe.title,
    price: recipe.price,
    itemKey: `dish:${recipe.id}@3`,
})));
