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
export type PetTraitRarity = "common" | "uncommon" | "rare";

/**
 * Every multiplier a trait can apply. A trait names only the ones it changes;
 * the rest stay 1, and a pet's traits multiply together (`petTraitMultiplier`).
 * Each key is read by exactly one rule module, named beside it.
 */
export type PetTraitMultipliers = Readonly<{
  hungerDrain: number;          // needs: hunger lost per farm day
  hungryAffectionLoss: number;  // needs: trust lost while hungry or starving
  starvationGrace: number;      // needs: how long at zero hunger before death
  happinessDrain: number;       // wellbeing: happiness lost per farm day
  missingDwellingDrain: number; // wellbeing: extra drain while its home is not placed
  dwellingHappiness: number;    // wellbeing: happiness its home adds per day
  dwellingAffection: number;    // wellbeing: trust its home adds per day, and the first-home award
  toyHappiness: number;         // wellbeing: happiness each toy adds per day
  toyAffection: number;         // wellbeing: trust each toy adds per day
  handlingAffection: number;    // handling: trust gained from petting and play
  handlingHappiness: number;    // handling: happiness gained from petting
  pace: number;                 // farm sim: walk speed
  idle: number;                 // farm sim: rest between strolls
  wanderRange: number;          // farm sim: how far one stroll goes
  lifespan: number;             // lifecycle: natural lifespan (growth stages stay on the species' life)
}>;
export type PetTraitMultiplier = keyof PetTraitMultipliers;

export type PetTrait = Readonly<{
  id: string;
  title: string;
  description: string;
  rarity: PetTraitRarity;
  conflicts: readonly string[];
  multipliers: Readonly<Partial<PetTraitMultipliers>>;
  /** Happiness/trust at or below which a handling attempt is snapped at; the default is DEFAULT_SNAP_AT. */
  snapAt: number | null;
  /** Picks its strolls near the player (farm sim). */
  follows: boolean;
  /** Where in the species' adult size range it lands, applied once at adoption. */
  size: "large" | "small" | null;
  /** How this trait wants to be treated: rapport added on top of BASE_TREATMENT per interaction. */
  treatment: Readonly<Partial<Record<PetTreatmentKind, number>>>;
}>;

/** Adoption draw weight per rarity: a common trait is six times as likely as a rare one. */
export const PET_TRAIT_RARITY_WEIGHTS: Readonly<Record<PetTraitRarity, number>> = Object.freeze({ common: 6, uncommon: 3, rare: 1 });
export const DEFAULT_SNAP_AT = 10;

type TraitSpec = Readonly<{
  rarity?: PetTraitRarity;
  conflicts?: readonly string[];
  multipliers?: Partial<PetTraitMultipliers>;
  snapAt?: number;
  follows?: boolean;
  size?: "large" | "small";
  treatment?: Partial<Record<PetTreatmentKind, number>>;
}>;
const trait = (id: string, title: string, description: string, spec: TraitSpec = {}): Omit<PetTrait, "conflicts"> & { declared: readonly string[] } =>
  Object.freeze({
    id, title, description,
    rarity: spec.rarity ?? "common",
    declared: Object.freeze([...(spec.conflicts ?? [])]),
    multipliers: Object.freeze({ ...(spec.multipliers ?? {}) }),
    snapAt: spec.snapAt ?? null,
    follows: spec.follows ?? false,
    size: spec.size ?? null,
    treatment: Object.freeze({ ...(spec.treatment ?? {}) }),
  });

/** Every pet's rapport response before its traits: attention is welcome, a serving when not hungry is neutral. */
export const BASE_TREATMENT: Readonly<Record<PetTreatmentKind, number>> = Object.freeze({ pet: 2, carry: 1, play: 3, feed: 1, "feed-early": 0 });
/** Feeding a pet above this hunger counts as `feed-early`, which Light Eaters dislike. */
export const EARLY_FEED_HUNGER = 60;
/** Zoomies wander this much faster than their species. */
export const ZOOMIES_PACE = 1.35;
/** Long-Lived pets live this much longer than their species (as elders: growth stages stay on the species' life). */
export const LONG_LIVED_LIFESPAN = 1.2;

