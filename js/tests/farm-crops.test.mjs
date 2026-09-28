import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CARE_GATE,
  DEAD_CROP_MODELS,
  DEATH_DRY_MINUTES,
  DEATH_UNTENDED_MINUTES,
  FARM_DAY_MINUTES,
  MAX_CARE_PENALTY,
  WILT_DRY_MINUTES,
  WILT_PENALTY,
  WILT_UNTENDED_MINUTES,
  advanceAgricultureBy,
  clearDeadFarmCrop,
  cropHarvestYield,
  deadCropModel,
  CROP_CATALOG,
  MOISTURE_CAPACITY_MINUTES,
  GREENHOUSE_CELL_LAYOUT,
  SOIL_CELL_LAYOUT,
  advanceAgriculture,
  createStarterAgriculture,
  cropStatus,
  findSoilCellInReach,
  harvestFarmCrop,
  normalizeAgriculture,
  plantFarmCrop,
  tendFarmCrop,
  waterFarmCrop,
} from "../farm-crops.mjs";
import { PET_CARE } from "../farm-pet-care.mjs";

const carrot = CROP_CATALOG.find((crop) => crop.id === "carrot");
const cropAssets = resolve(import.meta.dirname, "..", "..", "farm", "assets", "crops");

function glbJson(file) {
  const bytes = readFileSync(resolve(cropAssets, file));
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").replace(/\0+$/, ""));
}

test("the farming catalog exposes every growth-cycle crop and the inventory includes pet-food supplies", () => {
  assert.deepEqual(CROP_CATALOG.map((crop) => crop.id), [
    "bean", "beetroot", "blueberry", "cabbage", "carrot", "cauliflower", "corn", "eggplant",
    "garlic", "potato", "pumpkin", "radish", "strawberry", "sunflower", "tomato", "watermelon",
  ]);
  assert.ok(carrot);
  const agriculture = createStarterAgriculture(() => 0);
  assert.equal(agriculture.inventory.supplies["food.dog-food"], 20);
  assert.deepEqual(Object.keys(agriculture.inventory.supplies), PET_CARE.map((care) => care.food.itemId));
  for (const care of PET_CARE.filter((row) => row.speciesId !== "pet.corgi")) assert.equal(agriculture.inventory.supplies[care.food.itemId], 0);
  assert.equal(Object.values(agriculture.inventory.seeds).filter((count) => count === 1).length, 6);
  assert.equal(Object.values(agriculture.inventory.seeds).filter((count) => count === 0).length, CROP_CATALOG.length - 6);
  for (const crop of CROP_CATALOG) {
    assert.ok([0, 1].includes(agriculture.inventory.seeds[crop.id]), crop.id);
    assert.equal(agriculture.inventory.produce[crop.id], 0, crop.id);
    assert.equal(crop.models.length, 4);
    assert.ok(crop.models.every((file) => file.endsWith(".glb")));
    assert.ok(crop.growMinutes >= 2 * 1440 && crop.growMinutes <= 4 * 1440);
  }
});

test("starter seeds choose six unique crops under injected randomness", () => {
  const low = createStarterAgriculture(() => 0).inventory.seeds;
  const high = createStarterAgriculture(() => 0.999).inventory.seeds;
  assert.deepEqual(Object.entries(low).filter(([, count]) => count === 1).map(([id]) => id), [
    "bean", "beetroot", "blueberry", "cabbage", "carrot", "cauliflower",
  ]);
  assert.deepEqual(Object.entries(high).filter(([, count]) => count === 1).map(([id]) => id), [
    "pumpkin", "radish", "strawberry", "sunflower", "tomato", "watermelon",
  ]);
});

test("a crop added after a farm was saved starts at zero seeds instead of a free stack", () => {
  // The API keeps only seed ids already stored, so any default here would be
  // re-granted on every load. Only a legacy farm with no seed stack gets 5.
  const saved = normalizeAgriculture({ inventory: { seeds: { carrot: 3 } } }, new Set());
  assert.equal(saved.inventory.seeds.carrot, 3);
  assert.equal(saved.inventory.seeds.watermelon, 0);
  assert.equal(saved.inventory.seeds.radish, 0);
  const legacy = normalizeAgriculture({}, new Set());
  assert.ok(CROP_CATALOG.every((crop) => legacy.inventory.seeds[crop.id] === 5));
});

