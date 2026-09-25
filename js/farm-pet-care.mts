// Persistent pet identity and care data. Every species uses the same complete
// individual profile pipeline; species rows weight physical stats and name the
// food/dwelling that later care slices will use. The animal catalog remains the
// owner of render, locomotion and palette values. Dwelling ids cross-reference
// ordinary placeable farm decor so care never owns a second asset registry.

import { findAnimalPalette, pickAnimalPalette } from "./farm-catalog/animals.mjs";
import {
  applyPetTreatment,
  findGrowthGrade,
  growthStage,
  legacyPetGrowth,
  normalizePetGrowth,
  petGrowthOutlook,
  rollPetGrowth,
  statsFromGrowth,
  HUNGRY_GROWTH_WEIGHT,
  type PetGrowth,
  type PetGrowthOutlook,
  type PetTreatmentKind,
} from "./farm-pet-growth.mjs";

export type PetGender = "female" | "male";
export type PetTrait = Readonly<{
  id: string;
  title: string;
  description: string;
  conflicts: readonly string[];
  hungerDrainMultiplier: number;
  /** How this trait wants to be treated: rapport added on top of BASE_TREATMENT per interaction. */
  treatment: Readonly<Partial<Record<PetTreatmentKind, number>>>;
}>;

type TraitSpec = Readonly<{ conflicts?: readonly string[]; hungerDrainMultiplier?: number; treatment?: Partial<Record<PetTreatmentKind, number>> }>;
const trait = (id: string, title: string, description: string, spec: TraitSpec = {}): PetTrait =>
  Object.freeze({
    id, title, description,
    conflicts: Object.freeze([...(spec.conflicts ?? [])]),
    hungerDrainMultiplier: spec.hungerDrainMultiplier ?? 1,
    treatment: Object.freeze({ ...(spec.treatment ?? {}) }),
  });

/** Every pet's rapport response before its traits: attention is welcome, a serving when not hungry is neutral. */
export const BASE_TREATMENT: Readonly<Record<PetTreatmentKind, number>> = Object.freeze({ pet: 2, carry: 1, play: 3, feed: 1, "feed-early": 0 });
/** Feeding a pet above this hunger counts as `feed-early`, which Light Eaters dislike. */
export const EARLY_FEED_HUNGER = 60;

export const PET_TRAITS: readonly PetTrait[] = Object.freeze([
  trait("held.dislikes", "Independent", "Does not like to be held. Grows best when given space and toys.", { conflicts: ["held.loves"], treatment: { pet: -1, carry: -8, play: 3 } }),
  trait("held.loves", "Cuddly", "Likes to be held often. Grows best with cuddles and carrying.", { conflicts: ["held.dislikes"], treatment: { pet: 4, carry: 6 } }),
  trait("movement.fast", "Zoomies", "Moves unusually fast. Grows best with play, and would rather run than be carried.", { treatment: { play: 6, carry: -2 } }),
  trait("appetite.frequent", "Big Appetite", "Gets hungry more often, and loves every meal.", { conflicts: ["appetite.rare"], hungerDrainMultiplier: 1.5, treatment: { feed: 4, "feed-early": 3 } }),
  trait("appetite.rare", "Light Eater", "Gets hungry less often, and dislikes being fed when it is not hungry.", { conflicts: ["appetite.frequent"], hungerDrainMultiplier: 0.65, treatment: { feed: 1, "feed-early": -5 } }),
  trait("growth.fast", "Fast Grower", "Reaches adult size sooner and grows fastest while young.", { treatment: { feed: 2 } }),
]);

type Range = Readonly<{ min: number; max: number }>;
export type PetCareDefinition = Readonly<{
  speciesId: string;
  maxLifeDays: number;
  adoptionPrice: number;
  food: Readonly<{ itemId: string; title: string; price: number; starterQuantity: number }>;
  needs: Readonly<{ hungerPerDay: number; hungerPerServing: number }>;
  dwelling: Readonly<{ itemId: string; title: string }>;
  toys: readonly Readonly<{ itemId: string; title: string }>[];
  size: Readonly<{ min: number; max: number; adultMin: number }>;
  stats: Readonly<{ speed: Range; strength: Range }>;
  traitCount: Range;
  traitIds: readonly string[];
}>;

