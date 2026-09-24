import test from "node:test";
import assert from "node:assert/strict";

import {
  FARM_GAME_SLUG,
  FARM_LOADOUT_CATALOG,
  FARM_MAX_PETS,
  defaultFarmGarage,
  farmLoadoutFromGarage,
  normalizeFarmGarage,
} from "../src/services/farm-loadout-catalog.mjs";
import { isValidLoadoutSlug } from "../src/db/game-loadouts.mjs";

const pet = (overrides = {}) => ({ instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit", ...overrides });

test("the farm slug is registered on the shared garage table", () => {
  assert.equal(FARM_GAME_SLUG, "farm");
  assert.equal(isValidLoadoutSlug(FARM_GAME_SLUG), true);
  assert.equal(FARM_LOADOUT_CATALOG.requiresEntitlements, true);
});

test("paid ground and decor require server-owned Farm entitlements", () => {
  const input = {
    version: 3,
    ground: "ground.clover",
    pets: [],
    decor: [
      { instanceId: "barn-1", itemId: "decor.building.barn", x: 0, z: 0, rotationY: 0 },
      { instanceId: "mill-1", itemId: "decor.building.windmill", x: 5, z: 5, rotationY: 0 },
      { instanceId: "fake-1", itemId: "decor.building.fake", x: 2, z: 2, rotationY: 0 },
    ],
  };
  const locked = normalizeFarmGarage(input, { ownedEntitlementIds: new Set() });
  assert.equal(locked.ground, "");
  assert.deepEqual(locked.decor.map((row) => row.itemId), ["decor.building.barn"]);

  const owned = normalizeFarmGarage(input, {
    ownedEntitlementIds: new Set(["ground.clover", "decor.building.windmill", "decor.building.fake"]),
  });
  assert.equal(owned.ground, "ground.clover");
  assert.deepEqual(owned.decor.map((row) => row.itemId), ["decor.building.barn", "decor.building.windmill"]);
});

test("ordinary farm saves cannot mint paid pets or increase paid supplies", () => {
  const existing = normalizeFarmGarage({
    version: 3,
    onboarding: { status: "complete" },
    pets: [pet()],
    agriculture: { inventory: { supplies: { "food.dog-food": 2 } }, crops: [] },
  });
  const submitted = normalizeFarmGarage({
    ...existing,
    pets: [pet({ name: "Renamed" }), pet({ instanceId: "shark-1", speciesId: "pet.shark", name: "Free Shark" })],
    agriculture: { ...existing.agriculture, inventory: { ...existing.agriculture.inventory, supplies: { "food.dog-food": 99, "food.shark-feed": 99 } } },
  }, { currentGarage: existing });

  assert.deepEqual(submitted.pets.map((row) => [row.instanceId, row.name]), [["corgi-1", "Renamed"]]);
  assert.deepEqual(submitted.agriculture.inventory.supplies, { "food.dog-food": 2 });
});

test("ordinary saves cannot reroll a server-created pet's identity", () => {
  const profile = {
    gender: "female", ageDays: 1, affection: 50, hunger: 90, starvingMinutes: 0, happiness: 90,
    size: { current: 0.7, max: 1.1, growthPerDay: 0.005 }, stats: { speed: 44, strength: 33 },
    traits: ["movement.fast"], milestones: [], paletteId: "sable", paletteBonus: 0,
  };
  const existing = normalizeFarmGarage({ version: 3, onboarding: { status: "complete" }, pets: [pet({ profile })] });
  const submitted = normalizeFarmGarage({
    ...existing,
    pets: [pet({ profile: { ...profile, gender: "male", size: { current: 0.8, max: 5, growthPerDay: 1 }, stats: { speed: 100, strength: 100 }, traits: ["held.loves"], paletteId: "cosmic", paletteBonus: 0.5 } })],
  }, { currentGarage: existing });
  const saved = submitted.pets[0].profile;
  assert.equal(saved.gender, "female");
  assert.deepEqual(saved.stats, { speed: 44, strength: 33 });
  assert.deepEqual(saved.traits, ["movement.fast"]);
  assert.equal(saved.paletteId, "sable");
  assert.equal(saved.size.max, 1.1);
  assert.equal(saved.size.current, 0.8, "care progression may still grow the pet");
});

test("the one-time onboarding transition may add exactly the free starter corgi", () => {
  const existing = normalizeFarmGarage({
    version: 3,
    onboarding: { status: "needs_name" },
    pets: [],
    agriculture: { inventory: { supplies: { "food.dog-food": 20 } }, crops: [] },
  });
  const submitted = normalizeFarmGarage({
    ...existing,
    onboarding: { status: "complete" },
    pets: [pet(), pet({ instanceId: "duck-1", speciesId: "pet.duck" })],
  }, { currentGarage: existing });
  assert.deepEqual(submitted.pets.map((row) => row.speciesId), ["pet.corgi"]);
});

test("a missing row is the empty v3 farm with a persisted clock and agriculture document", () => {
  assert.deepEqual(normalizeFarmGarage(null), {
    version: 3,
    onboarding: { status: "needs_name", introSeen: false },
    ground: "",
    pets: [],
    agriculture: { inventory: { seeds: {}, produce: {}, supplies: {} }, crops: [] },
    clock: { farmMinutes: 480, updatedAt: 0 },
  });
  // A pre-build-mode document keeps its version so the client can migrate it (seed the starter field).
  assert.equal(normalizeFarmGarage({ version: 1, pets: [] }).version, 1);
  assert.equal(normalizeFarmGarage({ version: 7, pets: [] }).version, 3);
  assert.deepEqual(normalizeFarmGarage("nope"), defaultFarmGarage());
});

test("v3 agriculture and clock survive the server trust boundary", () => {
  const garage = normalizeFarmGarage({
    version: 3,
    decor: [
      { instanceId: "plot-1", itemId: "decor.plant.soil-patch", x: 2, z: 3, rotationY: 0 },
      { instanceId: "bench-1", itemId: "decor.seating.bench", x: 0, z: 0, rotationY: 0 },
    ],
    agriculture: {
      inventory: { seeds: { bean: 4, radish: 999, "bad id": 2 }, produce: { bean: 1 }, supplies: { "food.dog-food": 20, "bad item!": 2 } },
      crops: [
        { plotId: "plot-1", cropId: "bean", growthMinutes: 100, moistureMinutes: 20, tended: true, lastFarmMinute: 600 },
        { plotId: "bench-1", cropId: "radish", growthMinutes: 1, moistureMinutes: 1, tended: false, lastFarmMinute: 1 },
        { plotId: "missing-plot", cropId: "potato", growthMinutes: 1, moistureMinutes: 1, tended: false, lastFarmMinute: 1 },
      ],
    },
    clock: { farmMinutes: 612.5, updatedAt: 1_800_000_000_000 },
  });

  assert.deepEqual(garage.agriculture.inventory, {
    seeds: { bean: 4, radish: 99 },
    produce: { bean: 1 },
    supplies: { "food.dog-food": 20 },
  });
  assert.deepEqual(garage.agriculture.crops, [{
    plotId: "plot-1",
    cropId: "bean",
    growthMinutes: 100,
    moistureMinutes: 20,
    tended: true,
    lastFarmMinute: 600,
  }]);
  assert.deepEqual(garage.clock, { farmMinutes: 612.5, updatedAt: 1_800_000_000_000 });
});

test("a valid farm round-trips", () => {
  const garage = normalizeFarmGarage({ version: 1, ground: "ground.mud", pets: [pet(), pet({ instanceId: "duck-1", speciesId: "pet.duck", name: "Quack" })] });
  assert.deepEqual(garage, { version: 1, ground: "ground.mud", pets: [pet(), pet({ instanceId: "duck-1", speciesId: "pet.duck", name: "Quack" })] });
});

test("explicit onboarding state survives while legacy farms remain unmarked", () => {
  assert.deepEqual(
    normalizeFarmGarage({ version: 3, onboarding: { status: "needs_name", introSeen: true }, pets: [] }).onboarding,
    { status: "needs_name", introSeen: true },
  );
  assert.deepEqual(
    normalizeFarmGarage({ version: 3, onboarding: { status: "complete", introSeen: false }, pets: [] }).onboarding,
    { status: "complete", introSeen: true },
  );
  assert.equal("onboarding" in normalizeFarmGarage({ version: 2, pets: [] }), false, "legacy rows stay distinguishable from new defaults");
});

test("ids are checked for namespace only; the client's catalog decides what they mean", () => {
  const garage = normalizeFarmGarage({
    version: 1,
    ground: "floor.checker-classic",
    pets: [
      pet(),
      pet({ instanceId: "dragon-1", speciesId: "dragon" }),
      pet({ instanceId: "unicorn-1", speciesId: "pet.unicorn" }),
      pet({ instanceId: "bad id!", speciesId: "pet.duck" }),
      pet({ instanceId: "corgi-1", speciesId: "pet.duck", name: "Dupe" }),
    ],
  });
  assert.equal(garage.ground, "", "a room floor is not a farm ground: stored as the client default");
  assert.deepEqual(garage.pets.map((row) => row.instanceId), ["corgi-1", "unicorn-1"], "an unknown-but-well-formed species passes here and the client drops it");
});

test("pet names are printable single lines with markup characters removed and a cap", () => {
  const garage = normalizeFarmGarage({ version: 1, pets: [pet({ name: "  <b>Bis\u0000cuit</b>   the  Good " + "x".repeat(40) })] });
  assert.equal(garage.pets[0].name.length, 20);
  assert.ok(!garage.pets[0].name.includes("<") && !garage.pets[0].name.includes("\u0000"));
  assert.equal(normalizeFarmGarage({ version: 1, pets: [pet({ name: 42 })] }).pets[0].name, "");
});

test("the pet list is bounded", () => {
  const pets = Array.from({ length: FARM_MAX_PETS + 10 }, (_, index) => pet({ instanceId: `duck-${index + 1}`, speciesId: "pet.duck" }));
  assert.equal(normalizeFarmGarage({ version: 1, pets }).pets.length, FARM_MAX_PETS);
});

test("decor is the field: a namespace-checked list of bounded rows, emitted only when sent (absent = starter, [] = cleared)", () => {
  assert.equal("decor" in normalizeFarmGarage({ version: 2, pets: [] }), false);
  assert.deepEqual(normalizeFarmGarage({ version: 2, pets: [], decor: [] }).decor, []);
  const garage = normalizeFarmGarage({ version: 2, pets: [], decor: [
    { instanceId: "fence-1", itemId: "decor.fence.picket", x: 1, z: 2, rotationY: 0, length: 12.5 },
    { instanceId: "cab-1", itemId: "cabinet.bird-duty.standard", x: 1, z: 2, rotationY: 0 },
    { instanceId: "fence-2", itemId: "decor.fence.picket", x: 900, z: 2, rotationY: 0 },
  ] });
  assert.deepEqual(garage.decor.map((row) => row.instanceId), ["fence-1", "fence-2"]);
  assert.equal(garage.decor[1].x, 16, "coordinates are clamped to the bound, not dropped");
  assert.equal(garage.decor[0].length, 12.5, "a fence run keeps its length");
  assert.equal("length" in garage.decor[1], false, "no length sent, none stored");
});

test("the public loadout is the whole document, like the room", () => {
  const garage = normalizeFarmGarage({ version: 1, ground: "ground.clover", pets: [pet()] });
  assert.deepEqual(farmLoadoutFromGarage(garage), { layout: garage });
});