test("every crop model exists on disk and every stage is a distinct file", () => {
  for (const crop of CROP_CATALOG) {
    assert.equal(new Set(crop.models).size, 4, crop.id);
    for (const file of crop.models) assert.equal(existsSync(resolve(cropAssets, file)), true, `${crop.id}: ${file}`);
  }
});

test("Grimnir GLBs use the shared color texture instead of their embedded white placeholder", () => {
  assert.equal(existsSync(resolve(cropAssets, "Textures", "Texture Map.png")), true);
  const models = [
    ...CROP_CATALOG.flatMap((crop) => crop.models),
    "Env_Dirt_Large_Dry_01.glb",
    "Env_Dirt_Large_Watered_01.glb",
  ];
  for (const model of models) {
    const image = glbJson(model).images?.[0];
    assert.equal(image?.uri, "Textures/Texture%20Map.png", model);
    assert.equal(image?.bufferView, undefined, `${model} must not select the white embedded placeholder`);
  }
});

test("a growing plot exposes six evenly spaced cells and reach selects the cell the player is facing", () => {
  assert.deepEqual(SOIL_CELL_LAYOUT.map(({ id, x, z }) => ({ id, x, z })), [
    { id: "cell-0", x: -1, z: -0.5 },
    { id: "cell-1", x: 0, z: -0.5 },
    { id: "cell-2", x: 1, z: -0.5 },
    { id: "cell-3", x: -1, z: 0.5 },
    { id: "cell-4", x: 0, z: 0.5 },
    { id: "cell-5", x: 1, z: 0.5 },
  ]);
  const target = findSoilCellInReach(
    [{ instanceId: "soil-1", itemId: "decor.plant.soil-patch", x: 5, z: 5, rotationY: Math.PI / 2 }],
    { x: 5.5, z: 2.8, forward: { x: 0, z: 1 } },
  );
  assert.equal(target?.plot.instanceId, "soil-1");
  assert.equal(target?.cellId, "cell-5");
  assert.deepEqual({ x: target?.x, z: target?.z }, { x: 5.5, z: 4 });
});

test("a greenhouse exposes six bench planting positions and reach targets the chosen bench pot", () => {
  assert.deepEqual(GREENHOUSE_CELL_LAYOUT.map(({ id, x, y, z }) => ({ id, x, y, z })), [
    { id: "cell-0", x: -1.9, y: 0.96, z: -1 },
    { id: "cell-1", x: -1.9, y: 0.96, z: 0 },
    { id: "cell-2", x: -1.9, y: 0.96, z: 1 },
    { id: "cell-3", x: 1.9, y: 0.96, z: -1 },
    { id: "cell-4", x: 1.9, y: 0.96, z: 0 },
    { id: "cell-5", x: 1.9, y: 0.96, z: 1 },
  ]);
  const target = findSoilCellInReach(
    [{ instanceId: "glass-1", itemId: "decor.building.greenhouse", x: 5, z: 5, rotationY: 0 }],
    { x: 1, z: 4, forward: { x: 1, z: 0 } },
  );
  assert.equal(target?.plot.instanceId, "glass-1");
  assert.equal(target?.cellId, "cell-0");
  assert.deepEqual({ x: target?.x, y: target?.y, z: target?.z }, { x: 3.1, y: 0.96, z: 4 });
});