type CareSpec = Readonly<{
  speciesId: string;
  maxLifeDays: number;
  food: Readonly<{ id: string; title: string; price: number; starter?: number }>;
  dwelling: Readonly<{ id: string; title: string }>;
  speed: Range;
  strength: Range;
  toys?: readonly Readonly<{ itemId: string; title: string }>[];
}>;

const COMMON_SIZE = Object.freeze({ min: 0.62, adultMin: 0.9, max: 1.12 });
const COMMON_TRAIT_COUNT = Object.freeze({ min: 1, max: 3 });
const ALL_TRAIT_IDS = Object.freeze(PET_TRAITS.map((entry) => entry.id));

function care(spec: CareSpec): PetCareDefinition {
  return Object.freeze({
    speciesId: spec.speciesId,
    maxLifeDays: spec.maxLifeDays,
    adoptionPrice: 1200,
    food: Object.freeze({ itemId: `food.${spec.food.id}`, title: spec.food.title, price: spec.food.price, starterQuantity: spec.food.starter ?? 0 }),
    needs: Object.freeze({ hungerPerDay: 25, hungerPerServing: 35 }),
    dwelling: Object.freeze({ itemId: `decor.prop.${spec.dwelling.id}`, title: spec.dwelling.title }),
    toys: Object.freeze([...(spec.toys ?? [])].map((toy) => Object.freeze({ ...toy }))),
    // Relative multipliers: the catalog's world-space height remains the species' base size.
    size: COMMON_SIZE,
    stats: Object.freeze({ speed: Object.freeze({ ...spec.speed }), strength: Object.freeze({ ...spec.strength }) }),
    traitCount: COMMON_TRAIT_COUNT,
    traitIds: ALL_TRAIT_IDS,
  });
}

export const PET_CARE: readonly PetCareDefinition[] = Object.freeze([
  care({ speciesId: "pet.corgi", maxLifeDays: 100, food: { id: "dog-food", title: "Dog Food", price: 15, starter: 20 }, dwelling: { id: "doghouse", title: "Dog House" }, speed: { min: 35, max: 65 }, strength: { min: 25, max: 55 }, toys: [
    { itemId: "decor.prop.tennis-ball", title: "Tennis Ball" },
    { itemId: "decor.prop.rope-toy", title: "Rope Toy" },
    { itemId: "decor.prop.bone", title: "Bone" },
  ] }),
  care({ speciesId: "pet.duck", maxLifeDays: 80, food: { id: "waterfowl-feed", title: "Waterfowl Feed", price: 12 }, dwelling: { id: "duck-coop", title: "Duck Coop" }, speed: { min: 28, max: 55 }, strength: { min: 15, max: 35 } }),
  care({ speciesId: "pet.red-panda", maxLifeDays: 90, food: { id: "bamboo-bites", title: "Bamboo Bites", price: 24 }, dwelling: { id: "treetop-den", title: "Treetop Den" }, speed: { min: 30, max: 60 }, strength: { min: 20, max: 42 } }),
  care({ speciesId: "pet.platypus", maxLifeDays: 100, food: { id: "river-grubs", title: "River Grubs", price: 20 }, dwelling: { id: "burrow-lodge", title: "Burrow Lodge" }, speed: { min: 22, max: 50 }, strength: { min: 20, max: 45 } }),
  care({ speciesId: "pet.hippo", maxLifeDays: 140, food: { id: "river-hay", title: "River Hay", price: 30 }, dwelling: { id: "mud-wallow-shelter", title: "Mud-Wallow Shelter" }, speed: { min: 18, max: 42 }, strength: { min: 65, max: 95 } }),
  care({ speciesId: "pet.rhino", maxLifeDays: 130, food: { id: "browse-bundle", title: "Browse Bundle", price: 35 }, dwelling: { id: "rhino-shade", title: "Rhino Shade" }, speed: { min: 22, max: 48 }, strength: { min: 75, max: 100 } }),
  care({ speciesId: "pet.bat", maxLifeDays: 90, food: { id: "fruit-mix", title: "Fruit Mix", price: 18 }, dwelling: { id: "roosting-box", title: "Roosting Box" }, speed: { min: 45, max: 78 }, strength: { min: 10, max: 28 } }),
  care({ speciesId: "pet.shark", maxLifeDays: 150, food: { id: "shark-feed", title: "Shark Feed", price: 45 }, dwelling: { id: "reef-grotto", title: "Reef Grotto" }, speed: { min: 48, max: 82 }, strength: { min: 60, max: 90 } }),
  care({ speciesId: "pet.anglerfish", maxLifeDays: 110, food: { id: "deep-sea-feed", title: "Deep-Sea Feed", price: 40 }, dwelling: { id: "darkwater-cave", title: "Darkwater Cave" }, speed: { min: 20, max: 45 }, strength: { min: 18, max: 40 } }),
  care({ speciesId: "pet.jellyfish", maxLifeDays: 70, food: { id: "plankton-blend", title: "Plankton Blend", price: 28 }, dwelling: { id: "jellyfish-lagoon", title: "Jellyfish Lagoon" }, speed: { min: 12, max: 35 }, strength: { min: 8, max: 25 } }),
]);

