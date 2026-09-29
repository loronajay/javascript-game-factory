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

import type { AchievementDefinition, AchievementGame } from "./achievement-catalog.mjs";
import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { farmingLevelForXp, normalizeCarpentryRecord, normalizeCookingRecord, normalizeHusbandryRecord, normalizeWoodcuttingRecord, type CarpentryRecord, type CookingRecord, type FarmingRecord, type HusbandryRecord, type WoodcuttingRecord } from "./farm-skill-catalog.mjs";
import { FARM_PIECE_IDS } from "./farm-carpentry-catalog.mjs";
import { FARM_RECIPE_RULES } from "./farm-recipe-catalog.mjs";
import { FARM_FISH_RULES } from "./farm-fish-catalog.mjs";

/** What the farm's transactions hand the detector: the record after the change, and the change itself. */
export type FarmAchievementFacts = Readonly<{
  farming: FarmingRecord;
  /** The Woodcutting record; absent on farms that have never felled a tree. */
  woodcutting?: WoodcuttingRecord | null;
  /** The Cooking record; absent where the transaction did not read it. */
  cooking?: CookingRecord | null;
  /** The Carpentry record; absent where the transaction did not read it. */
  carpentry?: CarpentryRecord | null;
  /** The Husbandry record, when the change was a collection or a herd order. */
  husbandry?: HusbandryRecord | null;
  /** The Fishing record (db/farm-fishing.mts), when the change was a catch. */
  fishing?: Readonly<{ xp: number; catches: number; species: Readonly<Record<string, number>>; shiny: number; golden: number; trophies: number }> | null;
  /** The fish just landed, when the change was a catch. */
  catch?: Readonly<{ rarity: string; sizeClass: string; variant: string }> | null;
  /** A filled order's level gate, when the change was an order. */
  order?: Readonly<{ minLevel: number }> | null;
  /** The meat just cut, when the change was an animal sent to the Butcher. */
  butcher?: Readonly<{ quality: string }> | null;
}>;

function def(id: string, name: string, description: string, category: AchievementDefinition["category"], extra: Partial<AchievementDefinition> = {}): AchievementDefinition {
  return Object.freeze({ id, name, description, category, parentId: null, tier: 1, points: 10, secret: false, icon: null, ...extra });
}

export const FARM_ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = Object.freeze([
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
  // Phase 7: the sawmill and the workbench.
  def("farm_sawdust", "Sawdust", "Saw your first log into planks.", "progression"),
  def("farm_handiwork", "Handiwork", "Make your first piece of furniture at a Workbench.", "progression"),
  def("farm_masterwork", "Masterwork", "Make a three-star piece of furniture.", "challenge", { parentId: "farm_handiwork", tier: 2, points: 20 }),
  def("farm_cabinetmaker", "Cabinetmaker", "Make 50 pieces of furniture.", "progression", { parentId: "farm_handiwork", tier: 2, points: 30 }),
  def("farm_journeyman", "Journeyman", "Reach Carpentry level 10.", "progression", { points: 20 }),
  def("farm_pattern_book", "Every Pattern", "Make every piece in the pattern book at least once.", "mastery", { parentId: "farm_journeyman", tier: 2, points: 50 }),
  // The Cove: fishing.
  def("farm_first_catch", "First Catch", "Land your first fish at the Cove.", "progression"),
  def("farm_angler", "Angler", "Land 100 fish.", "progression", { parentId: "farm_first_catch", tier: 2, points: 20 }),
  def("farm_old_salt", "Old Salt", "Land 500 fish.", "progression", { parentId: "farm_angler", tier: 3, points: 30 }),
  def("farm_trophy_hunter", "Trophy Hunter", "Land a Trophy-size fish.", "challenge", { parentId: "farm_first_catch", tier: 2, points: 20 }),
  def("farm_record_breaker", "Record Breaker", "Land a Record-size fish.", "challenge", { parentId: "farm_trophy_hunter", tier: 3, points: 40 }),
  def("farm_something_shiny", "Something Shiny", "Land a Shiny fish.", "challenge", { points: 30 }),
  def("farm_pure_gold", "Pure Gold", "Land a Golden fish.", "challenge", { parentId: "farm_something_shiny", tier: 2, points: 50, secret: true }),
  def("farm_legend_of_the_deep", "Legend of the Deep", "Land a Legendary fish.", "challenge", { points: 40 }),
  def("farm_reel_talent", "Reel Talent", "Reach Fishing level 10.", "progression", { points: 20 }),
  def("farm_full_fishdex", "Full Fishdex", "Land every kind of fish in the Cove at least once.", "mastery", { parentId: "farm_reel_talent", tier: 2, points: 50 }),
  // Livestock: Husbandry.
  def("farm_fresh_from_the_pail", "Fresh from the Pail", "Collect milk or wool from your livestock.", "progression"),
  def("farm_stockkeeper", "Stockkeeper", "Collect from your livestock 100 times.", "progression", { parentId: "farm_fresh_from_the_pail", tier: 2, points: 30 }),
  def("farm_straight_from_the_herd", "Straight from the Herd", "Fill a herd order from the Order Board.", "progression", { parentId: "farm_fresh_from_the_pail", tier: 2, points: 20 }),
  def("farm_stockman", "Stockman", "Reach Husbandry level 10.", "progression", { points: 20 }),
  def("farm_off_to_the_butcher", "Off to the Butcher", "Send a grown animal to the Butcher in the Market Square.", "progression"),
  def("farm_prime_cut", "Prime Cut", "Have the Butcher cut Perfect meat.", "challenge", { parentId: "farm_off_to_the_butcher", tier: 2, points: 30 }),
]);