test("one seed creates one plant and all six cells in the same plot can be planted independently", () => {
  const starter = normalizeAgriculture({ inventory: { seeds: { carrot: 5, radish: 5 } } }, new Set(["soil-1"]));
  const planted = plantFarmCrop(starter, "soil-1", "cell-0", "carrot", 480);
  assert.equal(planted.ok, true);
  assert.equal(planted.agriculture.inventory.seeds.carrot, 4);
  assert.equal(planted.agriculture.crops.length, 1);
  assert.equal(planted.agriculture.crops[0].cellId, "cell-0");
  assert.deepEqual(cropStatus(planted.agriculture.crops[0], 480), {
    stage: 0,
    mature: false,
    thirsty: true,
    needsCare: false,
    progress: 0,
    condition: "thirsty",
    wilted: false,
    dead: false,
    harvestYield: 0,
    quality: "perfect",
  });
  assert.equal(plantFarmCrop(planted.agriculture, "soil-1", "cell-0", "radish", 480).reason, "occupied");
  assert.equal(plantFarmCrop(starter, "soil-1", "cell-0", "missing", 480).reason, "unknown_crop");

  let filled = starter;
  for (const [index, cell] of SOIL_CELL_LAYOUT.entries()) {
    const cropId = index === SOIL_CELL_LAYOUT.length - 1 ? "radish" : "carrot";
    const result = plantFarmCrop(filled, "soil-1", cell.id, cropId, 480);
    assert.equal(result.ok, true, cell.id);
    filled = result.agriculture;
  }
  assert.equal(filled.crops.length, 6);
  assert.equal(filled.inventory.seeds.carrot, 0);
  assert.equal(filled.inventory.seeds.radish, 4);
});

test("growth only advances while moisture remains and watering lasts less than a full farm day", () => {
  const planted = plantFarmCrop(createStarterAgriculture(() => 0), "soil-1", "cell-0", "carrot", 0).agriculture;
  const watered = waterFarmCrop(planted, "soil-1", "cell-0", 0);
  assert.equal(watered.ok, true);
  assert.equal(watered.agriculture.crops[0].moistureMinutes, MOISTURE_CAPACITY_MINUTES);
  const elapsed = advanceAgriculture(watered.agriculture, MOISTURE_CAPACITY_MINUTES + 600);
  assert.equal(elapsed.crops[0].growthMinutes, MOISTURE_CAPACITY_MINUTES);
  assert.equal(elapsed.crops[0].moistureMinutes, 0);
  assert.equal(cropStatus(elapsed.crops[0], MOISTURE_CAPACITY_MINUTES + 600).thirsty, true);
});

test("a crop stops at the care gate until tended, then can mature and be harvested into inventory", () => {
  let agriculture = plantFarmCrop(createStarterAgriculture(() => 0), "soil-1", "cell-0", "carrot", 0).agriculture;
  agriculture = waterFarmCrop(agriculture, "soil-1", "cell-0", 0).agriculture;
  let now = MOISTURE_CAPACITY_MINUTES;
  agriculture = advanceAgriculture(agriculture, now);
  agriculture = waterFarmCrop(agriculture, "soil-1", "cell-0", now).agriculture;
  now += MOISTURE_CAPACITY_MINUTES;
  agriculture = advanceAgriculture(agriculture, now);
  const gated = agriculture.crops[0];
  assert.equal(gated.growthMinutes, carrot.growMinutes * CARE_GATE);
  assert.equal(cropStatus(gated, now).needsCare, true);

  now += 300;
  agriculture = advanceAgriculture(agriculture, now);
  assert.equal(agriculture.crops[0].growthMinutes, gated.growthMinutes, "care gate pauses growth");
  agriculture = tendFarmCrop(agriculture, "soil-1", "cell-0", now).agriculture;
  assert.equal(agriculture.crops[0].tended, true);

  while (!cropStatus(agriculture.crops[0], now).mature) {
    agriculture = waterFarmCrop(agriculture, "soil-1", "cell-0", now).agriculture;
    now += MOISTURE_CAPACITY_MINUTES;
    agriculture = advanceAgriculture(agriculture, now);
  }
  const harvested = harvestFarmCrop(agriculture, "soil-1", "cell-0", now);
  assert.equal(harvested.ok, true);
  assert.equal(harvested.agriculture.crops.length, 0);
  assert.equal(harvested.agriculture.inventory.produce.carrot, carrot.yield);
});

