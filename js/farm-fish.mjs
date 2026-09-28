// A fish: what one specimen is, what bites, and where the shadows swim. PURE —
// no DOM, no THREE, no clock (times are passed in), no Math.random (a random
// source is injected).
//
// THE SPECIMEN. Two Koi are not the same Koi. When a fish bites, the server
// rolls a RANK (0..1, where it stands among its kind), and everything about
// its size follows from that one number: its weight (a bell round the
// species' average with long thin tails), its length (the cube law — twice
// the weight is a quarter longer), and its size class, from Tiny to Record.
// A colour VARIANT is rolled beside it (Shiny, rarer still Golden). How the
// fish was landed is its GRADE, the same four words as produce quality.
// Weight, grade and variant together set what it is worth and what XP it
// gives. The server holds its own copy of this maths (platform-api/src/
// services/farm-fish-catalog.mts), because the server rolls and pays.
//
// WHAT BITES. A bite is drawn from its zone's species: first a rarity, by
// weights that lean rarer for a shadow than for a blind cast into open water,
// then a species of that rarity, with the lure tilting both.
//
// THE SHADOWS. Time is cut into windows; each window every zone has a few
// shadow slots, each a fish (species, rank, colour — the server keeps those)
// swimming a loop inside its water. Anyone can be shown a slot's SIZE, its
// FIN (Epic and Legendary fish show a fin) and its path, so every player in the
// Cove sees the same fish in the same place without a byte of traffic.
import { FISH_CATALOG, RARITY_STRENGTH, RARITY_XP, findFishSpecies, } from "./farm-catalog/fish.mjs";
import { SHADOW_WATERS } from "./farm-cove.mjs";
// ---------------------------------------------------------------- size
export const SIZE_CLASSES = Object.freeze(["tiny", "small", "average", "large", "trophy", "record"]);
export const SIZE_TITLES = Object.freeze({ tiny: "Tiny", small: "Small", average: "Average", large: "Large", trophy: "Trophy", record: "Record" });
/** The rank each class starts at: the bottom tenth are Tiny, the top three in a thousand are Records. */
const CLASS_FLOORS = Object.freeze([
    ["record", 0.997], ["trophy", 0.97], ["large", 0.8], ["average", 0.35], ["small", 0.1], ["tiny", 0],
]);
export function sizeClassForRank(rank) {
    const q = clampUnit(rank);
    return CLASS_FLOORS.find(([, floor]) => q >= floor)[0];
}
function clampUnit(value) {
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5;
}
/**
 * The weight at a rank. The rank is spread out cubically round the middle, so
 * most fish land near the average and the tails are thin; the weight is then
 * read between min, avg and max in log space, so a fish twice the average is
 * as far above it as one half the average is below.
 */
