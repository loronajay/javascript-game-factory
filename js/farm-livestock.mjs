// Livestock rules: one animal as the server hands it over, and what follows
// from it — its grade, how grown it is, how big it is drawn.
//
// Pure — no THREE, no DOM, no clock of its own — and mirrored rule for rule by
// `platform-api/src/services/farm-livestock-catalog.mts`, which is the side that
// DECIDES (it rolls the stats, it stamps the birth). This copy presents: a
// record that does not normalize is dropped, never guessed at.
//
// AGE IS FARM TIME. An animal is born at a farm-clock minute (`bornAt`), and
// grows as the farm's clock runs — which only happens while the owner plays or
// naps. Nothing grows while the farm is away (the farm's own rule).
import { LIVESTOCK_NAME_MAX, LIVESTOCK_STATS, LIVESTOCK_STAT_TITLES, STAT_MAX, STAT_MIN, YOUNG_SIZE, findLivestockCoat, findLivestockSpecies, } from "./farm-catalog/livestock.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";
import { adultAgeDays, normalizeLivestockCare } from "./farm-livestock-care.mjs";
export { adultAgeDays, GROWTH_SPREAD } from "./farm-livestock-care.mjs";
export const LIVESTOCK_ID = /^stock-[A-Za-z0-9-]{8,64}$/;
/** Grades by the mean of the four stats: at least this much for each star. */
export const GRADE_THRESHOLDS = Object.freeze([0, 25, 40, 55, 70]);
export const MAX_GRADE = GRADE_THRESHOLDS.length;
function clampStat(value) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(STAT_MAX, Math.max(STAT_MIN, number)) : STAT_MIN;
}
/** The mean of the four stats, to one decimal. */
export function livestockStatMean(stats) {
    return Math.round((LIVESTOCK_STATS.reduce((sum, key) => sum + stats[key], 0) / LIVESTOCK_STATS.length) * 10) / 10;
}
/** ★1–★5 from the stats: what the Dealer and the Butcher price, and what breeding chases. */
export function livestockGrade(stats) {
    const mean = livestockStatMean(stats);
    let grade = 1;
    GRADE_THRESHOLDS.forEach((threshold, index) => { if (mean >= threshold)
        grade = index + 1; });
    return grade;
}
export function gradeStars(grade) {
    const whole = Math.min(MAX_GRADE, Math.max(1, Math.round(grade)));
    return "★".repeat(whole) + "☆".repeat(MAX_GRADE - whole);
}
/** Whole and part farm days since it was born, never negative (a clock behind the birth is a fresh animal). */
export function livestockAgeDays(animal, clockMinutes) {
    return Math.max(0, (clockMinutes - animal.bornAt) / DAY_MINUTES);
}
/** How far to grown, 0 at birth to 1. */
export function livestockMaturity(animal, clockMinutes) {
    const species = findLivestockSpecies(animal.speciesId);
    if (!species)
        return 1;
    return Math.min(1, livestockAgeDays(animal, clockMinutes) / adultAgeDays(species, animal.stats));
}
export function livestockStage(animal, clockMinutes) {
    return livestockMaturity(animal, clockMinutes) >= 1 ? "adult" : "young";
}
/** How big it is drawn (and how much room it takes), against a grown one. */
export function livestockSize(animal, clockMinutes) {
    return YOUNG_SIZE + (1 - YOUNG_SIZE) * livestockMaturity(animal, clockMinutes);
}
/** What it is called at its stage: "Lamb" while young, "Sheep" once grown. */
export function livestockKind(animal, clockMinutes) {
    const species = findLivestockSpecies(animal.speciesId);
    if (!species)
        return "";
    return livestockStage(animal, clockMinutes) === "adult" ? species.title : species.youngTitle;
}
/** Roll a stat inside a range: uniform, whole, clamped. The server's roll is the same rule. */
export function rollStat(range, random) {
    const sample = random();
    const unit = Math.min(0.999999, Math.max(0, Number.isFinite(sample) ? sample : 0));
    return clampStat(range.min + Math.floor(unit * (range.max - range.min + 1)));
}
export function cleanLivestockName(value, fallback) {
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, LIVESTOCK_NAME_MAX) : "";
    return text || fallback;
}
/** One animal from the server, or null when it is not one. */
export function normalizeLivestockAnimal(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    const id = typeof source.id === "string" ? source.id : "";
    const species = findLivestockSpecies(source.speciesId);
    if (!LIVESTOCK_ID.test(id) || !species)
        return null;
    const rawStats = source.stats && typeof source.stats === "object" ? source.stats : {};
    const stats = Object.freeze(Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, clampStat(rawStats[key])])));
    const bornAt = Number(source.bornAt);
    return Object.freeze({
        id,
        speciesId: species.id,
        name: cleanLivestockName(source.name, species.title),
        gender: source.gender === "male" ? "male" : "female",
        coatId: findLivestockCoat(species.id, source.coatId).id,
        stats,
        bornAt: Number.isFinite(bornAt) ? Math.max(0, bornAt) : 0,
        homeId: typeof source.homeId === "string" && source.homeId ? source.homeId : null,
        care: normalizeLivestockCare(source.care, Number.isFinite(bornAt) ? Math.max(0, bornAt) : 0),
        origin: source.origin === "bred" ? "bred" : "dealer",
        parents: normalizeParents(source.parents),
    });
}
function normalizeParents(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    if (typeof source.motherId !== "string" || !LIVESTOCK_ID.test(source.motherId) || typeof source.sireId !== "string" || !LIVESTOCK_ID.test(source.sireId))
        return null;
    return Object.freeze({
        motherId: source.motherId,
        motherName: cleanLivestockName(source.motherName, "?"),
        sireId: source.sireId,
        sireName: cleanLivestockName(source.sireName, "?"),
    });
}
export function normalizeLivestockHerd(value) {
    const seen = new Set();
    const herd = [];
    for (const entry of Array.isArray(value) ? value : []) {
        const animal = normalizeLivestockAnimal(entry);
        if (!animal || seen.has(animal.id))
            continue;
        seen.add(animal.id);
        herd.push(animal);
    }
    return Object.freeze(herd);
}
export function livestockSummary(animal, clockMinutes) {
    const grade = livestockGrade(animal.stats);
    const stage = livestockStage(animal, clockMinutes);
    return Object.freeze({
        title: animal.name,
        kind: livestockKind(animal, clockMinutes),
        stage,
        grownPercent: Math.floor(livestockMaturity(animal, clockMinutes) * 100),
        grade,
        stars: gradeStars(grade),
        coat: findLivestockCoat(animal.speciesId, animal.coatId)?.title ?? "",
        gender: animal.gender === "male" ? "♂" : "♀",
        stats: Object.freeze(LIVESTOCK_STATS.map((id) => Object.freeze({ id, title: LIVESTOCK_STAT_TITLES[id], value: animal.stats[id] }))),
    });
}
