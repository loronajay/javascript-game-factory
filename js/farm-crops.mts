// Persistent crop rules. This is deliberately independent of THREE and the DOM:
// the page, server normalizer and headless tests all use the same farming contract.

import { PET_CARE } from "./farm-pet-care.mjs";
import { FRUIT_IDS, TIMBER_TREES, TREE_CATALOG } from "./farm-catalog/trees.mjs";
import { LIVESTOCK_BASKET_ITEMS, LIVESTOCK_FEEDS } from "./farm-catalog/livestock.mjs";
import { DISH_KEYS } from "./farm-catalog/recipes.mjs";
import { PIECE_KEYS } from "./farm-catalog/carpentry.mjs";
import { QUALITIES, cropQuality, produceKey, type Quality } from "./farm-quality.mjs";

export const FARM_DAY_MINUTES = 24 * 60;
export const MOISTURE_CAPACITY_MINUTES = 18 * 60;
export const CARE_GATE = 0.5;
const MAX_STACK = 99;

// Neglect has consequences, in stages a player can read and recover from:
// thirsty (moisture gone, growth stops) → wilted (still rescuable, but the crop
// takes a permanent care penalty) → dead (yields nothing, stays until cleared).
// Two separate clocks feed it: continuous time dry, and time spent blocked at
// the care gate without being tended. Both only run while a crop is unripe.
export const WILT_DRY_MINUTES = 1 * FARM_DAY_MINUTES;
export const DEATH_DRY_MINUTES = 3 * FARM_DAY_MINUTES;
export const WILT_UNTENDED_MINUTES = 2 * FARM_DAY_MINUTES;
export const DEATH_UNTENDED_MINUTES = 4 * FARM_DAY_MINUTES;
/** The one-off hit a crop takes the moment it wilts. */
export const WILT_PENALTY = 0.2;
/** Further penalty accrued across the whole wilt → death span, pro rata. */
export const WILT_STRESS_PENALTY = 0.3;
export const MAX_CARE_PENALTY = 0.6;
/**
 * Time away is never lethal (for now, while the system is being introduced):
 * offline stress stops at least this far short of death, so a returning player
 * always has a farm day — one real hour of play — to water or tend. A crop
 * already closer than that when they left gets no worse while they are gone.
 */
export const OFFLINE_RESCUE_MINUTES = FARM_DAY_MINUTES;

export type CropDefinition = Readonly<{
  id: string;
  title: string;
  seedPrice: number;
  growMinutes: number;
  yield: number;
  models: readonly [string, string, string, string];
}>;

const crop = (id: string, title: string, seedPrice: number, days: number, yieldCount: number, models: readonly [string, string, string, string]): CropDefinition =>
  Object.freeze({ id, title, seedPrice, growMinutes: days * FARM_DAY_MINUTES, yield: yieldCount, models: Object.freeze([...models]) as unknown as readonly [string, string, string, string] });

/** Crops drawn by farm/crop-lab/generator (same palette atlas as the Grimnir pack): three stages and a ripe plant. */
const generated = (id: string, title: string, seedPrice: number, days: number, yieldCount: number): CropDefinition =>
  crop(id, title, seedPrice, days, yieldCount, [`Crop_${title}_STAGE_1_01.glb`, `Crop_${title}_STAGE_2_01.glb`, `Crop_${title}_STAGE_3_01.glb`, `Crop_${title}_RIPE_01.glb`]);

