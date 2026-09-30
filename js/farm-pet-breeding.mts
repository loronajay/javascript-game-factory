// Pet breeding: who may be paired, and what the young one inherits.
//
// Pure — no THREE, no DOM, no clock of its own — and the same rule, line for
// line, as `platform-api/src/services/farm-pet-breeding-policy.mts` (a test
// rolls both with one seeded sequence and holds them equal). The SERVER checks
// the pair, takes the fee and mints the young one; this copy lets the Pets
// panel say who can be paired, why not, and what the odds are, before it asks.
//
// WHO: a female and a male of one species, both past Youth, fed (hunger above
// BREED_MIN_HUNGER) and content (happiness at least BREED_MIN_HAPPINESS),
// neither bred in the last BREED_REST_DAYS farm days, on a farm with room for
// one more. The horse is Hollis's and lives in a stall; it does not breed here.
//
// WHAT THE YOUNG ONE GETS — every rarity leans toward being passed on, and
// anything BOTH parents carry leans harder:
//
//   · TRAITS — one of the mother's and one of the father's are GUARANTEED (a
//     rare or shared trait is likelier to be the one passed). Each of their
//     other traits may come along too (EXTRA_TRAIT_CHANCE, doubled if both
//     carry it). THEN it rolls its own 1–3, exactly as an adopted pet does, on
//     top — which is why a bred pet has more traits than an adopted one. Five at
//     most, and never two that conflict.
//   · PALETTE — hers (PALETTE_PASS by her palette's tier) or his, else a fresh
//     roll at the species' odds; when both parents wear a rare or super-rare
//     palette each chance is raised by RARE_PAIR_BONUS.
//   · STATS — each base leans HERITABILITY of the way from a fresh roll to the
//     parents' average; when both parents sit in the top STRONG_LINE_SHARE of
//     the species' range it gains STRONG_LINE_BONUS of the range on top.
//   · POTENTIAL — a fresh roll at the young one's palette tier, or a parent's
//     grade (GRADE_PASS; RARE_PAIR_BONUS when both are Exceptional or better),
//     whichever is better.
//
// Size, gender and every care meter start fresh: it is a newborn.

import { findAnimal, findAnimalPalette, pickAnimalPalette, type AnimalPalette } from "./farm-catalog/animals.mjs";
import {
  PET_TRAITS,
  PET_TRAIT_RARITY_WEIGHTS,
  biasAdultSize,
  findPetCare,
  findPetTrait,
  type PetCareDefinition,
  type PetProfile,
  type PetTraitRarity,
} from "./farm-pet-care.mjs";
import {
  GROWTH_GRADE_WEIGHTS,
  PET_GROWTH_GRADES,
  RAPPORT_NEUTRAL,
  RATE_JITTER,
  baseGrowthRate,
  findGrowthGrade,
  growthStage,
  statsFromGrowth,
  type PetGrowth,
  type PetGrowthGradeId,
  type PetPaletteTier,
  type PetStatId,
} from "./farm-pet-growth.mjs";
import { HORSE_SPECIES_ID } from "./farm-horse-riding.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";

export const BREEDING_PRICE = 600;
export const BREED_REST_DAYS = 5;
export const BREED_REST_MINUTES = BREED_REST_DAYS * DAY_MINUTES;
export const BREED_MIN_HUNGER = 40;
export const BREED_MIN_HAPPINESS = 50;
export const MAX_PET_TRAITS = 5;

/** How strongly a trait is favoured as the one a parent is guaranteed to pass. */
export const PASS_WEIGHT: Readonly<Record<PetTraitRarity, number>> = Object.freeze({ common: 1, uncommon: 1.5, rare: 2 });
/** A trait both parents carry: its pass weight and its extra chance are multiplied by this. */
export const SHARED_TRAIT_FACTOR = 2;
/** Chance each of a parent's OTHER traits also comes along. */
export const EXTRA_TRAIT_CHANCE: Readonly<Record<PetTraitRarity, number>> = Object.freeze({ common: 0.15, uncommon: 0.2, rare: 0.25 });
/** Chance the young one wears a parent's palette, by that palette's tier. */
export const PALETTE_PASS: Readonly<Record<PetPaletteTier, number>> = Object.freeze({ classic: 0.1, uncommon: 0.15, rare: 0.22, "super-rare": 0.28 });
/** Chance the young one takes a parent's potential grade (kept only if better than its own roll). */
export const GRADE_PASS: Readonly<Record<PetGrowthGradeId, number>> = Object.freeze({ steady: 0, gifted: 0.2, exceptional: 0.25, prodigy: 0.3 });
/** Both parents rare (palette: rare or super-rare; potential: Exceptional or better): each pass chance is raised by this. */
export const RARE_PAIR_BONUS = 1.35;
export const HERITABILITY = 0.6;
/** Both parents' base in the top this-share of the species range makes a strong line… */
export const STRONG_LINE_SHARE = 0.25;
/** …which adds this share of the range to the young one's base. */
export const STRONG_LINE_BONUS = 0.1;