export function weightAtRank(species, rank) {
    const u = clampUnit(rank) * 2 - 1;
    const spread = u * u * u;
    const { min, avg, max } = species.weightKg;
    const kg = spread < 0
        ? Math.exp(Math.log(avg) + (Math.log(avg) - Math.log(min)) * spread)
        : Math.exp(Math.log(avg) + (Math.log(max) - Math.log(avg)) * spread);
    return kg;
}
/** Grams, the unit a specimen is stored in: never below one. */
export function weightGramsAtRank(species, rank) {
    return Math.max(1, Math.round(weightAtRank(species, rank) * 1000));
}
/** Nose to tail, in metres, for a fish of this weight: the cube law from the species' average. */
export function lengthForWeight(species, weightKg) {
    return species.lengthM * Math.cbrt(Math.max(1e-6, weightKg) / species.weightKg.avg);
}
export function lengthMmForWeight(species, weightGrams) {
    return Math.max(1, Math.round(lengthForWeight(species, weightGrams / 1000) * 1000));
}
// ---------------------------------------------------------------- colour and grade
export const FISH_VARIANTS = Object.freeze(["normal", "shiny", "golden"]);
export const GOLDEN_CHANCE = 1 / 4096;
export const SHINY_CHANCE = 1 / 256;
export const VARIANT_PRICE = Object.freeze({ normal: 1, shiny: 3, golden: 10 });
export const VARIANT_TITLES = Object.freeze({ normal: "", shiny: "Shiny", golden: "Golden" });
export function variantForRoll(roll) {
    const v = clampUnit(roll);
    if (v < GOLDEN_CHANCE)
        return "golden";
    if (v < GOLDEN_CHANCE + SHINY_CHANCE)
        return "shiny";
    return "normal";
}
/** How a fish was landed: the produce grades, the same prices (farm-quality.mts). */
export const FISH_GRADES = Object.freeze(["poor", "normal", "fine", "perfect"]);
export const GRADE_PRICE = Object.freeze({ poor: 0.75, normal: 1, fine: 1.2, perfect: 1.4 });
export const GRADE_XP = Object.freeze({ poor: 0.8, normal: 1, fine: 1.1, perfect: 1.25 });
export const GRADE_TITLES = Object.freeze({ poor: "Poor", normal: "Normal", fine: "Fine", perfect: "Perfect" });
export function isFishGrade(value) {
    return typeof value === "string" && FISH_GRADES.includes(value);
}
export function isFishVariant(value) {
    return typeof value === "string" && FISH_VARIANTS.includes(value);
}
// ---------------------------------------------------------------- worth
/** How far the price follows the weight: a fish twice the average is worth about 1.74×, not 2×. */
export const WEIGHT_PRICE_EXPONENT = 0.8;
/** Fishing XP for a fish that got away: a hard fight is never nothing. */
export const ESCAPE_XP = 2;
/** The Fishmonger's price for one fish. */
export function fishValue(speciesId, weightG, grade, variant) {
    const species = findFishSpecies(speciesId);
    if (!species)
        return 0;
    const ratio = Math.max(1e-6, weightG / 1000 / species.weightKg.avg);
    return Math.max(1, Math.round(species.value * ratio ** WEIGHT_PRICE_EXPONENT * GRADE_PRICE[grade] * VARIANT_PRICE[variant]));
}
/** Fishing XP for landing one fish: its rarity, a little for size (half to double), a little for a clean landing. */
export function fishXp(speciesId, weightG, grade) {
    const species = findFishSpecies(speciesId);
    if (!species)
        return 0;
    const size = Math.min(2, Math.max(0.5, Math.sqrt(weightG / 1000 / species.weightKg.avg)));
    return Math.max(1, Math.round(RARITY_XP[species.rarity] * size * GRADE_XP[grade]));
}
/**
 * How hard this fish pulls, 0.05..1.2: its species, its rarity, and its size —
 * a Trophy of a kind fights harder than an average one.
 */