export const CROP_CATALOG: readonly CropDefinition[] = Object.freeze([
  crop("bean", "Bean", 10, 3, 4, ["Crop_Bean_STAGE_1_01.glb", "Crop_Bean_STAGE_2_01.glb", "Crop_Bean_STAGE_3_01.glb", "Crop_Bean_STAGE_4_01.glb"]),
  crop("beetroot", "Beetroot", 7, 2, 3, ["Crop_Beetroot_STAGE_1_01.glb", "Crop_Beetroot_STAGE_2_01.glb", "Crop_Beetroot_STAGE_3_01.glb", "Crop_Beetroot_01.glb"]),
  generated("blueberry", "Blueberry", 13, 4, 6),
  crop("cabbage", "Cabbage", 12, 3, 2, ["Crop_Cabbage_STAGE_1_01.glb", "Crop_Cabbage_STAGE_1_02.glb", "Crop_Cabbage_STAGE_1_03.glb", "Crop_Cabbage_01.glb"]),
  crop("carrot", "Carrot", 8, 2, 3, ["Crop_Carrot_STAGE_1_01.glb", "Crop_Carrot_STAGE_2_01.glb", "Crop_Carrot_STAGE_3_01.glb", "Crop_Carrot_01.glb"]),
  crop("cauliflower", "Cauliflower", 14, 4, 2, ["Crop_Cauliflower_STAGE_1_01.glb", "Crop_Cauliflower_STAGE_2_01.glb", "Crop_Cauliflower_STAGE_3_01.glb", "Crop_Cauliflower_01.glb"]),
  generated("corn", "Corn", 11, 3.5, 2),
  generated("eggplant", "Eggplant", 12, 3.5, 3),
  crop("garlic", "Garlic", 7, 2.5, 4, ["Crop_Garlic_STAGE_1_01.glb", "Crop_Garlic_STAGE_2_01.glb", "Crop_Garlic_STAGE_3_01.glb", "Crop_Garlic_01.glb"]),
  crop("potato", "Potato", 11, 3.5, 5, ["Crop_Potato_STAGE_1_01.glb", "Crop_Potato_STAGE_2_01.glb", "Crop_Potato_STAGE_3_01.glb", "Crop_Potato_01.glb"]),
  generated("pumpkin", "Pumpkin", 16, 4, 1),
  crop("radish", "Radish", 6, 2, 3, ["Crop_Radish_STAGE_1_01.glb", "Crop_Radish_STAGE_2_01.glb", "Crop_Radish_STAGE_3_01.glb", "Crop_Radish_01.glb"]),
  generated("strawberry", "Strawberry", 9, 2.5, 5),
  generated("sunflower", "Sunflower", 12, 4, 1),
  generated("tomato", "Tomato", 10, 3, 4),
  generated("watermelon", "Watermelon", 18, 4, 1),
]);

/**
 * The withered plant a dead crop shows instead of its own model, in three sizes
 * (farm/crop-lab/generator: DEAD_PLANT). A dead crop must never look harvestable.
 */
export const DEAD_CROP_MODELS = Object.freeze(["Crop_Dead_STAGE_1_01.glb", "Crop_Dead_STAGE_2_01.glb", "Crop_Dead_STAGE_3_01.glb"] as const);

export function deadCropModel(stage: 0 | 1 | 2 | 3): string {
  return DEAD_CROP_MODELS[Math.min(2, stage)];
}

export type FarmInventory = Readonly<{
  seeds: Readonly<Record<string, number>>;
  /** The harvest basket: every crop and every fruit (farm-catalog/trees.mts), server-owned on account farms. */
  produce: Readonly<Record<string, number>>;
  /** Stackable non-crop items. Food starts here; toys remain placed/owned items later. */
  supplies: Readonly<Record<string, number>>;
  /** Productive-tree saplings by species, planted with E in a Tree Plot (farm-trees.mts). */
  saplings: Readonly<Record<string, number>>;
  /** Felled timber by species. Server-owned like produce; the Sawmill (a later phase) turns it into planks. */
  logs: Readonly<Record<string, number>>;
  /**
   * The pantry: cooked dishes keyed "recipe@stars" (farm-catalog/recipes.mts).
   * Server-owned like produce — only a cook at the Kitchen Range makes one and
   * only a sale or a dish order takes one away.
   */
  dishes: Readonly<Record<string, number>>;
  /** Sawn planks by timber species. Server-owned like logs: only a Sawmill makes one, only the Workbench uses one. */
  planks: Readonly<Record<string, number>>;
  /**
   * Furniture the farm OWNS, placed or not, keyed "decor.furniture.<piece>@stars"
   * (farm-catalog/carpentry.mts). Server-owned: only the Workbench makes a
   * piece, only a sale takes one. What is on the shelf is owned minus placed
   * (farm-workshop.mts `furnitureShelf`).
   */
  furniture: Readonly<Record<string, number>>;
  /**
   * Compost: one made each time a dead crop is dug out, spent (E on a growing
   * crop) to lift it a grade (farm-quality.mts). The server holds a save to
   * the dead crops it dug out and the crops it fertilized.
   */
  compost: number;
}>;