export type PetLineage = Readonly<{
  mother: Readonly<{ id: string; name: string }>;
  father: Readonly<{ id: string; name: string }>;
  /** An adopted pet is generation 1; a young one is one more than its elder parent. */
  generation: number;
}>;

export type BreedingParent = Readonly<{
  instanceId: string;
  speciesId: string;
  name: string;
  profile: PetProfile | null;
  /** Farm minute this pet last bred; absent if never. */
  bredAt?: number;
  lineage?: PetLineage;
}>;

export type BreedingRefusal =
  | "same_pet" | "not_female" | "not_male" | "other_species" | "not_breedable"
  | "no_profile" | "not_grown" | "hungry" | "unhappy" | "resting" | "farm_full";

export const BREEDING_REFUSAL_WORDS: Readonly<Record<BreedingRefusal, string>> = Object.freeze({
  same_pet: "Pick two different pets.",
  not_female: "The first pet must be a female.",
  not_male: "She needs a male to be paired with.",
  other_species: "They are not the same kind of animal.",
  not_breedable: "Horses are bred by Hollis, not on the farm.",
  no_profile: "That pet's profile could not be loaded.",
  not_grown: "Both must be past Youth.",
  hungry: "Both must be fed.",
  unhappy: `Both must be at least ${BREED_MIN_HAPPINESS}% happy.`,
  resting: `Each pet rests ${BREED_REST_DAYS} farm days after breeding.`,
  farm_full: "The farm is full. Release a pet to make room for a young one.",
});

const unit = (value: number): number => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const round = (value: number, places = 2): number => Number(value.toFixed(places));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Farm minutes this pet still rests before it may breed again (0 = ready). */
export function breedingRestMinutes(pet: Readonly<{ bredAt?: number }>, farmMinutes: number): number {
  if (typeof pet.bredAt !== "number" || !Number.isFinite(pet.bredAt)) return 0;
  return Math.max(0, pet.bredAt + BREED_REST_MINUTES - farmMinutes);
}

function parentRefusal(pet: BreedingParent, farmMinutes: number): BreedingRefusal | null {
  const care = findPetCare(pet.speciesId);
  if (!pet.profile || !care) return "no_profile";
  if (growthStage(pet.profile.ageDays, care.maxLifeDays).id === "youth") return "not_grown";
  if (pet.profile.hunger <= BREED_MIN_HUNGER) return "hungry";
  if (pet.profile.happiness < BREED_MIN_HAPPINESS) return "unhappy";
  if (breedingRestMinutes(pet, farmMinutes) > 0) return "resting";
  return null;
}

/** Why this pair may not breed now, or null. `petCount`/`maxPets` are the farm's residents and cap. */
export function breedingRefusal(mother: BreedingParent, father: BreedingParent, farmMinutes: number, petCount: number, maxPets: number): BreedingRefusal | null {
  if (mother.instanceId === father.instanceId) return "same_pet";
  if (mother.speciesId !== father.speciesId) return "other_species";
  if (mother.speciesId === HORSE_SPECIES_ID) return "not_breedable";
  if (mother.profile?.gender !== "female") return mother.profile ? "not_female" : "no_profile";
  if (father.profile?.gender !== "male") return father.profile ? "not_male" : "no_profile";
  const refusal = parentRefusal(mother, farmMinutes) ?? parentRefusal(father, farmMinutes);
  if (refusal) return refusal;
  return petCount >= maxPets ? "farm_full" : null;
}

