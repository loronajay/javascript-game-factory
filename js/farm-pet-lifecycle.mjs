// Pure age and growth rules. Lifecycle time is advanced only from persisted
// farm minutes, through the same checkpoint as hunger and happiness; rendering
// never owns age or size. Natural lifespan is a deterministic species cap.
import { FARM_DAY_MINUTES } from "./farm-crops.mjs";
import { findPetCare } from "./farm-pet-care.mjs";
export const FAST_GROWTH_MULTIPLIER = 1.5;
const cleanElapsed = (value) => Number.isFinite(value) ? Math.max(0, value) : 0;
const tidy = (value) => Number(value.toFixed(10));
/** Advance one living profile, stopping both age and growth at its natural lifespan. */
export function advancePetLifecycle(profile, speciesId, elapsedFarmMinutes) {
    const care = findPetCare(speciesId);
    const elapsedDays = cleanElapsed(elapsedFarmMinutes) / FARM_DAY_MINUTES;
    if (!care || elapsedDays <= 0 || profile.ageDays >= care.maxLifeDays)
        return profile;
    const livingDays = Math.min(elapsedDays, care.maxLifeDays - profile.ageDays);
    const growthMultiplier = profile.traits.includes("growth.fast") ? FAST_GROWTH_MULTIPLIER : 1;
    const ageDays = tidy(profile.ageDays + livingDays);
    const current = tidy(Math.min(profile.size.max, profile.size.current + profile.size.growthPerDay * growthMultiplier * livingDays));
    if (ageDays === profile.ageDays && current === profile.size.current)
        return profile;
    return Object.freeze({
        ...profile,
        ageDays,
        size: Object.freeze({ ...profile.size, current }),
    });
}
