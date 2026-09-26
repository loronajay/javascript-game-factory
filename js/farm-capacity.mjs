// Productive capacity: how many crops a farm may have in the ground at once.
// Pure — the page, tests and (mirrored) the API all read this rule.
//
// Placement and production are separate on purpose. Growing plots are cheap
// decor a player may place as many of as they like; if every placed cell could
// grow, duplicating plots would multiply the harvest without limit. So a plot
// is only somewhere to grow — the number of crops growing at once is capped
// here, by Farming level (level 1 until the Farming skill exists) plus a
// one-time bonus for having a greenhouse at all (it is bought with tickets, so
// it must be worth something — but a second greenhouse adds nothing).
//
// Every planted row counts, dead ones included: a dead crop frees its place
// only once it is cleared. A farm already over its capacity keeps every crop it
// has; it just cannot plant again until it is back under.
//
// The API mirrors these numbers in platform-api/src/services/farm-loadout-catalog.mts.
/** The plan's starting targets (FARM_HARVEST_MARKET_SKILLS_PLAN.md §9.1), to be balanced on telemetry. */
export const CROP_CAPACITY_BY_FARMING_LEVEL = Object.freeze([
    Object.freeze({ level: 1, cells: 6 }),
    Object.freeze({ level: 10, cells: 12 }),
    Object.freeze({ level: 20, cells: 18 }),
    Object.freeze({ level: 35, cells: 24 }),
    Object.freeze({ level: 50, cells: 30 }),
    Object.freeze({ level: 70, cells: 36 }),
]);
export const GREENHOUSE_ITEM_ID = "decor.building.greenhouse";
export const GREENHOUSE_CAPACITY_BONUS = 6;
export function baseCropCapacity(farmingLevel = 1) {
    const level = Number.isFinite(farmingLevel) ? farmingLevel : 1;
    let cells = CROP_CAPACITY_BY_FARMING_LEVEL[0].cells;
    for (const step of CROP_CAPACITY_BY_FARMING_LEVEL)
        if (level >= step.level)
            cells = step.cells;
    return cells;
}
export function cropCapacity(decor, farmingLevel = 1) {
    const greenhouse = decor.some((row) => row.itemId === GREENHOUSE_ITEM_ID);
    return baseCropCapacity(farmingLevel) + (greenhouse ? GREENHOUSE_CAPACITY_BONUS : 0);
}
export function cropCapacityUse(agriculture, decor, farmingLevel = 1) {
    const capacity = cropCapacity(decor, farmingLevel);
    const used = agriculture.crops.length;
    return Object.freeze({ used, capacity, full: used >= capacity });
}