/** Complete starting-profile rows, named separately so care and identity remain clear at call sites. */
export const PET_PROFILE_SPECIES = PET_CARE;
export const DOG_CARE = PET_CARE[0]!;

export type PetProfile = Readonly<{
  gender: PetGender;
  ageDays: number;
  size: Readonly<{ current: number; max: number; growthPerDay: number }>;
  affection: number;
  hunger: number;
  /** Farm minutes spent continuously at zero hunger; the death pass consumes this persisted grace timer. */
  starvingMinutes: number;
  happiness: number;
  stats: Readonly<{ speed: number; strength: number }>;
  traits: readonly string[];
  /** One-time care awards already granted; additive so older profiles normalize safely. */
  milestones: readonly string[];
  paletteId: string;
  /** Persisted so rarity stat bonuses migrate once and never compound on reload. */
  paletteBonus: number;
  /** Stat progression; `stats` is always derived from this plus the palette bonus. */
  growth: PetGrowth;
}>;

export function findPetCare(speciesId: unknown): PetCareDefinition | undefined {
  return typeof speciesId === "string" ? PET_CARE.find((entry) => entry.speciesId === speciesId) : undefined;
}

export const findPetProfileSpecies = findPetCare;

const unit = (value: number): number => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const randomIn = (range: Range, random: () => number): number => range.min + (range.max - range.min) * unit(random());
const round = (value: number, places = 2): number => Number(value.toFixed(places));
const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function chooseTraits(care: PetCareDefinition, random: () => number): string[] {
  const target = care.traitCount.min + Math.floor(unit(random()) * (care.traitCount.max - care.traitCount.min + 1));
  const pool = care.traitIds.map((id) => ({ id, order: unit(random()) })).sort((a, b) => a.order - b.order);
  const selected: string[] = [];
  for (const candidate of pool) {
    const definition = PET_TRAITS.find((entry) => entry.id === candidate.id);
    if (!definition || selected.some((id) => definition.conflicts.includes(id))) continue;
    selected.push(candidate.id);
    if (selected.length >= Math.min(5, target)) break;
  }
  return selected;
}