test("stored agriculture is bounded and unknown crop or orphan plot rows are discarded", () => {
  const normalized = normalizeAgriculture({
    inventory: { seeds: { carrot: 999, missing: 5 }, produce: { carrot: -4 }, supplies: { "food.shark-feed": 7, "food.unknown": 9 } },
    crops: [
      { plotId: "soil-1", cropId: "carrot", growthMinutes: 999999, moistureMinutes: 999999, tended: true, lastFarmMinute: 50 },
      { plotId: "gone", cropId: "carrot", growthMinutes: 1, moistureMinutes: 1, tended: false, lastFarmMinute: 1 },
      { plotId: "soil-2", cropId: "missing", growthMinutes: 1, moistureMinutes: 1, tended: false, lastFarmMinute: 1 },
    ],
  }, new Set(["soil-1", "soil-2"]));
  assert.equal(normalized.inventory.seeds.carrot, 99);
  assert.equal(normalized.inventory.produce.carrot, 0);
  assert.equal(normalized.inventory.supplies["food.shark-feed"], 7);
  assert.equal(normalized.inventory.supplies["food.unknown"], undefined);
  assert.equal(normalized.crops.length, 1);
  assert.equal(normalized.crops[0].growthMinutes, carrot.growMinutes);
  assert.equal(normalized.crops[0].moistureMinutes, MOISTURE_CAPACITY_MINUTES);
  assert.equal(normalized.crops[0].cellId, "cell-0", "legacy whole-plot crops migrate into the first cell");
});

// ---------------------------------------------------------------- crop condition: thirsty → wilted → dead

const PLOT = new Set(["soil-1"]);
const seeded = () => normalizeAgriculture({ inventory: { seeds: { carrot: 5, pumpkin: 5, potato: 5 } } }, PLOT);
const plant = (cropId = "carrot", at = 0) => plantFarmCrop(seeded(), "soil-1", "cell-0", cropId, at).agriculture;
const only = (agriculture, now) => cropStatus(agriculture.crops[0], now);

test("the neglect thresholds are the plan's: a day dry wilts, three kill; two days untended wilt, four kill", () => {
  assert.equal(WILT_DRY_MINUTES, FARM_DAY_MINUTES);
  assert.equal(DEATH_DRY_MINUTES, 3 * FARM_DAY_MINUTES);
  assert.equal(WILT_UNTENDED_MINUTES, 2 * FARM_DAY_MINUTES);
  assert.equal(DEATH_UNTENDED_MINUTES, 4 * FARM_DAY_MINUTES);
});

test("a dry crop is thirsty, then wilted after a farm day, and watering rescues it with a lasting penalty", () => {
  let agriculture = plant();
  assert.equal(only(agriculture, WILT_DRY_MINUTES - 1).condition, "thirsty");
  agriculture = advanceAgriculture(agriculture, WILT_DRY_MINUTES + 60);
  const wilted = only(agriculture, WILT_DRY_MINUTES + 60);
  assert.equal(wilted.condition, "wilted");
  assert.equal(wilted.wilted, true);
  assert.ok(agriculture.crops[0].carePenalty >= WILT_PENALTY);

  const rescued = waterFarmCrop(agriculture, "soil-1", "cell-0", WILT_DRY_MINUTES + 60);
  assert.equal(rescued.ok, true);
  assert.equal(rescued.agriculture.crops[0].dryMinutes, 0);
  assert.equal(only(rescued.agriculture, WILT_DRY_MINUTES + 60).condition, "healthy");
  assert.equal(rescued.agriculture.crops[0].carePenalty, agriculture.crops[0].carePenalty, "the penalty never resets");
  const later = advanceAgriculture(rescued.agriculture, WILT_DRY_MINUTES + 600);
  assert.ok(later.crops[0].growthMinutes > 0, "a rescued crop grows again");
});

