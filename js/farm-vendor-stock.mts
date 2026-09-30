// The NPC shelves in the Market Square. PURE — prices and ids only.
//
// Marigold sells Normal-grade produce at a deliberate retail margin above the
// highest price she can pay on any market day — the herd's milk, eggs and wool
// too — and Otto the Butcher sells its meat on the same margin. Basil sells permanent recipe
// cards that do not belong to the automatic Cooking level tree. Hollis sells
// livestock feed at the supply shop's own price (the server's copy is the price).

import { CROP_CATALOG, PRODUCE_IDS } from "./farm-crops.mjs";
import { FRUIT_TREES } from "./farm-catalog/trees.mjs";
import { VENDOR_RECIPE_CATALOG } from "./farm-catalog/recipes.mjs";
import { producePrice } from "./farm-market-prices.mjs";
import { LIVESTOCK_FEEDS, LIVESTOCK_GOODS, LIVESTOCK_MEATS } from "./farm-catalog/livestock.mjs";

export type IngredientStockLine = Readonly<{ id: string; itemId: string; title: string; price: number; itemKey: string }>;
export type RecipeStockLine = Readonly<{ recipeId: string; itemId: string; title: string; price: number; itemKey: string }>;
/** A feed goes into the farm's supplies, not the basket: `feedId` is its supply stack. */
export type FeedStockLine = Readonly<{ feedId: string; itemId: string; title: string; price: number; itemKey: string }>;

function produceTitle(id: string): string {
  return CROP_CATALOG.find((crop) => crop.id === id)?.title
    ?? FRUIT_TREES.find((tree) => tree.fruitId === id)?.fruitTitle
    ?? id;
}

/** Retail is 1.6× standing value: safely above the merchant's +20% best day. */
export function ingredientPrice(id: string): number {
  const value = producePrice(id);
  return value > 0 ? Math.ceil(value * 1.6) : 0;
}

export const INGREDIENT_STOCK: readonly IngredientStockLine[] = Object.freeze(PRODUCE_IDS.map((id) => Object.freeze({
  id,
  itemId: `ingredient.${id}`,
  title: produceTitle(id),
  price: ingredientPrice(id),
  itemKey: `produce:${id}`,
})));

/** The herd's basket goods, bought Normal-grade by the same `ingredient.<id>` purchase as a crop. */
function livestockLine(id: string, title: string): IngredientStockLine {
  return Object.freeze({ id, itemId: `ingredient.${id}`, title, price: ingredientPrice(id), itemKey: `produce:${id}` });
}

/** Marigold's dairy shelf: milk, eggs and wool, after the crops. */
export const LIVESTOCK_GOODS_STOCK: readonly IngredientStockLine[] = Object.freeze(LIVESTOCK_GOODS.map((good) => livestockLine(good.itemId, good.title)));

/** Otto's counter: one cut of every meat. */
export const MEAT_STOCK: readonly IngredientStockLine[] = Object.freeze(LIVESTOCK_MEATS.map((meat) => livestockLine(meat.itemId, meat.title)));

export const FEED_STOCK: readonly FeedStockLine[] = Object.freeze(LIVESTOCK_FEEDS.map((feed) => Object.freeze({
  feedId: feed.itemId,
  itemId: feed.itemId,
  title: feed.title,
  price: feed.price,
  itemKey: `supply:${feed.itemId}`,
})));

export const RECIPE_STOCK: readonly RecipeStockLine[] = Object.freeze(VENDOR_RECIPE_CATALOG.map((recipe) => Object.freeze({
  recipeId: recipe.id,
  itemId: `recipe.${recipe.id}`,
  title: recipe.title,
  price: recipe.price,
  itemKey: `dish:${recipe.id}@3`,
})));