/** Everything the harvest basket holds: the crops, then the fruit. */
export const PRODUCE_IDS: readonly string[] = Object.freeze([...CROP_CATALOG.map((entry) => entry.id), ...FRUIT_IDS]);
/**
 * Every basket stack: each crop at every grade (Normal is the bare id), then the
 * fruit, which has no grades, then the livestock's goods (milk, wool) and the
 * Butcher's meat, graded like crops by the care the animal had
 * (farm-livestock-care.mts, farm-livestock-butcher.mts).
 */
export const PRODUCE_KEYS: readonly string[] = Object.freeze([
  ...CROP_CATALOG.flatMap((entry) => QUALITIES.map((quality) => produceKey(entry.id, quality))),
  ...FRUIT_IDS,
  ...LIVESTOCK_BASKET_ITEMS.flatMap((item) => QUALITIES.map((quality) => produceKey(item.itemId, quality))),
]);

export type FarmCrop = Readonly<{
  plotId: string;
  cellId: SoilCellId;
  cropId: string;
  growthMinutes: number;
  moistureMinutes: number;
  tended: boolean;
  lastFarmMinute: number;
  /** Continuous minutes with no moisture while unripe; watering resets it. */
  dryMinutes: number;
  /** Minutes spent blocked at the care gate; tending resets it. */
  untendedMinutes: number;
  /** Permanent damage from wilting, 0..MAX_CARE_PENALTY. Never resets. */
  carePenalty: number;
  /** "" while alive; what killed it once it is dead. A dead crop never changes again. */
  diedOf: CropDeathCause;
  /** Minutes spent stressed (dry, or waiting at the care gate) over its whole life. Never resets; decides its grade. */
  stressMinutes: number;
  /** Compost was worked into its soil: it harvests a grade higher. */
  fertilized: boolean;
}>;

export type CropDeathCause = "" | "thirst" | "neglect";
export type CropCondition = "healthy" | "thirsty" | "wilted" | "dead";
export type FarmAgriculture = Readonly<{ inventory: FarmInventory; crops: readonly FarmCrop[] }>;
export type CropActionResult = Readonly<{ ok: boolean; reason: string; agriculture: FarmAgriculture }>;
export type CropStatus = Readonly<{
  stage: 0 | 1 | 2 | 3;
  mature: boolean;
  thirsty: boolean;
  needsCare: boolean;
  progress: number;
  condition: CropCondition;
  wilted: boolean;
  dead: boolean;
  /** What harvesting it now would put in the inventory (0 until ripe, 0 when dead). */
  harvestYield: number;
  /** The grade it would harvest at now (farm-quality.mts). */
  quality: Quality;
}>;

export function findCrop(id: unknown): CropDefinition | undefined {
  return typeof id === "string" ? CROP_CATALOG.find((entry) => entry.id === id) : undefined;
}

export const SOIL_CELL_LAYOUT = Object.freeze([
  Object.freeze({ id: "cell-0", x: -1, z: -0.5 }),
  Object.freeze({ id: "cell-1", x: 0, z: -0.5 }),
  Object.freeze({ id: "cell-2", x: 1, z: -0.5 }),
  Object.freeze({ id: "cell-3", x: -1, z: 0.5 }),
  Object.freeze({ id: "cell-4", x: 0, z: 0.5 }),
  Object.freeze({ id: "cell-5", x: 1, z: 0.5 }),
] as const);
export const GREENHOUSE_CELL_LAYOUT = Object.freeze([
  Object.freeze({ id: "cell-0", x: -1.9, y: 0.96, z: -1 }),
  Object.freeze({ id: "cell-1", x: -1.9, y: 0.96, z: 0 }),
  Object.freeze({ id: "cell-2", x: -1.9, y: 0.96, z: 1 }),
  Object.freeze({ id: "cell-3", x: 1.9, y: 0.96, z: -1 }),
  Object.freeze({ id: "cell-4", x: 1.9, y: 0.96, z: 0 }),
  Object.freeze({ id: "cell-5", x: 1.9, y: 0.96, z: 1 }),
] as const);
export type SoilCellId = typeof SOIL_CELL_LAYOUT[number]["id"];
const SOIL_CELL_IDS = new Set<string>(SOIL_CELL_LAYOUT.map((cell) => cell.id));

