// The Farming skill, server side: the XP curve, what a harvest is worth, and
// what a level unlocks. It mirrors js/farm-skills.mts and js/farm-capacity.mts
// (tests/farm-skills.test.mjs holds them together), because XP is minted HERE:
// only a server harvest or a filled order ever raises it, and a client save
// can never change the stored record (farm-loadout-catalog's save guard).
//
// The record lives on the farm document as `skills.farming`: the XP total plus
// the lifetime counts the farm's achievements read. Levels are never stored —
// they are always derived from XP, so a curve retune moves every farm at once.
import { FARM_CROP_RULES, farmCropRule } from "./farm-crop-catalog.mjs";
import { FRUIT_TREE_IDS, TIMBER_TREE_IDS } from "./farm-tree-catalog.mjs";
export const FARMING_MAX_LEVEL = 99;
/** A bound on stored XP, comfortably past level 99 (13,034,431). */
export const FARMING_MAX_XP = 200_000_000;
/** XP a harvest earns per farm day its crop spent growing, before the care penalty. */
export const HARVEST_XP_PER_GROW_DAY = 60;
const DAY = 24 * 60;
/**
 * The RuneScape curve: each level costs a little more than the last, and the
 * gap grows exponentially. XP needed to REACH each level, index = level.
 */
export const FARMING_XP_TABLE = Object.freeze((() => {
    const table = [0, 0];
    let points = 0;
    for (let level = 1; level < FARMING_MAX_LEVEL; level += 1) {
        points += Math.floor(level + 300 * 2 ** (level / 7));
        table.push(Math.floor(points / 4));
    }
    return table;
})());
export function farmingLevelForXp(xp) {
    const total = Math.max(0, Number(xp) || 0);
    let level = 1;
    while (level < FARMING_MAX_LEVEL && total >= FARMING_XP_TABLE[level + 1])
        level += 1;
    return level;
}
/** A harvest's XP: the crop's growing time, less the same care penalty that cut its yield, never below one. */
export function farmHarvestXp(cropId, carePenalty = 0) {
    const rule = farmCropRule(cropId);
    if (!rule)
        return 0;
    const penalty = Math.min(1, Math.max(0, Number(carePenalty) || 0));
    return Math.max(1, Math.round(HARVEST_XP_PER_GROW_DAY * (rule.growMinutes / DAY) * (1 - penalty)));
}
// ---------------------------------------------------------------- productive capacity
/** The plan's starting targets (FARM_HARVEST_MARKET_SKILLS_PLAN.md §9.1), to be balanced on telemetry. */
export const CROP_CAPACITY_BY_FARMING_LEVEL = Object.freeze([
    Object.freeze({ level: 1, cells: 6 }),
    Object.freeze({ level: 10, cells: 12 }),
    Object.freeze({ level: 20, cells: 18 }),
    Object.freeze({ level: 35, cells: 24 }),
    Object.freeze({ level: 50, cells: 30 }),
    Object.freeze({ level: 70, cells: 36 }),
]);
export const GREENHOUSE_CAPACITY_BONUS = 6;
export function farmCropCapacity(decor, farmingLevel) {
    let cells = CROP_CAPACITY_BY_FARMING_LEVEL[0].cells;
    for (const step of CROP_CAPACITY_BY_FARMING_LEVEL)
        if (farmingLevel >= step.level)
            cells = step.cells;
    return cells + (decor.some((row) => row?.itemId === "decor.building.greenhouse") ? GREENHOUSE_CAPACITY_BONUS : 0);
}
const COUNT_LIMIT = 100_000_000;
function count(value, limit = COUNT_LIMIT) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(limit, Math.max(0, Math.floor(number))) : 0;
}
export function emptyFarmingRecord() {
    return { xp: 0, harvests: 0, orders: 0, crops: {}, fruit: {} };
}
export function emptyWoodcuttingRecord() {
    return { xp: 0, fellings: 0, trees: {} };
}
/** Positive counts for the known ids only. */
function counts(value, ids) {
    const source = value && typeof value === "object" ? value : {};
    const output = {};
    for (const id of ids) {
        const total = count(source[id]);
        if (total > 0)
            output[id] = total;
    }
    return output;
}
/** Shape-bounds a stored record. Only known crops and fruit trees are counted. */
export function normalizeFarmingRecord(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
        xp: count(source.xp, FARMING_MAX_XP), harvests: count(source.harvests), orders: count(source.orders),
        crops: counts(source.crops, Object.keys(FARM_CROP_RULES)),
        fruit: counts(source.fruit, FRUIT_TREE_IDS),
    };
}
export function normalizeWoodcuttingRecord(value) {
    const source = value && typeof value === "object" ? value : {};
    return { xp: count(source.xp, FARMING_MAX_XP), fellings: count(source.fellings), trees: counts(source.trees, TIMBER_TREE_IDS) };
}
/** Both server-owned skill records, shape-bounded. */
export function normalizeFarmSkillRecords(value) {
    const source = value && typeof value === "object" ? value : {};
    return { farming: normalizeFarmingRecord(source.farming), woodcutting: normalizeWoodcuttingRecord(source.woodcutting) };
}
/** A harvest of `cropId` landed: its XP, one more harvest, one more of that crop. */
export function recordFarmHarvest(record, cropId, xp) {
    return {
        ...record,
        xp: Math.min(FARMING_MAX_XP, record.xp + Math.max(0, xp)),
        harvests: record.harvests + 1,
        crops: { ...record.crops, [cropId]: (record.crops[cropId] ?? 0) + 1 },
    };
}
/** A fruit tree was picked: its Farming XP and one more pick of that species. (Not a crop harvest.) */
export function recordFarmFruit(record, speciesId, xp) {
    return { ...record, xp: Math.min(FARMING_MAX_XP, record.xp + Math.max(0, xp)), fruit: { ...record.fruit, [speciesId]: (record.fruit[speciesId] ?? 0) + 1 } };
}
/** A tree was felled: its Woodcutting XP and one more felling of that species. */
export function recordFarmFelling(record, speciesId, xp) {
    return { ...record, xp: Math.min(FARMING_MAX_XP, record.xp + Math.max(0, xp)), fellings: record.fellings + 1, trees: { ...record.trees, [speciesId]: (record.trees[speciesId] ?? 0) + 1 } };
}
/** An order was filled: its XP and one more order. */
export function recordFarmOrder(record, xp) {
    return { ...record, xp: Math.min(FARMING_MAX_XP, record.xp + Math.max(0, xp)), orders: record.orders + 1 };
}
/** What a response tells the client about a skill after an operation. Both skills share the curve. */
export function farmingSummary(record, previousXp) {
    const level = farmingLevelForXp(record.xp);
    return { xp: record.xp, level, levelBefore: farmingLevelForXp(previousXp) };
}
