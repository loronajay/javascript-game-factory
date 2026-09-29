// A horse's piloted numbers as the SERVER computes them
// (planning-docs/FARM_RIDING_PLAN.md): from the horse stored in the farm
// document and the rider's stored Riding XP, through the mirrored riding set
// (`../riding-sim`, copied byte for byte from js/ by tools/mirror-riding-sim.mjs).
// This is what a course run is ridden again on, and what a race is run on —
// never a stat the page sent.

import { horseStats } from "../riding-sim/farm-horse-riding.mjs";
import { growthStage } from "../riding-sim/farm-pet-growth.mjs";
import { rideProfile, rideTraitsFor } from "../riding-sim/farm-ride-profile.mjs";
import type { RideProfile } from "../riding-sim/farm-ride.mjs";
import { FARM_HORSE_LIFE_DAYS, FARM_HORSE_SPECIES_ID } from "./farm-horse-catalog.mjs";
import { farmingLevelForXp } from "./farm-skill-catalog.mjs";

/** The ridable horse row a farm document holds under this id, or null. */
export function storedHorse(layout: any, horseId: unknown): any | null {
  if (typeof horseId !== "string") return null;
  const pet = (Array.isArray(layout?.pets) ? layout.pets : []).find((row: any) => row?.instanceId === horseId);
  return pet && pet.speciesId === FARM_HORSE_SPECIES_ID && pet.profile?.growth && pet.profile?.riding ? pet : null;
}

export function ridingLevelOf(layout: any): number {
  return farmingLevelForXp(Number(layout?.skills?.riding?.xp) || 0);
}

/** The horse's piloted ride profile, from its stored profile and the rider's stored level. */
export function serverRideProfile(pet: any, ridingLevel: number): RideProfile {
  const profile = pet.profile;
  const elder = growthStage(Number(profile.ageDays) || 0, FARM_HORSE_LIFE_DAYS).id === "elder";
  const hunger = Number.isFinite(profile.hunger) ? profile.hunger : 100;
  const happiness = Number.isFinite(profile.happiness) ? profile.happiness : 100;
  return rideProfile(horseStats(profile), { hunger, happiness, elder }, rideTraitsFor(Array.isArray(profile.traits) ? profile.traits : []), ridingLevel);
}
