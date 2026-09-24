// Pure Phase-5 outcomes. Permanent departures are resolved only at persisted
// farm-time checkpoints. Chance is injectable for tests and otherwise stable
// per pet/day, so reloading the same save cannot reroll an outcome.
import { FARM_DAY_MINUTES } from "./farm-crops.mjs";
import { findPetCare } from "./farm-pet-care.mjs";
import { petNeedStatus } from "./farm-pet-needs.mjs";
import { withFarmDecor, withFarmPets, withPetHistory } from "./farm-layout.mjs";
export const AFFECTION_CALL_THRESHOLD = 70;
export const WATCH_AFFECTION = 35;
export const URGENT_AFFECTION = 15;
export const WATCH_HAPPINESS = 40;
export const URGENT_HAPPINESS = 20;
export const RUNAWAY_CHANCE_PER_DAY = 0.2;
export const LOW_AFFECTION_RUNAWAY_CHANCE_PER_DAY = 0.1;
export const RARE_NEGLECT_DEATH_CHANCE_PER_DAY = 0.01;
export function petOutcomeWarning(profile, speciesId) {
    const care = findPetCare(speciesId);
    const status = petNeedStatus(profile);
    if (status.starvationDue)
        return Object.freeze({ stage: "critical", label: "Life at risk", message: "This pet may die without food immediately." });
    if (care && profile.ageDays >= care.maxLifeDays)
        return Object.freeze({ stage: "critical", label: "At life's end", message: "This pet has reached its natural lifespan." });
    if (profile.hunger <= 0 || profile.affection <= URGENT_AFFECTION || profile.happiness <= URGENT_HAPPINESS)
        return Object.freeze({ stage: "urgent", label: "Distressed", message: "This pet may refuse care, run away, or become gravely ill." });
    if (profile.hunger <= 40 || profile.affection <= WATCH_AFFECTION || profile.happiness <= WATCH_HAPPINESS)
        return Object.freeze({ stage: "watch", label: "Needs care", message: "Food, shelter, play, and gentle attention can prevent distress." });
    return Object.freeze({ stage: "safe", label: "Doing well", message: "This pet feels safe and cared for." });
}
export function reactToPetCall(profile) {
    if (profile.happiness <= URGENT_HAPPINESS)
        return Object.freeze({ ok: false, message: "Is too distressed to come when called." });
    if (profile.affection < AFFECTION_CALL_THRESHOLD)
        return Object.freeze({ ok: false, message: "Does not trust the call yet." });
    return Object.freeze({ ok: true, message: "Comes when called." });
}
function stableRandom(identity) {
    let state = 2166136261;
    for (let index = 0; index < identity.length; index += 1) {
        state ^= identity.charCodeAt(index);
        state = Math.imul(state, 16777619) >>> 0;
    }
    return state / 0x100000000;
}
function memorialId(layout, pet) {
    const base = `memory-${pet.instanceId}`.slice(0, 40);
    if (!layout.petHistory.some((entry) => entry.id === base))
        return base;
    let number = 2;
    while (layout.petHistory.some((entry) => entry.id === `${base.slice(0, 36)}-${number}`))
        number += 1;
    return `${base.slice(0, 36)}-${number}`;
}
function remember(layout, pet, outcome, farmMinute) {
    if (!pet.profile)
        return withFarmPets(layout, layout.pets.filter((row) => row.instanceId !== pet.instanceId));
    const id = memorialId(layout, pet);
    const profile = pet.profile;
    const entry = Object.freeze({
        id, instanceId: pet.instanceId, speciesId: pet.speciesId, name: pet.name, outcome,
        departedAtFarmMinute: farmMinute, lifespanDays: profile.ageDays,
        finalStats: Object.freeze({ gender: profile.gender, ageDays: profile.ageDays, size: profile.size.current, hunger: profile.hunger, happiness: profile.happiness, speed: profile.stats.speed, strength: profile.stats.strength }),
        traits: Object.freeze([...profile.traits]), accomplishments: Object.freeze([]),
    });
    let next = withPetHistory(withFarmPets(layout, layout.pets.filter((row) => row.instanceId !== pet.instanceId)), [...layout.petHistory, entry]);
    if (outcome === "runaway")
        return next;
    const angle = stableRandom(`${id}:position`) * Math.PI * 2;
    const radius = 2.5 + stableRandom(`${id}:radius`) * 3;
    next = withFarmDecor(next, [...next.decor, Object.freeze({
            instanceId: `tombstone-${pet.instanceId}`.slice(0, 40), itemId: "decor.prop.pet-tombstone",
            x: Number((Math.cos(angle) * radius).toFixed(4)), z: Number((Math.sin(angle) * radius).toFixed(4)), rotationY: Number(angle.toFixed(4)), length: 0, memorialId: id,
        })]);
    return next;
}
/** Resolve terminal conditions and at most one low-care outcome for each crossed farm day. */
export function resolvePetOutcomes(layout, previousFarmMinute, targetFarmMinute, random) {
    let next = layout;
    const firstDay = Math.floor(Math.max(0, previousFarmMinute) / FARM_DAY_MINUTES) + 1;
    const lastDay = Math.floor(Math.max(0, targetFarmMinute) / FARM_DAY_MINUTES);
    for (const original of layout.pets) {
        const pet = next.pets.find((row) => row.instanceId === original.instanceId);
        if (!pet?.profile)
            continue;
        const care = findPetCare(pet.speciesId);
        if (petNeedStatus(pet.profile).starvationDue) {
            next = remember(next, pet, "starvation", targetFarmMinute);
            continue;
        }
        if (care && pet.profile.ageDays >= care.maxLifeDays) {
            next = remember(next, pet, "old_age", targetFarmMinute);
            continue;
        }
        for (let day = firstDay; day <= lastDay && next.pets.some((row) => row.instanceId === pet.instanceId); day += 1) {
            const roll = (kind) => random ? random() : stableRandom(`${pet.instanceId}:${day}:${kind}`);
            const runawayChance = (pet.profile.happiness <= URGENT_HAPPINESS ? RUNAWAY_CHANCE_PER_DAY : 0)
                + (pet.profile.affection <= URGENT_AFFECTION ? LOW_AFFECTION_RUNAWAY_CHANCE_PER_DAY : 0);
            if (runawayChance > 0 && roll("runaway") < runawayChance) {
                next = remember(next, pet, "runaway", day * FARM_DAY_MINUTES);
                break;
            }
            if (pet.profile.happiness <= 5 && roll("neglect") < RARE_NEGLECT_DEATH_CHANCE_PER_DAY) {
                next = remember(next, pet, "neglect", day * FARM_DAY_MINUTES);
                break;
            }
        }
    }
    return next;
}
