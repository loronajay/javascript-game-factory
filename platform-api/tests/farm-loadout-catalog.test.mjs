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
import { findFarmSupply } from "../src/services/farm-economy-catalog.mjs";
import { FARM_VENDOR_RECIPE_IDS } from "../src/services/farm-recipe-catalog.mjs";

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

test("ordinary farm saves cannot mint paid pets, seeds, or supplies", () => {
  const existing = normalizeFarmGarage({
    version: 3,
    onboarding: { status: "complete" },
    pets: [pet()],
    agriculture: { inventory: { seeds: { carrot: 2 }, supplies: { "food.dog-food": 2 } }, crops: [] },
  });
  const submitted = normalizeFarmGarage({
    ...existing,
    pets: [pet({ name: "Renamed" }), pet({ instanceId: "shark-1", speciesId: "pet.shark", name: "Free Shark" })],
    agriculture: { ...existing.agriculture, inventory: { ...existing.agriculture.inventory, seeds: { carrot: 99, bean: 99 }, supplies: { "food.dog-food": 99, "food.shark-feed": 99 } } },
  }, { currentGarage: existing });

  assert.deepEqual(submitted.pets.map((row) => [row.instanceId, row.name]), [["corgi-1", "Renamed"]]);
  assert.deepEqual(submitted.agriculture.inventory.supplies, { "food.dog-food": 2 });
  assert.deepEqual(submitted.agriculture.inventory.seeds, { carrot: 2 });
});

test("market ingredients and recipe cards are server-priced purchase catalog entries", () => {
  const ingredient = findFarmSupply("ingredient.tomato");
  assert.deepEqual({ kind: ingredient.kind, cropId: ingredient.cropId }, { kind: "ingredient", cropId: "tomato" });
  assert.ok(ingredient.price > 0);
  const recipe = findFarmSupply(`recipe.${FARM_VENDOR_RECIPE_IDS[0]}`);
  assert.deepEqual({ kind: recipe.kind, recipeId: recipe.recipeId }, { kind: "recipe", recipeId: FARM_VENDOR_RECIPE_IDS[0] });
  assert.ok(recipe.price >= 100);
});

test("vendor recipe ownership is normalized and cannot be minted by an ordinary save", () => {
  const recipeId = FARM_VENDOR_RECIPE_IDS[0];
  const existing = normalizeFarmGarage({ version: 3, onboarding: { status: "complete" }, skills: { cooking: { learned: [recipeId] } } });
  assert.deepEqual(existing.skills.cooking.learned, [recipeId]);
  const submitted = normalizeFarmGarage({ ...existing, skills: { ...existing.skills, cooking: { ...existing.skills.cooking, learned: FARM_VENDOR_RECIPE_IDS } } }, { currentGarage: existing });
  assert.deepEqual(submitted.skills.cooking.learned, [recipeId]);
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
    agriculture: { inventory: { seeds: {}, produce: {}, supplies: {}, saplings: {}, logs: {}, dishes: {}, planks: {}, furniture: {}, compost: 0 }, crops: [] },
    trees: [],
    clock: { farmMinutes: 480, updatedAt: 0, checkpointAt: 0, napBank: 1440 },
    skills: {
      farming: { xp: 0, harvests: 0, orders: 0, crops: {}, fruit: {} },
      woodcutting: { xp: 0, fellings: 0, trees: {} },
      cooking: { xp: 0, dishes: 0, perfect: 0, orders: 0, recipes: {}, learned: [], recent: [] },
      carpentry: { xp: 0, milled: 0, pieces: 0, masterwork: 0, patterns: {}, recent: [] },
      bartering: { xp: 0, deals: 0, bought: 0, sold: 0, saved: 0, bonus: 0 },
      husbandry: { xp: 0, collections: 0, orders: 0, goods: {}, butchered: 0, meat: {}, births: 0 },
    },
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
        { plotId: "plot-1", cellId: "cell-0", cropId: "bean", growthMinutes: 100, moistureMinutes: 20, tended: true, lastFarmMinute: 600 },
        { plotId: "plot-1", cellId: "cell-1", cropId: "radish", growthMinutes: 50, moistureMinutes: 0, tended: false, lastFarmMinute: 600, dryMinutes: 4320, untendedMinutes: 12, carePenalty: 7, diedOf: "thirst" },
        { plotId: "bench-1", cropId: "radish", growthMinutes: 1, moistureMinutes: 1, tended: false, lastFarmMinute: 1 },
        { plotId: "missing-plot", cropId: "potato", growthMinutes: 1, moistureMinutes: 1, tended: false, lastFarmMinute: 1 },
      ],
    },
    clock: { farmMinutes: 612.5, updatedAt: 1_800_000_000_000, checkpointAt: 1_799_999_000_000 },
  });

  assert.deepEqual(garage.agriculture.inventory, {
    seeds: { bean: 4, radish: 99 },
    produce: { bean: 1 },
    supplies: { "food.dog-food": 20 },
    saplings: {},
    logs: {},
    dishes: {},
    planks: {},
    furniture: {},
    compost: 0,
  });
  assert.deepEqual(garage.agriculture.crops, [{
    plotId: "plot-1",
    cellId: "cell-0",
    cropId: "bean",
    growthMinutes: 100,
    moistureMinutes: 20,
    tended: true,
    lastFarmMinute: 600,
    dryMinutes: 0,
    untendedMinutes: 0,
    carePenalty: 0,
    diedOf: "",
    stressMinutes: 0,
    fertilized: false,
  }, {
    plotId: "plot-1",
    cellId: "cell-1",
    cropId: "radish",
    growthMinutes: 50,
    moistureMinutes: 0,
    tended: false,
    lastFarmMinute: 600,
    dryMinutes: 4320,
    untendedMinutes: 12,
    carePenalty: 1,
    diedOf: "thirst",
    stressMinutes: 0,
    fertilized: false,
  }]);
  assert.deepEqual(garage.clock, { farmMinutes: 612.5, updatedAt: 1_800_000_000_000, checkpointAt: 1_799_999_000_000, napBank: 1440 });
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

