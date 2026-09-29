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
const rule = (minLevel, ingredients, steps, xp, vendorPrice = 0, fish = null) => Object.freeze({ minLevel, ingredients: Object.freeze(ingredients), steps, xp, vendorPrice, fish: fish ? Object.freeze({ ...fish }) : null });
const withFish = (minLevel, need, count, ingredients, steps, xp) => rule(minLevel, ingredients, steps, xp, 0, { need, count });
export const FARM_RECIPE_RULES = Object.freeze({
    // In the cookbook's (level) order. A `withFish` row also takes fish from the Cove's creel.
    // Dairy rows take the herd's milk from the basket like any crop (`milk`, `milk-sheep`).
    // Meat rows take the Butcher's cuts the same way (`beef`, `pork`, `mutton`, `llama-meat`).
    "tomato-sauce": rule(1, { tomato: 3, garlic: 1 }, 2, 80),
    "garden-salad": rule(1, { cabbage: 1, carrot: 1, radish: 1 }, 2, 70),
    "farm-stew": rule(3, { potato: 2, carrot: 1, garlic: 1 }, 2, 110),
    "berry-yogurt": rule(3, { "milk-sheep": 2, blueberry: 2 }, 2, 120),
    "fish-and-chips": withFish(4, "rarity=common", 1, { potato: 2 }, 2, 130),
    "pork-sausages": rule(4, { pork: 2, garlic: 1 }, 2, 130),
    "baked-apples": rule(5, { apple: 4 }, 2, 100),
    "fresh-butter": rule(5, { milk: 3 }, 2, 110),
    "sunflower-seeds": rule(6, { sunflower: 1 }, 2, 90),
    "shepherds-pie": rule(7, { mutton: 2, potato: 2, carrot: 1 }, 3, 170),
    "berry-preserves": rule(8, { strawberry: 3, blueberry: 2 }, 2, 140),
    "grilled-snapper": withFish(9, "species=fish.red-snapper", 1, { garlic: 1, tomato: 1 }, 2, 190),
    "creamed-corn": rule(9, { corn: 2, milk: 1 }, 3, 190),
    "corn-chowder": rule(10, { corn: 2, potato: 1, garlic: 1 }, 3, 180),
    "feta-salad": rule(11, { "milk-sheep": 3, tomato: 2, cabbage: 1 }, 2, 210),
    "bean-chili": rule(12, { bean: 3, tomato: 2, garlic: 1 }, 3, 200),
    "beef-stew": rule(12, { beef: 2, potato: 1, carrot: 1, garlic: 1 }, 3, 230),
    "fish-tacos": withFish(13, "zone=reef", 1, { corn: 1, tomato: 1, cabbage: 1 }, 3, 230),
    "strawberries-and-cream": rule(14, { strawberry: 3, milk: 2 }, 2, 230),
    "roasted-roots": rule(15, { beetroot: 2, carrot: 2, radish: 1 }, 2, 220),
    "roast-pork": rule(16, { pork: 2, apple: 2 }, 2, 250),
    "lagoon-fish-pie": withFish(17, "zone=lagoon", 2, { potato: 2, carrot: 1 }, 3, 270),
    "pumpkin-soup": rule(18, { pumpkin: 1, garlic: 1, carrot: 1 }, 3, 260),
    "farmhouse-cheddar": rule(19, { milk: 5 }, 3, 300),
    "melon-sorbet": rule(20, { watermelon: 1, strawberry: 2 }, 2, 240),
    "moussaka": rule(20, { mutton: 2, eggplant: 2, milk: 1 }, 3, 300),
    "seared-tuna": withFish(21, "species=fish.tuna", 1, { garlic: 1, radish: 1 }, 2, 320),
    "stuffed-eggplant": rule(22, { eggplant: 2, tomato: 1, garlic: 1 }, 3, 280),
    "surf-and-turf": withFish(23, "zone=reef", 1, { beef: 1, garlic: 1 }, 2, 340),
    "pear-tart": rule(24, { pear: 4, corn: 1 }, 3, 300),
    "pumpkin-pie": rule(25, { pumpkin: 1, milk: 2, corn: 1 }, 3, 330),
    "cauliflower-gratin": rule(26, { cauliflower: 1, potato: 2, garlic: 1 }, 3, 320),
    "sushi-platter": withFish(27, "rarity=rare", 2, { cabbage: 1, radish: 1 }, 2, 380),
    "andean-stew": rule(28, { "llama-meat": 2, potato: 2, corn: 1 }, 3, 360),
    "aged-pecorino": rule(29, { "milk-sheep": 6 }, 3, 380),
    "cherry-pie": rule(30, { cherry: 6, corn: 1 }, 3, 360),
    "bouillabaisse": withFish(32, "zone=reef", 3, { tomato: 2, garlic: 1 }, 3, 430),
    "pot-roast": rule(33, { beef: 3, carrot: 2, potato: 2 }, 3, 420),
    "peach-cobbler": rule(34, { peach: 4, corn: 1 }, 3, 400),
    "swordfish-steaks": withFish(36, "species=fish.swordfish", 1, { orange: 1, garlic: 1 }, 2, 470),
    "orange-marmalade": rule(38, { orange: 4 }, 3, 440),
    "summer-skewers": rule(1, { tomato: 1, eggplant: 1, corn: 1 }, 2, 120, 180),
    "harvest-curry": rule(1, { pumpkin: 1, cauliflower: 1, bean: 2 }, 3, 210, 320),
    "orchard-parfait": rule(1, { apple: 2, peach: 2, strawberry: 2 }, 2, 190, 480),
    "market-paella": rule(1, { tomato: 2, bean: 2, corn: 2, garlic: 1 }, 3, 270, 700),
    "five-fruit-crumble": rule(1, { apple: 1, pear: 1, peach: 1, cherry: 2, blueberry: 2 }, 3, 360, 950),
});
export const FARM_VENDOR_RECIPE_IDS = Object.freeze(Object.entries(FARM_RECIPE_RULES).filter(([, entry]) => entry.vendorPrice > 0).map(([id]) => id));
export function farmRecipeRule(recipeId) {
    return typeof recipeId === "string" && Object.prototype.hasOwnProperty.call(FARM_RECIPE_RULES, recipeId) ? FARM_RECIPE_RULES[recipeId] : null;
}
export const DISH_STAR_VALUES = Object.freeze([1, 2, 3]);
/** The mean step score at or above which a dish earns two stars, and three (js/farm-cooking.mts). */
export const TWO_STAR_SCORE = 0.5;
export const THREE_STAR_SCORE = 0.8;
/** A dish's stars from its step scores: the same rule the browser shows while cooking. */
export function farmDishStars(scores) {
    if (!scores.length)
        return 1;
    const clamp = (value) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0);
    const mean = scores.reduce((sum, score) => sum + clamp(score), 0) / scores.length;
    return mean >= THREE_STAR_SCORE ? 3 : mean >= TWO_STAR_SCORE ? 2 : 1;
}
/** A cook's reported scores made safe: exactly `steps` finite numbers in 0..1, or null. */
export function normalizeCookScores(value, steps) {
    if (!Array.isArray(value) || value.length !== steps)
        return null;
    const scores = value.map((entry) => Number(entry));
    return scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1) ? scores : null;
}
/** "farm-stew@2" — the pantry key for a dish. */
export function farmDishKey(recipeId, stars) {
    return `${recipeId}@${stars}`;
}
const DISH_KEY = /^([a-z0-9-]+)@([123])$/;
export function parseFarmDishKey(key) {
    const match = typeof key === "string" ? DISH_KEY.exec(key) : null;
    return match && farmRecipeRule(match[1]) ? Object.freeze({ recipeId: match[1], stars: Number(match[2]) }) : null;
}
/** Every pantry key there can be. */
export const FARM_DISH_KEYS = Object.freeze(Object.keys(FARM_RECIPE_RULES).flatMap((recipeId) => DISH_STAR_VALUES.map((stars) => farmDishKey(recipeId, stars))));
/**
 * Take `count` dishes of a recipe out of a pantry, the plainest first, so an
 * order never eats a three-star dish while a one-star would do. Null when the
 * pantry does not hold that many. The pantry passed in is not changed.
 */
export function takeFarmDishes(dishes, recipeId, count) {
    const next = { ...dishes };
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
export function farmDishCount(dishes, recipeId) {
    return DISH_STAR_VALUES.reduce((sum, stars) => sum + Math.max(0, Math.floor(Number(dishes[farmDishKey(recipeId, stars)]) || 0)), 0);
}
/** The id a client gives a cook so a retried request cooks once: the same shape as a purchase id. */
export const COOK_ID = /^[A-Za-z0-9_-]{1,80}$/;
/** How many of the latest cook ids the Cooking record remembers, for retries. */
export const RECENT_COOK_IDS = 24;
