// The Farm's achievements — the platform's first SERVER-AWARDED set.
//
// Every other game files a run summary from the browser and the detector
// judges it. The farm has nothing to file: the facts (a harvest landed, an
// order was filled, the Farming record moved) already happen inside the
// server's own transactions, so `detect` runs there, against the stored
// record, in the same transaction that changed it (db/farm-economy.mts →
// awardServerAchievementsInTransaction). That makes these the strongest
// achievements on the platform: there is no client claim to forge.
//
// `normalizeRun` therefore refuses every submission — `POST
// /achievements/farm/runs` is a closed door, not a second path.
//
// Ids are permanent (see achievement-catalog). Records start at zero when this
// shipped, so harvests from before Phase 4 do not count toward them.
import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { farmingLevelForXp, normalizeCookingRecord, normalizeWoodcuttingRecord } from "./farm-skill-catalog.mjs";
import { FARM_RECIPE_RULES } from "./farm-recipe-catalog.mjs";
function def(id, name, description, category, extra = {}) {
    return Object.freeze({ id, name, description, category, parentId: null, tier: 1, points: 10, secret: false, icon: null, ...extra });
}
export const FARM_ACHIEVEMENT_DEFINITIONS = Object.freeze([
    def("farm_first_harvest", "First Harvest", "Bring in your first crop.", "progression"),
    def("farm_bumper_crop", "Bumper Crop", "Harvest 50 crops.", "progression", { parentId: "farm_first_harvest", tier: 2, points: 20 }),
    def("farm_breadbasket", "Breadbasket", "Harvest 250 crops.", "progression", { parentId: "farm_bumper_crop", tier: 3, points: 30 }),
    def("farm_full_almanac", "Full Almanac", "Harvest every kind of crop at least once.", "mastery", { parentId: "farm_first_harvest", tier: 2, points: 30 }),
    def("farm_first_order", "Signed, Sealed, Delivered", "Fill an order from the Market Square's Order Board.", "progression"),
    def("farm_regular_supplier", "Regular Supplier", "Fill 10 orders.", "progression", { parentId: "farm_first_order", tier: 2, points: 20 }),
    def("farm_contractor", "Contractor", "Fill 50 orders.", "progression", { parentId: "farm_regular_supplier", tier: 3, points: 30 }),
    def("farm_wholesale", "Wholesale", "Fill a large order from the Order Board.", "challenge", { parentId: "farm_first_order", tier: 2, points: 20 }),
    def("farm_green_thumb", "Green Thumb", "Reach Farming level 10.", "progression", { points: 20 }),
    def("farm_seasoned_grower", "Seasoned Grower", "Reach Farming level 20.", "progression", { parentId: "farm_green_thumb", tier: 2, points: 30 }),
    def("farm_master_farmer", "Master Farmer", "Reach Farming level 35.", "progression", { parentId: "farm_seasoned_grower", tier: 3, points: 50 }),
    // Phase 5: the orchard and the forestry.
    def("farm_first_fruit", "Low-Hanging Fruit", "Pick your first fruit tree.", "progression"),
    def("farm_timber", "Timber!", "Fell your first tree.", "progression"),
    def("farm_lumberjack", "Lumberjack", "Fell 50 trees.", "progression", { parentId: "farm_timber", tier: 2, points: 30 }),
    def("farm_woodsman", "Woodsman", "Reach Woodcutting level 10.", "progression", { points: 20 }),
    // Phase 6: the kitchen.
    def("farm_home_cooking", "Home Cooking", "Cook your first dish at a Kitchen Range.", "progression"),
    def("farm_three_stars", "Three Stars", "Cook a three-star dish.", "challenge", { parentId: "farm_home_cooking", tier: 2, points: 20 }),
    def("farm_line_cook", "Line Cook", "Cook 50 dishes.", "progression", { parentId: "farm_home_cooking", tier: 2, points: 30 }),
    def("farm_order_up", "Order Up!", "Fill a dish order from the Order Board.", "progression", { parentId: "farm_home_cooking", tier: 2, points: 20 }),
    def("farm_head_chef", "Head Chef", "Reach Cooking level 10.", "progression", { points: 20 }),
    def("farm_cookbook", "Well-Thumbed Cookbook", "Cook every recipe at least once.", "mastery", { parentId: "farm_head_chef", tier: 2, points: 50 }),
]);
export function detectFarmAchievements(facts) {
    const { farming } = facts;
    const level = farmingLevelForXp(farming.xp);
    const earned = [];
    if (farming.harvests >= 1)
        earned.push("farm_first_harvest");
    if (farming.harvests >= 50)
        earned.push("farm_bumper_crop");
    if (farming.harvests >= 250)
        earned.push("farm_breadbasket");
    if (Object.keys(FARM_CROP_RULES).every((cropId) => (farming.crops[cropId] ?? 0) > 0))
        earned.push("farm_full_almanac");
    if (farming.orders >= 1)
        earned.push("farm_first_order");
    if (farming.orders >= 10)
        earned.push("farm_regular_supplier");
    if (farming.orders >= 50)
        earned.push("farm_contractor");
    if ((facts.order?.minLevel ?? 0) >= 10)
        earned.push("farm_wholesale");
    if (level >= 10)
        earned.push("farm_green_thumb");
    if (level >= 20)
        earned.push("farm_seasoned_grower");
    if (level >= 35)
        earned.push("farm_master_farmer");
    if (Object.values(farming.fruit ?? {}).some((picks) => picks > 0))
        earned.push("farm_first_fruit");
    const woodcutting = normalizeWoodcuttingRecord(facts.woodcutting);
    if (woodcutting.fellings >= 1)
        earned.push("farm_timber");
    if (woodcutting.fellings >= 50)
        earned.push("farm_lumberjack");
    if (farmingLevelForXp(woodcutting.xp) >= 10)
        earned.push("farm_woodsman");
    const cooking = normalizeCookingRecord(facts.cooking);
    if (cooking.dishes >= 1)
        earned.push("farm_home_cooking");
    if (cooking.perfect >= 1)
        earned.push("farm_three_stars");
    if (cooking.dishes >= 50)
        earned.push("farm_line_cook");
    if (cooking.orders >= 1)
        earned.push("farm_order_up");
    if (farmingLevelForXp(cooking.xp) >= 10)
        earned.push("farm_head_chef");
    if (Object.keys(FARM_RECIPE_RULES).every((recipeId) => (cooking.recipes[recipeId] ?? 0) > 0))
        earned.push("farm_cookbook");
    return earned;
}
export const FARM_ACHIEVEMENTS = Object.freeze({
    gameSlug: "farm",
    title: "The Farm",
    definitions: FARM_ACHIEVEMENT_DEFINITIONS,
    // Awarded only from the server's own farm transactions; a browser has nothing to file.
    normalizeRun: () => ({ ok: false, error: "server_awarded" }),
    detect: ({ run }) => detectFarmAchievements(run),
});
