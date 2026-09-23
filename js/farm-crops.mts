// Persistent crop rules. This is deliberately independent of THREE and the DOM:
// the page, server normalizer and headless tests all use the same farming contract.

export const FARM_DAY_MINUTES = 24 * 60;
export const MOISTURE_CAPACITY_MINUTES = 18 * 60;
export const CARE_GATE = 0.5;
const MAX_STACK = 99;

export type CropDefinition = Readonly<{
  id: string;
  title: string;
  growMinutes: number;
  yield: number;
  models: readonly [string, string, string, string];
}>;

const crop = (id: string, title: string, days: number, yieldCount: number, models: readonly [string, string, string, string]): CropDefinition =>
  Object.freeze({ id, title, growMinutes: days * FARM_DAY_MINUTES, yield: yieldCount, models: Object.freeze([...models]) as unknown as readonly [string, string, string, string] });

export const CROP_CATALOG: readonly CropDefinition[] = Object.freeze([
  crop("bean", "Bean", 3, 4, ["Crop_Bean_STAGE_1_01.glb", "Crop_Bean_STAGE_2_01.glb", "Crop_Bean_STAGE_3_01.glb", "Crop_Bean_STAGE_4_01.glb"]),
  crop("beetroot", "Beetroot", 2, 3, ["Crop_Beetroot_STAGE_1_01.glb", "Crop_Beetroot_STAGE_2_01.glb", "Crop_Beetroot_STAGE_3_01.glb", "Crop_Beetroot_01.glb"]),
  crop("cabbage", "Cabbage", 3, 2, ["Crop_Cabbage_STAGE_1_01.glb", "Crop_Cabbage_STAGE_1_02.glb", "Crop_Cabbage_STAGE_1_03.glb", "Crop_Cabbage_01.glb"]),
  crop("carrot", "Carrot", 2, 3, ["Crop_Carrot_STAGE_1_01.glb", "Crop_Carrot_STAGE_2_01.glb", "Crop_Carrot_STAGE_3_01.glb", "Crop_Carrot_01.glb"]),
  crop("cauliflower", "Cauliflower", 4, 2, ["Crop_Cauliflower_STAGE_1_01.glb", "Crop_Cauliflower_STAGE_2_01.glb", "Crop_Cauliflower_STAGE_3_01.glb", "Crop_Cauliflower_01.glb"]),
  crop("garlic", "Garlic", 2.5, 4, ["Crop_Garlic_STAGE_1_01.glb", "Crop_Garlic_STAGE_2_01.glb", "Crop_Garlic_STAGE_3_01.glb", "Crop_Garlic_01.glb"]),
  crop("potato", "Potato", 3.5, 5, ["Crop_Potato_STAGE_1_01.glb", "Crop_Potato_STAGE_2_01.glb", "Crop_Potato_STAGE_3_01.glb", "Crop_Potato_01.glb"]),
  crop("radish", "Radish", 2, 3, ["Crop_Radish_STAGE_1_01.glb", "Crop_Radish_STAGE_2_01.glb", "Crop_Radish_STAGE_3_01.glb", "Crop_Radish_01.glb"]),
]);

export type FarmInventory = Readonly<{
  seeds: Readonly<Record<string, number>>;
  produce: Readonly<Record<string, number>>;
}>;

export type FarmCrop = Readonly<{
  plotId: string;
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

export type SoilPlotRow = Readonly<{ instanceId: string; itemId: string; x: number; z: number }>;
export type CropPlayerPose = Readonly<{ x: number; z: number; forward: Readonly<{ x: number; z: number }> }>;

/** The nearest growing plot close enough and in front of the walking player. */
export function findSoilPlotInReach<T extends SoilPlotRow>(decor: readonly T[], player: CropPlayerPose, reach = 2.65): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const row of decor) {
    if (row.itemId !== "decor.plant.soil-patch") continue;
    const dx = row.x - player.x;
    const dz = row.z - player.z;
    const distance = Math.hypot(dx, dz);
    const forwardLength = Math.hypot(player.forward.x, player.forward.z) || 1;
    const facing = distance < 0.001 ? 1 : (player.forward.x * dx + player.forward.z * dz) / (forwardLength * distance);
    if (distance <= reach && facing >= 0.2 && distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}

const count = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? Math.min(MAX_STACK, Math.max(0, Math.floor(value))) : 0;
const finite = (value: unknown, fallback = 0): number => typeof value === "number" && Number.isFinite(value) ? value : fallback;

function inventoryWith(defaultSeeds: number, source?: unknown): FarmInventory {
  const input = source && typeof source === "object" ? source as { seeds?: unknown; produce?: unknown } : {};
  const seeds = input.seeds && typeof input.seeds === "object" ? input.seeds as Record<string, unknown> : {};
  const produce = input.produce && typeof input.produce === "object" ? input.produce as Record<string, unknown> : {};
  return Object.freeze({
    seeds: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, entry.id in seeds ? count(seeds[entry.id]) : defaultSeeds]))),
    produce: Object.freeze(Object.fromEntries(CROP_CATALOG.map((entry) => [entry.id, count(produce[entry.id])]))),
  });
}

