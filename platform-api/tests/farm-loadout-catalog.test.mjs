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
  assert.equal(FARM_LOADOUT_CATALOG.requiresEntitlements, false);
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