test("three farm days dry kills a crop: it cannot be watered, tended or harvested, only cleared", () => {
  const agriculture = advanceAgriculture(plant(), DEATH_DRY_MINUTES + 500);
  const now = DEATH_DRY_MINUTES + 500;
  const status = only(agriculture, now);
  assert.equal(status.dead, true);
  assert.equal(status.condition, "dead");
  assert.equal(status.harvestYield, 0);
  assert.equal(agriculture.crops[0].diedOf, "thirst");
  assert.equal(agriculture.crops[0].dryMinutes, DEATH_DRY_MINUTES, "the clock stops at death");
  const frozen = advanceAgriculture(agriculture, now + 50_000);
  assert.deepEqual({ ...frozen.crops[0], lastFarmMinute: 0 }, { ...agriculture.crops[0], lastFarmMinute: 0 }, "a dead crop never changes again");

  assert.equal(waterFarmCrop(agriculture, "soil-1", "cell-0", now).reason, "dead");
  assert.equal(tendFarmCrop(agriculture, "soil-1", "cell-0", now).reason, "dead");
  assert.equal(harvestFarmCrop(agriculture, "soil-1", "cell-0", now).reason, "dead");
  assert.equal(plantFarmCrop(agriculture, "soil-1", "cell-0", "carrot", now).reason, "occupied", "a dead crop still holds its cell");

  const seedsBefore = agriculture.inventory.seeds.carrot;
  const cleared = clearDeadFarmCrop(agriculture, "soil-1", "cell-0", now);
  assert.equal(cleared.ok, true);
  assert.equal(cleared.agriculture.crops.length, 0);
  assert.equal(cleared.agriculture.inventory.seeds.carrot, seedsBefore, "the seed is gone for good");
  assert.equal(cleared.agriculture.inventory.produce.carrot, 0);
  assert.equal(plantFarmCrop(cleared.agriculture, "soil-1", "cell-0", "carrot", now).ok, true);
});

test("a living crop cannot be cleared", () => {
  assert.equal(clearDeadFarmCrop(plant(), "soil-1", "cell-0", 10).reason, "alive");
  assert.equal(clearDeadFarmCrop(plant(), "soil-1", "cell-5", 10).reason, "empty");
});

/** Keep the one crop watered every 10 farm hours so only the untended clock can matter. */
function wateredUntil(agriculture, now, done) {
  while (!done(agriculture, now)) {
    agriculture = waterFarmCrop(agriculture, "soil-1", "cell-0", now).agriculture;
    now += 600;
    agriculture = advanceAgriculture(agriculture, now);
  }
  return { agriculture, now };
}

test("a moist crop left at the care gate wilts after two days and dies of neglect after four", () => {
  let { agriculture, now } = wateredUntil(plant(), 0, (a, t) => only(a, t).wilted);
  assert.ok(agriculture.crops[0].untendedMinutes >= WILT_UNTENDED_MINUTES);
  assert.ok(agriculture.crops[0].untendedMinutes < WILT_UNTENDED_MINUTES + 600);
  assert.equal(agriculture.crops[0].dryMinutes, 0);
  assert.equal(only(agriculture, now).needsCare, true, "a wilted crop can still be tended");
  ({ agriculture, now } = wateredUntil(agriculture, now, (a) => Boolean(a.crops[0].diedOf)));
  assert.equal(agriculture.crops[0].diedOf, "neglect");
  assert.equal(agriculture.crops[0].untendedMinutes, DEATH_UNTENDED_MINUTES);
});

test("tending a wilted crop resets its neglect clock", () => {
  const { agriculture, now } = wateredUntil(plant(), 0, (a, t) => only(a, t).wilted);
  const tended = tendFarmCrop(agriculture, "soil-1", "cell-0", now);
  assert.equal(tended.ok, true);
  assert.equal(tended.agriculture.crops[0].untendedMinutes, 0);
  assert.equal(only(tended.agriculture, now).wilted, false);
});

test("a ripe crop does not suffer: dryness and the gate only threaten unripe plants", () => {
  const ripe = normalizeAgriculture({ inventory: { seeds: {} }, crops: [{ plotId: "soil-1", cellId: "cell-0", cropId: "carrot", growthMinutes: carrot.growMinutes, moistureMinutes: 0, tended: true, lastFarmMinute: 0 }] }, PLOT);
  const later = advanceAgriculture(ripe, DEATH_DRY_MINUTES * 5);
  assert.equal(later.crops[0].diedOf, "");
  assert.equal(later.crops[0].dryMinutes, 0);
  assert.equal(only(later, DEATH_DRY_MINUTES * 5).harvestYield, carrot.yield);
});

