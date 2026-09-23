// Pure persisted pet-needs rules. Time is always expressed in the farm clock's
// minutes: play, naps and time away all enter through the same elapsed value.
// This module owns no timer, DOM, storage or rendering state.

import { FARM_DAY_MINUTES, type FarmInventory } from "./farm-crops.mjs";
import { PET_TRAITS, findPetCare, type PetProfile } from "./farm-pet-care.mjs";
import { withFarmAgriculture, withFarmClock, withFarmPets, type FarmLayout, type FarmPet } from "./farm-layout.mjs";

export const HUNGRY_THRESHOLD = 40;
export const STARVATION_GRACE_MINUTES = FARM_DAY_MINUTES;
export const HUNGRY_AFFECTION_LOSS_PER_DAY = 2;
export const STARVING_AFFECTION_LOSS_PER_DAY = 6;

export type PetNeedLevel = "full" | "content" | "hungry" | "starving";
export type PetNeedStatus = Readonly<{
  level: PetNeedLevel;
  label: string;
  starvationDue: boolean;
}>;
export type FeedPetResult = Readonly<{ ok: boolean; reason: "" | "unknown_pet" | "no_profile" | "no_food" | "full"; layout: FarmLayout; foodTitle: string }>;

const roundedNeed = (value: number): number => Number(value.toFixed(4));

function appetiteMultiplier(profile: PetProfile): number {
  return profile.traits.reduce((product, id) => {
    const modifier = PET_TRAITS.find((trait) => trait.id === id)?.hungerDrainMultiplier ?? 1;
    return product * modifier;
  }, 1);
}

/** A concise public state; affection remains deliberately absent. */
export function petNeedStatus(profile: PetProfile): PetNeedStatus {
  const level: PetNeedLevel = profile.hunger <= 0
    ? "starving"
    : profile.hunger <= HUNGRY_THRESHOLD
      ? "hungry"
      : profile.hunger >= 100
        ? "full"
        : "content";
  return Object.freeze({
    level,
    label: level === "full" ? "Full" : level === "content" ? "Content" : level === "hungry" ? "Hungry" : "Starving",
    starvationDue: profile.starvingMinutes >= STARVATION_GRACE_MINUTES,
  });
}

/** Advance one profile by elapsed farm minutes, including partial threshold crossings. */
export function advancePetProfile(profile: PetProfile, speciesId: string, elapsedFarmMinutes: number): PetProfile {
  const care = findPetCare(speciesId);
  const elapsed = Number.isFinite(elapsedFarmMinutes) ? Math.max(0, elapsedFarmMinutes) : 0;
  if (!care || elapsed <= 0) return profile;

  const drainPerMinute = care.needs.hungerPerDay * appetiteMultiplier(profile) / FARM_DAY_MINUTES;
  const minutesToHungry = profile.hunger > HUNGRY_THRESHOLD ? (profile.hunger - HUNGRY_THRESHOLD) / drainPerMinute : 0;
  const minutesToEmpty = profile.hunger > 0 ? profile.hunger / drainPerMinute : 0;
  const hungryMinutes = Math.max(0, Math.min(elapsed, minutesToEmpty) - Math.min(elapsed, minutesToHungry));
  const starvingMinutesAdded = Math.max(0, elapsed - minutesToEmpty);
  const hunger = roundedNeed(Math.max(0, profile.hunger - drainPerMinute * elapsed));
  const starvingMinutes = hunger <= 0
    ? Math.floor(profile.starvingMinutes + starvingMinutesAdded)
    : 0;
  const affectionLoss = (hungryMinutes / FARM_DAY_MINUTES) * HUNGRY_AFFECTION_LOSS_PER_DAY
    + (starvingMinutesAdded / FARM_DAY_MINUTES) * STARVING_AFFECTION_LOSS_PER_DAY;
  return Object.freeze({
    ...profile,
    hunger,
    starvingMinutes,
    affection: roundedNeed(Math.max(0, profile.affection - affectionLoss)),
  });
}

/** Checkpoint every pet from layout.clock.farmMinutes to targetFarmMinute. Rollback is a no-op. */
export function advancePetNeeds(layout: FarmLayout, targetFarmMinute: number): FarmLayout {
  const target = Number.isFinite(targetFarmMinute) ? targetFarmMinute : layout.clock.farmMinutes;
  const elapsed = Math.max(0, target - layout.clock.farmMinutes);
  if (elapsed <= 0) return layout;
  const pets = layout.pets.map((pet): FarmPet => pet.profile
    ? { ...pet, profile: advancePetProfile(pet.profile, pet.speciesId, elapsed) }
    : pet);
  return withFarmClock(withFarmPets(layout, pets), target, layout.clock.updatedAt);
}

function withSupplies(layout: FarmLayout, supplies: Readonly<Record<string, number>>): FarmLayout {
  const inventory: FarmInventory = Object.freeze({ ...layout.agriculture.inventory, supplies: Object.freeze({ ...supplies }) });
  return withFarmAgriculture(layout, Object.freeze({ ...layout.agriculture, inventory }));
}

/** One atomic care action: elapsed decay first, then one correct species serving when useful and owned. */
export function feedPet(layout: FarmLayout, instanceId: string, targetFarmMinute: number): FeedPetResult {
  const original = layout.pets.find((pet) => pet.instanceId === instanceId);
  if (!original) return Object.freeze({ ok: false, reason: "unknown_pet", layout, foodTitle: "" });
  let checkpoint = advancePetNeeds(layout, targetFarmMinute);
  const pet = checkpoint.pets.find((row) => row.instanceId === instanceId)!;
  const care = findPetCare(pet.speciesId);
  if (!pet.profile || !care) return Object.freeze({ ok: false, reason: "no_profile", layout: checkpoint, foodTitle: care?.food.title ?? "food" });
  if (pet.profile.hunger >= 100) return Object.freeze({ ok: false, reason: "full", layout: checkpoint, foodTitle: care.food.title });
  const count = checkpoint.agriculture.inventory.supplies[care.food.itemId] ?? 0;
  if (count <= 0) return Object.freeze({ ok: false, reason: "no_food", layout: checkpoint, foodTitle: care.food.title });

  const profile: PetProfile = Object.freeze({
    ...pet.profile,
    hunger: roundedNeed(Math.min(100, pet.profile.hunger + care.needs.hungerPerServing)),
    starvingMinutes: 0,
  });
  checkpoint = withFarmPets(checkpoint, checkpoint.pets.map((row) => row.instanceId === instanceId ? { ...row, profile } : row));
  checkpoint = withSupplies(checkpoint, { ...checkpoint.agriculture.inventory.supplies, [care.food.itemId]: count - 1 });
  return Object.freeze({ ok: true, reason: "", layout: checkpoint, foodTitle: care.food.title });
}