export type SoilPlotRow = Readonly<{ instanceId: string; itemId: string; x: number; z: number; rotationY: number }>;
export type CropPlayerPose = Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }>;
export type SoilCellTarget<T extends SoilPlotRow = SoilPlotRow> = Readonly<{ plot: T; cellId: SoilCellId; x: number; y: number; z: number }>;

export function farmPlantingCells(itemId: string): readonly Readonly<{ id: SoilCellId; x: number; y: number; z: number }>[] {
  if (itemId === "decor.building.greenhouse") return GREENHOUSE_CELL_LAYOUT;
  if (itemId === "decor.plant.soil-patch") return SOIL_CELL_LAYOUT.map((cell) => ({ ...cell, y: 0.11 }));
  return [];
}

/** The nearest actual planting cell close enough and in front of the walking player. */
export function findSoilCellInReach<T extends SoilPlotRow>(decor: readonly T[], player: CropPlayerPose, reach = 2.65): SoilCellTarget<T> | null {
  let best: SoilCellTarget<T> | null = null;
  let bestDistance = Infinity;
  for (const row of decor) {
    const cells = farmPlantingCells(row.itemId);
    if (!cells.length) continue;
    const cosine = Math.cos(row.rotationY);
    const sine = Math.sin(row.rotationY);
    for (const cell of cells) {
      const x = Number((row.x + cell.x * cosine + cell.z * sine).toFixed(4));
      const z = Number((row.z - cell.x * sine + cell.z * cosine).toFixed(4));
      const dx = x - player.x;
      const dz = z - player.z;
      const distance = Math.hypot(dx, dz);
      const forwardLength = Math.hypot(player.forward.x, player.forward.z) || 1;
      const facing = distance < 0.001 ? 1 : (player.forward.x * dx + player.forward.z * dz) / (forwardLength * distance);
      if (distance <= reach && facing >= 0.2 && distance < bestDistance) {
        best = { plot: row, cellId: cell.id, x, y: cell.y, z };
        bestDistance = distance;
      }
    }
  }
  return best;
}

const count = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.min(MAX_STACK, Math.max(0, Math.floor(value))) : 0;
const finite = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** A new farm's first saplings: one fruit tree and one timber tree to try. Older farms buy theirs. */
const STARTER_SAPLINGS: Readonly<Record<string, number>> = Object.freeze({ apple: 1, oak: 1 });