export function createPetProfile(speciesId: string, random: () => number): PetProfile | null {
  const care = findPetCare(speciesId);
  if (!care) return null;
  const maxSize = round(randomIn({ min: care.size.adultMin, max: care.size.max }, random));
  const currentSize = round(randomIn({ min: care.size.min, max: Math.min(care.size.adultMin, maxSize) }, random));
  const gender = unit(random()) < 0.5 ? "female" : "male";
  const baseSpeed = randomIn(care.stats.speed, random);
  const baseStrength = randomIn(care.stats.strength, random);
  const traits = chooseTraits(care, random);
  const palette = pickAnimalPalette(speciesId, random);
  const paletteBonus = palette?.statBoost ?? 0;
  // Rolled last so every earlier draw (and every existing seeded test) is unchanged.
  const growth = rollPetGrowth(care, { speed: baseSpeed, strength: baseStrength }, palette?.tier ?? "classic", random);
  return Object.freeze({
    gender,
    ageDays: 0,
    size: Object.freeze({ current: currentSize, max: maxSize, growthPerDay: round((maxSize - currentSize) / 70, 4) }),
    affection: 50,
    hunger: 100,
    starvingMinutes: 0,
    happiness: 100,
    stats: statsFromGrowth(growth, paletteBonus),
    traits: Object.freeze(traits),
    milestones: Object.freeze([]),
    paletteId: palette?.id ?? "standard",
    paletteBonus,
    growth,
  });
}

export function normalizePetProfile(speciesId: string, value: unknown): PetProfile | null {
  const care = findPetCare(speciesId);
  if (!care) return null;
  const source = value && typeof value === "object" ? value as Partial<PetProfile> : {};
  const size: Partial<PetProfile["size"]> = source.size && typeof source.size === "object" ? source.size : {};
  const stats: Partial<PetProfile["stats"]> = source.stats && typeof source.stats === "object" ? source.stats : {};
  const palette = findAnimalPalette(speciesId, source.paletteId) ?? findAnimalPalette(speciesId, "standard");
  const paletteBonus = palette?.statBoost ?? 0;
  const storedBonus = clamp(source.paletteBonus, 0, 0.5, 0);
  const bonusMigration = (1 + paletteBonus) / (1 + storedBonus);
  const maxSize = round(clamp(size.max, care.size.adultMin, care.size.max, care.size.adultMin));
  const currentSize = round(clamp(size.current, care.size.min, maxSize, care.size.min));
  const selected: string[] = [];
  for (const id of Array.isArray(source.traits) ? source.traits : []) {
    const definition = PET_TRAITS.find((entry) => entry.id === id);
    if (!definition || selected.includes(id) || selected.some((other) => definition.conflicts.includes(other)) || selected.length >= 5) continue;
    selected.push(id);
  }
  const ageDays = round(clamp(source.ageDays, 0, care.maxLifeDays, 0), 4);
  const gender = source.gender === "male" ? "male" : "female";
  // A profile saved before progression: its stored stats (bonus included) become
  // the base, a stable seeded roll supplies potential, and the days it already
  // lived are credited. Also the fallback for any malformed growth field.
  const legacyStat = (id: "speed" | "strength") => {
    const range = care.stats[id];
    const middle = (range.min + range.max) / 2;
    const stored = clamp((typeof stats[id] === "number" ? stats[id] : middle) * bonusMigration, range.min, Math.min(100, range.max * (1 + paletteBonus)), middle);
    return Math.min(range.max, Math.max(range.min, stored / (1 + paletteBonus)));
  };
  const legacyBase = { speed: legacyStat("speed"), strength: legacyStat("strength") };
  const legacyRoll = rollPetGrowth(care, legacyBase, palette?.tier ?? "classic",
    seededRandom(`${speciesId}:${gender}:${round(legacyBase.speed, 3)}:${round(legacyBase.strength, 3)}:${palette?.id ?? "standard"}`));
  const legacy = legacyPetGrowth(care, legacyRoll, ageDays, selected.includes("growth.fast"), paletteBonus);
  const growth = source.growth && typeof source.growth === "object"
    ? normalizePetGrowth(care, source.growth, legacy, ageDays, paletteBonus)
    : legacy;
  return Object.freeze({
    gender,
    ageDays,
    size: Object.freeze({ current: currentSize, max: maxSize, growthPerDay: round(clamp(size.growthPerDay, 0, 0.02, 0), 4) }),
    affection: round(clamp(source.affection, 0, 100, 50), 4),
    hunger: round(clamp(source.hunger, 0, 100, 100), 4),
    starvingMinutes: Math.floor(clamp(source.starvingMinutes, 0, 100 * 365 * 24 * 60, 0)),
    happiness: round(clamp(source.happiness, 0, 100, 100), 1),
    stats: statsFromGrowth(growth, paletteBonus),
    traits: Object.freeze(selected),
    milestones: Object.freeze(Array.from(new Set((Array.isArray(source.milestones) ? source.milestones : [])
      .filter((id): id is string => typeof id === "string" && /^dwelling:decor\.[a-z0-9.-]+$/.test(id))
      .slice(0, 16)))),
    paletteId: palette?.id ?? "standard",
    paletteBonus,
    growth,
  });
}

