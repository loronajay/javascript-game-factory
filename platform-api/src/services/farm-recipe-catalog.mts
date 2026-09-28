// The server's copy of the farm's recipes: what each dish takes, which Cooking
// level teaches it, how many cooking steps it has, and the XP it pays. It
// mirrors js/farm-catalog/recipes.mts (tests/farm-kitchen.test.mjs holds the
// two together), because a dish is made HERE: the client names a recipe and
// reports how its steps went; the server checks the level and the STORED
// basket, takes the ingredients, decides the stars and pays the XP.
//
// What a dish looks like is the client's business and is not mirrored.
//
// TRUST. The step scores are the client's report of a game played in the
// browser, the same standing as a cabinet's run summary: plausibility, not
// proof. They can only choose between one and three stars (a sale premium of
// 1.25× to 1.7× on the ingredients' raw price) — never the ingredients, the
// XP or how many dishes a cook makes, which are all decided here.

export type FarmRecipeRule = Readonly<{
  minLevel: number;
  ingredients: Readonly<Record<string, number>>;
  /** How many cooking steps the recipe has: a cook reports exactly this many scores. */
  steps: number;
  xp: number;
  /** A non-zero price means Basil teaches this recipe only after its card is bought. */
  vendorPrice: number;
}>;

const rule = (minLevel: number, ingredients: Record<string, number>, steps: number, xp: number, vendorPrice = 0): FarmRecipeRule =>
  Object.freeze({ minLevel, ingredients: Object.freeze(ingredients), steps, xp, vendorPrice });

export const FARM_RECIPE_RULES: Readonly<Record<string, FarmRecipeRule>> = Object.freeze({
  "tomato-sauce": rule(1, { tomato: 3, garlic: 1 }, 2, 80),
  "garden-salad": rule(1, { cabbage: 1, carrot: 1, radish: 1 }, 2, 70),
  "farm-stew": rule(3, { potato: 2, carrot: 1, garlic: 1 }, 2, 110),
  "baked-apples": rule(5, { apple: 4 }, 2, 100),
  "sunflower-seeds": rule(6, { sunflower: 1 }, 2, 90),
  "berry-preserves": rule(8, { strawberry: 3, blueberry: 2 }, 2, 140),
  "corn-chowder": rule(10, { corn: 2, potato: 1, garlic: 1 }, 3, 180),
  "bean-chili": rule(12, { bean: 3, tomato: 2, garlic: 1 }, 3, 200),
  "roasted-roots": rule(15, { beetroot: 2, carrot: 2, radish: 1 }, 2, 220),
  "pumpkin-soup": rule(18, { pumpkin: 1, garlic: 1, carrot: 1 }, 3, 260),
  "melon-sorbet": rule(20, { watermelon: 1, strawberry: 2 }, 2, 240),
  "stuffed-eggplant": rule(22, { eggplant: 2, tomato: 1, garlic: 1 }, 3, 280),
  "pear-tart": rule(24, { pear: 4, corn: 1 }, 3, 300),
  "cauliflower-gratin": rule(26, { cauliflower: 1, potato: 2, garlic: 1 }, 3, 320),
  "cherry-pie": rule(30, { cherry: 6, corn: 1 }, 3, 360),
  "peach-cobbler": rule(34, { peach: 4, corn: 1 }, 3, 400),
  "orange-marmalade": rule(38, { orange: 4 }, 3, 440),
  "summer-skewers": rule(1, { tomato: 1, eggplant: 1, corn: 1 }, 2, 120, 180),
  "harvest-curry": rule(1, { pumpkin: 1, cauliflower: 1, bean: 2 }, 3, 210, 320),
  "orchard-parfait": rule(1, { apple: 2, peach: 2, strawberry: 2 }, 2, 190, 480),
  "market-paella": rule(1, { tomato: 2, bean: 2, corn: 2, garlic: 1 }, 3, 270, 700),
  "five-fruit-crumble": rule(1, { apple: 1, pear: 1, peach: 1, cherry: 2, blueberry: 2 }, 3, 360, 950),
});

