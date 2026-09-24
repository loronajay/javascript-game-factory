// Pure persisted pet-needs rules. Time is always expressed in the farm clock's
// minutes: play, naps and time away all enter through the same elapsed value.
// This module owns no timer, DOM, storage or rendering state.
import { FARM_DAY_MINUTES } from "./farm-crops.mjs";
import { PET_TRAITS, findPetCare } from "./farm-pet-care.mjs";
import { withFarmAgriculture, withFarmClock, withFarmPets } from "./farm-layout.mjs";
import { advancePetWellbeing } from "./farm-pet-happiness.mjs";
import { advancePetLifecycle } from "./farm-pet-lifecycle.mjs";
import { resolvePetOutcomes } from "./farm-pet-outcomes.mjs";
export const HUNGRY_THRESHOLD = 40;
export const STARVATION_GRACE_MINUTES = FARM_DAY_MINUTES;
export const HUNGRY_AFFECTION_LOSS_PER_DAY = 2;
export const STARVING_AFFECTION_LOSS_PER_DAY = 6;
const roundedNeed = (value) => Number(value.toFixed(4));
function appetiteMultiplier(profile) {
    return profile.traits.reduce((product, id) => {
        const modifier = PET_TRAITS.find((trait) => trait.id === id)?.hungerDrainMultiplier ?? 1;
        return product * modifier;
    }, 1);
}
/** A concise public state; affection remains deliberately absent. */
export function petNeedStatus(profile) {
    const level = profile.hunger <= 0
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
export function advancePetProfile(profile, speciesId, elapsedFarmMinutes, decor = []) {
    const care = findPetCare(speciesId);
    const elapsed = Number.isFinite(elapsedFarmMinutes) ? Math.max(0, elapsedFarmMinutes) : 0;
    if (!care || elapsed <= 0)
        return profile;
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
    const hungryProfile = Object.freeze({
        ...profile,
        hunger,
        starvingMinutes,
        affection: roundedNeed(Math.max(0, profile.affection - affectionLoss)),
    });
    return advancePetLifecycle(advancePetWellbeing(hungryProfile, speciesId, decor, elapsed), speciesId, elapsed);
}
/** Checkpoint every pet from layout.clock.farmMinutes to targetFarmMinute. Rollback is a no-op. */
export function advancePetNeeds(layout, targetFarmMinute) {
    const target = Number.isFinite(targetFarmMinute) ? targetFarmMinute : layout.clock.farmMinutes;
    const elapsed = Math.max(0, target - layout.clock.farmMinutes);
    if (elapsed <= 0)
        return layout;
    const pets = layout.pets.map((pet) => pet.profile
        ? { ...pet, profile: advancePetProfile(pet.profile, pet.speciesId, elapsed, layout.decor) }
        : pet);
    const checkpoint = withFarmClock(withFarmPets(layout, pets), target, layout.clock.updatedAt);
    return resolvePetOutcomes(checkpoint, layout.clock.farmMinutes, target);
}
function withSupplies(layout, supplies) {
    const inventory = Object.freeze({ ...layout.agriculture.inventory, supplies: Object.freeze({ ...supplies }) });
    return withFarmAgriculture(layout, Object.freeze({ ...layout.agriculture, inventory }));
}
/** One atomic care action: elapsed decay first, then one correct species serving when useful and owned. */
export function feedPet(layout, instanceId, targetFarmMinute) {
    const original = layout.pets.find((pet) => pet.instanceId === instanceId);
    if (!original)
        return Object.freeze({ ok: false, reason: "unknown_pet", layout, foodTitle: "" });
    let checkpoint = advancePetNeeds(layout, targetFarmMinute);
    const pet = checkpoint.pets.find((row) => row.instanceId === instanceId);
    if (!pet)
        return Object.freeze({ ok: false, reason: "unknown_pet", layout: checkpoint, foodTitle: "" });
    const care = findPetCare(pet.speciesId);
    if (!pet.profile || !care)
        return Object.freeze({ ok: false, reason: "no_profile", layout: checkpoint, foodTitle: care?.food.title ?? "food" });
    if (pet.profile.happiness <= 10)
        return Object.freeze({ ok: false, reason: "refused", layout: checkpoint, foodTitle: care.food.title });
    if (pet.profile.hunger >= 100)
        return Object.freeze({ ok: false, reason: "full", layout: checkpoint, foodTitle: care.food.title });
    const count = checkpoint.agriculture.inventory.supplies[care.food.itemId] ?? 0;
    if (count <= 0)
        return Object.freeze({ ok: false, reason: "no_food", layout: checkpoint, foodTitle: care.food.title });
    const profile = Object.freeze({
        ...pet.profile,
        hunger: roundedNeed(Math.min(100, pet.profile.hunger + care.needs.hungerPerServing)),
        starvingMinutes: 0,
    });
    checkpoint = withFarmPets(checkpoint, checkpoint.pets.map((row) => row.instanceId === instanceId ? { ...row, profile } : row));
    checkpoint = withSupplies(checkpoint, { ...checkpoint.agriculture.inventory.supplies, [care.food.itemId]: count - 1 });
    return Object.freeze({ ok: true, reason: "", layout: checkpoint, foodTitle: care.food.title });
}
