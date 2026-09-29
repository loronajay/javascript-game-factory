import test from "node:test";
import assert from "node:assert/strict";

import {
  FARM_BOUNDS,
  FARM_LAYOUT_STORAGE_KEY,
  MAX_PETS,
  PET_NAME_MAX_LENGTH,
  addPet,
  cleanPetName,
  createDefaultFarmLayout,
  farmCacheKey,
  farmLayoutsEqual,
  normalizeFarmLayout,
  removePet,
  renamePet,
  setFarmGround,
  STARTER_FARM_DECOR,
  farmHabitats,
  normalizeFarmDecorRow,
  waterPets,
} from "../farm-layout.mjs";
import { completeFarmOnboarding, markFarmIntroSeen } from "../farm-onboarding.mjs";
import { DEFAULT_GROUND_ID } from "../farm-catalog/ground.mjs";
import { findFarmDecor } from "../farm-catalog/decor.mjs";
import { CROP_CATALOG } from "../farm-crops.mjs";
import { alignFarmDecorPlacement, boxesOverlap, farmDecorBox, farmDecorCollides, placeFarmDecor } from "../farm-decor-layout.mjs";
import { buildingDoor, buildingLocalToWorld } from "../farm-scene.mjs";

test("a new farm waits for a named dog and receives one plot plus six persisted starter seeds", () => {
  const layout = createDefaultFarmLayout(() => 0);
  assert.equal(layout.version, 3);
  assert.equal(layout.ground, DEFAULT_GROUND_ID);
  assert.deepEqual(layout.pets, []);
  assert.deepEqual(layout.decor, STARTER_FARM_DECOR);
  assert.deepEqual(layout.onboarding, { status: "needs_name", introSeen: false });
  assert.equal(layout.decor.filter((row) => row.itemId === "decor.plant.soil-patch").length, 1);
  assert.equal(Object.values(layout.agriculture.inventory.seeds).filter((count) => count === 1).length, 6);
  assert.equal(Object.values(layout.agriculture.inventory.seeds).filter((count) => count === 0).length, CROP_CATALOG.length - 6);
  assert.deepEqual(layout.agriculture.crops, []);
  assert.deepEqual(layout.clock, { farmMinutes: 480, updatedAt: 0, checkpointAt: 0, napBank: 1440 });
  assert.ok(Object.isFrozen(layout));
  // The slice-1 field, as rows: a fenced perimeter with a gate, the barn, trees, hay and the trough.
  const kinds = STARTER_FARM_DECOR.map((row) => row.itemId);
  assert.equal(kinds.filter((id) => id === "decor.fence.post-rail").length, 5);
  assert.ok(kinds.includes("decor.fence.gate") && kinds.includes("decor.building.barn") && kinds.includes("decor.prop.trough"));
  for (const row of STARTER_FARM_DECOR) assert.ok(findFarmDecor(row.itemId), `${row.itemId} is a catalog item`);
  assert.equal(new Set(STARTER_FARM_DECOR.map((row) => row.instanceId)).size, STARTER_FARM_DECOR.length);
});

test("the farm is a wide open field bounded by the perimeter fence inset", () => {
  assert.equal(FARM_BOUNDS.width, 28);
  assert.equal(FARM_BOUNDS.depth, 28);
  assert.ok(FARM_BOUNDS.wallInset > 0 && FARM_BOUNDS.wallInset < 2);
});

