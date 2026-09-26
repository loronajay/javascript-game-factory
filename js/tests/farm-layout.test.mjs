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
  assert.deepEqual(layout.clock, { farmMinutes: 480, updatedAt: 0 });
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