function freezeAgriculture(value: { inventory: FarmInventory; crops: readonly FarmCrop[] }): FarmAgriculture {
  return Object.freeze({ inventory: value.inventory, crops: Object.freeze(value.crops.map((entry) => Object.freeze({ ...entry }))) });
}

export function createStarterAgriculture(): FarmAgriculture {
  return freezeAgriculture({ inventory: inventoryWith(5), crops: [] });
}

export function normalizeAgriculture(value: unknown, validPlotIds: ReadonlySet<string>): FarmAgriculture {
  const source = value && typeof value === "object" ? value as { inventory?: unknown; crops?: unknown } : {};
  const seen = new Set<string>();
  const crops: FarmCrop[] = [];
  for (const raw of Array.isArray(source.crops) ? source.crops : []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Partial<FarmCrop>;
    const definition = findCrop(row.cropId);
    if (!definition || typeof row.plotId !== "string" || !validPlotIds.has(row.plotId) || seen.has(row.plotId)) continue;
    seen.add(row.plotId);
    crops.push({
      plotId: row.plotId,
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

export function plantFarmCrop(value: FarmAgriculture, plotId: string, cropId: string, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const definition = findCrop(cropId);
  if (!definition) return result(agriculture, false, "unknown_crop");
  if (agriculture.crops.some((row) => row.plotId === plotId)) return result(agriculture, false, "occupied");
  if ((agriculture.inventory.seeds[cropId] ?? 0) <= 0) return result(agriculture, false, "no_seeds");
  const seeds = { ...agriculture.inventory.seeds, [cropId]: agriculture.inventory.seeds[cropId] - 1 };
  const cropRow: FarmCrop = { plotId, cropId, growthMinutes: 0, moistureMinutes: 0, tended: false, lastFarmMinute: now };
  return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, seeds: Object.freeze(seeds) }), crops: [...agriculture.crops, cropRow] }), true);
}

export function waterFarmCrop(value: FarmAgriculture, plotId: string, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  if (!agriculture.crops.some((row) => row.plotId === plotId)) return result(agriculture, false, "empty");
  return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((row) => row.plotId === plotId ? { ...row, moistureMinutes: MOISTURE_CAPACITY_MINUTES } : row) }), true);
}

export function tendFarmCrop(value: FarmAgriculture, plotId: string, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId);
  if (!row) return result(agriculture, false, "empty");
  if (!cropStatus(row, now).needsCare) return result(agriculture, false, "not_ready");
  return result(freezeAgriculture({ inventory: agriculture.inventory, crops: agriculture.crops.map((entry) => entry.plotId === plotId ? { ...entry, tended: true } : entry) }), true);
}

export function harvestFarmCrop(value: FarmAgriculture, plotId: string, now: number): CropActionResult {
  const agriculture = advanceAgriculture(value, now);
  const row = agriculture.crops.find((entry) => entry.plotId === plotId);
  if (!row) return result(agriculture, false, "empty");
  if (!cropStatus(row, now).mature) return result(agriculture, false, "not_ready");
  const definition = findCrop(row.cropId)!;
  const produce = { ...agriculture.inventory.produce, [row.cropId]: Math.min(MAX_STACK, agriculture.inventory.produce[row.cropId] + definition.yield) };
  return result(freezeAgriculture({ inventory: Object.freeze({ ...agriculture.inventory, produce: Object.freeze(produce) }), crops: agriculture.crops.filter((entry) => entry.plotId !== plotId) }), true);
}