test("care penalty lowers the harvest, capped, and never below one", () => {
  const row = (carePenalty, cropId = "carrot") => ({ plotId: "soil-1", cellId: "cell-0", cropId, growthMinutes: 0, moistureMinutes: 0, tended: false, lastFarmMinute: 0, dryMinutes: 0, untendedMinutes: 0, carePenalty, diedOf: "" });
  const potatoYield = CROP_CATALOG.find((crop) => crop.id === "potato").yield;
  assert.equal(cropHarvestYield(row(0, "potato")), potatoYield);
  assert.ok(cropHarvestYield(row(0.4, "potato")) < potatoYield);
  assert.equal(cropHarvestYield(row(5, "potato")), cropHarvestYield(row(MAX_CARE_PENALTY, "potato")));
  assert.equal(cropHarvestYield(row(MAX_CARE_PENALTY, "pumpkin")), 1);
  assert.equal(cropHarvestYield({ ...row(0), diedOf: "thirst" }), 0);
});

test("a crop that nearly died of thirst pays for it at harvest", () => {
  let now = DEATH_DRY_MINUTES - 60; // a close call
  let agriculture = waterFarmCrop(advanceAgriculture(plant("potato"), now), "soil-1", "cell-0", now).agriculture;
  assert.ok(agriculture.crops[0].carePenalty > WILT_PENALTY + 0.2);
  while (!only(agriculture, now).mature) {
    if (only(agriculture, now).needsCare) agriculture = tendFarmCrop(agriculture, "soil-1", "cell-0", now).agriculture;
    agriculture = waterFarmCrop(agriculture, "soil-1", "cell-0", now).agriculture;
    now += 600;
    agriculture = advanceAgriculture(agriculture, now);
  }
  const potato = CROP_CATALOG.find((crop) => crop.id === "potato");
  const harvested = harvestFarmCrop(agriculture, "soil-1", "cell-0", now);
  // Fewer potatoes, and Poor ones: a close call costs yield and grade (farm-quality.mts).
  const poor = harvested.agriculture.inventory.produce["potato@poor"];
  assert.ok(poor < potato.yield);
  assert.ok(poor >= 1);
  assert.equal(harvested.agriculture.inventory.produce.potato, 0, "nothing lands in the Normal stack");
});

test("extra offline minutes give crops life without moving the farm clock", () => {
  const watered = waterFarmCrop(plant(), "soil-1", "cell-0", 0).agriculture;
  const later = advanceAgricultureBy(watered, 300, 0);
  assert.equal(later.crops[0].growthMinutes, 300);
  assert.equal(later.crops[0].lastFarmMinute, 0, "crop time is anchored to the paused clock");
  assert.equal(advanceAgriculture(later, 0).crops[0].growthMinutes, 300, "no double counting at the same clock minute");
});

test("legacy crop rows load healthy, and death survives normalization", () => {
  const legacy = normalizeAgriculture({ crops: [{ plotId: "soil-1", cellId: "cell-0", cropId: "carrot", growthMinutes: 10, moistureMinutes: 10, tended: false, lastFarmMinute: 0 }] }, PLOT);
  const row = legacy.crops[0];
  assert.deepEqual({ dry: row.dryMinutes, untended: row.untendedMinutes, penalty: row.carePenalty, diedOf: row.diedOf }, { dry: 0, untended: 0, penalty: 0, diedOf: "" });
  const dead = normalizeAgriculture({ crops: [{ ...row, diedOf: "neglect", carePenalty: 9, dryMinutes: 1e9 }] }, PLOT);
  assert.equal(dead.crops[0].diedOf, "neglect");
  assert.equal(dead.crops[0].carePenalty, MAX_CARE_PENALTY);
  assert.equal(dead.crops[0].dryMinutes, DEATH_DRY_MINUTES);
  assert.equal(normalizeAgriculture({ crops: [{ ...row, diedOf: "boredom" }] }, PLOT).crops[0].diedOf, "");
});