test("the starter farmhouse sits square against the rear fence with a clear gateward walk", () => {
  const layout = createDefaultFarmLayout(() => 0);
  const farmhouse = layout.decor.find((row) => row.instanceId === "cottage-1");
  const range = layout.decor.find((row) => row.instanceId === "kitchen-range-1");
  const gate = layout.decor.find((row) => row.instanceId === "gate-1");
  const farmhouseDefinition = findFarmDecor(farmhouse.itemId);
  assert.deepEqual(
    { x: farmhouse.x, z: farmhouse.z, rotationY: farmhouse.rotationY },
    { x: 4.2, z: -9.3, rotationY: 0 },
    "the farmhouse walls run parallel to the straight rear fence",
  );
  assert.deepEqual(
    { x: range.x, z: range.z, rotationY: range.rotationY },
    { x: 3, z: -12, rotationY: 0 },
    "the range keeps its original local pose against the farmhouse back wall",
  );
  assert.deepEqual(
    layout.decor.filter((row) => row.itemId === "decor.prop.hay-bale").map(({ x, z }) => ({ x, z })),
    [{ x: -8, z: -2.5 }, { x: -6.5, z: -2 }],
    "the hay remains starter dressing but vacates the farmhouse site",
  );
  assert.deepEqual(
    layout.decor.filter((row) => row.itemId === "decor.plant.oak").map(({ x, z }) => ({ x, z })),
    [{ x: 11.5, z: -10.5 }, { x: 11, z: 5.5 }, { x: -11, z: 4 }, { x: 9.5, z: 10.5 }],
    "the mature trees stay around the perimeter instead of crowding the farmhouse",
  );

  const door = buildingDoor(farmhouseDefinition, farmhouse);
  const toGate = { x: gate.x - door.x, z: gate.z - door.z };
  const gateDistance = Math.hypot(toGate.x, toGate.z);
  const facingDot = (door.forward.x * toGate.x + door.forward.z * toGate.z) / gateDistance;
  assert.ok(facingDot > 0.97, "the front door points downfield toward the front gate");

  const frontWalkLength = gateDistance - 1.5;
  const walkStart = { x: door.x + door.forward.x * 0.5, z: door.z + door.forward.z * 0.5 };
  const frontWalk = {
    x: walkStart.x + door.forward.x * frontWalkLength / 2,
    z: walkStart.z + door.forward.z * frontWalkLength / 2,
    rotationY: farmhouse.rotationY,
  };
  for (const row of layout.decor) {
    if (["cottage-1", "kitchen-range-1", "gate-1"].includes(row.instanceId)) continue;
    const definition = findFarmDecor(row.itemId);
    if (!definition.solid && !definition.keepOut) continue;
    assert.equal(
      boxesOverlap(frontWalk, { width: 2.2, depth: frontWalkLength }, farmDecorBox(row, definition), definition.footprint),
      false,
      `${row.instanceId} must not block the porch-to-gate walk`,
    );
  }

  const barn = layout.decor.find((row) => row.instanceId === "barn-1");
  const barnDefinition = findFarmDecor(barn.itemId);
  assert.equal(
    boxesOverlap(
      farmDecorBox(farmhouse, farmhouseDefinition),
      { width: farmhouseDefinition.footprint.width + 2, depth: farmhouseDefinition.footprint.depth + 2 },
      farmDecorBox(barn, barnDefinition),
      { width: barnDefinition.footprint.width + 2, depth: barnDefinition.footprint.depth + 2 },
    ),
    false,
    "the farmhouse and barn need visible yard space between them",
  );

  for (let first = 0; first < layout.decor.length; first += 1) {
    for (let second = first + 1; second < layout.decor.length; second += 1) {
      const a = layout.decor[first];
      const b = layout.decor[second];
      const aDefinition = findFarmDecor(a.itemId);
      const bDefinition = findFarmDecor(b.itemId);
      if (!farmDecorCollides(aDefinition, bDefinition)) continue;
      const permittedInterior = b.instanceId === "kitchen-range-1" && a.instanceId === "cottage-1";
      if (permittedInterior) continue;
      assert.equal(
        boxesOverlap(farmDecorBox(a, aDefinition), aDefinition.footprint, farmDecorBox(b, bDefinition), bDefinition.footprint),
        false,
        `${a.instanceId} must not overlap ${b.instanceId}`,
      );
    }
  }
});

