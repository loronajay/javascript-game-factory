import test from "node:test";
import assert from "node:assert/strict";

import {
  DOG_CARE,
  PET_CARE,
  PET_PROFILE_SPECIES,
  PET_TRAITS,
  createPetProfile,
  findPetProfileSpecies,
  normalizePetProfile,
  visiblePetStats,
} from "../farm-pet-care.mjs";
import { ANIMAL_CATALOG } from "../farm-catalog/animals.mjs";
import { addPet, createDefaultFarmLayout, normalizeFarmLayout } from "../farm-layout.mjs";

function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("dog care is data, including the future ticket prices and owned-item relationships", () => {
  assert.equal(DOG_CARE.speciesId, "pet.corgi");
  assert.equal(DOG_CARE.adoptionPrice, 1200);
  assert.deepEqual(DOG_CARE.food, { itemId: "food.dog-food", title: "Dog Food", price: 15, starterQuantity: 20 });
  assert.equal(DOG_CARE.dwelling.itemId, "decor.building.dog-house");
  assert.deepEqual(DOG_CARE.toys.map((toy) => toy.title), ["Tennis Ball", "Rope Toy", "Bone"]);
  assert.equal(DOG_CARE.maxLifeDays, 100);
});

test("every species has its own sensible food and data-only dwelling", () => {
  assert.deepEqual(PET_CARE.map(({ speciesId, food, dwelling }) => ({ speciesId, food: food.title, dwelling: dwelling.title })), [
    { speciesId: "pet.corgi", food: "Dog Food", dwelling: "Dog House" },
    { speciesId: "pet.duck", food: "Waterfowl Feed", dwelling: "Duck Coop" },
    { speciesId: "pet.red-panda", food: "Bamboo Bites", dwelling: "Treetop Den" },
    { speciesId: "pet.platypus", food: "River Grubs", dwelling: "Burrow Lodge" },
    { speciesId: "pet.hippo", food: "River Hay", dwelling: "Mud-Wallow Shelter" },
    { speciesId: "pet.rhino", food: "Browse Bundle", dwelling: "Rhino Shade" },
    { speciesId: "pet.bat", food: "Fruit Mix", dwelling: "Roosting Box" },
    { speciesId: "pet.shark", food: "Shark Feed", dwelling: "Reef Grotto" },
    { speciesId: "pet.anglerfish", food: "Deep-Sea Feed", dwelling: "Darkwater Cave" },
    { speciesId: "pet.jellyfish", food: "Plankton Blend", dwelling: "Jellyfish Lagoon" },
  ]);
  assert.equal(new Set(PET_CARE.map((care) => care.food.itemId)).size, PET_CARE.length);
  assert.equal(new Set(PET_CARE.map((care) => care.dwelling.itemId)).size, PET_CARE.length);
  assert.equal(PET_CARE.filter((care) => care.food.starterQuantity > 0).map((care) => care.speciesId).join(), "pet.corgi");
});

test("a newly adopted dog receives bounded individual identity, needs, growth and compatible traits", () => {
  const profile = createPetProfile("pet.corgi", sequence([0, 0.99, 0.4, 0.7, 0.2, 0.8, 0.1, 0.6, 0.3, 0.9]));
  assert.equal(profile.gender, "female");
  assert.equal(profile.ageDays, 0);
  assert.equal(profile.affection, 50);
  assert.equal(profile.hunger, 100);
  assert.equal(profile.starvingMinutes, 0);
  assert.equal(profile.happiness, 100);
  assert.ok(profile.size.current >= DOG_CARE.size.min && profile.size.current <= DOG_CARE.size.max);
  assert.ok(profile.size.max >= profile.size.current && profile.size.max <= DOG_CARE.size.max);
  assert.ok(profile.stats.speed >= DOG_CARE.stats.speed.min && profile.stats.speed <= DOG_CARE.stats.speed.max);
  assert.ok(profile.stats.strength >= DOG_CARE.stats.strength.min && profile.stats.strength <= DOG_CARE.stats.strength.max);
  assert.ok(profile.traits.length >= 1 && profile.traits.length <= 5);
  assert.equal(new Set(profile.traits).size, profile.traits.length);
  assert.equal(profile.traits.includes("held.dislikes") && profile.traits.includes("held.loves"), false);
  assert.equal(profile.traits.includes("appetite.frequent") && profile.traits.includes("appetite.rare"), false);
  assert.ok(profile.traits.every((id) => PET_TRAITS.some((trait) => trait.id === id)));
});