// The pool is shared by every species. Conflicts are declared on one side and
// made mutual below. Order matters: it is the adoption draw order, mirrored by
// the API's `FARM_PET_TRAITS` (a parity test holds the two together).
const DECLARED_TRAITS = [
  trait("held.dislikes", "Independent", "Does not like to be held. Grows best when given space and toys.", { conflicts: ["held.loves"], treatment: { pet: -1, carry: -8, play: 3 } }),
  trait("held.loves", "Cuddly", "Likes to be held often. Grows best with cuddles and carrying.", { treatment: { pet: 4, carry: 6 } }),
  trait("movement.fast", "Zoomies", "Moves unusually fast. Grows best with play, and would rather run than be carried.", { rarity: "uncommon", multipliers: { pace: ZOOMIES_PACE }, treatment: { play: 6, carry: -2 } }),
  trait("appetite.frequent", "Big Appetite", "Gets hungry more often, and loves every meal.", { conflicts: ["appetite.rare", "appetite.picky"], multipliers: { hungerDrain: 1.5 }, treatment: { feed: 4, "feed-early": 3 } }),
  trait("appetite.rare", "Light Eater", "Gets hungry less often, and dislikes being fed when it is not hungry.", { multipliers: { hungerDrain: 0.65 }, treatment: { feed: 1, "feed-early": -5 } }),
  trait("growth.fast", "Fast Grower", "Reaches adult size sooner and grows fastest while young.", { rarity: "uncommon", treatment: { feed: 2 } }),
  trait("temper.gentle", "Gentle", "Almost never snaps, even when it is unhappy, and loves a soft pat.", { rarity: "rare", conflicts: ["temper.grumpy"], snapAt: 5, treatment: { pet: 2 } }),
  trait("temper.grumpy", "Grumpy", "Snaps sooner when unhappy and gets little out of being petted. Would rather have its toys.", { snapAt: 20, multipliers: { handlingHappiness: 0.5 }, treatment: { pet: -2, carry: -3, play: 2 } }),
  trait("social.shy", "Shy", "Slow to trust people: handling earns half the trust, but a home of its own earns twice as much.", { conflicts: ["social.friendly"], multipliers: { handlingAffection: 0.5, dwellingAffection: 2 }, treatment: { pet: -1, carry: -4, play: 1 } }),
  trait("social.friendly", "Social", "Loves attention and company, and gets lonely faster when it is ignored.", { conflicts: ["social.loner"], multipliers: { happinessDrain: 1.25 }, treatment: { pet: 3, play: 2 } }),
  trait("social.loner", "Loner", "Content on its own: its happiness fades slowly, but it is lukewarm about being petted.", { conflicts: ["follows.player"], multipliers: { happinessDrain: 0.75 }, treatment: { pet: -1, carry: -2 } }),
  trait("play.eager", "Playful", "Its toys cheer it up twice as much, and play is its favourite thing.", { conflicts: ["movement.lazy"], multipliers: { toyHappiness: 2 }, treatment: { play: 4 } }),
  trait("home.loves", "Homebody", "Its home cheers it up twice as much, but it pines faster without one.", { conflicts: ["movement.roams"], multipliers: { dwellingHappiness: 2, missingDwellingDrain: 1.3 }, treatment: { pet: 1 } }),
  trait("toys.collector", "Collector", "Every one of its toys on the farm earns twice the trust.", { rarity: "uncommon", multipliers: { toyAffection: 2 }, treatment: { play: 2 } }),
  trait("movement.lazy", "Lazy", "Ambles slowly and naps between strolls. Would rather eat than play.", { conflicts: ["movement.fast", "movement.roams"], multipliers: { pace: 0.75, idle: 2 }, treatment: { play: -2, feed: 2, carry: 1 } }),
  trait("movement.roams", "Wanderer", "Roams far and rests little. Would rather walk than be carried.", { multipliers: { wanderRange: 1.5, idle: 0.6 }, treatment: { carry: -2, play: 2 } }),
  trait("follows.player", "Shadow", "Follows you around the farm, and loves being close to you.", { rarity: "rare", follows: true, treatment: { pet: 2, carry: 2 } }),
  trait("appetite.picky", "Picky Eater", "Unimpressed by meals, and dislikes being fed before it is hungry.", { treatment: { feed: -1, "feed-early": -3 } }),
  trait("body.hardy", "Hardy", "Survives twice as long without food, and loses less trust when it goes hungry.", { rarity: "rare", multipliers: { starvationGrace: 2, hungryAffectionLoss: 0.5 }, treatment: { feed: 1 } }),
  trait("size.large", "Big-Boned", "Grows up near the top of its species' size range.", { rarity: "rare", conflicts: ["size.small"], size: "large", treatment: { feed: 2 } }),
  trait("size.small", "Runt", "Stays near the bottom of its species' size range. Easy to carry, and likes it.", { rarity: "rare", size: "small", treatment: { pet: 1, carry: 1 } }),
  trait("life.long", "Long-Lived", "Lives a fifth longer than its species usually does, keeping its peak into old age.", { rarity: "rare", multipliers: { lifespan: LONG_LIVED_LIFESPAN }, treatment: { pet: 1 } }),
];

