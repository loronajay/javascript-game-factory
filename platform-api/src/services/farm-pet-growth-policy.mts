// Server mirror of the farm's pet stat progression (`js/farm-pet-growth.mts`).
//
// Stats used to be pinned outright at the trust boundary. Now they grow, so
// the server pins what was ROLLED — potential grade, per-stat base and rates —
// and bounds what was EARNED: `gained` may never exceed what the pinned rates
// could have produced by the pet's age under perfect care, and the visible
// `stats` are recomputed here from base + gained + palette bonus, never taken
// from the client. Same standing as the rest of the farm (a plausibility gate
// over client-advanced care, not a replayed simulation).
//
// The maths below must match the client module; a parity test in
// `tests/farm-pet-growth-policy.test.mjs` imports both and compares them.

type Range = Readonly<{ min: number; max: number }>;
/** The slice of a `FARM_SPECIES` row this policy reads; passed in so the catalogs import this file, not the reverse. */
export type GrowthSpeciesRow = Readonly<{ id: string; speed: Range; strength: Range; palettes: readonly Readonly<{ id: string }>[] }>;
type StatPair = { speed: number; strength: number };
type Tier = "classic" | "uncommon" | "rare" | "super-rare";

const GRADES = Object.freeze([
  Object.freeze({ id: "steady", multiplier: 1 }),
  Object.freeze({ id: "gifted", multiplier: 1.35 }),
  Object.freeze({ id: "exceptional", multiplier: 1.8 }),
  Object.freeze({ id: "prodigy", multiplier: 2.5 }),
]);
const GRADE_WEIGHTS: Readonly<Record<Tier, readonly number[]>> = Object.freeze({
  classic: [72, 21, 6, 1], uncommon: [64, 26, 8, 2], rare: [45, 33, 17, 5], "super-rare": [25, 35, 28, 12],
});
const STAGES = Object.freeze([{ id: "youth", until: 0.4, weight: 1.2 }, { id: "adult", until: 0.75, weight: 0.8 }, { id: "elder", until: Infinity, weight: 0 }]);
const FAST_GROWER_YOUTH_BONUS = 1.25;
const GROWTH_BUDGET_SHARE = 0.9;
const RATE_JITTER = Object.freeze({ min: 0.85, max: 1.15 });
const MAX_CARE_MULTIPLIER = 1.3 * 1.3;
const STAT_CEILING = 100;
const TIERS: readonly Tier[] = Object.freeze(["classic", "uncommon", "rare", "super-rare"]);

/** Species lifespans, mirrored from the client care catalog (`maxLifeDays`). */
export const FARM_PET_LIFESPANS: Readonly<Record<string, number>> = Object.freeze({
  "pet.corgi": 100, "pet.duck": 80, "pet.red-panda": 90, "pet.platypus": 100, "pet.hippo": 140,
  "pet.rhino": 130, "pet.bat": 90, "pet.shark": 150, "pet.anglerfish": 110, "pet.jellyfish": 70,
});

const unit = (value: number): number => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const round = (value: number, places: number): number => Number(value.toFixed(places));
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function growthStageDays(fromAge: number, toAge: number, maxLifeDays: number, fastGrower: boolean): number {
  if (!(toAge > fromAge) || !(maxLifeDays > 0)) return 0;
  let total = 0;
  let start = 0;
  for (const stage of STAGES) {
    const end = stage.until * maxLifeDays;
    const overlap = Math.min(toAge, end) - Math.max(fromAge, start);
    if (overlap > 0) total += overlap * stage.weight * (fastGrower && stage.id === "youth" ? FAST_GROWER_YOUTH_BONUS : 1);
    start = end;
  }
  return total;
}

export function baseGrowthRate(range: Range, maxLifeDays: number): number {
  const lifetime = growthStageDays(0, maxLifeDays, maxLifeDays, false);
  return lifetime > 0 ? Math.max(0, range.max - range.min) * GROWTH_BUDGET_SHARE / lifetime : 0;
}

export function maxGrowthRate(range: Range, maxLifeDays: number): number {
  return baseGrowthRate(range, maxLifeDays) * GRADES[GRADES.length - 1]!.multiplier * RATE_JITTER.max;
}

export function maxGainedByAge(rate: number, ageDays: number, maxLifeDays: number): number {
  return rate * growthStageDays(0, ageDays, maxLifeDays, true) * MAX_CARE_MULTIPLIER;
}

export function paletteTier(species: GrowthSpeciesRow | null, paletteId: unknown): Tier {
  const index = species?.palettes.findIndex((palette) => palette.id === paletteId) ?? -1;
  return TIERS[index] ?? "classic";
}