test("the withered dead-plant models exist in three sizes and share the pack texture", () => {
  assert.equal(DEAD_CROP_MODELS.length, 3);
  assert.equal(deadCropModel(0), DEAD_CROP_MODELS[0]);
  assert.equal(deadCropModel(3), DEAD_CROP_MODELS[2], "ripe and stage-2 crops die into the largest size");
  for (const file of DEAD_CROP_MODELS) {
    assert.equal(existsSync(resolve(cropAssets, file)), true, file);
    assert.equal(glbJson(file).images?.[0]?.uri, "Textures/Texture%20Map.png", file);
  }
});

// ---------------------------------------------------------------- quality and compost (farm-quality.mts)

import { canFertilizeCrop, fertilizeFarmCrop, tendFarmCrop as tendCrop, waterFarmCrop as waterCrop } from "../farm-crops.mjs";

/** Grow a planted carrot to ripe, watering and tending the moment it asks, `lateBy` farm minutes late each time. */
function growCarefully(agriculture, lateBy = 0) {
  let now = lateBy;
  agriculture = waterCrop(advanceAgriculture(agriculture, now), "soil-1", "cell-0", now).agriculture;
  while (!only(agriculture, now).mature) {
    now += 30;
    agriculture = advanceAgriculture(agriculture, now);
    const state = only(agriculture, now);
    if (state.needsCare) agriculture = tendCrop(advanceAgriculture(agriculture, now + lateBy), "soil-1", "cell-0", now + lateBy).agriculture;
    if (state.thirsty) agriculture = waterCrop(advanceAgriculture(agriculture, now + lateBy), "soil-1", "cell-0", now + lateBy).agriculture;
    if (state.needsCare || state.thirsty) now += lateBy;
  }
  return { agriculture, now };
}

test("a crop cared for on time is Perfect; one left waiting is graded down, and the harvest fills that grade's stack", () => {
  const prompt = growCarefully(plant("carrot"), 0);
  assert.equal(only(prompt.agriculture, prompt.now).quality, "perfect");
  const harvested = harvestFarmCrop(prompt.agriculture, "soil-1", "cell-0", prompt.now).agriculture;
  assert.equal(harvested.inventory.produce["carrot@perfect"], CROP_CATALOG.find((crop) => crop.id === "carrot").yield);
  const slow = growCarefully(plant("carrot"), 180);
  assert.equal(only(slow.agriculture, slow.now).quality, "fine", "a few hours' stress is Fine, not Perfect");
});

test("a dead crop dug out goes on the compost heap, and compost worked into a growing crop lifts it a grade", () => {
  const dead = advanceAgriculture(plant("carrot"), DEATH_DRY_MINUTES + 1);
  const cleared = clearDeadFarmCrop(dead, "soil-1", "cell-0", DEATH_DRY_MINUTES + 1).agriculture;
  assert.equal(cleared.inventory.compost, 1);
  const stressed = normalizeAgriculture({
    inventory: { seeds: {}, compost: 1 },
    crops: [{ plotId: "soil-1", cellId: "cell-0", cropId: "carrot", growthMinutes: 60, moistureMinutes: 600, tended: false, lastFarmMinute: 0, stressMinutes: 6 * 60 }],
  }, new Set(["soil-1"]));
  assert.equal(only(stressed, 0).quality, "fine");
  assert.equal(canFertilizeCrop(stressed, stressed.crops[0], 0), true);
  const fed = fertilizeFarmCrop(stressed, "soil-1", "cell-0", 0);
  assert.equal(fed.ok, true);
  assert.equal(fed.agriculture.inventory.compost, 0);
  assert.equal(only(fed.agriculture, 0).quality, "perfect");
  assert.equal(fertilizeFarmCrop(fed.agriculture, "soil-1", "cell-0", 0).reason, "fertilized", "once is enough");
  assert.equal(fertilizeFarmCrop(normalizeAgriculture({ inventory: { compost: 0 }, crops: stressed.crops }, new Set(["soil-1"])), "soil-1", "cell-0", 0).reason, "no_compost");
});