export const PET_TRAITS: readonly PetTrait[] = Object.freeze(DECLARED_TRAITS.map(({ declared, ...entry }) => Object.freeze({
  ...entry,
  conflicts: Object.freeze(DECLARED_TRAITS
    .filter((other) => declared.includes(other.id) || other.declared.includes(entry.id))
    .map((other) => other.id)),
})));

export function findPetTrait(id: unknown): PetTrait | undefined {
  return typeof id === "string" ? PET_TRAITS.find((entry) => entry.id === id) : undefined;
}

/** The product of one multiplier across a pet's traits (1 when none of them changes it). */
export function petTraitMultiplier(profile: Readonly<{ traits: readonly string[] }> | null | undefined, key: PetTraitMultiplier): number {
  return (profile?.traits ?? []).reduce((product, id) => product * (findPetTrait(id)?.multipliers[key] ?? 1), 1);
}

export function petHasTrait(profile: Readonly<{ traits: readonly string[] }> | null | undefined, predicate: (trait: PetTrait) => boolean): boolean {
  return (profile?.traits ?? []).some((id) => { const entry = findPetTrait(id); return entry ? predicate(entry) : false; });
}

/** Happiness/trust at or below which this pet snaps at handling. */
export function petSnapThreshold(profile: Readonly<{ traits: readonly string[] }>): number {
  for (const id of profile.traits) {
    const snapAt = findPetTrait(id)?.snapAt;
    if (snapAt !== null && snapAt !== undefined) return snapAt;
  }
  return DEFAULT_SNAP_AT;
}

/** This individual's natural lifespan in farm days: the species' cap, stretched by Long-Lived. */
export function petMaxLifeDays(care: Readonly<{ maxLifeDays: number }>, profile: Readonly<{ traits: readonly string[] }> | null | undefined): number {
  return Math.round(care.maxLifeDays * petTraitMultiplier(profile, "lifespan"));
}

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

const toy = (id: string, title: string): Readonly<{ itemId: string; title: string }> => Object.freeze({ itemId: `decor.prop.${id}`, title });