function inventoryWith(defaultSeeds: number | Readonly<Record<string, number>>, source?: unknown, defaultSaplings: Readonly<Record<string, number>> = {}): FarmInventory {
  const input = source && typeof source === "object" ? source as { seeds?: unknown; produce?: unknown; supplies?: unknown; saplings?: unknown; logs?: unknown; dishes?: unknown; planks?: unknown; furniture?: unknown; compost?: unknown } : {};
  const storedSeeds = Boolean(input.seeds && typeof input.seeds === "object");
  const seeds = storedSeeds ? input.seeds as Record<string, unknown> : {};
  const produce = input.produce && typeof input.produce === "object" ? input.produce as Record<string, unknown> : {};
  const supplies = input.supplies && typeof input.supplies === "object" ? input.supplies as Record<string, unknown> : {};
  const saplings = input.saplings && typeof input.saplings === "object" ? input.saplings as Record<string, unknown> : defaultSaplings;
  const logs = input.logs && typeof input.logs === "object" ? input.logs as Record<string, unknown> : {};
  const dishes = input.dishes && typeof input.dishes === "object" ? input.dishes as Record<string, unknown> : {};
  const planks = input.planks && typeof input.planks === "object" ? input.planks as Record<string, unknown> : {};
  const furniture = input.furniture && typeof input.furniture === "object" ? input.furniture as Record<string, unknown> : {};
  return Object.freeze({
    // A stored seed stack is authoritative: a crop added to the catalog after it
    // was saved starts at 0 (the server keeps only stored ids, so a default here
    // would re-grant on every load). The number default is only for a legacy
    // document with no seed stack at all.
    seeds: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, entry.id in seeds ? count(seeds[entry.id]) : typeof defaultSeeds === "number" ? (storedSeeds ? 0 : defaultSeeds) : count(defaultSeeds[entry.id])]))),
    produce: Object.freeze(Object.fromEntries(PRODUCE_KEYS.map((id) => [id, count(produce[id])]))),
    supplies: Object.freeze(Object.fromEntries([
      ...PET_CARE.map((care) => [
        care.food.itemId,
        care.food.itemId in supplies ? count(supplies[care.food.itemId]) : care.food.starterQuantity,
      ]),
      // Livestock feed (farm-catalog/livestock.mts): bought, never granted.
      ...LIVESTOCK_FEEDS.map((feed) => [feed.itemId, count(supplies[feed.itemId])]),
    ])),
    saplings: Object.freeze(Object.fromEntries(TREE_CATALOG.map((species) => [species.id, count(saplings[species.id])]))),
    logs: Object.freeze(Object.fromEntries(TIMBER_TREES.map((species) => [species.id, count(logs[species.id])]))),
    dishes: Object.freeze(Object.fromEntries(DISH_KEYS.map((key) => [key, count(dishes[key])]))),
    planks: Object.freeze(Object.fromEntries(TIMBER_TREES.map((species) => [species.id, count(planks[species.id])]))),
    furniture: Object.freeze(Object.fromEntries(PIECE_KEYS.map((key) => [key, count(furniture[key])]))),
    compost: count(input.compost),
  });
}

function freezeAgriculture(value: { inventory: FarmInventory; crops: readonly FarmCrop[] }): FarmAgriculture {
  return Object.freeze({ inventory: value.inventory, crops: Object.freeze(value.crops.map((entry) => Object.freeze({ ...entry }))) });
}

export function createStarterAgriculture(random: () => number = Math.random): FarmAgriculture {
  const available = CROP_CATALOG.map((entry) => entry.id);
  const selected = new Set<string>();
  const targetCount = Math.min(6, available.length);
  while (selected.size < targetCount) {
    const sampled = random();
    const roll = Number.isFinite(sampled) ? Math.max(0, Math.min(0.999999999, sampled)) : 0;
    selected.add(available.splice(Math.floor(roll * available.length), 1)[0]);
  }
  const seeds = Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, selected.has(entry.id) ? 1 : 0]));
  return freezeAgriculture({ inventory: inventoryWith(seeds, undefined, STARTER_SAPLINGS), crops: [] });
}

export function normalizeAgriculture(value: unknown, validPlotIds: ReadonlySet<string>): FarmAgriculture {
  const source = value && typeof value === "object" ? value as { inventory?: unknown; crops?: unknown } : {};
  const seen = new Set<string>();
  const crops: FarmCrop[] = [];
  for (const raw of Array.isArray(source.crops) ? source.crops : []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<FarmCrop>;
    const definition = findCrop(row.cropId);
    if (!definition || typeof row.plotId !== "string" || !validPlotIds.has(row.plotId)) continue;
    const cellId = typeof row.cellId === "string" && SOIL_CELL_IDS.has(row.cellId)
      ? row.cellId as SoilCellId
      : SOIL_CELL_LAYOUT.find((cell) => !seen.has(`${row.plotId}:${cell.id}`))?.id;
    if (!cellId || seen.has(`${row.plotId}:${cellId}`)) continue;
    seen.add(`${row.plotId}:${cellId}`);
    const diedOf: CropDeathCause = row.diedOf === "thirst" || row.diedOf === "neglect" ? row.diedOf : "";
    crops.push({
      plotId: row.plotId,
      cellId,
      cropId: definition.id,
      growthMinutes: Math.min(definition.growMinutes, Math.max(0, finite(row.growthMinutes))),
      moistureMinutes: Math.min(MOISTURE_CAPACITY_MINUTES, Math.max(0, finite(row.moistureMinutes))),
      tended: row.tended === true,
      lastFarmMinute: Math.max(0, finite(row.lastFarmMinute)),
      dryMinutes: Math.min(DEATH_DRY_MINUTES, Math.max(0, finite(row.dryMinutes))),
      untendedMinutes: Math.min(DEATH_UNTENDED_MINUTES, Math.max(0, finite(row.untendedMinutes))),
      carePenalty: Math.min(MAX_CARE_PENALTY, Math.max(0, finite(row.carePenalty))),
      diedOf,
      stressMinutes: Math.max(0, finite(row.stressMinutes)),
      fertilized: row.fertilized === true,
    });
  }
  return freezeAgriculture({ inventory: inventoryWith(5, source.inventory), crops });
}

