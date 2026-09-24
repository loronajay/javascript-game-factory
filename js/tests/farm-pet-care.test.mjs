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
import { ANIMAL_CATALOG, findAnimalPalette, pickAnimalPalette } from "../farm-catalog/animals.mjs";
import { animalPaletteDisplayName, recolorPalettePixel } from "../farm-pet-palettes.mjs";
import { findFarmDecor } from "../farm-catalog/decor.mjs";
import { addPet, createDefaultFarmLayout, normalizeFarmLayout } from "../farm-layout.mjs";
import { advancePetWellbeing, applyPetCareMilestones, petCareEnvironment, reactToPetInteraction } from "../farm-pet-happiness.mjs";
import { FAST_GROWTH_MULTIPLIER, advancePetLifecycle } from "../farm-pet-lifecycle.mjs";
import { advancePetProfile, feedPet } from "../farm-pet-needs.mjs";
import { farmPropNames } from "../farm-props.mjs";
import { removeFarmDecor } from "../farm-decor-layout.mjs";
import { AFFECTION_CALL_THRESHOLD, petOutcomeWarning, reactToPetCall, resolvePetOutcomes } from "../farm-pet-outcomes.mjs";

function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

const careRow = (instanceId, itemId) => ({ instanceId, itemId, x: 0, z: 0, rotationY: 0, length: 0 });

function dogProfile(overrides = {}) {
  return {
    ...createPetProfile("pet.corgi", () => 0.5),
    affection: 50,
    happiness: 50,
    traits: [],
    milestones: [],
    ...overrides,
  };
}