/** Stable entropy for migrating pre-progression profiles without rerolling on every load. */
function seededRandom(identity: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    state ^= identity.charCodeAt(index);
    state = Math.imul(state, 16777619) >>> 0;
  }
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** This pet's full rapport response to one kind of treatment: the baseline plus every trait's preference. */
export function petTreatmentDelta(profile: PetProfile, kind: PetTreatmentKind): number {
  return profile.traits.reduce((sum, id) => sum + (PET_TRAITS.find((entry) => entry.id === id)?.treatment[kind] ?? 0), BASE_TREATMENT[kind]);
}

/** Record one treatment against the pet's rapport, faded by how often this kind already happened today. */
export function treatPet(profile: PetProfile, kind: PetTreatmentKind, farmDay: number): Readonly<{ profile: PetProfile; applied: number }> {
  const result = applyPetTreatment(profile.growth, kind, petTreatmentDelta(profile, kind), farmDay);
  return Object.freeze({ applied: result.applied, profile: Object.freeze({ ...profile, growth: result.growth }) });
}

/** Status-line wording for a treatment's effect; silent when it barely registered. */
export function treatmentNote(applied: number): string {
  if (applied >= 4) return "It loved being treated this way.";
  if (applied <= -3) return "It did not like that.";
  return "";
}

export type PetGrowthView = Readonly<{
  gradeTitle: string;
  stars: number;
  stageTitle: string;
  outlook: PetGrowthOutlook;
  gained: Readonly<{ speed: number; strength: number }>;
}>;

/** What the Pets panel may show about progression: potential, life stage, trend and earned points — never affection or rapport. */
export function petGrowthView(profile: PetProfile, speciesId: string): PetGrowthView | null {
  const care = findPetCare(speciesId);
  if (!care) return null;
  const grade = findGrowthGrade(profile.growth.grade);
  const hungerWeight = profile.hunger <= 0 ? 0 : profile.hunger <= 40 ? HUNGRY_GROWTH_WEIGHT : 1;
  const sample = { hungerWeight, happiness: profile.happiness, affection: profile.affection, rapport: profile.growth.rapport };
  const earned = (id: "speed" | "strength") => round(Math.max(0, profile.stats[id] - Math.min(100, profile.growth.base[id] * (1 + profile.paletteBonus))), 1);
  return Object.freeze({
    gradeTitle: grade.title,
    stars: grade.stars,
    stageTitle: growthStage(profile.ageDays, care.maxLifeDays).title,
    outlook: petGrowthOutlook(profile.growth, sample, profile.ageDays, care.maxLifeDays, profile.paletteBonus),
    gained: Object.freeze({ speed: earned("speed"), strength: earned("strength") }),
  });
}

/** The UI contract: affection remains in persistence but never joins this view. */
export function visiblePetStats(profile: PetProfile): Readonly<Record<string, string | number>> {
  return Object.freeze({
    gender: profile.gender,
    ageDays: profile.ageDays,
    size: profile.size.current,
    hunger: round(profile.hunger, 1),
    happiness: profile.happiness,
    speed: profile.stats.speed,
    strength: profile.stats.strength,
  });
}
