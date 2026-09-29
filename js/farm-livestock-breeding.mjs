// Livestock breeding (planning-docs/FARM_LIVESTOCK_PLAN.md Phase 5): who may be
// paired, what a young one inherits, and how a pregnancy reads on the panel.
//
// Pure — no THREE, no DOM, no clock of its own — and the same rule, line for
// line, as the Breeding section of
// `platform-api/src/services/farm-livestock-catalog.mts` (a test holds them
// equal with a seeded roll). The SERVER pairs, rolls and mints the young one;
// this copy lets the Herd panel say who can be paired and why not, before it
// asks.
//
// THE RULES, deliberately simple (pet breeding is its own, deeper pass):
//
//   · a grown female and a grown male of one species, living in the SAME home
//     (a pen or the barn floor — a stall holds one), both well fed, from
//     Husbandry level 3;
//   · she is not already carrying, and not resting after a birth;
//   · the farm has a free place for the young one, counting the places other
//     mothers' young are already owed;
//   · she carries for the species' `gestationDays` of WELL-FED time (the
//     goods' rule: hungry time does not count), then gives birth at the next
//     settle with room — never lost for want of a place, only delayed;
//   · each stat is the parents' average ± INHERIT_SPREAD, with a JUMP_CHANCE
//     of a JUMP_MIN–JUMP_MAX leap upward, clamped to 1–100 — past the Dealer's
//     ranges, which is what makes ★5 stock a thing only breeding reaches;
//   · the coat is hers or his (45% each) or any of the species' (10%).
//
// A pregnancy ends with her: if she dies or goes to the Butcher, so does it.
import { LIVESTOCK_STATS, STAT_MAX, STAT_MIN, findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";
import { HUNGRY_AT, HUSBANDRY_XP_PER_CYCLE_DAY, adultAgeDays, gestationMinutes } from "./farm-livestock-care.mjs";
export const BREEDING_MIN_LEVEL = 3;
/** Farm days a mother rests after a birth before she can be paired again. */
export const REST_DAYS = 1;
export const INHERIT_SPREAD = 5;
export const JUMP_CHANCE = 0.1;
export const JUMP_MIN = 6;
export const JUMP_MAX = 12;
export const MOTHER_COAT_SHARE = 0.45;
export const SIRE_COAT_SHARE = 0.45;
export const BREEDING_REFUSAL_WORDS = Object.freeze({
    level_too_low: `Breeding opens at Husbandry level ${BREEDING_MIN_LEVEL}.`,
    not_female: "Only a female carries a young one.",
    not_male: "She needs a male to be paired with.",
    other_species: "They are not the same kind of animal.",
    not_grown: "Both must be grown.",
    not_together: "They must live in the same pen, coop or barn floor.",
    pregnant: "She is already expecting.",
    resting: "She is resting after her last birth.",
    hungry: "Both must be well fed.",
    no_room: "There is no free place on the farm for a young one.",
});
/**
 * Places a young one could be born into: empty slots in standing homes (those
 * that take `speciesId`, when given — a calf is never born into the coop), less
 * those other mothers' young are owed. Every owed young one is counted against
 * every species, so the answer may be short, never long.
 */
export function freePlacesForYoung(homes, herd, speciesId) {
    const counts = new Map(homes.map((home) => [home.id, 0]));
    for (const animal of herd)
        if (animal.homeId && counts.has(animal.homeId))
            counts.set(animal.homeId, counts.get(animal.homeId) + 1);
    const takes = (home) => speciesId === undefined || !home.species || home.species.includes(speciesId);
    const empty = homes.filter(takes).reduce((sum, home) => sum + Math.max(0, home.slots - (counts.get(home.id) ?? 0)), 0);
    const owed = herd.filter((animal) => Boolean(animal.care?.pregnancy)).length;
    return Math.max(0, empty - owed);
}
function grown(animal, species, clock) {
    return (clock - animal.bornAt) / DAY_MINUTES >= adultAgeDays(species, animal.stats);
}
/** Why this pair cannot be bred now, or null when it can. The first reason found, in the order the panel should say them. */
export function breedingRefusal(mother, sire, context) {
    const species = findLivestockSpecies(mother.speciesId);
    if (!species)
        return "other_species";
    if (context.level < BREEDING_MIN_LEVEL)
        return "level_too_low";
    if (mother.gender !== "female")
        return "not_female";
    if (sire.gender !== "male")
        return "not_male";
    if (sire.speciesId !== mother.speciesId)
        return "other_species";
    if (!grown(mother, species, context.clock) || !grown(sire, species, context.clock))
        return "not_grown";
    if (!mother.homeId || mother.homeId !== sire.homeId)
        return "not_together";
    if (mother.care.pregnancy)
        return "pregnant";
    if (mother.care.restUntil > context.clock)
        return "resting";
    if (!(mother.care.hunger > HUNGRY_AT) || !(sire.care.hunger > HUNGRY_AT))
        return "hungry";
    if (context.freePlaces < 1)
        return "no_room";
    return null;
}
/** Husbandry XP for a birth: the gestation in farm days at the goods' daily rate (only well-fed time carries, so there is nothing to take off). */
export function livestockBirthXp(species) {
    return HUSBANDRY_XP_PER_CYCLE_DAY * species.gestationDays;
}
function unit(random) {
    const sample = random();
    return Math.min(0.999999, Math.max(0, Number.isFinite(sample) ? sample : 0));
}
function clampStat(value) {
    return Math.min(STAT_MAX, Math.max(STAT_MIN, Math.round(value)));
}
/** One stat of a young one: the parents' average, a spread, and now and then a leap. Three draws, always, so a seeded roll stays in step. */
export function inheritStat(motherValue, sireValue, random) {
    const spread = Math.floor(unit(random) * (INHERIT_SPREAD * 2 + 1)) - INHERIT_SPREAD;
    const leaps = unit(random) < JUMP_CHANCE;
    const leap = JUMP_MIN + Math.floor(unit(random) * (JUMP_MAX - JUMP_MIN + 1));
    return clampStat(Math.round((motherValue + sireValue) / 2) + spread + (leaps ? leap : 0));
}
/** The young one, rolled. Draws: sex, coat source, species coat, three per stat, name — a fixed order the server keeps too. */
export function inheritLivestock(species, mother, sire, random) {
    const gender = unit(random) < 0.5 ? "female" : "male";
    const source = unit(random);
    const total = species.coats.reduce((sum, coat) => sum + coat.weight, 0);
    const roll = unit(random) * total;
    let cursor = 0;
    const drawn = (species.coats.find((coat) => (cursor += coat.weight) > roll) ?? species.coats[0]).id;
    const known = (id) => species.coats.some((coat) => coat.id === id);
    const coatId = source < MOTHER_COAT_SHARE && known(mother.coatId) ? mother.coatId
        : source >= MOTHER_COAT_SHARE && source < MOTHER_COAT_SHARE + SIRE_COAT_SHARE && known(sire.coatId) ? sire.coatId
            : drawn;
    const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, inheritStat(mother.stats[key], sire.stats[key], random)]));
    const name = species.names[Math.floor(unit(random) * species.names.length)];
    return { gender, coatId, stats, name };
}
/** What the panel and the prompt say about a mother, with her care carried to `clock`. */
export function pregnancyView(animal, clock) {
    const pregnancy = animal.care.pregnancy;
    const species = findLivestockSpecies(animal.speciesId);
    if (pregnancy && species) {
        if (pregnancy.dueAt !== null)
            return Object.freeze({ stage: "due", sireName: pregnancy.sireName });
        return Object.freeze({ stage: "expecting", percent: Math.floor((pregnancy.progress / gestationMinutes(species)) * 100), sireName: pregnancy.sireName });
    }
    if (animal.care.restUntil > clock)
        return Object.freeze({ stage: "resting", hours: Math.ceil((animal.care.restUntil - clock) / 60) });
    return null;
}
