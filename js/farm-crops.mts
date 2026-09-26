// Persistent crop rules. This is deliberately independent of THREE and the DOM:
// the page, server normalizer and headless tests all use the same farming contract.

import { PET_CARE } from "./farm-pet-care.mjs";

export const FARM_DAY_MINUTES = 24 * 60;
export const MOISTURE_CAPACITY_MINUTES = 18 * 60;
export const CARE_GATE = 0.5;
const MAX_STACK = 99;

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

export type FarmInventory = Readonly<{
  seeds: Readonly<Record<string, number>>;
  produce: Readonly<Record<string, number>>;
  /** Stackable non-crop items. Food starts here; toys remain placed/owned items later. */
  supplies: Readonly<Record<string, number>>;
}>;

export type FarmCrop = Readonly<{
  plotId: string;
  cellId: SoilCellId;
  cropId: string;
  growthMinutes: number;
  moistureMinutes: number;
  tended: boolean;
  lastFarmMinute: number;
}>;

export type FarmAgriculture = Readonly<{ inventory: FarmInventory; crops: readonly FarmCrop[] }>;
export type CropActionResult = Readonly<{ ok: boolean; reason: string; agriculture: FarmAgriculture }>;
export type CropStatus = Readonly<{ stage: 0 | 1 | 2 | 3; mature: boolean; thirsty: boolean; needsCare: boolean; progress: number }>;

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

function inventoryWith(defaultSeeds: number | Readonly<Record<string, number>>, source?: unknown): FarmInventory {
  const input = source && typeof source === "object" ? source as { seeds?: unknown; produce?: unknown; supplies?: unknown } : {};
  const storedSeeds = Boolean(input.seeds && typeof input.seeds === "object");
  const seeds = storedSeeds ? input.seeds as Record<string, unknown> : {};
  const produce = input.produce && typeof input.produce === "object" ? input.produce as Record<string, unknown> : {};
  const supplies = input.supplies && typeof input.supplies === "object" ? input.supplies as Record<string, unknown> : {};
  return Object.freeze({
    // A stored seed stack is authoritative: a crop added to the catalog after it
    // was saved starts at 0 (the server keeps only stored ids, so a default here
    // would re-grant on every load). The number default is only for a legacy
    // document with no seed stack at all.
    seeds: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, entry.id in seeds ? count(seeds[entry.id]) : typeof defaultSeeds === "number" ? (storedSeeds ? 0 : defaultSeeds) : count(defaultSeeds[entry.id])]))),
    produce: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, count(produce[entry.id])]))),
    supplies: Object.freeze(Object.fromEntries(PET_CARE.map((care) => [
      care.food.itemId,
      care.food.itemId in supplies ? count(supplies[care.food.itemId]) : care.food.starterQuantity,
    ]))),
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
  return freezeAgriculture({ inventory: inventoryWith(seeds), crops: [] });
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
    crops.push({
      plotId: row.plotId,
      cellId,
      cropId: definition.id,
      growthMinutes: Math.min(definition.growMinutes, Math.max(0, finite(row.growthMinutes))),
      moistureMinutes: Math.min(MOISTURE_CAPACITY_MINUTES, Math.max(0, finite(row.moistureMinutes))),
      tended: row.tended === true,
      lastFarmMinute: Math.max(0, finite(row.lastFarmMinute)),
    });
  }
  return freezeAgriculture({ inventory: inventoryWith(5, source.inventory), crops });
}

function advanceCrop(row: FarmCrop, now: number): FarmCrop {
  const definition = findCrop(row.cropId)!;
  const elapsed = Math.max(0, finite(now) - row.lastFarmMinute);
  const hydrated = Math.min(elapsed, row.moistureMinutes);
  const gate = definition.growMinutes * CARE_GATE;
  const growthLimit = row.tended ? definition.growMinutes : gate;
  return {
    ...row,
    growthMinutes: Math.min(growthLimit, row.growthMinutes + hydrated),
    moistureMinutes: Math.max(0, row.moistureMinutes - elapsed),
    lastFarmMinute: Math.max(row.lastFarmMinute, finite(now, row.lastFarmMinute)),
  };
}

export function advanceAgriculture(value: FarmAgriculture, now: number): FarmAgriculture {
  return freezeAgriculture({ inventory: value.inventory, crops: value.crops.map((row) => advanceCrop(row, now)) });
}

export function cropStatus(row: FarmCrop, now: number): CropStatus {
  const current = advanceCrop(row, now);
  const definition = findCrop(current.cropId)!;
  const progress = Math.min(1, current.growthMinutes / definition.growMinutes);
  const mature = progress >= 1;
  return Object.freeze({
    stage: Math.min(3, Math.floor(progress * 4)) as 0 | 1 | 2 | 3,
    mature,
    thirsty: !mature && current.moistureMinutes <= 0,
    needsCare: !mature && !current.tended && progress >= CARE_GATE,
    progress,
  });
}

function result(agriculture: FarmAgriculture, ok: boolean, reason = ""): CropActionResult {
  return Object.freeze({ ok, reason, agriculture });
}

export function plantFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, cropId: string, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const definition = findCrop(cropId);
  if (!definition) return result(agriculture, false, "unknown_crop");
  if (!SOIL_CELL_IDS.has(cellId)) return result(agriculture, false, "unknown_cell");
  if (agriculture.crops.some((row) => row.plotId === plotId && row.cellId === cellId)) return result(agriculture, false, "occupied");
  if ((agriculture.inventory.seeds[cropId] ?? 0) <= 0) return result(agriculture, false, "no_seeds");
  const seeds = { ...agriculture.inventory.seeds, [cropId]: agriculture.inventory.seeds[cropId] - 1 };
  const cropRow: FarmCrop = { plotId, cellId, cropId, growthMinutes: 0, moistureMinutes: 0, tended: false, lastFarmMinute: now };
  return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, seeds: Object.freeze(seeds) }), crops: [...agriculture.crops, cropRow] }), true);
}

export function waterFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  if (!agriculture.crops.some((row) => row.plotId === plotId && row.cellId === cellId)) return result(agriculture, false, "empty");
  return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((row) => row.plotId === plotId && row.cellId === cellId ? { ...row, moistureMinutes: MOISTURE_CAPACITY_MINUTES } : row) }), true);
}

export function tendFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (!cropStatus(row, now).needsCare) return result(agriculture, false, "not_ready");
  return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((entry) => entry.plotId === plotId && entry.cellId === cellId ? { ...entry, tended: true } : entry) }), true);
}

export function harvestFarmCrop(value: FarmAgriculture, plotId: string, cellId: SoilCellId, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId && entry.cellId === cellId);
  if (!row) return result(agriculture, false, "empty");
  if (!cropStatus(row, now).mature) return result(agriculture, false, "not_ready");
  const definition = findCrop(row.cropId)!;
  const produce = { ...agriculture.inventory.produce, [row.cropId]: Math.min(MAX_STACK, agriculture.inventory.produce[row.cropId] + definition.yield) };
  return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, produce: Object.freeze(produce) }), crops: agriculture.crops.filter((entry) => entry.plotId !== plotId || entry.cellId !== cellId) }), true);
}