// Every species has exactly three toys of its own, and a swimmer's toys stand
// in its pond like its home does. A toy belongs to one species: compatibility
// is a care question, so it is answered here and nowhere else.
export const PET_CARE: readonly PetCareDefinition[] = Object.freeze([
  care({ speciesId: "pet.corgi", maxLifeDays: 100, food: { id: "dog-food", title: "Dog Food", price: 15, starter: 20 }, dwelling: { id: "doghouse", title: "Dog House" }, speed: { min: 35, max: 65 }, strength: { min: 25, max: 55 }, toys: [
    toy("tennis-ball", "Tennis Ball"), toy("rope-toy", "Rope Toy"), toy("bone", "Bone"),
  ] }),
  care({ speciesId: "pet.duck", maxLifeDays: 80, food: { id: "waterfowl-feed", title: "Waterfowl Feed", price: 12 }, dwelling: { id: "duck-coop", title: "Duck Coop" }, speed: { min: 28, max: 55 }, strength: { min: 15, max: 35 }, toys: [
    toy("splash-tub", "Splash Tub"), toy("pecking-bell", "Pecking Bell"), toy("rubber-duckling", "Rubber Duckling"),
  ] }),
  care({ speciesId: "pet.red-panda", maxLifeDays: 90, food: { id: "bamboo-bites", title: "Bamboo Bites", price: 24 }, dwelling: { id: "treetop-den", title: "Treetop Den" }, speed: { min: 30, max: 60 }, strength: { min: 20, max: 42 }, toys: [
    toy("bamboo-climber", "Bamboo Climber"), toy("pinecone-puzzle", "Pinecone Puzzle"), toy("leaf-hammock", "Leaf Hammock"),
  ] }),
  care({ speciesId: "pet.platypus", maxLifeDays: 100, food: { id: "river-grubs", title: "River Grubs", price: 20 }, dwelling: { id: "burrow-lodge", title: "Burrow Lodge" }, speed: { min: 22, max: 50 }, strength: { min: 20, max: 45 }, toys: [
    toy("log-tunnel", "Log Tunnel"), toy("pebble-pile", "Pebble Pile"), toy("paddle-pool", "Paddle Pool"),
  ] }),
  care({ speciesId: "pet.hippo", maxLifeDays: 140, food: { id: "river-hay", title: "River Hay", price: 30 }, dwelling: { id: "mud-wallow-shelter", title: "Mud-Wallow Shelter" }, speed: { min: 18, max: 42 }, strength: { min: 65, max: 95 }, toys: [
    toy("beach-ball", "Beach Ball"), toy("scratching-post", "Scratching Post"), toy("watermelon", "Watermelon"),
  ] }),
  care({ speciesId: "pet.rhino", maxLifeDays: 130, food: { id: "browse-bundle", title: "Browse Bundle", price: 35 }, dwelling: { id: "rhino-shade", title: "Rhino Shade" }, speed: { min: 22, max: 48 }, strength: { min: 75, max: 100 }, toys: [
    toy("tractor-tire", "Tractor Tire"), toy("scratch-boulder", "Scratch Boulder"), toy("pushing-log", "Pushing Log"),
  ] }),
  care({ speciesId: "pet.bat", maxLifeDays: 90, food: { id: "fruit-mix", title: "Fruit Mix", price: 18 }, dwelling: { id: "roosting-box", title: "Roosting Box" }, speed: { min: 45, max: 78 }, strength: { min: 10, max: 28 }, toys: [
    toy("fruit-mobile", "Fruit Mobile"), toy("moth-lantern", "Moth Lantern"), toy("swing-perch", "Swing Perch"),
  ] }),
  care({ speciesId: "pet.shark", maxLifeDays: 150, food: { id: "shark-feed", title: "Shark Feed", price: 45 }, dwelling: { id: "reef-grotto", title: "Reef Grotto" }, speed: { min: 48, max: 82 }, strength: { min: 60, max: 90 }, toys: [
    toy("chew-ring", "Chew Ring"), toy("sunken-chest", "Sunken Chest"), toy("kelp-garden", "Kelp Garden"),
  ] }),
  care({ speciesId: "pet.anglerfish", maxLifeDays: 110, food: { id: "deep-sea-feed", title: "Deep-Sea Feed", price: 40 }, dwelling: { id: "darkwater-cave", title: "Darkwater Cave" }, speed: { min: 20, max: 45 }, strength: { min: 18, max: 40 }, toys: [
    toy("glow-stone", "Glow Stone"), toy("old-anchor", "Old Anchor"), toy("bubble-stone", "Bubble Stone"),
  ] }),
  care({ speciesId: "pet.jellyfish", maxLifeDays: 70, food: { id: "plankton-blend", title: "Plankton Blend", price: 28 }, dwelling: { id: "jellyfish-lagoon", title: "Jellyfish Lagoon" }, speed: { min: 12, max: 35 }, strength: { min: 8, max: 25 }, toys: [
    toy("glass-float", "Glass Float"), toy("coral-fan", "Coral Fan"), toy("current-spinner", "Current Spinner"),
  ] }),
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

/** The care row whose home or toy this decor item is, and which of the two; null for ordinary decor. */
export function petCareForItem(itemId: unknown): Readonly<{ care: PetCareDefinition; role: "dwelling" | "toy" }> | null {
  if (typeof itemId !== "string") return null;
  for (const entry of PET_CARE) {
    if (entry.dwelling.itemId === itemId) return Object.freeze({ care: entry, role: "dwelling" as const });
    if (entry.toys.some((candidate) => candidate.itemId === itemId)) return Object.freeze({ care: entry, role: "toy" as const });
  }
  return null;
}

/**
 * How fast this individual moves around the farm relative to its species'
 * walk: a narrow band from Speed (0.9–1.1×, the same curve the pet games use)
 * and its movement traits (Zoomies, Lazy) on top. Movement only; it never touches care maths.
 */
export function petPace(profile: PetProfile | null | undefined): number {
  if (!profile) return 1;
  const fromSpeed = 0.9 + Math.min(100, Math.max(0, profile.stats.speed)) / 500;
  return round(fromSpeed * petTraitMultiplier(profile, "pace"), 3);
}

export type PetTemperament = Readonly<{ pace: number; idle: number; wanderRange: number; follows: boolean }>;

/** Everything the farm sim reads off a pet's traits: its walk, its rests, its stroll length, and whether it shadows the player. */
export function petTemperament(profile: PetProfile | null | undefined): PetTemperament {
  return Object.freeze({
    pace: petPace(profile),
    idle: petTraitMultiplier(profile, "idle"),
    wanderRange: petTraitMultiplier(profile, "wanderRange"),
    follows: petHasTrait(profile, (entry) => entry.follows),
  });
}

const unit = (value: number): number => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const randomIn = (range: Range, random: () => number): number => range.min + (range.max - range.min) * unit(random());
const round = (value: number, places = 2): number => Number(value.toFixed(places));
const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Share of the adult size range a Big-Boned or Runt pet is squeezed into, at its top or bottom. */
export const SIZE_TRAIT_BAND = 0.3;

/** Big-Boned and Runt remap the rolled adult size into the top or bottom band of the range; no extra draw. */
export function biasAdultSize(rolled: number, size: Readonly<{ adultMin: number; max: number }>, traits: readonly string[]): number {
  const bias = traits.map((id) => findPetTrait(id)?.size).find((value) => value);
  const span = size.max - size.adultMin;
  const within = span > 0 ? (rolled - size.adultMin) / span : 0;
  if (bias === "large") return size.max - span * SIZE_TRAIT_BAND * (1 - within);
  if (bias === "small") return size.adultMin + span * SIZE_TRAIT_BAND * within;
  return rolled;
}

function chooseTraits(care: PetCareDefinition, random: () => number): string[] {
  const target = care.traitCount.min + Math.floor(unit(random()) * (care.traitCount.max - care.traitCount.min + 1));
  // A weighted shuffle, one draw per trait: key = u^(1/weight), highest first,
  // so a common trait comes out ahead of a rare one six times as often.
  const pool = care.traitIds
    .map((id) => ({ id, key: Math.pow(unit(random()), 1 / PET_TRAIT_RARITY_WEIGHTS[findPetTrait(id)?.rarity ?? "common"]) }))
    .sort((a, b) => b.key - a.key);
  const selected: string[] = [];
  for (const candidate of pool) {
    const definition = findPetTrait(candidate.id);
    if (!definition || selected.some((id) => definition.conflicts.includes(id))) continue;
    selected.push(candidate.id);
    if (selected.length >= Math.min(5, target)) break;
  }
  return selected;
}

export function createPetProfile(speciesId: string, random: () => number): PetProfile | null {
  const care = findPetCare(speciesId);
  if (!care) return null;
  const rolledMax = randomIn({ min: care.size.adultMin, max: care.size.max }, random);
  const currentSize = round(randomIn({ min: care.size.min, max: Math.min(care.size.adultMin, round(rolledMax)) }, random));
  const gender = unit(random()) < 0.5 ? "female" : "male";
  const baseSpeed = randomIn(care.stats.speed, random);
  const baseStrength = randomIn(care.stats.strength, random);
  const traits = chooseTraits(care, random);
  const maxSize = round(biasAdultSize(rolledMax, care.size, traits));
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
    const definition = findPetTrait(id);
    if (!definition || selected.includes(id) || selected.some((other) => definition.conflicts.includes(other)) || selected.length >= 5) continue;
    selected.push(id);
  }
  const ageDays = round(clamp(source.ageDays, 0, petMaxLifeDays(care, { traits: selected }), 0), 4);
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