function paletteTierOf(speciesId: string, profile: PetProfile): PetPaletteTier {
  return findAnimalPalette(speciesId, profile.paletteId)?.tier ?? "classic";
}

const RARE_TIERS: readonly PetPaletteTier[] = ["rare", "super-rare"];
const RARE_GRADES: readonly PetGrowthGradeId[] = ["exceptional", "prodigy"];

/** Each parent's chance to pass its palette. */
export function palettePassChances(speciesId: string, mother: PetProfile, father: PetProfile): Readonly<{ mother: number; father: number }> {
  const motherTier = paletteTierOf(speciesId, mother);
  const fatherTier = paletteTierOf(speciesId, father);
  const bonus = RARE_TIERS.includes(motherTier) && RARE_TIERS.includes(fatherTier) ? RARE_PAIR_BONUS : 1;
  return Object.freeze({ mother: PALETTE_PASS[motherTier] * bonus, father: PALETTE_PASS[fatherTier] * bonus });
}

/** Each parent's chance to pass its potential grade. */
export function gradePassChances(mother: PetProfile, father: PetProfile): Readonly<{ mother: number; father: number }> {
  const motherGrade = findGrowthGrade(mother.growth.grade).id;
  const fatherGrade = findGrowthGrade(father.growth.grade).id;
  const bonus = RARE_GRADES.includes(motherGrade) && RARE_GRADES.includes(fatherGrade) ? RARE_PAIR_BONUS : 1;
  return Object.freeze({ mother: GRADE_PASS[motherGrade] * bonus, father: GRADE_PASS[fatherGrade] * bonus });
}

function rarityOf(id: string): PetTraitRarity {
  return findPetTrait(id)?.rarity ?? "common";
}

function passWeight(id: string, other: readonly string[]): number {
  return PASS_WEIGHT[rarityOf(id)] * (other.includes(id) ? SHARED_TRAIT_FACTOR : 1);
}

/** Traits a parent may pass given what the young one already has: not held, not in conflict. */
function passable(traits: readonly string[], held: readonly string[]): string[] {
  return traits.filter((id) => !held.includes(id) && !held.some((other) => findPetTrait(id)?.conflicts.includes(other)));
}

function weightedPick(ids: readonly string[], weights: readonly number[], draw: number): string | null {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!ids.length || !(total > 0)) return null;
  let roll = unit(draw) * total;
  for (let index = 0; index < ids.length; index += 1) {
    roll -= weights[index]!;
    if (roll < 0) return ids[index]!;
  }
  return ids[ids.length - 1]!;
}

/** The chance each of a parent's traits is the one it is guaranteed to pass (the mother's first; the father's given hers could be any). */
export function traitPassChances(own: readonly string[], other: readonly string[]): ReadonlyArray<Readonly<{ id: string; chance: number }>> {
  const weights = own.map((id) => passWeight(id, other));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return Object.freeze(own.map((id, index) => Object.freeze({ id, chance: total > 0 ? weights[index]! / total : 0 })));
}

/** Chance one of a parent's non-guaranteed traits also comes along. */
export function extraTraitChance(id: string, mother: readonly string[], father: readonly string[]): number {
  return EXTRA_TRAIT_CHANCE[rarityOf(id)] * (mother.includes(id) && father.includes(id) ? SHARED_TRAIT_FACTOR : 1);
}

export type InheritedTraits = Readonly<{ fromMother: string | null; fromFather: string | null; extra: readonly string[] }>;