test("stored pet profiles are bounded and visible stats never expose affection", () => {
  const normalized = normalizePetProfile("pet.corgi", {
    gender: "robot",
    ageDays: 999,
    affection: -20,
    hunger: 500,
    starvingMinutes: -10,
    happiness: -1,
    size: { current: -5, max: 100, growthPerDay: 9 },
    stats: { speed: 1000, strength: -5 },
    traits: ["held.loves", "held.dislikes", "missing", "held.loves"],
    paletteId: "neon",
  });
  assert.equal(normalized.gender, "female");
  assert.equal(normalized.ageDays, 100);
  assert.equal(normalized.affection, 0);
  assert.equal(normalized.hunger, 100);
  assert.equal(normalized.starvingMinutes, 0);
  assert.equal(normalized.happiness, 0);
  assert.equal(normalized.size.max, DOG_CARE.size.max);
  assert.ok(normalized.size.current >= DOG_CARE.size.min);
  assert.deepEqual(normalized.traits, ["held.loves"]);
  const visible = visiblePetStats(normalized);
  assert.equal("affection" in visible, false);
  assert.deepEqual(Object.keys(visible), ["gender", "ageDays", "size", "hunger", "happiness", "speed", "strength"]);
});

test("every species uses the same randomized profile system with species-weighted physical stats", () => {
  assert.deepEqual(PET_PROFILE_SPECIES.map((row) => row.speciesId), ANIMAL_CATALOG.map((row) => row.id));
  for (const species of ANIMAL_CATALOG) {
    const weights = findPetProfileSpecies(species.id);
    const profile = createPetProfile(species.id, sequence([0.8, 0.2, 0.75, 0.25, 0.6, 0.1, 0.9, 0.3, 0.7, 0.4]));
    assert.ok(weights, `${species.id} has profile weights`);
    assert.ok(profile, `${species.id} receives a profile`);
    assert.equal(profile.gender, "male");
    assert.equal(profile.ageDays, 0);
    assert.equal(profile.hunger, 100);
    assert.equal(profile.happiness, 100);
    assert.ok(profile.stats.speed >= weights.stats.speed.min && profile.stats.speed <= weights.stats.speed.max);
    assert.ok(profile.stats.strength >= weights.stats.strength.min && profile.stats.strength <= weights.stats.strength.max);
    assert.ok(profile.traits.length >= 1 && profile.traits.length <= 5);
  }
  assert.ok(findPetProfileSpecies("pet.bat").stats.speed.min > findPetProfileSpecies("pet.hippo").stats.speed.min, "a bat skews faster than a hippo");
  assert.ok(findPetProfileSpecies("pet.rhino").stats.strength.min > findPetProfileSpecies("pet.duck").stats.strength.max, "a rhino skews stronger than a duck");
  assert.equal(createPetProfile("pet.missing", () => 0.5), null);
  assert.equal(normalizePetProfile("pet.missing", {}), null);
});

test("adoption persists a profile and every legacy pet row receives a safe profile on load", () => {
  const adopted = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit", () => 0.5).layout.pets[0];
  assert.equal(adopted.name, "Biscuit");
  assert.ok(adopted.profile);
  assert.equal(adopted.profile.affection, 50);

  const legacy = normalizeFarmLayout({
    version: 1,
    pets: [{ instanceId: "corgi-1", speciesId: "pet.corgi", name: "Legacy" }],
  }).pets[0];
  assert.ok(legacy.profile);
  assert.equal(legacy.profile.hunger, 100);

  const legacyDuck = normalizeFarmLayout({
    version: 1,
    pets: [{ instanceId: "duck-1", speciesId: "pet.duck", name: "Puddle" }],
  }).pets[0];
  assert.ok(legacyDuck.profile);
  assert.equal(legacyDuck.profile.hunger, 100);
  assert.ok(legacyDuck.profile.traits.length >= 1, "legacy pets receive the complete profile, including traits");
  const sameDuck = normalizeFarmLayout({
    version: 1,
    pets: [{ instanceId: "duck-1", speciesId: "pet.duck", name: "Puddle" }],
  }).pets[0];
  const otherDuck = normalizeFarmLayout({
    version: 1,
    pets: [{ instanceId: "duck-2", speciesId: "pet.duck", name: "Ripple" }],
  }).pets[0];
  assert.deepEqual(sameDuck.profile, legacyDuck.profile, "migration never rerolls on reload");
  assert.notDeepEqual(otherDuck.profile, legacyDuck.profile, "identity seeds individual variation");
});