test("dog care is data, including the future ticket prices and owned-item relationships", () => {
  assert.equal(DOG_CARE.speciesId, "pet.corgi");
  assert.equal(DOG_CARE.adoptionPrice, 1200);
  assert.deepEqual(DOG_CARE.food, { itemId: "food.dog-food", title: "Dog Food", price: 15, starterQuantity: 20 });
  assert.equal(DOG_CARE.dwelling.itemId, "decor.prop.doghouse");
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

test("every pet has a complete weighted visual palette set", () => {
  assert.equal(ANIMAL_CATALOG.length, 10);
  for (const species of ANIMAL_CATALOG) {
    assert.equal(species.palettes.length, 4, `${species.id} has classic, uncommon, rare and super-rare looks`);
    assert.equal(species.palettes[0].id, "standard", `${species.id} keeps the source art as its common look`);
    assert.deepEqual(species.palettes.map(({ tier, weight, statBoost }) => ({ tier, weight, statBoost })), [
      { tier: "classic", weight: 69, statBoost: 0 },
      { tier: "uncommon", weight: 24, statBoost: 0 },
      { tier: "rare", weight: 6, statBoost: 0.08 },
      { tier: "super-rare", weight: 1, statBoost: 0.15 },
    ], `${species.id} uses the locked 69/24/6/1 distribution`);
    assert.equal(new Set(species.palettes.map((palette) => palette.id)).size, species.palettes.length, `${species.id} palette ids are unique`);
    assert.equal(species.palettes.reduce((sum, palette) => sum + palette.weight, 0), 100, `${species.id} weights are readable percentages`);
    for (const palette of species.palettes) {
      assert.match(palette.tint, /^#[0-9a-f]{6}$/i);
      assert.ok(palette.weight > 0);
      assert.equal(findAnimalPalette(species.id, palette.id), palette);
      if (palette.id !== "standard") {
        assert.equal(palette.colors.length, 3, `${species.id} ${palette.id} uses a deliberate three-color ramp`);
        palette.colors.forEach((color) => assert.match(color, /^#[0-9a-f]{6}$/i));
      }
    }
    assert.equal(pickAnimalPalette(species.id, () => 0)?.id, "standard");
    assert.equal(pickAnimalPalette(species.id, () => 0.989999)?.tier, "rare");
    assert.equal(pickAnimalPalette(species.id, () => 0.99)?.tier, "super-rare");
    assert.equal(pickAnimalPalette(species.id, () => 0.999999)?.id, species.palettes.at(-1).id);
    assert.match(animalPaletteDisplayName(species.palettes.at(-1)), /Super Rare$/);
    assert.equal(species.palettes.at(-1).finish, "pearl");
  }
});

test("pet palette recoloring protects eyes and other neutral facial details", () => {
  const colors = ["#24345f", "#4e63a6", "#d08a4f"];
  assert.deepEqual(recolorPalettePixel({ r: 0, g: 0, b: 0, a: 255 }, colors), { r: 0, g: 0, b: 0, a: 255 }, "black pupils remain black");
  assert.deepEqual(recolorPalettePixel({ r: 255, g: 255, b: 255, a: 255 }, colors), { r: 255, g: 255, b: 255, a: 255 }, "eye whites remain white");
  assert.deepEqual(recolorPalettePixel({ r: 240, g: 236, b: 225, a: 255 }, colors), { r: 240, g: 236, b: 225, a: 255 }, "warm white muzzle and eye pixels remain untouched");
  assert.notDeepEqual(recolorPalettePixel({ r: 150, g: 150, b: 150, a: 255 }, colors), { r: 150, g: 150, b: 150, a: 255 }, "mid-tone neutral body colors can still become a rare coat");
  assert.notDeepEqual(recolorPalettePixel({ r: 192, g: 112, b: 54, a: 255 }, colors), { r: 192, g: 112, b: 54, a: 255 }, "colored coat pixels use the rare ramp");
});

test("every pet dwelling is placeable, identifies its resident, and has a usable entrance", () => {
  const builders = new Set(farmPropNames());
  const models = [];
  for (const care of PET_CARE) {
    const species = ANIMAL_CATALOG.find((entry) => entry.id === care.speciesId);
    const dwelling = findFarmDecor(care.dwelling.itemId);
    assert.ok(dwelling, `${care.dwelling.title} is in the farm catalog`);
    assert.equal(dwelling.category, "prop");
    assert.equal(dwelling.dwelling?.speciesId, care.speciesId);
    assert.ok(builders.has(dwelling.model), `${care.dwelling.title} has a procedural builder`);
    models.push(dwelling.model);
    assert.ok(dwelling.dwelling.entrance.width >= species.radius * 1.6, `${care.dwelling.title} entrance fits ${species.title}`);
    assert.ok(dwelling.dwelling.entrance.height >= species.height * 0.9, `${care.dwelling.title} entrance is tall enough for ${species.title}`);
  }
  assert.equal(new Set(models).size, PET_CARE.length, "every species gets a distinct dwelling model");
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
    milestones: ["dwelling:decor.prop.doghouse", "bad", "dwelling:decor.prop.doghouse"],
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
  assert.deepEqual(normalized.milestones, ["dwelling:decor.prop.doghouse"]);
  assert.equal(normalized.paletteId, "standard", "an unknown palette falls back safely");
  const visible = visiblePetStats(normalized);
  assert.equal("affection" in visible, false);
  assert.deepEqual(Object.keys(visible), ["gender", "ageDays", "size", "hunger", "happiness", "speed", "strength"]);
});

test("palette rarity is assigned at adoption and valid looks survive persistence", () => {
  const common = createPetProfile("pet.corgi", () => 0);
  const superRare = createPetProfile("pet.corgi", () => 0.999999);
  assert.equal(common.paletteId, "standard");
  assert.equal(superRare.paletteId, ANIMAL_CATALOG[0].palettes.at(-1).id);
  assert.equal(superRare.paletteBonus, 0.15);
  assert.equal(superRare.stats.speed, 74.7);
  assert.equal(superRare.stats.strength, 63.2);
  assert.equal(normalizePetProfile("pet.corgi", superRare).paletteId, superRare.paletteId);
});

test("rare and super-rare palettes boost persisted base stats exactly once", () => {
  const [rare, superRare] = ["rare", "super-rare"].map((tier) => ANIMAL_CATALOG[0].palettes.find((palette) => palette.tier === tier));
  const base = { stats: { speed: 50, strength: 40 } };
  const boostedRare = normalizePetProfile("pet.corgi", { ...base, paletteId: rare.id });
  const boostedSuperRare = normalizePetProfile("pet.corgi", { ...base, paletteId: superRare.id });
  assert.deepEqual(boostedRare.stats, { speed: 54, strength: 43.2 });
  assert.equal(boostedRare.paletteBonus, 0.08);
  assert.deepEqual(boostedSuperRare.stats, { speed: 57.5, strength: 46 });
  assert.equal(boostedSuperRare.paletteBonus, 0.15);
  assert.deepEqual(normalizePetProfile("pet.corgi", boostedSuperRare).stats, boostedSuperRare.stats, "reload does not compound the bonus");
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

test("a profile saved before traits existed receives stable traits without rerolling its other identity", () => {
  const oldProfile = {
    gender: "female",
    ageDays: 0,
    size: { current: 0.62, max: 1.04, growthPerDay: 0.006 },
    affection: 63,
    hunger: 88,
    starvingMinutes: 0,
    happiness: 91,
    stats: { speed: 50, strength: 40 },
    traits: [],
    paletteId: "standard",
  };
  const document = {
    version: 3,
    onboarding: { status: "complete", introSeen: true },
    ground: "ground.grass",
    pets: [{ instanceId: "corgi-1", speciesId: "pet.corgi", name: "Biscuit", profile: oldProfile }],
    decor: [],
    agriculture: { inventory: { seeds: {}, produce: {}, supplies: {} }, crops: [] },
    clock: { farmMinutes: 480, updatedAt: 0 },
  };

  const repaired = normalizeFarmLayout(document).pets[0].profile;
  const reloaded = normalizeFarmLayout(document).pets[0].profile;
  assert.ok(repaired.traits.length >= 1, "pre-trait profiles are repaired for the Pets panel");
  assert.deepEqual(reloaded.traits, repaired.traits, "repair is deterministic for the pet's stable identity");
  assert.equal(repaired.affection, oldProfile.affection);
  assert.equal(repaired.hunger, oldProfile.hunger);
  assert.deepEqual(repaired.stats, oldProfile.stats);
});

test("farm time advances age and growth without losing partial days", () => {
  const profile = dogProfile({
    ageDays: 12.25,
    size: { current: 0.7, max: 1, growthPerDay: 0.006 },
  });
  const halfDay = advancePetLifecycle(profile, "pet.corgi", 720);
  assert.equal(halfDay.ageDays, 12.75);
  assert.equal(halfDay.size.current, 0.703);

  const checkpoint = advancePetProfile(profile, "pet.corgi", 720);
  assert.equal(checkpoint.ageDays, halfDay.ageDays, "the persisted needs checkpoint owns lifecycle time too");
  assert.equal(checkpoint.size.current, halfDay.size.current);
});

test("Fast Grower reaches the individual cap sooner while age stops exactly at the species lifespan", () => {
  const ordinary = dogProfile({
    ageDays: 0,
    size: { current: 0.7, max: 1, growthPerDay: 0.1 },
  });
  const fast = { ...ordinary, traits: ["growth.fast"] };
  assert.equal(advancePetLifecycle(fast, "pet.corgi", 1440).size.current, 0.7 + 0.1 * FAST_GROWTH_MULTIPLIER);

  const nearEnd = { ...fast, ageDays: 99.5, size: { current: 0.99, max: 1, growthPerDay: 0.1 } };
  const old = advancePetLifecycle(nearEnd, "pet.corgi", 1440 * 20);
  assert.equal(old.ageDays, DOG_CARE.maxLifeDays, "care never extends the deterministic natural lifespan");
  assert.equal(old.size.current, old.size.max);
});

test("the dog care row points at the placeable doghouse and three placeable toys", () => {
  assert.equal(DOG_CARE.dwelling.itemId, "decor.prop.doghouse");
  assert.deepEqual(DOG_CARE.toys.map((toy) => toy.itemId), [
    "decor.prop.tennis-ball",
    "decor.prop.rope-toy",
    "decor.prop.bone",
  ]);
  const ownedItems = [DOG_CARE.dwelling, ...DOG_CARE.toys].map((item) => findFarmDecor(item.itemId));
  assert.deepEqual(ownedItems.map((item) => item?.title), ["Doghouse", "Tennis Ball", "Rope Toy", "Bone"]);
  assert.ok(ownedItems.every((item) => item?.unlock.type === "starter"), "development keeps the dwelling and toys owned");
  assert.ok(ownedItems.slice(1).every((item) => item?.solid === false), "small toys never block the player or a pet");
});

test("placed species care is recognized once per distinct compatible item", () => {
  const decor = [
    careRow("house-1", "decor.prop.doghouse"),
    careRow("ball-1", "decor.prop.tennis-ball"),
    careRow("ball-2", "decor.prop.tennis-ball"),
    careRow("rope-1", "decor.prop.rope-toy"),
    careRow("bench-1", "decor.prop.bench"),
  ];
  assert.deepEqual(petCareEnvironment("pet.corgi", decor), {
    hasDwelling: true,
    toyCount: 2,
    toyTitles: ["Tennis Ball", "Rope Toy"],
  });
});

test("dwelling and toys offset happiness decay and build affection over farm time", () => {
  const bare = advancePetWellbeing(dogProfile(), "pet.corgi", [], 1440);
  assert.equal(bare.happiness, 42);
  assert.equal(bare.affection, 50);

  const caredFor = advancePetWellbeing(dogProfile(), "pet.corgi", [
    careRow("house-1", "decor.prop.doghouse"),
    careRow("ball-1", "decor.prop.tennis-ball"),
    careRow("rope-1", "decor.prop.rope-toy"),
  ], 1440);
  assert.equal(caredFor.happiness, 51);
  assert.equal(caredFor.affection, 52);
});

test("the first placed dwelling awards affection once and persists its milestone", () => {
  let layout = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit", () => 0.5).layout;
  layout = { ...layout, decor: [...layout.decor, careRow("house-1", "decor.prop.doghouse")] };
  const first = applyPetCareMilestones(layout);
  assert.equal(first.pets[0].profile.affection, 60);
  assert.deepEqual(first.pets[0].profile.milestones, ["dwelling:decor.prop.doghouse"]);
  assert.equal(applyPetCareMilestones(first), first, "a later save cannot award the house again");
});

test("handling reactions are trait-aware, readable, and play requires a compatible toy", () => {
  const cuddly = reactToPetInteraction(dogProfile({ traits: ["held.loves"] }), "pet.corgi", "pet", []);
  assert.equal(cuddly.ok, true);
  assert.equal(cuddly.profile.affection, 54);
  assert.equal(cuddly.profile.happiness, 54);

  const independent = reactToPetInteraction(dogProfile({ traits: ["held.dislikes"], affection: 50 }), "pet.corgi", "carry", []);
  assert.equal(independent.ok, false);
  assert.equal(independent.reaction, "refuse");
  assert.match(independent.message, /space|trust/i);

  const distressed = reactToPetInteraction(dogProfile({ affection: 5, happiness: 5 }), "pet.corgi", "carry", []);
  assert.equal(distressed.ok, false);
  assert.equal(distressed.reaction, "bite");
  assert.match(distressed.message, /warning|snap/i);

  const noToy = reactToPetInteraction(dogProfile(), "pet.corgi", "play", []);
  assert.equal(noToy.ok, false);
  assert.equal(noToy.reason, "no_toy");
  const played = reactToPetInteraction(dogProfile(), "pet.corgi", "play", [careRow("ball-1", "decor.prop.tennis-ball")]);
  assert.equal(played.ok, true);
  assert.equal(played.profile.happiness, 62);
  assert.equal(played.profile.affection, 53);
  assert.match(played.message, /Tennis Ball/);
});

test("a severely unhappy pet refuses food without consuming a serving", () => {
  let layout = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit", () => 0.5).layout;
  layout = { ...layout, pets: layout.pets.map((pet) => ({ ...pet, profile: { ...pet.profile, hunger: 50, happiness: 10 } })) };
  const before = layout.agriculture.inventory.supplies["food.dog-food"];
  const fed = feedPet(layout, "corgi-1", layout.clock.farmMinutes);
  assert.equal(fed.ok, false);
  assert.equal(fed.reason, "refused");
  assert.equal(fed.layout.agriculture.inventory.supplies["food.dog-food"], before);
});

test("Phase-5 warnings escalate and only a trusted, happy pet answers a call", () => {
  assert.equal(petOutcomeWarning(dogProfile(), "pet.corgi").stage, "safe");
  assert.equal(petOutcomeWarning(dogProfile({ affection: 35 }), "pet.corgi").stage, "watch");
  assert.equal(petOutcomeWarning(dogProfile({ happiness: 18 }), "pet.corgi").stage, "urgent");
  assert.equal(petOutcomeWarning(dogProfile({ hunger: 0, starvingMinutes: 1440 }), "pet.corgi").stage, "critical");
  assert.equal(reactToPetCall(dogProfile({ affection: AFFECTION_CALL_THRESHOLD, happiness: 60 })).ok, true);
  assert.equal(reactToPetCall(dogProfile({ affection: AFFECTION_CALL_THRESHOLD - 1 })).ok, false);
  assert.equal(reactToPetCall(dogProfile({ affection: 100, happiness: 10 })).ok, false);
});

test("starvation atomically creates a movable memorial and durable final history", () => {
  let layout = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit", () => 0.5).layout;
  layout = { ...layout, pets: layout.pets.map((pet) => ({ ...pet, profile: { ...pet.profile, hunger: 0, starvingMinutes: 1440, ageDays: 22.5, traits: ["held.loves"] } })) };
  const resolved = resolvePetOutcomes(layout, layout.clock.farmMinutes, layout.clock.farmMinutes, () => 0.99);
  assert.equal(resolved.pets.length, 0);
  assert.equal(resolved.petHistory[0].outcome, "starvation");
  assert.equal(resolved.petHistory[0].lifespanDays, 22.5);
  assert.deepEqual(resolved.petHistory[0].traits, ["held.loves"]);
  assert.deepEqual(resolved.petHistory[0].accomplishments, []);
  const stone = resolved.decor.find((row) => row.itemId === "decor.prop.pet-tombstone");
  assert.equal(stone.memorialId, resolved.petHistory[0].id);
  const moved = normalizeFarmLayout({ ...resolved, decor: resolved.decor.map((row) => row.instanceId === stone.instanceId ? { ...row, x: 3, z: 4, rotationY: 1 } : row) });
  assert.equal(moved.decor.find((row) => row.instanceId === stone.instanceId).x, 3);
  const removed = removeFarmDecor(moved, stone.instanceId).layout;
  assert.equal(removed.decor.some((row) => row.instanceId === stone.instanceId), false);
  assert.equal(removed.petHistory.length, 1, "removing the prop never erases history");
});

test("natural lifespan and low-happiness daily outcomes use the intended order", () => {
  let old = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit", () => 0.5).layout;
  old = { ...old, pets: old.pets.map((pet) => ({ ...pet, profile: { ...pet.profile, ageDays: 100 } })) };
  assert.equal(resolvePetOutcomes(old, old.clock.farmMinutes, old.clock.farmMinutes, () => 0.99).petHistory[0].outcome, "old_age");

  let unhappy = addPet(createDefaultFarmLayout(), "pet.corgi", "Biscuit", () => 0.5).layout;
  unhappy = { ...unhappy, pets: unhappy.pets.map((pet) => ({ ...pet, profile: { ...pet.profile, happiness: 5, affection: 50 } })) };
  const nextDay = unhappy.clock.farmMinutes + 1440;
  assert.equal(resolvePetOutcomes(unhappy, unhappy.clock.farmMinutes, nextDay, () => 0.01).petHistory[0].outcome, "runaway");
  const rolls = [0.99, 0.001];
  const rareDeath = resolvePetOutcomes(unhappy, unhappy.clock.farmMinutes, nextDay, () => rolls.shift() ?? 0.99);
  assert.equal(rareDeath.petHistory[0].outcome, "neglect", "rare death is rolled only after runaway fails");
  assert.equal(rareDeath.decor.some((row) => row.itemId === "decor.prop.pet-tombstone"), true);
});
