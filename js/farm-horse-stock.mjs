// Hollis's horses (planning-docs/FARM_RIDING_PLAN.md): what the Livestock
// Dealer has in the paddock today, as a pure function of the UTC day.
//
// Each day brings `HORSE_STOCK_SIZE` horses, and each one is a SEED: the card
// rolls its profile from the seed through the pets' own roller
// (`createPetProfile`), and the server rolls the horse it sells from the same
// seed through its mirror (`createFarmPetProfile`), so the horse that arrives
// is exactly the horse the card showed. A parity test holds the two rollers
// equal. A player can buy each of the day's horses once (the ticket ledger key
// is `farm:horse:<day>:<slot>`); other players see the same paddock.
//
// A horse is priced by its potential, and the best ones wait for a rider good
// enough for them (`HORSE_GRADE_RULES`, Riding level).
//
// Pure — no THREE, no DOM. The clock comes in as `now`.
import { createPetProfile } from "./farm-pet-care.mjs";
import { HORSE_SPECIES_ID, horseStats } from "./farm-horse-riding.mjs";
export const HORSE_STOCK_DAY_MS = 24 * 60 * 60 * 1000;
export const HORSE_STOCK_SIZE = 3;
/** What a horse costs by its potential, and the Riding level Hollis sells it from. */
export const HORSE_GRADE_RULES = Object.freeze({
    steady: Object.freeze({ price: 2500, minRidingLevel: 1 }),
    gifted: Object.freeze({ price: 4500, minRidingLevel: 1 }),
    exceptional: Object.freeze({ price: 8000, minRidingLevel: 20 }),
    prodigy: Object.freeze({ price: 15000, minRidingLevel: 60 }),
});
/** FNV-1a (the server's `farmSeedFor`). */
export function horseSeedFor(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
/** mulberry32 (the server's `farmSeededRandom`). */
export function horseSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export function horseStockDay(now) {
    return Math.floor(now / HORSE_STOCK_DAY_MS);
}
/** The seed text of one of the day's horses. */
export function horseStockSeed(day, slot) {
    return `farm-horses:v1:${day}:${slot}`;
}
/** One of the day's horses, rolled from its seed. */
export function horseStockLine(day, slot) {
    const profile = createPetProfile(HORSE_SPECIES_ID, horseSeededRandom(horseSeedFor(horseStockSeed(day, slot))));
    if (!profile)
        return null;
    const grade = profile.growth.grade;
    const rule = HORSE_GRADE_RULES[grade];
    return Object.freeze({ day, slot, profile, stats: horseStats(profile), grade, price: rule.price, minRidingLevel: rule.minRidingLevel });
}
/** The whole paddock for a day. */
export function horseStock(day) {
    const lines = [];
    for (let slot = 0; slot < HORSE_STOCK_SIZE; slot += 1) {
        const line = horseStockLine(day, slot);
        if (line)
            lines.push(line);
    }
    return Object.freeze(lines);
}