test("an untouched saved starter cluster migrates to the corrected farmhouse arrangement", () => {
  const legacy = createDefaultFarmLayout(() => 0);
  const oldDecor = legacy.decor.map((row) => {
    if (row.instanceId === "cottage-1") return { ...row, x: -7.5, z: 1.5, rotationY: Math.PI / 2 };
    if (row.instanceId === "kitchen-range-1") return { ...row, x: -10.28, z: 2.7, rotationY: Math.PI / 2 };
    if (row.instanceId === "hay-bale-1") return { ...row, x: -1.2, z: -8.6 };
    if (row.instanceId === "hay-bale-2") return { ...row, x: 0.9, z: -8.9 };
    if (row.instanceId === "trough-1") return { ...row, x: 5.5, z: -1.5 };
    if (row.instanceId === "oak-1") return { ...row, x: 9.5, z: -9 };
    if (row.instanceId === "oak-2") return { ...row, x: 11.2, z: -4.5 };
    if (row.instanceId === "oak-3") return { ...row, x: -11.5, z: 4 };
    if (row.instanceId === "oak-4") return { ...row, x: 7.8, z: 9.5 };
    return row;
  });
  const migrated = normalizeFarmLayout({ ...legacy, decor: oldDecor });
  assert.deepEqual(
    migrated.decor.filter((row) => ["cottage-1", "kitchen-range-1", "hay-bale-1", "hay-bale-2", "trough-1", "oak-1", "oak-2", "oak-3", "oak-4"].includes(row.instanceId)).map(({ instanceId, itemId, x, z, rotationY }) => ({ instanceId, itemId, x, z, rotationY })),
    STARTER_FARM_DECOR.filter((row) => ["cottage-1", "kitchen-range-1", "hay-bale-1", "hay-bale-2", "trough-1", "oak-1", "oak-2", "oak-3", "oak-4"].includes(row.instanceId)).map(({ instanceId, itemId, x, z, rotationY }) => ({ instanceId, itemId, x, z, rotationY })),
  );
});

test("the previously shipped crowded farmhouse arrangement migrates without overwriting a player-adjusted homesite", () => {
  const starter = createDefaultFarmLayout(() => 0);
  const homesiteIds = ["cottage-1", "kitchen-range-1", "hay-bale-1", "hay-bale-2", "trough-1", "oak-1", "oak-2", "oak-3", "oak-4"];
  const homesiteRows = (decor) => decor.filter((row) => homesiteIds.includes(row.instanceId));
  const crowdedDecor = starter.decor.map((row) => {
    if (row.instanceId === "cottage-1") return { ...row, x: 0.25, z: -8.6, rotationY: Math.PI / 2 };
    if (row.instanceId === "kitchen-range-1") return { ...row, x: -2.53, z: -7.4, rotationY: Math.PI / 2 };
    if (row.instanceId === "trough-1") return { ...row, x: 5.5, z: -1.5 };
    if (row.instanceId === "oak-1") return { ...row, x: 9.5, z: -9 };
    if (row.instanceId === "oak-2") return { ...row, x: 11.2, z: -4.5 };
    if (row.instanceId === "oak-3") return { ...row, x: -11.5, z: 4 };
    if (row.instanceId === "oak-4") return { ...row, x: 7.8, z: 9.5 };
    return row;
  });
  assert.deepEqual(homesiteRows(normalizeFarmLayout({ ...starter, decor: crowdedDecor }).decor), homesiteRows(STARTER_FARM_DECOR));

  const adjusted = crowdedDecor.map((row) => row.instanceId === "cottage-1" ? { ...row, x: 1 } : row);
  const normalizedAdjusted = normalizeFarmLayout({ ...starter, decor: adjusted });
  assert.equal(normalizedAdjusted.decor.find((row) => row.instanceId === "cottage-1").x, 1);
  assert.equal(normalizedAdjusted.decor.find((row) => row.instanceId === "oak-1").x, 9.5);
});

test("the interim forward farmhouse arrangement migrates back to the rear fence", () => {
  const starter = createDefaultFarmLayout(() => 0);
  const interim = starter.decor.map((row) => {
    if (row.instanceId === "cottage-1") return { ...row, x: 4.2, z: -2, rotationY: Math.PI * 2 - Math.PI / 12 };
    if (row.instanceId === "kitchen-range-1") return { ...row, x: 3.7604, z: -4.9959, rotationY: Math.PI * 2 - Math.PI / 12 };
    return row;
  });
  const migrated = normalizeFarmLayout({ ...starter, decor: interim });
  assert.deepEqual(
    migrated.decor.filter((row) => ["cottage-1", "kitchen-range-1"].includes(row.instanceId)),
    STARTER_FARM_DECOR.filter((row) => ["cottage-1", "kitchen-range-1"].includes(row.instanceId)),
  );
});