export function fightStrength(speciesId, weightG) {
    const species = findFishSpecies(speciesId);
    if (!species)
        return 0.2;
    const ratio = Math.max(1e-6, weightG / 1000 / species.weightKg.avg);
    const size = Math.log2(ratio) * 0.12;
    return Math.min(1.2, Math.max(0.05, species.strength + RARITY_STRENGTH[species.rarity] + size));
}
/** "Trophy Golden Koi", "Shiny Tetra", "Koi". */
export function specimenTitle(speciesId, variant, sizeClass) {
    const title = findFishSpecies(speciesId)?.title ?? speciesId;
    const size = sizeClass && (sizeClass === "trophy" || sizeClass === "record") ? `${SIZE_TITLES[sizeClass]} ` : "";
    const colour = variant === "normal" ? "" : `${VARIANT_TITLES[variant]} `;
    return `${size}${colour}${title}`;
}
export function formatWeight(weightG) {
    if (weightG < 1000)
        return `${Math.round(weightG)} g`;
    const kg = weightG / 1000;
    return `${kg >= 100 ? Math.round(kg).toLocaleString() : kg.toFixed(kg >= 10 ? 1 : 2)} kg`;
}
export function formatLength(lengthMm) {
    return lengthMm < 1000 ? `${Math.round(lengthMm / 10)} cm` : `${(lengthMm / 1000).toFixed(2)} m`;
}
// ---------------------------------------------------------------- what bites
/** A blind cast into open water mostly brings up the everyday fish. */
export const BLIND_RARITY_WEIGHTS = Object.freeze({ common: 64, uncommon: 26, rare: 8, epic: 1.8, legendary: 0.2 });
/** A shadow is where the rare fish are. */
export const SHADOW_RARITY_WEIGHTS = Object.freeze({ common: 34, uncommon: 30, rare: 22, epic: 11, legendary: 3 });
/** Every species that can bite in a zone, with its share, for a lure (or none) and a kind of cast. */
export function biteOdds(zone, lure, kind) {
    const table = kind === "shadow" ? SHADOW_RARITY_WEIGHTS : BLIND_RARITY_WEIGHTS;
    const pool = FISH_CATALOG.filter((entry) => entry.zones.includes(zone));
    const perRarity = new Map();
    for (const entry of pool)
        perRarity.set(entry.rarity, (perRarity.get(entry.rarity) ?? 0) + 1);
    return pool.map((entry) => {
        const share = table[entry.rarity] * (lure?.rarity[entry.rarity] ?? 1) / (perRarity.get(entry.rarity) ?? 1);
        const favored = lure?.favors.includes(entry.id) ? 2 : 1;
        return Object.freeze({ speciesId: entry.id, weight: share * favored });
    });
}
/** Pick one from weighted odds with a roll in [0, 1). */
export function pickFromOdds(odds, roll) {
    const total = odds.reduce((sum, entry) => sum + entry.weight, 0);
    let left = clampUnit(roll) * total;
    for (const entry of odds) {
        left -= entry.weight;
        if (left < 0)
            return entry.speciesId;
    }
    return odds[odds.length - 1].speciesId;
}
/** A whole bite: the species from the odds, a rank and a colour. Three draws from `random`, in that order. */
export function rollBite(zone, lure, kind, random) {
    const speciesId = pickFromOdds(biteOdds(zone, lure, kind), random());
    return Object.freeze({ speciesId, rank: clampUnit(random()), variant: variantForRoll(random()) });
}
// ---------------------------------------------------------------- the shadows
/** Each window lasts five minutes; a shadow is born some way into it and swims off before the next. */
export const SHADOW_WINDOW_MS = 5 * 60 * 1000;
export const SHADOWS_PER_ZONE = Object.freeze({ lagoon: 5, reef: 4, deep: 3 });
/** A lure that lands this close to a shadow is seen, and the shadow comes to it. */
export const SHADOW_REACH = 2.2;
/** The server's slack for the shadow having swum on while the cast was in flight. */
export const SHADOW_SLACK = 1.4;
export const SHADOW_SIZES = Object.freeze(["s", "m", "l", "xl"]);
/** What a shadow looks like from above: how long the fish is. */
export function shadowSizeForLength(lengthMm) {
    if (lengthMm < 200)
        return "s";
    if (lengthMm < 500)
        return "m";
    if (lengthMm < 1200)
        return "l";
    return "xl";
}
export function shadowWindow(now) {
    return Math.floor(now / SHADOW_WINDOW_MS);
}
/** Where a shadow is at `now`, and which way it faces (the walker's yaw convention). Null before it is born or after it has gone. */
export function shadowAt(shadow, now) {
    if (now < shadow.bornAt || now > shadow.goneAt)
        return null;
    const { cx, cz, rx, rz, speed, phase, turn } = shadow.path;
    const angle = phase + turn * speed * (now - shadow.bornAt) / 1000;
    const x = cx + rx * Math.cos(angle);
    const z = cz + rz * Math.sin(angle);
    // The tangent of the loop, the way it is swimming.
    const dx = -rx * Math.sin(angle) * turn;
    const dz = rz * Math.cos(angle) * turn;
    const heading = Math.atan2(-dx, -dz);
    // A shadow fades in over its first four seconds and out over its last four.
    const fade = Math.min(1, (now - shadow.bornAt) / 4000, (shadow.goneAt - now) / 4000);
    return Object.freeze({ x, z, heading, fade: Math.max(0, fade) });
}
/** The shadow a lure landing here (at `now`) is close enough to, the nearest, or null. */
export function shadowInReach(shadows, point, now, reach = SHADOW_REACH) {
    let best = null;
    let bestDistance = Infinity;
    for (const shadow of shadows) {
        const at = shadowAt(shadow, now);
        if (!at)
            continue;
        const distance = Math.hypot(at.x - point.x, at.z - point.z);
        if (distance <= reach && distance < bestDistance) {
            best = shadow;
            bestDistance = distance;
        }
    }
    return best;
}
function loopInside(box, random) {
    const width = box.maxX - box.minX;
    const depth = box.maxZ - box.minZ;
    const rx = Math.max(0.4, Math.min(3.2, width / 2 - 0.3) * (0.4 + random() * 0.6));
    const rz = Math.max(0.4, Math.min(3.2, depth / 2 - 0.3) * (0.4 + random() * 0.6));
    const cx = box.minX + rx + random() * Math.max(0, width - rx * 2);
    const cz = box.minZ + rz + random() * Math.max(0, depth - rz * 2);
    // About a metre every two seconds round the loop, whatever its size.
    const speed = (0.35 + random() * 0.3) / Math.max(rx, rz);
    return Object.freeze({ cx, cz, rx, rz, speed, phase: random() * Math.PI * 2, turn: random() < 0.5 ? 1 : -1 });
}
/**
 * Every shadow in one window. Two streams: `paths` for where each shadow swims
 * and when (anyone could know it), `fish` for what each one is (the server
 * seeds it from a secret and the window's number, so no one can read the fish
 * ahead of time). Draws are made in a fixed order, so the same seeds always
 * make the same shadows.
 */
