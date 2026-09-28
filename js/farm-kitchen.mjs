// The kitchen's rules: which recipes a farmer can cook right now, what a cook
// takes out of the basket and puts in the pantry, and where the Kitchen Range
// is in reach. PURE — no THREE, no DOM, no storage.
//
// On an account farm the server makes every dish (`POST
// /games/farm/kitchen/cooks`, platform-api/src/db/farm-kitchen.mts): it takes
// the ingredients from the STORED basket, recomputes the stars from the step
// scores and pays the Cooking XP. `cookLocally` is the same rule for a
// signed-out farm, which cooks on this device and earns no XP — the skill is
// account progression, like Farming.
import { CROP_CATALOG } from "./farm-crops.mjs";
import { FRUIT_TREES } from "./farm-catalog/trees.mjs";
import { DISH_STARS, KITCHEN_RANGE_ITEM_ID, RECIPE_CATALOG, dishKey, findRecipe } from "./farm-catalog/recipes.mjs";
import { produceHeld, takeProduce } from "./farm-quality.mjs";
import { fishHeldForNeed, fishNeedPortraitSpecies, fishNeedTitle, parseFishNeed } from "./farm-fish.mjs";
const MAX_STACK = 99;
/** "Tomato", "Apple": the harvest-basket item's own name. */
export function basketItemTitle(id) {
    return CROP_CATALOG.find((crop) => crop.id === id)?.title ?? FRUIT_TREES.find((species) => species.fruitId === id)?.fruitTitle ?? id;
}
/**
 * `creel` is the fish the angler holds (the Cove's server read); a signed-out
 * farm has none, so its fish recipes read as short — catch them at the Cove.
 */
export function recipeAvailability(recipe, produce, level, learned = [], creel = []) {
    const lines = Object.entries(recipe.ingredients).map(([id, need]) => {
        // Any grade will do; the pot takes the plainest first.
        const held = Math.max(0, Math.floor(produceHeld(produce, id)));
        return Object.freeze({ id, title: basketItemTitle(id), need, held, short: Math.max(0, need - held) });
    });
    const fishNeed = recipe.fish ? parseFishNeed(recipe.fish.need) : null;
    if (recipe.fish && fishNeed) {
        const held = fishHeldForNeed(creel, fishNeed);
        lines.unshift(Object.freeze({ id: recipe.fish.need, title: fishNeedTitle(fishNeed), need: recipe.fish.count, held, short: Math.max(0, recipe.fish.count - held), fish: true, portrait: fishNeedPortraitSpecies(fishNeed) }));
    }
    const lock = recipe.source === "vendor" && !learned.includes(recipe.id) ? "vendor" : level < recipe.minLevel ? "level" : null;
    const state = lock ? "locked" : lines.some((line) => line.short > 0) ? "short" : "ready";
    return Object.freeze({ recipe, state, lock, lines: Object.freeze(lines) });
}
/** The cookbook in catalog order (which is level order). */
export function cookbook(produce, level, learned = [], creel = []) {
    return Object.freeze(RECIPE_CATALOG.map((recipe) => recipeAvailability(recipe, produce, level, learned, creel)));
}
/** Take a recipe's ingredients and put one dish of `stars` in the pantry. */
export function cookLocally(inventory, recipeId, stars, level, learned = []) {
    const recipe = findRecipe(recipeId);
    if (!recipe)
        return Object.freeze({ ok: false, reason: "unknown_recipe", inventory });
    // Fish live on the server: a farm cooking on this device has none to put in the pot.
    if (recipe.fish)
        return Object.freeze({ ok: false, reason: "not_enough_produce", inventory });
    const availability = recipeAvailability(recipe, inventory.produce, level, learned);
    if (availability.state === "locked")
        return Object.freeze({ ok: false, reason: "level_too_low", inventory });
    if (availability.state === "short")
        return Object.freeze({ ok: false, reason: "not_enough_produce", inventory });
    const key = dishKey(recipe.id, stars);
    if ((inventory.dishes[key] ?? 0) >= MAX_STACK)
        return Object.freeze({ ok: false, reason: "pantry_full", inventory });
    let produce = { ...inventory.produce };
    for (const [id, need] of Object.entries(recipe.ingredients))
        produce = takeProduce(produce, id, need) ?? produce;
    return Object.freeze({
        ok: true,
        reason: "",
        inventory: Object.freeze({ ...inventory, produce: Object.freeze(produce), dishes: Object.freeze({ ...inventory.dishes, [key]: (inventory.dishes[key] ?? 0) + 1 }) }),
    });
}
/** Every dish the pantry holds, recipe order, best stars first. */
export function pantryLines(dishes) {
    const lines = [];
    for (const recipe of RECIPE_CATALOG) {
        for (const stars of [...DISH_STARS].reverse()) {
            const key = dishKey(recipe.id, stars);
            const count = Math.max(0, Math.floor(Number(dishes[key]) || 0));
            if (count > 0)
                lines.push(Object.freeze({ key, recipe, stars, count }));
        }
    }
    return Object.freeze(lines);
}
/** How many of a recipe the pantry holds, whatever their stars. */
export function pantryCount(dishes, recipeId) {
    return DISH_STARS.reduce((sum, stars) => sum + Math.max(0, Math.floor(Number(dishes[dishKey(recipeId, stars)]) || 0)), 0);
}
/**
 * "★★": only the stars earned. An outlined ☆ beside a filled one is too easy
 * to misread at label size, so the missing ones are simply not drawn.
 */
