// Course runs at Windrush Downs on the database (planning-docs/FARM_RIDING_PLAN.md).
//
// A finished run arrives as the horse's state at the start line and one input
// byte per tick. Under the farm's row lock the server rides it again on the
// mirrored sim (`../riding-sim/downs-replay`), from the horse's numbers as it
// computes them, and only a run that lands on the claimed time and faults pays:
// Riding XP into the server-owned `skills.riding` (less for the same course
// again the same UTC day) and training into the horse's `riding` block (capped
// per farm day and by its potential). A run that does not hold up is refused
// and changes nothing.
import { lockedFarm, saveFarm, transaction } from "./farm-economy.mjs";
import { normalizeFarmGarage } from "../services/farm-loadout-catalog.mjs";
import { farmingLevelForXp, normalizeFarmSkillRecords } from "../services/farm-skill-catalog.mjs";
import { ridingLevelOf, serverRideProfile, storedHorse } from "../services/farm-horse-ride.mjs";
import { trainFarmHorse } from "../services/farm-horse-catalog.mjs";
import { findDownsCourse, MAX_RUN_TICKS } from "../riding-sim/downs-course.mjs";
import { plausibleStart, replayRun } from "../riding-sim/downs-replay.mjs";
import { ridingPerkEffects, runXp, trainingFrom } from "../riding-sim/farm-riding-skill.mjs";
const DAY_MS = 24 * 60 * 60 * 1000;
/** No rider needs more runs than this in a UTC day; past it a run is refused. */
export const MAX_RUNS_PER_DAY = 240;
function required(value, field) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text)
        throw new TypeError(`${field} is required`);
    return text;
}
function trainingWords(applied) {
    const names = { speed: "Speed", strength: "Strength", stamina: "Stamina", agility: "Agility" };
    const parts = Object.entries(applied).filter(([, amount]) => amount >= 0.005).map(([id, amount]) => `+${amount.toFixed(2)} ${names[id]}`);
    return parts.length ? `Training: ${parts.join(", ")}` : "";
}
export async function submitFarmRidingRun(pool, input, now = Date.now()) {
    const playerId = required(input?.playerId, "playerId");
    const course = findDownsCourse(input?.courseId);
    if (!course || !course.solo)
        return { ok: false, error: "unknown_course" };
    const inputs = Array.isArray(input?.inputs) ? input.inputs : null;
    const ticks = Number(input?.ticks);
    const faults = Number(input?.faults);
    if (!inputs || !Number.isSafeInteger(ticks) || ticks < 1 || ticks > MAX_RUN_TICKS || inputs.length !== ticks)
        return { ok: false, error: "invalid_run" };
    if (!inputs.every((byte) => Number.isInteger(byte) && byte >= 0 && byte < 64))
        return { ok: false, error: "invalid_run" };
    if (!Number.isSafeInteger(faults) || faults < 0 || faults > 400)
        return { ok: false, error: "invalid_run" };
    return transaction(pool, async (client) => {
        const farm = await lockedFarm(client, playerId);
        if (!farm || farm.layout.onboarding?.status !== "complete")
            return { ok: false, error: "farm_not_initialized" };
        const horse = storedHorse(farm.layout, input?.horseId);
        if (!horse)
            return { ok: false, error: "no_horse" };
        const skills = normalizeFarmSkillRecords(farm.layout.skills);
        const levelBefore = ridingLevelOf(farm.layout);
        const perks = ridingPerkEffects(levelBefore);
        if ((course.needs === "openRing" && !perks.openRing) || (course.needs === "championship" && !perks.championship))
            return { ok: false, error: "level_too_low" };
        const day = Math.floor(now / DAY_MS);
        const today = skills.riding.today.day === day ? skills.riding.today : { day, runs: {} };
        const runsToday = Object.values(today.runs).reduce((sum, n) => sum + n, 0);
        if (runsToday >= MAX_RUNS_PER_DAY)
            return { ok: false, error: "daily_run_limit" };
        const profile = serverRideProfile(horse, levelBefore);
        const start = plausibleStart(course.id, input?.start, profile);
        if (!start)
            return { ok: false, error: "replay_mismatch" };
        const outcome = replayRun(course.id, start, inputs, profile);
        if (!outcome.finished || outcome.ticks !== ticks || outcome.faults !== faults)
            return { ok: false, error: "replay_mismatch", replay: { finished: outcome.finished, ticks: outcome.ticks, faults: outcome.faults } };
        const runsBefore = today.runs[course.id] ?? 0;
        const xp = runXp(course.id, faults, ticks, course.par, runsBefore);
        const farmDay = Math.floor((Number(farm.layout.clock?.farmMinutes) || 0) / 1440);
        const trained = trainFarmHorse(horse.profile.riding, trainingFrom(outcome.gallopTicks, outcome.cleared), farmDay);
        const riding = {
            ...skills.riding,
            xp: skills.riding.xp + xp,
            runs: skills.riding.runs + 1,
            today: { day, runs: { ...today.runs, [course.id]: runsBefore + 1 } },
        };
        const next = normalizeFarmGarage({
            ...farm.layout,
            pets: farm.layout.pets.map((pet) => (pet.instanceId === horse.instanceId ? { ...pet, profile: { ...pet.profile, riding: trained.riding } } : pet)),
            skills: { ...skills, riding },
        }, { ownedEntitlementIds: farm.owned });
        await saveFarm(client, playerId, next);
        return {
            ok: true,
            xp,
            levelBefore,
            levelAfter: farmingLevelForXp(riding.xp),
            trained: trained.applied,
            trainingNote: trainingWords(trained.applied),
            layout: next,
        };
    });
}