type StressClock = Readonly<{ key: "dryMinutes" | "untendedMinutes"; wilt: number; death: number; cause: Exclude<CropDeathCause, ""> }>;
/** The thirst clock. Productive trees (farm-trees.mts) run it too: a tree is watered exactly like a crop. */
export const DRY_CLOCK: StressClock = Object.freeze({ key: "dryMinutes", wilt: WILT_DRY_MINUTES, death: DEATH_DRY_MINUTES, cause: "thirst" });
const UNTENDED_CLOCK: StressClock = { key: "untendedMinutes", wilt: WILT_UNTENDED_MINUTES, death: DEATH_UNTENDED_MINUTES, cause: "neglect" };

/** What a stress clock reads and writes: a crop, or a productive tree (which has no untended clock and no grade). */
export type StressedRow = Readonly<{ dryMinutes: number; untendedMinutes?: number; carePenalty: number; diedOf: CropDeathCause; stressMinutes?: number }>;

/**
 * Run the given stress clocks for `span` minutes. Wilting costs WILT_PENALTY
 * once, then time spent wilted accrues WILT_STRESS_PENALTY pro rata; the first
 * clock to reach its death threshold kills the plant and nothing else accrues.
 */
export function accrueStress<T extends StressedRow>(row: T, span: number, clocks: readonly StressClock[], lethal: boolean): T {
  if (span <= 0 || !clocks.length || row.diedOf) return row;
  const clockOf = (clock: StressClock) => row[clock.key] ?? 0;
  // Whichever clock reaches death first bounds the span everything accrues over.
  // Non-lethal time (away) has a ceiling short of death instead, and never kills.
  const ceiling = (clock: StressClock) => lethal ? clock.death : Math.max(clockOf(clock), clock.death - OFFLINE_RESCUE_MINUTES);
  let lived = span;
  let cause: CropDeathCause = "";
  if (lethal) {
    for (const clock of clocks) {
      const untilDeath = clock.death - clockOf(clock);
      if (untilDeath <= lived) { lived = Math.max(0, untilDeath); cause = clock.cause; }
    }
  }
  // However many clocks run, a minute stressed is one minute against its grade.
  let next: T = typeof row.stressMinutes === "number" ? { ...row, stressMinutes: row.stressMinutes + lived } : { ...row };
  let penalty = row.carePenalty;
  for (const clock of clocks) {
    const before = clockOf(clock);
    const after = Math.min(ceiling(clock), before + lived);
    if (before < clock.wilt && after >= clock.wilt) penalty += WILT_PENALTY;
    penalty += WILT_STRESS_PENALTY * Math.max(0, after - Math.max(before, clock.wilt)) / (clock.death - clock.wilt);
    next = { ...next, [clock.key]: after };
  }
  return { ...next, carePenalty: Math.min(MAX_CARE_PENALTY, penalty), diedOf: cause };
}

