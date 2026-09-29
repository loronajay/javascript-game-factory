// The farm's skills, for display: Farming, Woodcutting, Cooking and Carpentry. PURE — no DOM, no
// THREE, no storage.
//
// The server owns the records (platform-api/src/services/farm-skill-catalog.mts):
// only a server harvest, a picked fruit tree, a felled tree, a cooked dish, a
// sawn log, a made piece of furniture or a filled Market order raises them, and a save can never change them. The page reads `layout.skills.farming` as the server last
// returned it and derives the level and progress bar from it with this same
// curve; platform-api/tests/farm-skills.test.mjs holds the two copies equal.
//
// A signed-out farm has no server, so it earns no Farming XP and stays at
// level 1 — the skill is account progression, like the tickets it leads to.
import { CROP_CATALOG, FARM_DAY_MINUTES, findCrop } from "./farm-crops.mjs";
import { FRUIT_TREES, TIMBER_TREES } from "./farm-catalog/trees.mjs";
import { RECIPE_CATALOG } from "./farm-catalog/recipes.mjs";
import { PATTERN_CATALOG } from "./farm-catalog/carpentry.mjs";
import { LIVESTOCK_GOODS, LIVESTOCK_MEATS } from "./farm-catalog/livestock.mjs";
export const FARMING_MAX_LEVEL = 99;
export const FARMING_MAX_XP = 200_000_000;
/** XP a harvest earns per farm day its crop spent growing, before the care penalty. */
export const HARVEST_XP_PER_GROW_DAY = 60;
/** XP needed to REACH each level (index = level): the RuneScape curve. */
export const FARMING_XP_TABLE = Object.freeze((() => {
    const table = [0, 0];
    let points = 0;
    for (let level = 1; level < FARMING_MAX_LEVEL; level += 1) {
        points += Math.floor(level + 300 * 2 ** (level / 7));
        table.push(Math.floor(points / 4));
    }
    return table;
})());
/** Both skills share the curve; Farming's names stay for the code that has always read them. */
export function skillLevelForXp(xp) {
    return farmingLevelForXp(xp);
}
export function farmingLevelForXp(xp) {
    const total = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (level < FARMING_MAX_LEVEL && total >= FARMING_XP_TABLE[level + 1])
        level += 1;
    return level;
}
/** What a harvest of `cropId` earns: its growing days, less the care penalty that cut its yield. */
export function harvestXp(cropId, carePenalty = 0) {
    const crop = findCrop(cropId);
    if (!crop)
        return 0;
    const penalty = Math.min(1, Math.max(0, Number(carePenalty) || 0));
    return Math.max(1, Math.round(HARVEST_XP_PER_GROW_DAY * (crop.growMinutes / FARM_DAY_MINUTES) * (1 - penalty)));
}
export const EMPTY_FARM_SKILLS = Object.freeze({
    farming: Object.freeze({ xp: 0, harvests: 0, orders: 0, crops: Object.freeze({}), fruit: Object.freeze({}) }),
    woodcutting: Object.freeze({ xp: 0, fellings: 0, trees: Object.freeze({}) }),
    cooking: Object.freeze({ xp: 0, dishes: 0, perfect: 0, orders: 0, recipes: Object.freeze({}), learned: Object.freeze([]) }),
    carpentry: Object.freeze({ xp: 0, milled: 0, pieces: 0, masterwork: 0, patterns: Object.freeze({}) }),
    bartering: Object.freeze({ xp: 0, deals: 0, bought: 0, sold: 0, saved: 0, bonus: 0 }),
    husbandry: Object.freeze({ xp: 0, collections: 0, orders: 0, goods: Object.freeze({}), butchered: 0, meat: Object.freeze({}) }),
});
function count(value, limit = 100_000_000) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(limit, Math.max(0, Math.floor(number))) : 0;
}
/** Positive counts for the known ids only. */
function counts(source, ids) {
    const output = {};
    for (const id of ids) {
        const value = count(source?.[id]);
        if (value > 0)
            output[id] = value;
    }
    return Object.freeze(output);
}
function learnedRecipes(value) {
    const ids = Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
    return Object.freeze(Array.from(new Set(ids.filter((id) => RECIPE_CATALOG.some((entry) => entry.id === id && entry.source === "vendor")))));
}
export function normalizeFarmSkills(value) {
    const source = value && typeof value === "object" ? value : {};
    const farming = source.farming && typeof source.farming === "object" ? source.farming : null;
    const woodcutting = source.woodcutting && typeof source.woodcutting === "object" ? source.woodcutting : null;
    const cooking = source.cooking && typeof source.cooking === "object" ? source.cooking : null;
    const carpentry = source.carpentry && typeof source.carpentry === "object" ? source.carpentry : null;
    const bartering = source.bartering && typeof source.bartering === "object" ? source.bartering : null;
    const husbandry = source.husbandry && typeof source.husbandry === "object" ? source.husbandry : null;
    if (!farming && !woodcutting && !cooking && !carpentry && !bartering && !husbandry)
        return EMPTY_FARM_SKILLS;
    return Object.freeze({
        farming: farming ? Object.freeze({
            xp: count(farming.xp, FARMING_MAX_XP),
            harvests: count(farming.harvests),
            orders: count(farming.orders),
            crops: counts(farming.crops, CROP_CATALOG.map((crop) => crop.id)),
            fruit: counts(farming.fruit, FRUIT_TREES.map((species) => species.id)),
        }) : EMPTY_FARM_SKILLS.farming,
        woodcutting: woodcutting ? Object.freeze({
            xp: count(woodcutting.xp, FARMING_MAX_XP),
            fellings: count(woodcutting.fellings),
            trees: counts(woodcutting.trees, TIMBER_TREES.map((species) => species.id)),
        }) : EMPTY_FARM_SKILLS.woodcutting,
        cooking: cooking ? Object.freeze({
            xp: count(cooking.xp, FARMING_MAX_XP),
            dishes: count(cooking.dishes),
            perfect: count(cooking.perfect),
            orders: count(cooking.orders),
            recipes: counts(cooking.recipes, RECIPE_CATALOG.map((entry) => entry.id)),
            learned: learnedRecipes(cooking.learned),
        }) : EMPTY_FARM_SKILLS.cooking,
        carpentry: carpentry ? Object.freeze({
            xp: count(carpentry.xp, FARMING_MAX_XP),
            milled: count(carpentry.milled),
            pieces: count(carpentry.pieces),
            masterwork: count(carpentry.masterwork),
            patterns: counts(carpentry.patterns, PATTERN_CATALOG.map((entry) => entry.id)),
        }) : EMPTY_FARM_SKILLS.carpentry,
        bartering: bartering ? Object.freeze({
            xp: count(bartering.xp, FARMING_MAX_XP), deals: count(bartering.deals),
            bought: count(bartering.bought), sold: count(bartering.sold), saved: count(bartering.saved), bonus: count(bartering.bonus),
        }) : EMPTY_FARM_SKILLS.bartering,
        husbandry: husbandry ? Object.freeze({
            xp: count(husbandry.xp, FARMING_MAX_XP), collections: count(husbandry.collections), orders: count(husbandry.orders),
            goods: counts(husbandry.goods, LIVESTOCK_GOODS.map((good) => good.itemId)),
            butchered: count(husbandry.butchered),
            meat: counts(husbandry.meat, LIVESTOCK_MEATS.map((meat) => meat.itemId)),
        }) : EMPTY_FARM_SKILLS.husbandry,
    });
}
export function farmingProgress(xp) {
    const total = Math.max(0, Number(xp) || 0);
    const level = farmingLevelForXp(total);
    const maxed = level >= FARMING_MAX_LEVEL;
    const levelXp = FARMING_XP_TABLE[level];
    const nextLevelXp = maxed ? levelXp : FARMING_XP_TABLE[level + 1];
    const fraction = maxed ? 1 : Math.min(1, (total - levelXp) / Math.max(1, nextLevelXp - levelXp));
    return Object.freeze({ level, xp: total, levelXp, nextLevelXp, fraction, maxed });
}
/** The HUD's words: "Farming 7 · 1,120 / 1,358 XP". */
export function farmingLabel(xp) {
    return skillLabel("Farming", xp);
}
export function skillLabel(name, xp) {
    const progress = farmingProgress(xp);
    if (progress.maxed)
        return `${name} ${progress.level} · ${progress.xp.toLocaleString()} XP`;
    return `${name} ${progress.level} · ${progress.xp.toLocaleString()} / ${progress.nextLevelXp.toLocaleString()} XP`;
}
