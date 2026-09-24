// Pure Phase-3 pet wellbeing and handling rules. The layout owns which care
// objects are placed; this module translates that environment into persisted
// needs and explicit interaction outcomes. Rendering and key handling stay in
// the farm composition root.

import { FARM_DAY_MINUTES } from "./farm-crops.mjs";
import { findPetCare, type PetProfile } from "./farm-pet-care.mjs";
import { withFarmPets, type FarmDecorRow, type FarmLayout, type FarmPet } from "./farm-layout.mjs";

export const HAPPINESS_DRAIN_PER_DAY = 8;
export const DWELLING_HAPPINESS_PER_DAY = 5;
export const TOY_HAPPINESS_PER_DAY = 2;
export const DWELLING_AFFECTION_PER_DAY = 1;
export const TOY_AFFECTION_PER_DAY = 0.5;
export const FIRST_DWELLING_AFFECTION = 10;

export type PetCareEnvironment = Readonly<{ hasDwelling: boolean; toyCount: number; toyTitles: readonly string[] }>;
export type PetInteractionKind = "pet" | "carry" | "play";
export type PetInteractionResult = Readonly<{
  ok: boolean;
  reason: "" | "no_profile" | "no_toy" | "refused";
  reaction: "accept" | "refuse" | "bite";
  message: string;
  profile: PetProfile;
  carrySeconds: number | null;
}>;

const rounded = (value: number): number => Number(value.toFixed(4));
const bounded = (value: number): number => rounded(Math.min(100, Math.max(0, value)));

export function petCareEnvironment(speciesId: string, decor: readonly FarmDecorRow[]): PetCareEnvironment {
  const care = findPetCare(speciesId);
  if (!care) return Object.freeze({ hasDwelling: false, toyCount: 0, toyTitles: Object.freeze([]) });
  const placed = new Set(decor.map((row) => row.itemId));
  const toys = care.toys.filter((toy) => placed.has(toy.itemId));
  return Object.freeze({
    hasDwelling: placed.has(care.dwelling.itemId),
    toyCount: toys.length,
    toyTitles: Object.freeze(toys.map((toy) => toy.title)),
  });
}

/** Daily wellbeing from the currently placed species-appropriate care objects. */
export function advancePetWellbeing(profile: PetProfile, speciesId: string, decor: readonly FarmDecorRow[], elapsedFarmMinutes: number): PetProfile {
  const elapsed = Number.isFinite(elapsedFarmMinutes) ? Math.max(0, elapsedFarmMinutes) : 0;
  if (elapsed <= 0 || !findPetCare(speciesId)) return profile;
  const days = elapsed / FARM_DAY_MINUTES;
  const environment = petCareEnvironment(speciesId, decor);
  const happinessRate = -HAPPINESS_DRAIN_PER_DAY
    + (environment.hasDwelling ? DWELLING_HAPPINESS_PER_DAY : 0)
    + environment.toyCount * TOY_HAPPINESS_PER_DAY;
  const affectionRate = (environment.hasDwelling ? DWELLING_AFFECTION_PER_DAY : 0)
    + environment.toyCount * TOY_AFFECTION_PER_DAY;
  return Object.freeze({
    ...profile,
    happiness: bounded(profile.happiness + happinessRate * days),
    affection: bounded(profile.affection + affectionRate * days),
  });
}

/** Award each pet's first valid dwelling once; the marker survives removal/replacement and reload. */
export function applyPetCareMilestones(layout: FarmLayout): FarmLayout {
  let changed = false;
  const pets = layout.pets.map((pet): FarmPet => {
    const care = findPetCare(pet.speciesId);
    if (!pet.profile || !care || !layout.decor.some((row) => row.itemId === care.dwelling.itemId)) return pet;
    const milestone = `dwelling:${care.dwelling.itemId}`;
    if (pet.profile.milestones.includes(milestone)) return pet;
    changed = true;
    return {
      ...pet,
      profile: Object.freeze({
        ...pet.profile,
        affection: bounded(pet.profile.affection + FIRST_DWELLING_AFFECTION),
        milestones: Object.freeze([...pet.profile.milestones, milestone]),
      }),
    };
  });
  return changed ? withFarmPets(layout, pets) : layout;
}

function result(profile: PetProfile, ok: boolean, reason: PetInteractionResult["reason"], reaction: PetInteractionResult["reaction"], message: string, carrySeconds: number | null = null): PetInteractionResult {
  return Object.freeze({ ok, reason, reaction, message, profile, carrySeconds });
}

/** Trait-aware handling and play. Refusals are returned as readable outcomes before the caller animates anything. */
export function reactToPetInteraction(profile: PetProfile, speciesId: string, kind: PetInteractionKind, decor: readonly FarmDecorRow[]): PetInteractionResult {
  const care = findPetCare(speciesId);
  if (!care) return result(profile, false, "no_profile", "refuse", "This pet cannot be handled right now.");
  const cuddly = profile.traits.includes("held.loves");
  const independent = profile.traits.includes("held.dislikes");

  if (kind === "play") {
    const environment = petCareEnvironment(speciesId, decor);
    const toy = environment.toyTitles[0];
    if (!toy) return result(profile, false, "no_toy", "refuse", "Place a compatible toy before asking this pet to play.");
    return result(Object.freeze({ ...profile, happiness: bounded(profile.happiness + 12), affection: bounded(profile.affection + 3) }), true, "", "accept", `Played with the ${toy}.`);
  }

  if (profile.happiness <= 10 || profile.affection <= 10) {
    return result(profile, false, "refused", "bite", "Warning: this pet is distressed and snaps. Give it space, food, a dwelling, and toys.");
  }
  if (independent && profile.affection < (kind === "carry" ? 70 : 60)) {
    return result(profile, false, "refused", "refuse", "This Independent pet backs away. Give it space and earn more trust first.");
  }
  if (kind === "carry") {
    const seconds = independent ? 8 : profile.happiness < 35 ? 12 : null;
    const message = seconds ? `Picked up carefully · it may wriggle free in ${seconds} seconds.` : "Picked up gently.";
    return result(profile, true, "", "accept", message, seconds);
  }
  const affection = cuddly ? 4 : independent ? 1 : 2;
  const happiness = cuddly ? 4 : 2;
  return result(Object.freeze({ ...profile, affection: bounded(profile.affection + affection), happiness: bounded(profile.happiness + happiness) }), true, "", "accept", cuddly ? "Loved the extra cuddle." : "Enjoyed being petted.");
}
