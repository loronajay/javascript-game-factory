// The Pet Games, as far as the platform needs to know them: which courses and
// cups exist, how long a race on each can possibly take, what a Grand Prix
// placing is worth and which trophy a cup win puts on the farm.
//
// Mirrors of cabinet data (games/barnyard-dash/scripts/sim/courses.js,
// games/barnyard-dash/scripts/grand-prix.js, js/farm-catalog/decor.mts) —
// platform-api never imports a cabinet — and tests/pet-games.test.mjs holds
// every table here equal to its source.
export const PET_CPU_LEVELS = Object.freeze(["rookie", "pro", "champion"]);
/**
 * Every Barnyard Dash course: its laps and the fastest a race on it can be run.
 * The floor is three quarters of the centre line's length at the top speed a
 * pet can ever reach (165 × 1.1) — a racing line cuts corners, never that much.
 */
export const BARNYARD_COURSES = Object.freeze({
    "barnyard-loop": Object.freeze({ laps: 3, minRaceMs: 24_700 }),
    "orchard-esses": Object.freeze({ laps: 3, minRaceMs: 36_800 }),
    "millpond-oval": Object.freeze({ laps: 4, minRaceMs: 39_100 }),
    "hayloft-hairpins": Object.freeze({ laps: 2, minRaceMs: 34_000 }),
    "thunder-ridge": Object.freeze({ laps: 2, minRaceMs: 29_300 }),
});
export const BARNYARD_CUPS = Object.freeze({
    "clover-cup": Object.freeze(["barnyard-loop", "millpond-oval", "orchard-esses"]),
    "harvest-cup": Object.freeze(["hayloft-hairpins", "orchard-esses", "thunder-ridge"]),
    "blue-ribbon-cup": Object.freeze(["barnyard-loop", "orchard-esses", "millpond-oval", "hayloft-hairpins", "thunder-ridge"]),
});
export const BARNYARD_GRID_SIZE = 8;
export const BARNYARD_POINTS_BY_PLACE = Object.freeze([10, 8, 6, 5, 4, 3, 2, 1]);
const TROPHY_TIER_BY_LEVEL = Object.freeze({ rookie: "bronze", pro: "silver", champion: "gold" });
/** The farm decor item a cup win at a class earns. */
export function barnyardTrophyId(cupId, level) {
    return `decor.prop.trophy-${cupId}-${TROPHY_TIER_BY_LEVEL[level]}`;
}
/** Every prize item the Pet Games can put on a farm (the farm catalog admits these by entitlement). */
export const PET_GAMES_PRIZE_IDS = Object.freeze(Object.keys(BARNYARD_CUPS).flatMap((cupId) => PET_CPU_LEVELS.map((level) => barnyardTrophyId(cupId, level))));
/**
 * Could a pet with these race placings finish the cup's table in `place`?
 *
 * The points the other seven share are fixed by the placings the player did
 * NOT take, so for the player to finish p-th the rivals below them must each
 * hold no more than the player. With k = p − 1 rivals allowed above (each at
 * most 10 a race), the rest share what is left: 39R − P ≤ 10Rk + (7 − k)·P.
 * A claimed first place with fifth-place points, say, is refused.
 */
export function cupPlacePlausible(raceCount, points, place) {
    if (place < 1 || place > BARNYARD_GRID_SIZE)
        return false;
    const perRace = BARNYARD_POINTS_BY_PLACE.reduce((sum, value) => sum + value, 0);
    const shared = perRace * raceCount - points;
    const above = place - 1;
    return shared <= BARNYARD_POINTS_BY_PLACE[0] * raceCount * above + (BARNYARD_GRID_SIZE - 1 - above) * points;
}
export const PONDSIDE_MAX_PETS = 4;
export const PONDSIDE_WINS_TO_MATCH = 3;
/** A round is at least its countdown and the pause after the splash. */
export const PONDSIDE_MIN_ROUND_MS = 5_000;
