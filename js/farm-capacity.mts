// Productive capacity: how many crops a farm may have in the ground at once.
// Pure — the page, tests and (mirrored) the API all read this rule.
//
// Placement and production are separate on purpose. Growing plots are cheap
// decor a player may place as many of as they like; if every placed cell could
// grow, duplicating plots would multiply the harvest without limit. So a plot
// is only somewhere to grow — the number of crops growing at once is capped
// here, by Farming level (farm-skills.mts; the server's stored record, so a
// level is only ever earned) plus a one-time bonus for having a greenhouse at all (it is bought with tickets, so
// it must be worth something — but a second greenhouse adds nothing).
//
// Every planted row counts, dead ones included: a dead crop frees its place
// only once it is cleared. A farm already over its capacity keeps every crop it
// has; it just cannot plant again until it is back under.
//
// The API mirrors these numbers in platform-api/src/services/farm-skill-catalog.mts.

import type { FarmAgriculture } from "./farm-crops.mjs";

/** The plan's starting targets (FARM_HARVEST_MARKET_SKILLS_PLAN.md §9.1), to be balanced on telemetry. */
export const CROP_CAPACITY_BY_FARMING_LEVEL: readonly Readonly<{ level: number; cells: number }>[] = Object.freeze([
  Object.freeze({ level: 1, cells: 6 }),
  Object.freeze({ level: 10, cells: 12 }),
  Object.freeze({ level: 20, cells: 18 }),
  Object.freeze({ level: 35, cells: 24 }),
  Object.freeze({ level: 50, cells: 30 }),
  Object.freeze({ level: 70, cells: 36 }),
]);
export const GREENHOUSE_ITEM_ID = "decor.building.greenhouse";
export const GREENHOUSE_CAPACITY_BONUS = 6;

export function baseCropCapacity(farmingLevel = 1): number {
  const level = Number.isFinite(farmingLevel) ? farmingLevel : 1;
  let cells = CROP_CAPACITY_BY_FARMING_LEVEL[0].cells;
  for (const step of CROP_CAPACITY_BY_FARMING_LEVEL) if (level >= step.level) cells = step.cells;
  return cells;
}

export function cropCapacity(decor: readonly Readonly<{ itemId: string }>[], farmingLevel = 1): number {
  const greenhouse = decor.some((row) => row.itemId === GREENHOUSE_ITEM_ID);
  return baseCropCapacity(farmingLevel) + (greenhouse ? GREENHOUSE_CAPACITY_BONUS : 0);
}

export type CropCapacityUse = Readonly<{ used: number; capacity: number; full: boolean }>;

export function cropCapacityUse(agriculture: FarmAgriculture, decor: readonly Readonly<{ itemId: string }>[], farmingLevel = 1): CropCapacityUse {
  const capacity = cropCapacity(decor, farmingLevel);
  const used = agriculture.crops.length;
  return Object.freeze({ used, capacity, full: used >= capacity });
}

// ---------------------------------------------------------------- productive trees
//
// Trees are capped the same way crops are: a Tree Plot is free, repeatable
// decor, and how many productive trees may stand at once is a skill's to
// grant. Fruit trees are Farming's (§9.2 of the plan, with a first tree at
// level 1 so a new farmer can try one); timber trees are Woodcutting's (§9.3,
// a little more generous at the start because felling is the only way to earn
// that skill). A felled tree's stump still holds its place until it grows back
// or is dug out. Mirrored in platform-api/src/services/farm-tree-catalog.mts.

export const ORCHARD_CAPACITY_BY_FARMING_LEVEL: readonly Readonly<{ level: number; trees: number }>[] = Object.freeze([
  Object.freeze({ level: 1, trees: 1 }),
  Object.freeze({ level: 15, trees: 2 }),
  Object.freeze({ level: 30, trees: 4 }),
  Object.freeze({ level: 50, trees: 6 }),
  Object.freeze({ level: 70, trees: 8 }),
]);

export const FORESTRY_CAPACITY_BY_WOODCUTTING_LEVEL: readonly Readonly<{ level: number; trees: number }>[] = Object.freeze([
  Object.freeze({ level: 1, trees: 2 }),
  Object.freeze({ level: 20, trees: 3 }),
  Object.freeze({ level: 40, trees: 4 }),
  Object.freeze({ level: 65, trees: 5 }),
  Object.freeze({ level: 85, trees: 6 }),
]);

function stepFor(table: readonly Readonly<{ level: number; trees: number }>[], level: number): number {
  const reached = Number.isFinite(level) ? level : 1;
  let trees = table[0]!.trees;
  for (const step of table) if (reached >= step.level) trees = step.trees;
  return trees;
}

export function orchardCapacity(farmingLevel = 1): number {
  return stepFor(ORCHARD_CAPACITY_BY_FARMING_LEVEL, farmingLevel);
}

export function forestryCapacity(woodcuttingLevel = 1): number {
  return stepFor(FORESTRY_CAPACITY_BY_WOODCUTTING_LEVEL, woodcuttingLevel);
}
