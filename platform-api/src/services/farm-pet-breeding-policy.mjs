// Server mirror of pet breeding (`js/farm-pet-breeding.mts`): who may be
// paired, and the roll that mints the young one. The rules and the draw order
// are the client's, line for line — `tests/farm-pet-breeding-policy.test.mjs`
// rolls both with one seeded sequence and holds them equal — but only this copy
// decides: the pairing is checked against the STORED farm, the fee is taken and
// the young one written in one transaction (`db/farm-pet-breeding.mts`).
//
// In short: one trait from each parent is guaranteed, the rest of theirs may
// follow (rare and shared ones likelier), then it rolls its own 1–3 as any
// adopted pet does; palette and potential lean toward the parents', harder when
// both parents are rare; stats lean toward the parents' average.
import { FARM_PET_TRAITS, FARM_PET_TRAIT_CONFLICTS, findFarmSpecies } from "./farm-economy-catalog.mjs";
import { FARM_PET_LIFESPANS, GRADE_WEIGHTS, farmPetGrowthForGrade, paletteTier } from "./farm-pet-growth-policy.mjs";
export const FARM_BREEDING_PRICE = 600;
export const FARM_BREED_REST_MINUTES = 5 * 24 * 60;
const BREED_MIN_HUNGER = 40;
const BREED_MIN_HAPPINESS = 50;
const MAX_TRAITS = 5;
const HORSE = "pet.horse";
const RARITY_BY_WEIGHT = Object.freeze({ 6: "common", 3: "uncommon", 1: "rare" });
const PASS_WEIGHT = Object.freeze({ common: 1, uncommon: 1.5, rare: 2 });
const SHARED_TRAIT_FACTOR = 2;
const EXTRA_TRAIT_CHANCE = Object.freeze({ common: 0.15, uncommon: 0.2, rare: 0.25 });
const PALETTE_PASS = Object.freeze({ classic: 0.1, uncommon: 0.15, rare: 0.22, "super-rare": 0.28 });
const GRADES = Object.freeze(["steady", "gifted", "exceptional", "prodigy"]);
const GRADE_PASS = Object.freeze({ steady: 0, gifted: 0.2, exceptional: 0.25, prodigy: 0.3 });
const RARE_PAIR_BONUS = 1.35;
const HERITABILITY = 0.6;
const STRONG_LINE_SHARE = 0.25;
const STRONG_LINE_BONUS = 0.1;
const SIZE = Object.freeze({ min: 0.62, adultMin: 0.9, max: 1.12 });
const SIZE_TRAIT_BAND = 0.3;
const YOUTH_UNTIL = 0.4;
/** The constants the parity test compares with the client's. */
export const FARM_BREEDING_TUNING = Object.freeze({
    price: FARM_BREEDING_PRICE, restMinutes: FARM_BREED_REST_MINUTES, minHunger: BREED_MIN_HUNGER, minHappiness: BREED_MIN_HAPPINESS,
    maxTraits: MAX_TRAITS, passWeight: PASS_WEIGHT, sharedTraitFactor: SHARED_TRAIT_FACTOR, extraTraitChance: EXTRA_TRAIT_CHANCE,
    palettePass: PALETTE_PASS, gradePass: GRADE_PASS, rarePairBonus: RARE_PAIR_BONUS, heritability: HERITABILITY,
    strongLineShare: STRONG_LINE_SHARE, strongLineBonus: STRONG_LINE_BONUS,
});
const unit = (value) => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const round = (value, places = 2) => Number(value.toFixed(places));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const rarityOf = (id) => RARITY_BY_WEIGHT[FARM_PET_TRAITS.find((row) => row.id === id)?.weight ?? 6] ?? "common";
const conflicts = (first, second) => FARM_PET_TRAIT_CONFLICTS.some(([a, b]) => (a === first && b === second) || (a === second && b === first));
const passable = (traits, held) => traits.filter((id) => !held.includes(id) && !held.some((other) => conflicts(id, other)));
const passWeight = (id, other) => PASS_WEIGHT[rarityOf(id)] * (other.includes(id) ? SHARED_TRAIT_FACTOR : 1);
const traitsOf = (profile) => (Array.isArray(profile?.traits) ? profile.traits : []).filter((id) => typeof id === "string");
function parentRefusal(pet, farmMinutes) {
    const life = FARM_PET_LIFESPANS[pet.speciesId];
    const profile = pet.profile;
    if (!profile || !life)
        return "no_profile";
    if ((finite(profile.ageDays) ?? 0) < life * YOUTH_UNTIL)
        return "not_grown";
    if ((finite(profile.hunger) ?? 0) <= BREED_MIN_HUNGER)
        return "hungry";
    if ((finite(profile.happiness) ?? 0) < BREED_MIN_HAPPINESS)
        return "unhappy";
    const bredAt = finite(pet.bredAt);
    if (bredAt !== null && bredAt + FARM_BREED_REST_MINUTES > farmMinutes)
        return "resting";
    return null;
}
/** Why this stored pair may not breed at the farm's stored clock, or null. */
export function farmBreedingRefusal(mother, father, farmMinutes, petCount, maxPets) {
    if (mother.instanceId === father.instanceId)
        return "same_pet";
    if (mother.speciesId !== father.speciesId)
        return "other_species";
    if (mother.speciesId === HORSE)
        return "not_breedable";
    if (mother.profile?.gender !== "female")
        return mother.profile ? "not_female" : "no_profile";
    if (father.profile?.gender !== "male")
        return father.profile ? "not_male" : "no_profile";
    const refusal = parentRefusal(mother, farmMinutes) ?? parentRefusal(father, farmMinutes);
    if (refusal)
        return refusal;
    return petCount >= maxPets ? "farm_full" : null;
}
function weightedPick(ids, weights, draw) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!ids.length || !(total > 0))
        return null;
    let roll = unit(draw) * total;
    for (let index = 0; index < ids.length; index += 1) {
        roll -= weights[index];
        if (roll < 0)
            return ids[index];
    }
    return ids[ids.length - 1];
}
function pairBonus(first, second, rare) {
    return rare.includes(first) && rare.includes(second) ? RARE_PAIR_BONUS : 1;
}
function parentBase(range, profile, id) {
    const bonus = clamp(finite(profile?.paletteBonus) ?? 0, 0, 0.5);
    const base = finite(profile?.growth?.base?.[id]) ?? (finite(profile?.stats?.[id]) ?? range.min) / (1 + bonus);
    return clamp(base, range.min, range.max);
}
/** Roll the young one's profile, in the client's draw order. Null for an unknown species. */
export function breedFarmPetProfile(speciesId, mother, father, random) {
    const species = findFarmSpecies(speciesId);
    if (!species || !FARM_PET_LIFESPANS[species.id])
        return null;
    const motherTraits = traitsOf(mother);
    const fatherTraits = traitsOf(father);
    const gender = unit(random()) < 0.5 ? "female" : "male";
    const rolledMax = SIZE.adultMin + (SIZE.max - SIZE.adultMin) * unit(random());
    const motherTier = paletteTier(species, mother?.paletteId);
    const fatherTier = paletteTier(species, father?.paletteId);
    const paletteBonusFactor = pairBonus(motherTier, fatherTier, ["rare", "super-rare"]);
    const motherPaletteChance = PALETTE_PASS[motherTier] * paletteBonusFactor;
    const fatherPaletteChance = PALETTE_PASS[fatherTier] * paletteBonusFactor;
    const paletteDraw = unit(random());
    const freshRoll = unit(random()) * species.palettes.reduce((sum, row) => sum + row.weight, 0);
    let cursor = 0;
    const fresh = species.palettes.find((row) => (cursor += row.weight) > freshRoll) ?? species.palettes.at(-1);
    const byId = (id) => species.palettes.find((row) => row.id === id);
    const palette = paletteDraw < motherPaletteChance ? byId(mother?.paletteId) ?? fresh
        : paletteDraw < motherPaletteChance + fatherPaletteChance ? byId(father?.paletteId) ?? fresh
            : fresh;
    const traits = [];
    const motherPool = passable(motherTraits, traits);
    const fromMother = weightedPick(motherPool, motherPool.map((id) => passWeight(id, fatherTraits)), random());
    if (fromMother)
        traits.push(fromMother);
    const fatherPool = passable(fatherTraits, traits);
    const fromFather = weightedPick(fatherPool, fatherPool.map((id) => passWeight(id, motherTraits)), random());
    if (fromFather)
        traits.push(fromFather);
    const extra = [];
    for (const row of FARM_PET_TRAITS) {
        if (traits.includes(row.id) || (!motherTraits.includes(row.id) && !fatherTraits.includes(row.id)))
            continue;
        const draw = unit(random());
        if (traits.length >= MAX_TRAITS || !passable([row.id], traits).length)
            continue;
        const chance = EXTRA_TRAIT_CHANCE[rarityOf(row.id)] * (motherTraits.includes(row.id) && fatherTraits.includes(row.id) ? SHARED_TRAIT_FACTOR : 1);
        if (draw < chance) {
            traits.push(row.id);
            extra.push(row.id);
        }
    }
    const own = 1 + Math.floor(unit(random()) * 3);
    const pool = FARM_PET_TRAITS.map((row) => ({ id: row.id, key: Math.pow(unit(random()), 1 / row.weight) })).sort((a, b) => b.key - a.key);
    let added = 0;
    for (const candidate of pool) {
        if (added >= own || traits.length >= MAX_TRAITS)
            break;
        if (!passable([candidate.id], traits).length)
            continue;
        traits.push(candidate.id);
        added += 1;
    }
    const base = { speed: 0, strength: 0 };
    for (const id of ["speed", "strength"]) {
        const range = species[id];
        const span = range.max - range.min;
        const freshStat = range.min + span * unit(random());
        const motherBase = parentBase(range, mother, id);
        const fatherBase = parentBase(range, father, id);
        const strong = Math.min(motherBase, fatherBase) >= range.max - span * STRONG_LINE_SHARE;
        base[id] = round(clamp(freshStat + ((motherBase + fatherBase) / 2 - freshStat) * HERITABILITY + (strong ? span * STRONG_LINE_BONUS : 0), range.min, range.max), 5);
    }
    const weights = GRADE_WEIGHTS[palette.tier] ?? GRADE_WEIGHTS.classic;
    let gradeRoll = unit(random()) * weights.reduce((sum, weight) => sum + weight, 0);
    let rolled = 0;
    for (let index = 0; index < GRADES.length; index += 1) {
        gradeRoll -= weights[index] ?? 0;
        if (gradeRoll < 0) {
            rolled = index;
            break;
        }
    }
    const gradeOf = (profile) => GRADES.includes(profile?.growth?.grade) ? profile.growth.grade : "steady";
    const motherGrade = gradeOf(mother);
    const fatherGrade = gradeOf(father);
    const gradeBonus = pairBonus(motherGrade, fatherGrade, ["exceptional", "prodigy"]);
    const motherGradeChance = GRADE_PASS[motherGrade] * gradeBonus;
    const fatherGradeChance = GRADE_PASS[fatherGrade] * gradeBonus;
    const gradeDraw = unit(random());
    const inherited = gradeDraw < motherGradeChance ? motherGrade : gradeDraw < motherGradeChance + fatherGradeChance ? fatherGrade : null;
    const grade = GRADES[Math.max(rolled, inherited ? GRADES.indexOf(inherited) : -1)];
    const growth = farmPetGrowthForGrade(species, base, grade, random);
    const bias = traits.map((id) => FARM_PET_TRAITS.find((row) => row.id === id)?.size).find((value) => value);
    const span = SIZE.max - SIZE.adultMin;
    const within = (rolledMax - SIZE.adultMin) / span;
    const biased = bias === "large" ? SIZE.max - span * SIZE_TRAIT_BAND * (1 - within)
        : bias === "small" ? SIZE.adultMin + span * SIZE_TRAIT_BAND * within
            : rolledMax;
    const maxSize = round(biased);
    const current = round(SIZE.min);
    const stat = (value) => round(Math.min(100, value * (1 + palette.statBoost)), 1);
    return {
        inherited: { fromMother, fromFather, extra },
        profile: {
            gender, ageDays: 0,
            size: { current, max: maxSize, growthPerDay: round((maxSize - current) / 70, 4) },
            affection: 50, hunger: 100, starvingMinutes: 0, happiness: 100,
            stats: { speed: stat(base.speed), strength: stat(base.strength) },
            traits, milestones: [], paletteId: palette.id, paletteBonus: palette.statBoost,
            growth,
        },
    };
}
/** A young one's lineage: its parents by id and name, one generation past the elder of them (adopted = 1). */
export function farmPetLineage(mother, father) {
    const generation = (pet) => Math.floor(clamp(finite(pet?.lineage?.generation) ?? 1, 1, 998));
    return {
        mother: { id: mother.instanceId, name: String(mother.name ?? "").slice(0, 20) },
        father: { id: father.instanceId, name: String(father.name ?? "").slice(0, 20) },
        generation: Math.max(generation(mother), generation(father)) + 1,
    };
}
/** Shape-only bounds for a stored lineage block. */
export function normalizeFarmPetLineage(value) {
    if (!value || typeof value !== "object")
        return null;
    const parent = (raw) => raw && typeof raw === "object" && typeof raw.id === "string" && /^[a-z0-9-]{1,40}$/.test(raw.id)
        ? { id: raw.id, name: typeof raw.name === "string" ? raw.name.replace(/[<>]/g, "").slice(0, 20) : "" }
        : null;
    const mother = parent(value.mother);
    const father = parent(value.father);
    if (!mother || !father)
        return null;
    return { mother, father, generation: Math.floor(clamp(finite(value.generation) ?? 2, 2, 999)) };
}