/** Guaranteed passes, extras, then the young one's own 1–3 (the adoption draw). */
function inheritTraits(care: PetCareDefinition, mother: readonly string[], father: readonly string[], random: () => number): { traits: string[]; inherited: InheritedTraits } {
  const traits: string[] = [];
  const motherPool = passable(mother, traits);
  const fromMother = weightedPick(motherPool, motherPool.map((id) => passWeight(id, father)), random());
  if (fromMother) traits.push(fromMother);
  const fatherPool = passable(father, traits);
  const fromFather = weightedPick(fatherPool, fatherPool.map((id) => passWeight(id, mother)), random());
  if (fromFather) traits.push(fromFather);

  // Every other trait either parent carries, in pool order, one draw each whether or not it can land.
  const extra: string[] = [];
  for (const entry of PET_TRAITS) {
    if (traits.includes(entry.id) || (!mother.includes(entry.id) && !father.includes(entry.id))) continue;
    const draw = unit(random());
    if (traits.length >= MAX_PET_TRAITS || !passable([entry.id], traits).length) continue;
    if (draw < extraTraitChance(entry.id, mother, father)) {
      traits.push(entry.id);
      extra.push(entry.id);
    }
  }

  // Its own: the same 1–3 an adopted pet rolls, drawn by the same weighted shuffle, on top.
  const own = care.traitCount.min + Math.floor(unit(random()) * (care.traitCount.max - care.traitCount.min + 1));
  const pool = care.traitIds
    .map((id) => ({ id, key: Math.pow(unit(random()), 1 / PET_TRAIT_RARITY_WEIGHTS[rarityOf(id)]) }))
    .sort((a, b) => b.key - a.key);
  let added = 0;
  for (const candidate of pool) {
    if (added >= own || traits.length >= MAX_PET_TRAITS) break;
    if (!passable([candidate.id], traits).length) continue;
    traits.push(candidate.id);
    added += 1;
  }
  return { traits, inherited: Object.freeze({ fromMother, fromFather, extra: Object.freeze(extra) }) };
}

function choosePalette(speciesId: string, mother: PetProfile, father: PetProfile, random: () => number): AnimalPalette | undefined {
  const chances = palettePassChances(speciesId, mother, father);
  const draw = unit(random());
  const fresh = pickAnimalPalette(speciesId, random);
  if (draw < chances.mother) return findAnimalPalette(speciesId, mother.paletteId) ?? fresh;
  if (draw < chances.mother + chances.father) return findAnimalPalette(speciesId, father.paletteId) ?? fresh;
  return fresh;
}

/** A parent's rolled base for one stat; a pet from before progression is read back from its stats. */
function parentBase(care: PetCareDefinition, profile: PetProfile, id: PetStatId): number {
  const range = care.stats[id];
  const base = profile.growth?.base?.[id] ?? profile.stats[id] / (1 + profile.paletteBonus);
  return clamp(base, range.min, range.max);
}

/** Every chance the Pets panel shows before a pairing, in one place. */
export type BreedingOdds = Readonly<{
  palettes: ReadonlyArray<Readonly<{ paletteId: string; chance: number }>>;
  motherTraits: ReturnType<typeof traitPassChances>;
  fatherTraits: ReturnType<typeof traitPassChances>;
  grade: Readonly<{ mother: number; father: number }>;
}>;

export function breedingOdds(speciesId: string, mother: PetProfile, father: PetProfile): BreedingOdds {
  const pass = palettePassChances(speciesId, mother, father);
  const rest = Math.max(0, 1 - pass.mother - pass.father);
  const all = findAnimal(speciesId)?.palettes ?? [];
  const total = all.reduce((sum, palette) => sum + palette.weight, 0) || 1;
  const palettes = all.map((palette) => Object.freeze({
    paletteId: palette.id,
    chance: (palette.id === mother.paletteId ? pass.mother : 0) + (palette.id === father.paletteId ? pass.father : 0) + rest * palette.weight / total,
  })).filter((row) => row.chance > 0);
  return Object.freeze({
    palettes: Object.freeze(palettes),
    motherTraits: traitPassChances(mother.traits, father.traits),
    fatherTraits: traitPassChances(father.traits, mother.traits),
    grade: gradePassChances(mother, father),
  });
}

export type BredPet = Readonly<{ profile: PetProfile; inherited: InheritedTraits }>;

/**
 * Roll the young one. The draw order is the contract with the server:
 * gender, adult size, palette pass, palette fresh roll, the mother's pass, the
 * father's pass, one draw per extra candidate, its own trait count, one draw
 * per pool trait, speed and strength fresh rolls, potential fresh roll,
 * potential pass, speed and strength rate jitters.
 */