test("the previously shipped lopsided rear-fence farmhouse migrates to the square pose", () => {
  const starter = createDefaultFarmLayout(() => 0);
  const lopsided = starter.decor.map((row) => {
    if (row.instanceId === "cottage-1") return { ...row, x: 4.2, z: -9.3, rotationY: 6.1021 };
    if (row.instanceId === "kitchen-range-1") return { ...row, x: 3.5203, z: -12.2507, rotationY: 6.1021 };
    return row;
  });
  const migrated = normalizeFarmLayout({ ...starter, decor: lopsided });
  assert.deepEqual(
    migrated.decor.filter((row) => ["cottage-1", "kitchen-range-1"].includes(row.instanceId)),
    STARTER_FARM_DECOR.filter((row) => ["cottage-1", "kitchen-range-1"].includes(row.instanceId)),
  );
});

test("moving or turning a farmhouse carries placed furniture and leaves yard props behind", () => {
  const cottage = findFarmDecor("decor.building.cottage");
  const building = { instanceId: "cottage-1", itemId: cottage.id, x: 0, z: 0, rotationY: 0, length: 0 };
  const range = { instanceId: "range-1", itemId: "decor.prop.kitchen-range", x: -1.2, z: -2.7, rotationY: 0, length: 0 };
  const bed = { instanceId: "bed-1", itemId: "decor.prop.bed", x: 2, z: 0.5, rotationY: Math.PI / 2, length: 0 };
  const bale = { instanceId: "bale-1", itemId: "decor.prop.hay-bale", x: 8, z: 8, rotationY: 0.4, length: 0 };
  const layout = { ...createDefaultFarmLayout(), decor: [building, range, bed, bale] };
  const nextBuilding = { x: 3, z: -2, rotationY: Math.PI / 2 };
  const moved = placeFarmDecor(layout, building.instanceId, nextBuilding);
  assert.ok(moved.valid, moved.reason);
  for (const original of [range, bed]) {
    const after = moved.layout.decor.find((row) => row.instanceId === original.instanceId);
    const expected = buildingLocalToWorld(nextBuilding, { x: original.x, z: original.z });
    assert.ok(Math.abs(after.x - expected.x) < 1e-4 && Math.abs(after.z - expected.z) < 1e-4);
    assert.ok(Math.abs(after.rotationY - (original.rotationY + Math.PI / 2)) < 1e-4);
  }
  assert.deepEqual(moved.layout.decor.find((row) => row.instanceId === bale.instanceId), bale);
});

test("plots snap edge-to-edge and align their centres with visible guides", () => {
  const soil = findFarmDecor("decor.plant.soil-patch");
  const layout = { ...createDefaultFarmLayout(), decor: [
    { instanceId: "soil-1", itemId: soil.id, x: 0, z: 0, rotationY: 0, length: 0 },
    { instanceId: "soil-2", itemId: soil.id, x: 5, z: 0, rotationY: 0, length: 0 },
  ] };
  const aligned = alignFarmDecorPlacement(layout, "soil-2", { x: 3.18, z: 0.14, rotationY: 0 }, 0.25);
  assert.deepEqual(aligned.value, { x: 3, z: 0, rotationY: 0 });
  assert.equal(aligned.guides.length, 2);
  assert.deepEqual(alignFarmDecorPlacement(layout, "soil-2", { x: 3.18, z: 0.14, rotationY: 0 }, 0), {
    value: { x: 3.18, z: 0.14, rotationY: 0 }, guides: [],
  });
});