export function starsLabel(stars) {
    return "★".repeat(Math.min(3, Math.max(1, Math.round(stars))));
}
// ---------------------------------------------------------------- the range's frame
/**
 * Where things are on a Kitchen Range, in its own frame (metres; the range
 * faces +z, its footprint is 2.2 × 0.8 centred on the origin). The model
 * (farm-props-kitchen.mts) is drawn to these and the cooking view
 * (farm-kitchen-view.mts) puts ingredients, steam and the finished plate at
 * them, so the two can never disagree about where the board is.
 */
export const KITCHEN_ANCHORS = Object.freeze({
    /** The hot plate the pot stands on (its top surface), and the kettle's. */
    hob: Object.freeze({ x: -0.8, y: 0.916, z: -0.02 }),
    kettle: Object.freeze({ x: -0.32, y: 0.916, z: -0.02 }),
    /** Where the pot's lid sits when it is on. */
    lidRest: Object.freeze({ x: -0.8, y: 1.074, z: -0.02 }),
    /** The firebox's and the oven's windows on the range's front. */
    firebox: Object.freeze({ x: -0.8, y: 0.52, z: 0.332, width: 0.26, height: 0.18 }),
    oven: Object.freeze({ x: -0.32, y: 0.47, z: 0.332, width: 0.34, height: 0.22 }),
    /** The chopping board's top, and the cloth the finished plate is set on. */
    board: Object.freeze({ x: 0.42, y: 0.924, z: 0.05 }),
    plate: Object.freeze({ x: 0.88, y: 0.906, z: 0.1 }),
});
// ---------------------------------------------------------------- the range in reach
/** The range's worktop is its front (+z) face; this is how far from it, and how squarely faced, E works it. */
export const KITCHEN_REACH = Object.freeze({ radius: 1.7, facing: 0.35 });
/** Half the range's depth: its front face sits this far from its centre. */
export const KITCHEN_RANGE_HALF_DEPTH = 0.4;
/** The front of a range in the world, and the way it faces. */
export function kitchenFront(row) {
    const normal = { x: Math.sin(row.rotationY), z: Math.cos(row.rotationY) };
    return Object.freeze({ x: row.x + normal.x * KITCHEN_RANGE_HALF_DEPTH, z: row.z + normal.z * KITCHEN_RANGE_HALF_DEPTH, normal: Object.freeze(normal) });
}
/** The Kitchen Range the player stands at the front of and looks at, or null. */
export function findKitchenInReach(decor, pose) {
    if (Math.abs(pose.y) > 0.3)
        return null;
    let best = null;
    let bestDistance = Infinity;
    for (const row of decor) {
        if (row.itemId !== KITCHEN_RANGE_ITEM_ID)
            continue;
        const front = kitchenFront(row);
        const distance = Math.hypot(pose.x - front.x, pose.z - front.z);
        if (distance > KITCHEN_REACH.radius)
            continue;
        // In front of the range, never round the back of it.
        if ((pose.x - front.x) * front.normal.x + (pose.z - front.z) * front.normal.z < -0.05)
            continue;
        const toward = { x: row.x - pose.x, z: row.z - pose.z };
        const length = Math.hypot(toward.x, toward.z) || 1;
        const forward = Math.hypot(pose.forward.x, pose.forward.z) || 1;
        if ((pose.forward.x * toward.x + pose.forward.z * toward.z) / (length * forward) < KITCHEN_REACH.facing)
            continue;
        if (distance < bestDistance) {
            best = row;
            bestDistance = distance;
        }
    }
    return best;
}
