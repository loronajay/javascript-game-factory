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
export const FARMING_XP_TABLE: readonly number[] = Object.freeze((() => {
  const table = [0, 0];
  let points = 0;
  for (let level = 1; level < FARMING_MAX_LEVEL; level += 1) {
    points += Math.floor(level + 300 * 2 ** (level / 7));
    table.push(Math.floor(points / 4));
  }
  return table;
})());

/** Both skills share the curve; Farming's names stay for the code that has always read them. */
export function skillLevelForXp(xp: number): number {
  return farmingLevelForXp(xp);
}

export function farmingLevelForXp(xp: number): number {
  const total = Math.max(0, Number(xp) || 0);
  let level = 1;
  while (level < FARMING_MAX_LEVEL && total >= FARMING_XP_TABLE[level + 1]!) level += 1;
  return level;
}

/** What a harvest of `cropId` earns: its growing days, less the care penalty that cut its yield. */
export function harvestXp(cropId: string, carePenalty = 0): number {
  const crop = findCrop(cropId);
  if (!crop) return 0;
  const penalty = Math.min(1, Math.max(0, Number(carePenalty) || 0));
  return Math.max(1, Math.round(HARVEST_XP_PER_GROW_DAY * (crop.growMinutes / FARM_DAY_MINUTES) * (1 - penalty)));
}

export type FarmingRecord = Readonly<{
  xp: number;
  harvests: number;
  orders: number;
  /** Lifetime harvests per crop. */
  crops: Readonly<Record<string, number>>;
  /** Lifetime picks per fruit tree species. */
  fruit: Readonly<Record<string, number>>;
}>;

export type WoodcuttingRecord = Readonly<{
  xp: number;
  /** Lifetime trees felled, and per species. */
  fellings: number;
  trees: Readonly<Record<string, number>>;
}>;

export type CookingRecord = Readonly<{
  xp: number;
  /** Lifetime dishes cooked, three-star dishes among them, and dish orders filled. */
  dishes: number;
  perfect: number;
  orders: number;
  /** Lifetime cooks per recipe. */
  recipes: Readonly<Record<string, number>>;
  /** Permanent recipe cards bought from Basil; level-taught recipes never appear here. */
  learned: readonly string[];
}>;

export type CarpentryRecord = Readonly<{
  xp: number;
  /** Lifetime logs sawn, pieces made, and three-star pieces among them. */
  milled: number;
  pieces: number;
  masterwork: number;
  /** Lifetime pieces per pattern. */
  patterns: Readonly<Record<string, number>>;
}>;

export type BarteringRecord = Readonly<{
  xp: number;
  deals: number;
  /** Actual tickets spent and earned after the skill adjustment. */
  bought: number;
  sold: number;
  /** Lifetime discount and bonus tickets created by the skill. */
  saved: number;
  bonus: number;
}>;

export type HusbandryRecord = Readonly<{
  xp: number;
  /** Lifetime trips to an animal that brought goods home, and herd orders filled. */
  collections: number;
  orders: number;
  /** Lifetime pieces collected per good (milk, wool…). */
  goods: Readonly<Record<string, number>>;
  /** Animals sent to the Butcher, and the cuts he made of them per meat. */
  butchered: number;
  meat: Readonly<Record<string, number>>;
  /** Young ones born on the farm. */
  births: number;
}>;

export type FarmSkills = Readonly<{ farming: FarmingRecord; woodcutting: WoodcuttingRecord; cooking: CookingRecord; carpentry: CarpentryRecord; bartering: BarteringRecord; husbandry: HusbandryRecord }>;

export const EMPTY_FARM_SKILLS: FarmSkills = Object.freeze({
  farming: Object.freeze({ xp: 0, harvests: 0, orders: 0, crops: Object.freeze({}), fruit: Object.freeze({}) }),
  woodcutting: Object.freeze({ xp: 0, fellings: 0, trees: Object.freeze({}) }),
  cooking: Object.freeze({ xp: 0, dishes: 0, perfect: 0, orders: 0, recipes: Object.freeze({}), learned: Object.freeze([]) }),
  carpentry: Object.freeze({ xp: 0, milled: 0, pieces: 0, masterwork: 0, patterns: Object.freeze({}) }),
  bartering: Object.freeze({ xp: 0, deals: 0, bought: 0, sold: 0, saved: 0, bonus: 0 }),
  husbandry: Object.freeze({ xp: 0, collections: 0, orders: 0, goods: Object.freeze({}), butchered: 0, meat: Object.freeze({}), births: 0 }),
});

function count(value: unknown, limit = 100_000_000): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(limit, Math.max(0, Math.floor(number))) : 0;
}

/** Positive counts for the known ids only. */
function counts(source: any, ids: readonly string[]): Readonly<Record<string, number>> {
  const output: Record<string, number> = {};
  for (const id of ids) {
    const value = count(source?.[id]);
    if (value > 0) output[id] = value;
  }
  return Object.freeze(output);
}

function learnedRecipes(value: unknown): readonly string[] {
  const ids = Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
  return Object.freeze(Array.from(new Set(ids.filter((id) => RECIPE_CATALOG.some((entry) => entry.id === id && entry.source === "vendor")))));
}

export function normalizeFarmSkills(value: unknown): FarmSkills {
  const source: any = value && typeof value === "object" ? value : {};
  const farming: any = source.farming && typeof source.farming === "object" ? source.farming : null;
  const woodcutting: any = source.woodcutting && typeof source.woodcutting === "object" ? source.woodcutting : null;
  const cooking: any = source.cooking && typeof source.cooking === "object" ? source.cooking : null;
  const carpentry: any = source.carpentry && typeof source.carpentry === "object" ? source.carpentry : null;
  const bartering: any = source.bartering && typeof source.bartering === "object" ? source.bartering : null;
  const husbandry: any = source.husbandry && typeof source.husbandry === "object" ? source.husbandry : null;
  if (!farming && !woodcutting && !cooking && !carpentry && !bartering && !husbandry) return EMPTY_FARM_SKILLS;
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
      births: count(husbandry.births),
    }) : EMPTY_FARM_SKILLS.husbandry,
  });
}

export type FarmingProgress = Readonly<{
  level: number;
  xp: number;
  /** XP at which the current level began, and the next one starts (equal at the cap). */
  levelXp: number;
  nextLevelXp: number;
  /** 0..1 through the current level; 1 at the cap. */
  fraction: number;
  maxed: boolean;
}>;

export function farmingProgress(xp: number): FarmingProgress {
  const total = Math.max(0, Number(xp) || 0);
  const level = farmingLevelForXp(total);
  const maxed = level >= FARMING_MAX_LEVEL;
  const levelXp = FARMING_XP_TABLE[level]!;
  const nextLevelXp = maxed ? levelXp : FARMING_XP_TABLE[level + 1]!;
  const fraction = maxed ? 1 : Math.min(1, (total - levelXp) / Math.max(1, nextLevelXp - levelXp));
  return Object.freeze({ level, xp: total, levelXp, nextLevelXp, fraction, maxed });
}

/** The HUD's words: "Farming 7 · 1,120 / 1,358 XP". */
export function farmingLabel(xp: number): string {
  return skillLabel("Farming", xp);
}

export function skillLabel(name: string, xp: number): string {
  const progress = farmingProgress(xp);
  if (progress.maxed) return `${name} ${progress.level} · ${progress.xp.toLocaleString()} XP`;
  return `${name} ${progress.level} · ${progress.xp.toLocaleString()} / ${progress.nextLevelXp.toLocaleString()} XP`;
}
