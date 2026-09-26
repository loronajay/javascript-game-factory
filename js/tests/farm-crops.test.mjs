import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CARE_GATE,
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