test("a save cannot plant past productive capacity, but stored crops always survive", () => {
  const plots = Array.from({ length: 3 }, (_, index) => ({ instanceId: `plot-${index}`, itemId: "decor.plant.soil-patch", x: index * 4, z: 0, rotationY: 0 }));
  const crop = (plotId, cellId) => ({ plotId, cellId, cropId: "carrot", growthMinutes: 0, moistureMinutes: 0, tended: false, lastFarmMinute: 0 });
  const eighteen = plots.flatMap((plot) => ["cell-0", "cell-1", "cell-2", "cell-3", "cell-4", "cell-5"].map((cellId) => crop(plot.instanceId, cellId)));
  const document = (crops, decor = plots) => ({ version: 3, decor, agriculture: { inventory: { seeds: { carrot: 50 } }, crops }, clock: {} });
  const planted = (garage) => garage.agriculture.crops.map((row) => `${row.plotId}:${row.cellId}`);

  // A first save (no stored row yet) of 18 crops on three plots keeps six.
  const first = normalizeFarmGarage(document(eighteen), { currentGarage: null });
  assert.equal(first.agriculture.crops.length, 6);

  // A grandfathered farm keeps all 18 it already had, and a 19th is refused.
  const stored = normalizeFarmGarage(document(eighteen));
  assert.equal(stored.agriculture.crops.length, 18, "reads never trim");
  const withPlots = [...plots, { instanceId: "plot-9", itemId: "decor.plant.soil-patch", x: 20, z: 0, rotationY: 0 }];
  const grown = normalizeFarmGarage(document([...eighteen, crop("plot-9", "cell-0")], withPlots), { currentGarage: stored });
  assert.equal(grown.agriculture.crops.length, 18);
  assert.ok(!planted(grown).includes("plot-9:cell-0"));

  // A greenhouse lifts the cap once: six new crops land, a seventh does not, a second greenhouse adds nothing.
  const houses = [{ instanceId: "glass-1", itemId: "decor.building.greenhouse", x: -8, z: 5, rotationY: 0 }, { instanceId: "glass-2", itemId: "decor.building.greenhouse", x: 8, z: 5, rotationY: 0 }];
  const base = normalizeFarmGarage(document(eighteen.slice(0, 6)));
  const more = eighteen.slice(6, 13);
  const withGreenhouse = normalizeFarmGarage(document([...eighteen.slice(0, 6), ...more], [...plots, ...houses]), { currentGarage: base, ownedEntitlementIds: new Set(["decor.building.greenhouse"]) });
  assert.equal(withGreenhouse.agriculture.crops.length, 12);
});