export function detectFarmAchievements(facts: FarmAchievementFacts): string[] {
  const { farming } = facts;
  const level = farmingLevelForXp(farming.xp);
  const earned: string[] = [];
  if (farming.harvests >= 1) earned.push("farm_first_harvest");
  if (farming.harvests >= 50) earned.push("farm_bumper_crop");
  if (farming.harvests >= 250) earned.push("farm_breadbasket");
  if (Object.keys(FARM_CROP_RULES).every((cropId) => (farming.crops[cropId] ?? 0) > 0)) earned.push("farm_full_almanac");
  if (farming.orders >= 1) earned.push("farm_first_order");
  if (farming.orders >= 10) earned.push("farm_regular_supplier");
  if (farming.orders >= 50) earned.push("farm_contractor");
  if ((facts.order?.minLevel ?? 0) >= 10) earned.push("farm_wholesale");
  if (level >= 10) earned.push("farm_green_thumb");
  if (level >= 20) earned.push("farm_seasoned_grower");
  if (level >= 35) earned.push("farm_master_farmer");
  if (Object.values(farming.fruit ?? {}).some((picks) => picks > 0)) earned.push("farm_first_fruit");
  const woodcutting = normalizeWoodcuttingRecord(facts.woodcutting);
  if (woodcutting.fellings >= 1) earned.push("farm_timber");
  if (woodcutting.fellings >= 50) earned.push("farm_lumberjack");
  if (farmingLevelForXp(woodcutting.xp) >= 10) earned.push("farm_woodsman");
  const cooking = normalizeCookingRecord(facts.cooking);
  if (cooking.dishes >= 1) earned.push("farm_home_cooking");
  if (cooking.perfect >= 1) earned.push("farm_three_stars");
  if (cooking.dishes >= 50) earned.push("farm_line_cook");
  if (cooking.orders >= 1) earned.push("farm_order_up");
  if (farmingLevelForXp(cooking.xp) >= 10) earned.push("farm_head_chef");
  if (Object.keys(FARM_RECIPE_RULES).every((recipeId) => (cooking.recipes[recipeId] ?? 0) > 0)) earned.push("farm_cookbook");
  const carpentry = normalizeCarpentryRecord(facts.carpentry);
  if (carpentry.milled >= 1) earned.push("farm_sawdust");
  if (carpentry.pieces >= 1) earned.push("farm_handiwork");
  if (carpentry.masterwork >= 1) earned.push("farm_masterwork");
  if (carpentry.pieces >= 50) earned.push("farm_cabinetmaker");
  if (farmingLevelForXp(carpentry.xp) >= 10) earned.push("farm_journeyman");
  if (FARM_PIECE_IDS.every((itemId) => (carpentry.patterns[itemId] ?? 0) > 0)) earned.push("farm_pattern_book");
  const husbandry = normalizeHusbandryRecord(facts.husbandry);
  if (husbandry.collections >= 1) earned.push("farm_fresh_from_the_pail");
  if (husbandry.collections >= 100) earned.push("farm_stockkeeper");
  if (husbandry.orders >= 1) earned.push("farm_straight_from_the_herd");
  if (farmingLevelForXp(husbandry.xp) >= 10) earned.push("farm_stockman");
  if (husbandry.butchered >= 1) earned.push("farm_off_to_the_butcher");
  if (facts.butcher?.quality === "perfect") earned.push("farm_prime_cut");
  const fishing = facts.fishing;
  if (fishing) {
    if (fishing.catches >= 1) earned.push("farm_first_catch");
    if (fishing.catches >= 100) earned.push("farm_angler");
    if (fishing.catches >= 500) earned.push("farm_old_salt");
    if (fishing.trophies >= 1) earned.push("farm_trophy_hunter");
    if (facts.catch?.sizeClass === "record") earned.push("farm_record_breaker");
    if (fishing.shiny >= 1) earned.push("farm_something_shiny");
    if (fishing.golden >= 1) earned.push("farm_pure_gold");
    if (FARM_FISH_RULES.some((rule) => rule.rarity === "legendary" && (fishing.species[rule.id] ?? 0) > 0)) earned.push("farm_legend_of_the_deep");
    if (farmingLevelForXp(fishing.xp) >= 10) earned.push("farm_reel_talent");
    if (FARM_FISH_RULES.every((rule) => (fishing.species[rule.id] ?? 0) > 0)) earned.push("farm_full_fishdex");
  }
  return earned;
}

export const FARM_ACHIEVEMENTS: AchievementGame<FarmAchievementFacts> = Object.freeze({
  gameSlug: "farm",
  title: "The Farm",
  definitions: FARM_ACHIEVEMENT_DEFINITIONS,
  // Awarded only from the server's own farm transactions; a browser has nothing to file.
  normalizeRun: () => ({ ok: false as const, error: "server_awarded" }),
  detect: ({ run }: { run: FarmAchievementFacts }) => detectFarmAchievements(run),
});