/** Adoption roll, consuming random values in the client's order: grade, speed jitter, strength jitter. */
export function rollFarmPetGrowth(species: GrowthSpeciesRow | null, base: StatPair, tier: Tier, random: () => number): any | null {
  const life = species ? FARM_PET_LIFESPANS[species.id] : undefined;
  if (!species || !life) return null;
  const weights = GRADE_WEIGHTS[tier] ?? GRADE_WEIGHTS.classic;
  let roll = unit(random()) * weights.reduce((sum, weight) => sum + weight, 0);
  let grade = GRADES[0]!;
  for (let index = 0; index < GRADES.length; index += 1) {
    roll -= weights[index] ?? 0;
    if (roll < 0) { grade = GRADES[index]!; break; }
  }
  const rate = (range: Range) => round(baseGrowthRate(range, life) * grade.multiplier * (RATE_JITTER.min + (RATE_JITTER.max - RATE_JITTER.min) * unit(random())), 5);
  return {
    grade: grade.id,
    base: { speed: round(base.speed, 5), strength: round(base.strength, 5) },
    rates: { speed: rate(species.speed), strength: rate(species.strength) },
    gained: { speed: 0, strength: 0 },
    rapport: 50, treatDay: 0, treats: { pet: 0, carry: 0, play: 0, feed: 0 },
  };
}

/** Shape-only bounds for a submitted growth object (species rules come in `pinFarmPetGrowth`). */
export function normalizeFarmPetGrowthShape(value: any): any | null {
  if (!value || typeof value !== "object") return null;
  const pair = (raw: any, max: number) => ({
    speed: clamp(finite(raw?.speed) ?? 0, 0, max),
    strength: clamp(finite(raw?.strength) ?? 0, 0, max),
  });
  const treats = value.treats && typeof value.treats === "object" ? value.treats : {};
  const count = (raw: unknown) => Math.floor(clamp(finite(raw) ?? 0, 0, 99));
  return {
    grade: GRADES.some((grade) => grade.id === value.grade) ? value.grade : "steady",
    base: pair(value.base, 100),
    rates: pair(value.rates, 10),
    gained: pair(value.gained, 100),
    rapport: clamp(finite(value.rapport) ?? 50, 0, 100),
    treatDay: Math.floor(clamp(finite(value.treatDay) ?? 0, 0, 1e7)),
    treats: { pet: count(treats.pet), carry: count(treats.carry), play: count(treats.play), feed: count(treats.feed) },
  };
}

/**
 * Merge a submitted profile's growth onto the stored one. The roll (grade,
 * base, rates) comes from the stored profile when it has one; a pet stored
 * before progression existed is seeded from its stored stats and the client's
 * rates, bounded by the species. Returns `{ growth, stats }` or null when this
 * pet has no growth to speak of (left exactly as before).
 */
export function pinFarmPetGrowth(species: GrowthSpeciesRow | null, submitted: any, stored: any): { growth: any; stats: StatPair } | null {
  const life = species ? FARM_PET_LIFESPANS[species.id] : undefined;
  const incoming = normalizeFarmPetGrowthShape(submitted?.growth);
  if (!species || !life || !incoming) return null;
  const bonus = clamp(finite(stored?.paletteBonus) ?? 0, 0, 0.5);
  const ageDays = clamp(finite(submitted?.ageDays) ?? 0, 0, life);
  const pinned = normalizeFarmPetGrowthShape(stored?.growth);
  const growth: any = { ...incoming, base: {}, rates: {}, gained: {} };
  for (const id of ["speed", "strength"] as const) {
    const range = species[id];
    const maxRate = maxGrowthRate(range, life);
    const storedStat = finite(stored?.stats?.[id]);
    const base = pinned ? pinned.base[id] : storedStat !== null ? storedStat / (1 + bonus) : incoming.base[id];
    growth.base[id] = round(clamp(base, range.min, range.max), 5);
    growth.rates[id] = Math.min(maxRate, round(clamp(pinned ? pinned.rates[id] : incoming.rates[id], 0, maxRate), 5));
    const ceiling = Math.max(0, STAT_CEILING / (1 + bonus) - growth.base[id]);
    const cap = Math.min(ceiling, maxGainedByAge(growth.rates[id], ageDays, life));
    growth.gained[id] = Math.min(cap, round(clamp(incoming.gained[id], 0, cap), 4));
  }
  if (pinned) growth.grade = pinned.grade;
  const stat = (id: "speed" | "strength") => round(Math.min(STAT_CEILING, (growth.base[id] + growth.gained[id]) * (1 + bonus)), 1);
  return { growth, stats: { speed: stat("speed"), strength: stat("strength") } };
}
