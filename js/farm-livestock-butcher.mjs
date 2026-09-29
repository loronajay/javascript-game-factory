// The Butcher's rules: what a grown animal is cut into, how fine the meat is,
// and the Husbandry it pays (planning-docs/FARM_LIVESTOCK_PLAN.md Phase 4).
//
// Pure — no THREE, no DOM, no clock of its own — and the same rule, line for
// line, as the Butcher section of
// `platform-api/src/services/farm-livestock-catalog.mts` (a test holds them
// equal). The SERVER cuts: it settles the herd at the farm's stored clock,
// closes the animal's row as `butchered` and puts the meat in the basket. This
// copy only lets the Butcher's counter say what an animal would give before
// the player decides — a decision that cannot be taken back.
//
// CUTS are the species' own count (`meat.cuts`, an average one at its prime),
// scaled by Yield (0.6× to 1.4×) and by age: nothing while it is young, three
// quarters the day it is grown, all of it at twice its grown age. So a pig
// taken the day it grows up is a fair sale and one kept to its prime a better
// one — the same trade a crop left to ripen makes.
//
// THE GRADE is the goods' rule over a whole life: the Quality stat, less what
// its lifetime hunger (`care.neglect`) took, Poor/Normal/Fine/Perfect.
import { PRIME_AGE, STAT_MAX, findLivestockSpecies, livestockMeatPrice } from "./farm-catalog/livestock.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";
import { HUSBANDRY_XP_PER_CYCLE_DAY, adultAgeDays, advanceLivestockCare, goodQuality } from "./farm-livestock-care.mjs";
import { QUALITY_PRICE } from "./farm-quality.mjs";
/** Just grown, an animal cuts to this share of its prime. */
export const GROWN_CUT_SHARE = 0.75;
/** How many cuts an animal `ageDays` old makes: none while young, never fewer than one once grown. */
export function butcherCuts(species, stats, ageDays) {
    const grownAt = adultAgeDays(species, stats);
    if (!(ageDays >= grownAt))
        return 0;
    const toPrime = Math.min(1, (ageDays - grownAt) / (grownAt * (PRIME_AGE - 1)));
    const age = GROWN_CUT_SHARE + (1 - GROWN_CUT_SHARE) * toPrime;
    const yieldShare = 0.6 + 0.8 * (stats.yield / STAT_MAX);
    return Math.max(1, Math.round(species.meat.cuts * yieldShare * age));
}
/** The meat's grade: Quality less the share of its life spent hungry. */
export function butcherQuality(stats, neglectMinutes, lifeMinutes) {
    return goodQuality(stats, neglectMinutes, lifeMinutes);
}
/** Husbandry XP for an animal raised to the Butcher: its species' days to grown, less its hungry share of life, never below one. */
export function livestockButcherXp(species, neglectMinutes, lifeMinutes) {
    const share = Math.min(1, Math.max(0, Number(neglectMinutes) || 0) / Math.max(1, lifeMinutes));
    return Math.max(1, Math.round(HUSBANDRY_XP_PER_CYCLE_DAY * species.adultDays * (1 - share)));
}
export function butcherQuote(animal, clock) {
    const species = findLivestockSpecies(animal.speciesId);
    if (!species)
        return null;
    const care = advanceLivestockCare(animal, animal.care, clock);
    const lifeMinutes = Math.max(0, clock - animal.bornAt);
    const ageDays = lifeMinutes / DAY_MINUTES;
    const grownAt = adultAgeDays(species, animal.stats);
    const cuts = butcherCuts(species, animal.stats, ageDays);
    const quality = butcherQuality(animal.stats, care.neglect, lifeMinutes);
    const each = livestockMeatPrice(species);
    const unit = quality === "normal" ? each : Math.max(1, Math.round(each * QUALITY_PRICE[quality]));
    return Object.freeze({
        meat: species.meat,
        grown: cuts > 0,
        cuts,
        quality,
        value: cuts * unit,
        xp: livestockButcherXp(species, care.neglect, lifeMinutes),
        prime: cuts > 0 ? Math.min(1, (ageDays - grownAt) / (grownAt * (PRIME_AGE - 1))) : 0,
    });
}