export const FARM_VENDOR_RECIPE_IDS: readonly string[] = Object.freeze(Object.entries(FARM_RECIPE_RULES).filter(([, entry]) => entry.vendorPrice > 0).map(([id]) => id));

export function farmRecipeRule(recipeId: unknown): FarmRecipeRule | null {
  return typeof recipeId === "string" && Object.prototype.hasOwnProperty.call(FARM_RECIPE_RULES, recipeId) ? FARM_RECIPE_RULES[recipeId]! : null;
}

export type DishStars = 1 | 2 | 3;
export const DISH_STAR_VALUES: readonly DishStars[] = Object.freeze([1, 2, 3] as const);

/** The mean step score at or above which a dish earns two stars, and three (js/farm-cooking.mts). */
export const TWO_STAR_SCORE = 0.5;
export const THREE_STAR_SCORE = 0.8;

/** A dish's stars from its step scores: the same rule the browser shows while cooking. */
export function farmDishStars(scores: readonly number[]): DishStars {
  if (!scores.length) return 1;
  const clamp = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
  const mean = scores.reduce((sum, score) => sum + clamp(score), 0) / scores.length;
  return mean >= THREE_STAR_SCORE ? 3 : mean >= TWO_STAR_SCORE ? 2 : 1;
}

/** A cook's reported scores made safe: exactly `steps` finite numbers in 0..1, or null. */
export function normalizeCookScores(value: unknown, steps: number): number[] | null {
  if (!Array.isArray(value) || value.length !== steps) return null;
  const scores = value.map((entry) => Number(entry));
  return scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1) ? scores : null;
}

/** "farm-stew@2" — the pantry key for a dish. */
export function farmDishKey(recipeId: string, stars: DishStars): string {
  return `${recipeId}@${stars}`;
}

const DISH_KEY = /^([a-z0-9-]+)@([123])$/;

export function parseFarmDishKey(key: unknown): Readonly<{ recipeId: string; stars: DishStars }> | null {
  const match = typeof key === "string" ? DISH_KEY.exec(key) : null;
  return match && farmRecipeRule(match[1]) ? Object.freeze({ recipeId: match[1]!, stars: Number(match[2]) as DishStars }) : null;
}

/** Every pantry key there can be. */
export const FARM_DISH_KEYS: readonly string[] = Object.freeze(Object.keys(FARM_RECIPE_RULES).flatMap((recipeId) => DISH_STAR_VALUES.map((stars) => farmDishKey(recipeId, stars))));

/**
 * Take `count` dishes of a recipe out of a pantry, the plainest first, so an
 * order never eats a three-star dish while a one-star would do. Null when the
 * pantry does not hold that many. The pantry passed in is not changed.
 */
export function takeFarmDishes(dishes: Readonly<Record<string, number>>, recipeId: string, count: number): Record<string, number> | null {
  const next: Record<string, number> = { ...dishes };
  let wanted = count;
  for (const stars of DISH_STAR_VALUES) {
    const key = farmDishKey(recipeId, stars);
    const held = Math.max(0, Math.floor(Number(next[key]) || 0));
    const taken = Math.min(held, wanted);
    next[key] = held - taken;
    wanted -= taken;
  }
  return wanted > 0 ? null : next;
}

/** How many of a recipe a pantry holds, whatever the stars. */
export function farmDishCount(dishes: Readonly<Record<string, number>>, recipeId: string): number {
  return DISH_STAR_VALUES.reduce((sum, stars) => sum + Math.max(0, Math.floor(Number(dishes[farmDishKey(recipeId, stars)]) || 0)), 0);
}

/** The id a client gives a cook so a retried request cooks once: the same shape as a purchase id. */
export const COOK_ID = /^[A-Za-z0-9_-]{1,80}$/;
/** How many of the latest cook ids the Cooking record remembers, for retries. */
export const RECENT_COOK_IDS = 24;