/** Simulate `elapsed` farm minutes of one crop's life. Dead crops are frozen. */
function simulateCrop(row: FarmCrop, elapsed: number, lethal = true): FarmCrop {
  const span = Math.max(0, finite(elapsed));
  if (row.diedOf || span <= 0) return row;
  const definition = findCrop(row.cropId)!;
  const gate = definition.growMinutes * CARE_GATE;
  const limit = row.tended ? definition.growMinutes : gate;
  // While moisture lasts the crop grows until it reaches its limit (the gate,
  // or ripeness once tended); a moist crop can still sit untended at the gate.
  const wet = Math.min(span, row.moistureMinutes);
  const growing = Math.min(wet, Math.max(0, limit - row.growthMinutes));
  let next: FarmCrop = { ...row, growthMinutes: Math.min(limit, row.growthMinutes + growing), moistureMinutes: Math.max(0, row.moistureMinutes - span) };
  const ripe = () => next.growthMinutes >= definition.growMinutes;
  const blockedAtGate = () => !next.tended && next.growthMinutes >= gate && !ripe();
  if (blockedAtGate()) next = accrueStress(next, wet - growing, [UNTENDED_CLOCK], lethal);
  // Then the rest of the span is dry: growth has stopped, and an unripe crop suffers for it.
  const dry = span - wet;
  if (dry > 0 && !next.diedOf && !ripe()) next = accrueStress(next, dry, blockedAtGate() ? [DRY_CLOCK, UNTENDED_CLOCK] : [DRY_CLOCK], lethal);
  return next;
}

function advanceCrop(row: FarmCrop, now: number): FarmCrop {
  const target = finite(now, row.lastFarmMinute);
  return { ...simulateCrop(row, target - row.lastFarmMinute), lastFarmMinute: Math.max(row.lastFarmMinute, target) };
}

export function advanceAgriculture(value: FarmAgriculture, now: number): FarmAgriculture {
  return freezeAgriculture({ inventory: value.inventory, crops: value.crops.map((row) => advanceCrop(row, now)) });
}

/**
 * Bring every crop to `now`, then give it `extraMinutes` more of life without
 * the farm clock moving. This is how offline production reaches crops while
 * everything else on the farm — pets above all — stays paused. Those extra
 * minutes can wilt a crop but never kill it (OFFLINE_RESCUE_MINUTES).
 */
export function advanceAgricultureBy(value: FarmAgriculture, extraMinutes: number, now: number): FarmAgriculture {
  return freezeAgriculture({
    inventory: value.inventory,
    crops: value.crops.map((row) => ({ ...simulateCrop(advanceCrop(row, now), extraMinutes, false) })),
  });
}

/** What a ripe crop yields: the catalog yield less its care penalty, never below one. */
export function cropHarvestYield(row: FarmCrop): number {
  const definition = findCrop(row.cropId);
  if (!definition || row.diedOf) return 0;
  return Math.max(1, Math.round(definition.yield * (1 - Math.min(MAX_CARE_PENALTY, row.carePenalty))));
}

export function cropStatus(row: FarmCrop, now: number): CropStatus {
  const current = advanceCrop(row, now);
  const definition = findCrop(current.cropId)!;
  const progress = Math.min(1, current.growthMinutes / definition.growMinutes);
  const dead = Boolean(current.diedOf);
  const mature = !dead && progress >= 1;
  const growing = !dead && !mature;
  const thirsty = growing && current.moistureMinutes <= 0;
  const wilted = growing && (current.dryMinutes >= WILT_DRY_MINUTES || current.untendedMinutes >= WILT_UNTENDED_MINUTES);
  return Object.freeze({
    stage: Math.min(3, Math.floor(progress * 4)) as 0 | 1 | 2 | 3,
    mature,
    thirsty,
    needsCare: growing && !current.tended && progress >= CARE_GATE,
    progress,
    condition: dead ? "dead" : wilted ? "wilted" : thirsty ? "thirsty" : "healthy",
    wilted,
    dead,
    harvestYield: mature ? cropHarvestYield(current) : 0,
    quality: cropQuality(current),
  });
}

function result(agriculture: FarmAgriculture, ok: boolean, reason = ""): CropActionResult {
  return Object.freeze({ ok, reason, agriculture });
}