export function generateShadows(window, paths, fish) {
    const start = window * SHADOW_WINDOW_MS;
    const out = [];
    for (const zone of ["lagoon", "reef", "deep"]) {
        const waters = SHADOW_WATERS[zone];
        for (let slot = 0; slot < SHADOWS_PER_ZONE[zone]; slot += 1) {
            const box = waters[Math.floor(paths() * waters.length) % waters.length];
            const path = loopInside(box, paths);
            const bite = rollBite(zone, null, "shadow", fish);
            const species = findFishSpecies(bite.speciesId);
            const lengthMm = lengthMmForWeight(species, weightGramsAtRank(species, bite.rank));
            const bornAt = start + Math.floor(paths() * SHADOW_WINDOW_MS * 0.35);
            const goneAt = Math.min(start + SHADOW_WINDOW_MS * 1.3, bornAt + SHADOW_WINDOW_MS * (0.55 + paths() * 0.45));
            out.push(Object.freeze({
                id: `s${window}-${zone}-${slot}`,
                zone,
                size: shadowSizeForLength(lengthMm),
                fin: species.rarity === "epic" || species.rarity === "legendary",
                path,
                bornAt,
                goneAt,
                speciesId: bite.speciesId,
                rank: bite.rank,
                variant: bite.variant,
            }));
        }
    }
    return out;
}
/** Strip a shadow down to what anyone may be shown. */
export function publicShadow(shadow) {
    return Object.freeze({ id: shadow.id, zone: shadow.zone, size: shadow.size, fin: shadow.fin, path: shadow.path, bornAt: shadow.bornAt, goneAt: shadow.goneAt });
}
const SHADOW_ID = /^s(\d{1,12})-(lagoon|reef|deep)-(\d{1,2})$/;
/** A public shadow as the server sent it, or null when it is not shaped like one. */
export function normalizePublicShadow(value) {
    const source = value && typeof value === "object" ? value : null;
    if (!source || typeof source.id !== "string" || !SHADOW_ID.test(source.id))
        return null;
    const zone = SHADOW_ID.exec(source.id)[2];
    const size = SHADOW_SIZES.includes(source.size) ? source.size : "m";
    const path = source.path ?? {};
    const numbers = ["cx", "cz", "rx", "rz", "speed", "phase"].map((key) => Number(path[key]));
    if (numbers.some((entry) => !Number.isFinite(entry)))
        return null;
    const [cx, cz, rx, rz, speed, phase] = numbers;
    const bornAt = Number(source.bornAt);
    const goneAt = Number(source.goneAt);
    if (!Number.isFinite(bornAt) || !Number.isFinite(goneAt))
        return null;
    return Object.freeze({
        id: source.id, zone, size, fin: Boolean(source.fin),
        path: Object.freeze({ cx, cz, rx, rz, speed, phase, turn: path.turn === -1 ? -1 : 1 }),
        bornAt, goneAt,
    });
}
const NEED_PART = /^(species|zone|rarity|size)=([a-z0-9.-]+)$/;
const ZONES = ["lagoon", "reef", "deep"];
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary"];
export function parseFishNeed(key) {
    if (typeof key !== "string" || !key || key.length > 60)
        return null;
    const need = {};
    for (const part of key.split(",")) {
        const match = NEED_PART.exec(part);
        if (!match)
            return null;
        const [, field, value] = match;
        if (field === "species" && findFishSpecies(value) && !need.species)
            need.species = value;
        else if (field === "zone" && ZONES.includes(value) && !need.zone)
            need.zone = value;
        else if (field === "rarity" && RARITIES.includes(value) && !need.rarity)
            need.rarity = value;
        else if (field === "size" && SIZE_CLASSES.includes(value) && !need.size)
            need.size = value;
        else
            return null;
    }
    if (!need.species && !need.zone && !need.rarity)
        return null;
    return Object.freeze(need);
}
export function fishMeetsNeed(need, speciesId, sizeClass) {
    const species = findFishSpecies(speciesId);
    if (!species)
        return false;
    if (need.species && need.species !== speciesId)
        return false;
    if (need.zone && !species.zones.includes(need.zone))
        return false;
    if (need.rarity && RARITIES.indexOf(species.rarity) < RARITIES.indexOf(need.rarity))
        return false;
    if (need.size && SIZE_CLASSES.indexOf(sizeClass) < SIZE_CLASSES.indexOf(need.size))
        return false;
    return true;
}
export function fishForNeed(need) {
    return FISH_CATALOG.filter((species) => fishMeetsNeed(need, species.id, "record"));
}
const SIZE_RANK = Object.freeze({ tiny: 0.05, small: 0.2, average: 0.5, large: 0.85, trophy: 0.975, record: 0.998 });
/** One fish meeting a need, at its cheapest (the least valuable species, the smallest size allowed, Normal, ordinary colour). */
export function fishNeedValue(need) {
    const rank = need.size ? SIZE_RANK[need.size] : 0.5;
    const values = fishForNeed(need).map((species) => fishValue(species.id, weightGramsAtRank(species, rank), "normal", "normal"));
    return values.length ? Math.min(...values) : 0;
}
/** "Koi", "Lagoon fish", "Rare fish or better", "Large Reef fish". */
export function fishNeedTitle(need) {
    const size = need.size && need.size !== "tiny" ? `${SIZE_TITLES[need.size]}${need.size === "record" || need.size === "trophy" ? "" : "+"} ` : "";
    if (need.species)
        return `${size}${findFishSpecies(need.species)?.title ?? need.species}`;
    if (need.zone)
        return `${size}${need.zone === "lagoon" ? "Lagoon" : need.zone === "reef" ? "Reef" : "Deep"} fish`;
    const rarity = need.rarity;
    return `${size}${rarity === "common" ? "Any fish" : `${rarity[0].toUpperCase()}${rarity.slice(1)} fish${rarity === "legendary" ? "" : " or better"}`}`;
}
/** A fish that stands for a need on a card: the named species, or the plainest that would do. */
export function fishNeedPortraitSpecies(need) {
    if (need.species)
        return need.species;
    const options = fishForNeed(need);
    return (options.find((species) => species.rarity === (need.rarity ?? species.rarity)) ?? options[0])?.id ?? "fish.goldfish";
}
/** Pick `count` fish for a need, the least valuable first, never a locked one; null when the creel cannot cover it. */
export function pickFishForNeed(creel, need, count, taken = new Set()) {
    const fits = creel
        .filter((fish) => !fish.locked && !taken.has(fish.id) && fishMeetsNeed(need, fish.speciesId, fish.sizeClass))
        .slice()
        .sort((left, right) => left.value - right.value);
    return fits.length >= count ? fits.slice(0, count) : null;
}
/** How many fish in a creel could go toward a need (unlocked, meeting it). */
export function fishHeldForNeed(creel, need, taken = new Set()) {
    return creel.filter((fish) => !fish.locked && !taken.has(fish.id) && fishMeetsNeed(need, fish.speciesId, fish.sizeClass)).length;
}