export function breedPetProfile(speciesId: string, mother: PetProfile, father: PetProfile, random: () => number): BredPet | null {
  const care = findPetCare(speciesId);
  if (!care) return null;
  const gender = unit(random()) < 0.5 ? "female" : "male";
  const rolledMax = care.size.adultMin + (care.size.max - care.size.adultMin) * unit(random());
  const palette = choosePalette(speciesId, mother, father, random);
  const paletteBonus = palette?.statBoost ?? 0;
  const { traits, inherited } = inheritTraits(care, mother.traits, father.traits, random);

  const base = {} as Record<PetStatId, number>;
  for (const id of ["speed", "strength"] as const) {
    const range = care.stats[id];
    const span = range.max - range.min;
    const fresh = range.min + span * unit(random());
    const motherBase = parentBase(care, mother, id);
    const fatherBase = parentBase(care, father, id);
    const average = (motherBase + fatherBase) / 2;
    const strong = Math.min(motherBase, fatherBase) >= range.max - span * STRONG_LINE_SHARE;
    base[id] = round(clamp(fresh + (average - fresh) * HERITABILITY + (strong ? span * STRONG_LINE_BONUS : 0), range.min, range.max), 5);
  }

  const growth = inheritGrowth(care, base, palette?.tier ?? "classic", mother, father, random);
  const maxSize = round(biasAdultSize(rolledMax, care.size, traits));
  const currentSize = round(care.size.min);
  return Object.freeze({
    inherited,
    profile: Object.freeze({
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
    }),
  });
}

function inheritGrowth(care: PetCareDefinition, base: Readonly<Record<PetStatId, number>>, tier: PetPaletteTier, mother: PetProfile, father: PetProfile, random: () => number): PetGrowth {
  const weights = GROWTH_GRADE_WEIGHTS[tier] ?? GROWTH_GRADE_WEIGHTS.classic;
  let roll = unit(random()) * weights.reduce((sum, weight) => sum + weight, 0);
  let rolled = 0;
  for (let index = 0; index < PET_GROWTH_GRADES.length; index += 1) {
    roll -= weights[index] ?? 0;
    if (roll < 0) { rolled = index; break; }
  }
  const pass = gradePassChances(mother, father);
  const draw = unit(random());
  const inheritedId = draw < pass.mother ? mother.growth.grade : draw < pass.mother + pass.father ? father.growth.grade : null;
  const inheritedIndex = inheritedId ? PET_GROWTH_GRADES.findIndex((grade) => grade.id === inheritedId) : -1;
  const grade = PET_GROWTH_GRADES[Math.max(rolled, inheritedIndex)]!;
  const rate = (id: PetStatId) => {
    const jitter = RATE_JITTER.min + (RATE_JITTER.max - RATE_JITTER.min) * unit(random());
    return round(baseGrowthRate(care.stats[id], care.maxLifeDays) * grade.multiplier * jitter, 5);
  };
  return Object.freeze({
    grade: grade.id,
    base: Object.freeze({ speed: base.speed, strength: base.strength }),
    rates: Object.freeze({ speed: rate("speed"), strength: rate("strength") }),
    gained: Object.freeze({ speed: 0, strength: 0 }),
    rapport: RAPPORT_NEUTRAL,
    treatDay: 0,
    treats: Object.freeze({ pet: 0, carry: 0, play: 0, feed: 0 }),
  });
}

/** A young one's lineage: its parents by id and name, one generation past the elder of them. */
export function lineageFor(mother: BreedingParent, father: BreedingParent): PetLineage {
  return Object.freeze({
    mother: Object.freeze({ id: mother.instanceId, name: mother.name }),
    father: Object.freeze({ id: father.instanceId, name: father.name }),
    generation: Math.max(mother.lineage?.generation ?? 1, father.lineage?.generation ?? 1) + 1,
  });
}

/** Stored-shape bounds for a lineage block (the layout normalizer's; the server keeps its own). */
export function normalizePetLineage(value: unknown): PetLineage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, any>;
  const parent = (raw: any) => raw && typeof raw === "object" && typeof raw.id === "string" && /^[a-z0-9-]{1,40}$/.test(raw.id)
    ? Object.freeze({ id: raw.id as string, name: typeof raw.name === "string" ? raw.name.slice(0, 20) : "" })
    : null;
  const mother = parent(source.mother);
  const father = parent(source.father);
  const generation = typeof source.generation === "number" && Number.isFinite(source.generation) ? Math.floor(clamp(source.generation, 2, 999)) : 2;
  return mother && father ? Object.freeze({ mother, father, generation }) : undefined;
}