test("normalize keeps a valid document, treats old documents as established, and repairs garbage", () => {
  const valid = { version: 2, ground: "ground.mud", pets: [{ instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit" }], decor: [{ instanceId: "oak-1", itemId: "decor.plant.oak", x: 2, z: 3, rotationY: 0, length: 0 }] };
  const normalized = normalizeFarmLayout(valid);
  assert.equal(normalized.version, 3);
  assert.equal(normalized.ground, valid.ground);
  assert.deepEqual({ instanceId: normalized.pets[0].instanceId, speciesId: normalized.pets[0].speciesId, name: normalized.pets[0].name }, valid.pets[0]);
  assert.ok(normalized.pets[0].profile, "legacy dogs gain a safe bounded profile");
  assert.deepEqual(normalized.decor, valid.decor);
  assert.deepEqual(Object.values(normalized.agriculture.inventory.seeds), Array(CROP_CATALOG.length).fill(5));
  assert.deepEqual(normalized.onboarding, { status: "complete", introSeen: true });
  assert.equal(normalizeFarmLayout(null).onboarding.status, "needs_name");
  assert.equal(normalizeFarmLayout({ version: 9 }).onboarding.status, "needs_name");
  assert.equal(normalizeFarmLayout("garbage").onboarding.status, "needs_name");
});

test("onboarding requires a real name, creates exactly one dog atomically, and never re-grants on reload", () => {
  const starter = createDefaultFarmLayout(() => 0);
  const seen = markFarmIntroSeen(starter);
  assert.deepEqual(seen.onboarding, { status: "needs_name", introSeen: true });

  const blank = completeFarmOnboarding(seen, "  ", () => 0.5);
  assert.equal(blank.ok, false);
  assert.equal(blank.reason, "invalid_name");
  assert.equal(blank.layout, seen);

  const completed = completeFarmOnboarding(seen, "  Biscuit  ", () => 0.5);
  assert.equal(completed.ok, true);
  assert.deepEqual(completed.layout.onboarding, { status: "complete", introSeen: true });
  assert.equal(completed.layout.pets.length, 1);
  assert.equal(completed.layout.pets[0].speciesId, "pet.corgi");
  assert.equal(completed.layout.pets[0].name, "Biscuit");

  const spent = {
    ...completed.layout,
    pets: [],
    agriculture: { ...completed.layout.agriculture, inventory: { ...completed.layout.agriculture.inventory, seeds: Object.fromEntries(CROP_CATALOG.map((crop) => [crop.id, 0])), supplies: { "food.dog-food": 0 } } },
  };
  const reloaded = normalizeFarmLayout(spent);
  assert.deepEqual(reloaded.onboarding, { status: "complete", introSeen: true });
  assert.deepEqual(reloaded.pets, []);
  assert.ok(Object.values(reloaded.agriculture.inventory.seeds).every((count) => count === 0));
  assert.equal(reloaded.agriculture.inventory.supplies["food.dog-food"], 0);
  assert.equal(completeFarmOnboarding(reloaded, "Second dog").reason, "already_complete");
});

test("a server-created pending farm receives its six-seed pool once", () => {
  const fromServer = normalizeFarmLayout({
    version: 3,
    onboarding: { status: "needs_name", introSeen: false },
    pets: [],
    agriculture: { inventory: { seeds: {}, produce: {}, supplies: {} }, crops: [] },
  });
  assert.equal(Object.values(fromServer.agriculture.inventory.seeds).filter((count) => count === 1).length, 6);
  assert.equal(Object.values(fromServer.agriculture.inventory.seeds).filter((count) => count === 0).length, CROP_CATALOG.length - 6);
  const reloaded = normalizeFarmLayout(fromServer);
  assert.deepEqual(reloaded.agriculture.inventory.seeds, fromServer.agriculture.inventory.seeds);
});

test("older documents migrate to v3 with the starter field; absent decor is the starter and an empty list is a cleared field", () => {
  const v1 = normalizeFarmLayout({ version: 1, ground: "ground.mud", pets: [{ instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit" }], decor: [] });
  assert.equal(v1.version, 3);
  assert.equal(v1.ground, "ground.mud");
  assert.equal(v1.pets.length, 1);
  assert.deepEqual(v1.decor, STARTER_FARM_DECOR);
  assert.deepEqual(normalizeFarmLayout({ version: 2, pets: [] }).decor, STARTER_FARM_DECOR);
  assert.deepEqual(normalizeFarmLayout({ version: 2, pets: [], decor: [] }).decor, []);
});

test("decor rows are validated per field: catalog id, clean instance id, finite clamped coordinates, wrapped rotation, and a length only for stretchable items", () => {
  const row = normalizeFarmDecorRow({ instanceId: "post-rail-9", itemId: "decor.fence.post-rail", x: 40, z: -3.5, rotationY: -Math.PI / 2, length: 99 });
  assert.equal(row.x, 14);
  assert.equal(row.z, -3.5);
  assert.ok(row.rotationY > 4.7 && row.rotationY < 4.72);
  assert.equal(row.length, 28, "clamped to the catalog's range");
  assert.equal(normalizeFarmDecorRow({ instanceId: "oak-1", itemId: "decor.plant.oak", x: 1, z: 1, rotationY: 0, length: 5 }).length, 0, "a tree has no length");
  assert.equal(normalizeFarmDecorRow({ instanceId: "post-rail-1", itemId: "decor.fence.post-rail", x: 1, z: 1 }).length, 4, "a fence without a length gets the default");
  assert.equal(normalizeFarmDecorRow({ instanceId: "cab-1", itemId: "cabinet.bird-duty.standard", x: 1, z: 1, rotationY: 0 }), null);
  assert.equal(normalizeFarmDecorRow({ instanceId: "bad id", itemId: "decor.plant.oak", x: 1, z: 1, rotationY: 0 }), null);
  assert.equal(normalizeFarmDecorRow({ instanceId: "oak-1", itemId: "decor.plant.oak", x: "1", z: 1, rotationY: 0 }), null);
  const layout = normalizeFarmLayout({ version: 2, pets: [], decor: [
    { instanceId: "oak-1", itemId: "decor.plant.oak", x: 1, z: 1, rotationY: 0 },
    { instanceId: "oak-1", itemId: "decor.plant.pine", x: 2, z: 2, rotationY: 0 },
    { instanceId: "cab-1", itemId: "cabinet.bird-duty.standard", x: 1, z: 1, rotationY: 0 },
  ] });
  assert.deepEqual(layout.decor.map((item) => item.itemId), ["decor.plant.oak"], "duplicates and foreign ids are dropped");
});

test("a pond makes the farm a water habitat, swimmers become adoptable, and a swimmer without a pond is dropped on load", () => {
  const dry = { ...createDefaultFarmLayout(() => 0), onboarding: { status: "complete", introSeen: true } };
  assert.equal(farmHabitats(dry).water, false);
  assert.equal(addPet(dry, "pet.shark", "Bruce").reason, "needs_water");
  const wet = { ...dry, decor: [...dry.decor, { instanceId: "pond-round-1", itemId: "decor.water.pond-round", x: 4, z: 4, rotationY: 0, length: 0 }] };
  assert.equal(farmHabitats(wet).water, true);
  const adopted = addPet(wet, "pet.shark", "Bruce");
  assert.ok(adopted.valid);
  assert.equal(waterPets(adopted.layout).length, 1);
  const drained = normalizeFarmLayout({ ...adopted.layout, decor: dry.decor });
  assert.equal(drained.pets.length, 0, "a shark cannot live on grass");
  assert.equal(normalizeFarmLayout(adopted.layout).pets.length, 1);
});

test("normalize falls back per field: an unknown ground becomes the meadow, a bad pet row is dropped", () => {
  const layout = normalizeFarmLayout({
    version: 1,
    ground: "ground.lava",
    pets: [
      { instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit" },
      { instanceId: "dragon-1", speciesId: "pet.dragon", name: "Smaug" },
      { instanceId: "", speciesId: "pet.duck", name: "Quack" },
      { instanceId: "corgi-1", speciesId: "pet.duck", name: "Dupe" },
      { instanceId: "duck-2", speciesId: "pet.duck", name: "  <b>Quack</b>  " },
    ],
  });
  assert.equal(layout.ground, DEFAULT_GROUND_ID);
  assert.deepEqual(layout.pets.map((pet) => pet.instanceId), ["corgi-1", "duck-2"]);
  assert.equal(layout.pets[1].name, "bQuack/b", "markup is stripped, whitespace trimmed");
  assert.deepEqual(layout.decor, STARTER_FARM_DECOR);
});

test("pet names are cleaned and bounded; an empty name falls back to the species title", () => {
  assert.equal(cleanPetName("  Biscuit  "), "Biscuit");
  assert.equal(cleanPetName("x".repeat(80)).length, PET_NAME_MAX_LENGTH);
  assert.equal(cleanPetName(42), "");
  const { layout } = addPet(createDefaultFarmLayout(), "pet.corgi", "");
  assert.equal(layout.pets[0].name, "Corgi");
});

test("adopting assigns a unique per-species instance id and respects the cap", () => {
  let layout = createDefaultFarmLayout();
  const first = addPet(layout, "pet.corgi", "Biscuit");
  assert.ok(first.valid);
  assert.ok(first.layout.pets[0].profile, "a scoped dog gets its individual profile at adoption");
  assert.equal(first.layout.pets[0].profile.affection, 50);
  layout = first.layout;
  const second = addPet(layout, "pet.corgi", "Waffle");
  layout = second.layout;
  assert.deepEqual(layout.pets.map((pet) => pet.instanceId), ["corgi-1", "corgi-2"]);
  assert.equal(addPet(layout, "pet.dragon", "Smaug").valid, false, "unknown species");
  assert.equal(addPet(layout, "pet.shark", "Bruce").valid, false, "a water species has nowhere to live yet");
  for (let index = layout.pets.length; index < MAX_PETS; index += 1) layout = addPet(layout, "pet.duck", "").layout;
  const overflow = addPet(layout, "pet.duck", "");
  assert.equal(overflow.valid, false);
  assert.equal(overflow.reason, "full");
  assert.equal(overflow.layout, layout);
});

test("rename and release are by instance id and leave other rows untouched", () => {
  let layout = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit").layout;
  layout = addPet(layout, "pet.duck", "Quack").layout;
  const renamed = renamePet(layout, "duck-1", "Sir Quackington");
  assert.equal(renamed.pets[1].name, "Sir Quackington");
  assert.deepEqual(renamed.pets[0], layout.pets[0]);
  assert.equal(renamePet(layout, "nope", "x"), layout, "unknown id is a no-op");
  const released = removePet(renamed, "corgi-1");
  assert.deepEqual(released.pets.map((pet) => pet.instanceId), ["duck-1"]);
  // A freed number is not reused while a later one exists: ids stay stable for anything that remembers them.
  assert.equal(addPet(released, "pet.duck", "").layout.pets.at(-1).instanceId, "duck-2");
});

test("setting the ground validates the id", () => {
  const layout = createDefaultFarmLayout();
  assert.equal(setFarmGround(layout, "ground.mud").layout.ground, "ground.mud");
  assert.equal(setFarmGround(layout, "ground.mud").valid, true);
  const bad = setFarmGround(layout, "floor.checker-classic");
  assert.equal(bad.valid, false);
  assert.equal(bad.layout, layout);
});

test("equality is structural and the cache key is per player", () => {
  const a = addPet(createDefaultFarmLayout(() => 0.5), "pet.corgi", "Biscuit", () => 0.5).layout;
  const b = addPet(createDefaultFarmLayout(() => 0.5), "pet.corgi", "Biscuit", () => 0.5).layout;
  assert.ok(farmLayoutsEqual(a, b));
  assert.ok(!farmLayoutsEqual(a, renamePet(b, "corgi-1", "Waffle")));
  assert.ok(!farmLayoutsEqual(a, { ...b, petHistory: [{ id: "memory-corgi-1", instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit", outcome: "runaway", departedAtFarmMinute: 1000, lifespanDays: 1, finalStats: { gender: "female", ageDays: 1, size: 1, hunger: 50, happiness: 5, speed: 50, strength: 40 }, traits: [], accomplishments: [] }] }), "durable history is part of layout identity");
  assert.equal(farmCacheKey("p1"), `${FARM_LAYOUT_STORAGE_KEY}:p1`);
  assert.equal(farmCacheKey(""), `${FARM_LAYOUT_STORAGE_KEY}:guest`);
});