/** `capacity` is how many crops may be in the ground at once (farm-capacity.mts); planting past it is refused. */
export function plantFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, cropId: string, now: number, capacity = Infinity): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const definition = findCrop(cropId);
  if (!definition) return result(agriculture, false, "unknown_crop");
  if (!SOIL_CELL_IDS.has(cellId)) return result(agriculture, false, "unknown_cell");
  if (agriculture.crops.some((row) => row.plotId === plotId && row.cellId === cellId)) return result(agriculture, false, "occupied");
  if ((agriculture.inventory.seeds[cropId] ?? 0) <= 0) return result(agriculture, false, "no_seeds");
  if (agriculture.crops.length >= capacity) return result(agriculture, false, "at_capacity");
  const seeds = { ...agriculture.inventory.seeds, [cropId]: agriculture.inventory.seeds[cropId] - 1 };
  const cropRow: FarmCrop = {
    plotId, cellId, cropId, growthMinutes: 0, moistureMinutes: 0, tended: false, lastFarmMinute: now,
    dryMinutes: 0, untendedMinutes: 0, carePenalty: 0, diedOf: "", stressMinutes: 0, fertilized: false,
  };
  return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, seeds: Object.freeze(seeds) }), crops: [...agriculture.crops, cropRow] }), true);
}

function updateCrop(agriculture: FarmAgriculture, plotId: string, cellId: SoilCellId, change: (row: FarmCrop) => FarmCrop): FarmAgriculture {
  return freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((row) => row.plotId === plotId && row.cellId === cellId ? change(row) : row) });
}

/** Watering a living crop fills its soil and ends its dry spell. A dead crop cannot be watered back. */
export function waterFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (row.diedOf) return result(agriculture, false, "dead");
  return result(updateCrop(agriculture, plotId, cellId, (entry) => ({ ...entry, moistureMinutes: MOISTURE_CAPACITY_MINUTES, dryMinutes: 0 })), true);
}

export function tendFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (row.diedOf) return result(agriculture, false, "dead");
  if (!cropStatus(row, now).needsCare) return result(agriculture, false, "not_ready");
  return result(updateCrop(agriculture, plotId, cellId, (entry) => ({ ...entry, tended: true, untendedMinutes: 0 })), true);
}

export function harvestFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (row.diedOf) return result(agriculture, false, "dead");
  if (!cropStatus(row, now).mature) return result(agriculture, false, "not_ready");
  const key = produceKey(row.cropId, cropQuality(row));
  const produce = { ...agriculture.inventory.produce, [key]: Math.min(MAX_STACK, (agriculture.inventory.produce[key] ?? 0) + cropHarvestYield(row)) };
  return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, produce: Object.freeze(produce) }), crops: agriculture.crops.filter((entry) => entry.plotId !== plotId || entry.cellId !== cellId) }), true);
}

/**
 * Dig out a dead crop. It yields nothing and its seed is gone, but it goes on
 * the compost heap (one compost); only then is the cell free again.
 */
export function clearDeadFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (!row.diedOf) return result(agriculture, false, "alive");
  const inventory = Object.freeze({ ...agriculture.inventory, compost: Math.min(MAX_STACK, agriculture.inventory.compost + 1) });
  return result(freezeAgriculture({ inventory, crops: agriculture.crops.filter((entry) => entry !== row) }), true);
}

/**
 * Uproot one living plant from one planting cell. The spent seed is deliberately
 * lost and no compost is made; dead crops keep their separate rewarded clearing
 * path above.
 */
export function clearFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (row.diedOf) return result(agriculture, false, "dead");
  return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.filter((entry) => entry !== row) }), true);
}

/** Whether E on this crop would work compost into it: alive, unripe, not yet fertilized, and compost on the heap. */
export function canFertilizeCrop(agriculture: FarmAgriculture, row: FarmCrop, now: number): boolean {
  const state = cropStatus(row, now);
  return agriculture.inventory.compost > 0 && !row.fertilized && !state.dead && !state.mature;
}

/** Work one compost into a growing crop: it will harvest a grade higher. */
export function fertilizeFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (row.diedOf) return result(agriculture, false, "dead");
  if (row.fertilized) return result(agriculture, false, "fertilized");
  if (cropStatus(row, now).mature) return result(agriculture, false, "ripe");
  if (agriculture.inventory.compost <= 0) return result(agriculture, false, "no_compost");
  const inventory = Object.freeze({ ...agriculture.inventory, compost: agriculture.inventory.compost - 1 });
  return result(updateCrop(freezeAgriculture({ inventory, crops: agriculture.crops }), plotId, cellId, (entry) => ({ ...entry, fertilized: true })), true);
}
