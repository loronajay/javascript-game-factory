// Livestock care: hunger, the goods an animal is working up to, and neglect.
//
// Pure — no THREE, no DOM, no clock of its own — and the same rule, line for
// line, as `platform-api/src/services/farm-livestock-catalog.mts` (a test
// holds them equal). The SERVER decides: it advances every animal to the
// farm's verified clock before a feed, a collection or a checkup, and it is
// the one that marks a death. This copy lets the page show the same numbers
// between those moments without asking.
//
// CARE IS A CHECKPOINT AND A STRAIGHT LINE. A row stores its hunger at a
// farm minute (`at`); between checkpoints hunger falls in a straight line at
// the animal's own rate, so everything that happened in between can be
// worked out exactly from the two ends:
//
//   · how long it was WELL FED (hunger above `HUNGRY_AT`) — the only time its
//     goods come along, and only once it is grown;
//   · how long it was HUNGRY while grown — stress, which costs its goods a grade;
//   · the minute its hunger reached nothing — `starvedAt`. A whole farm day
//     starving and it dies, the pets' rule;
//   · how long it has been hungry over its whole life, at any age —
//     `neglect`, which grades its meat at the Butcher;
//   · how far a mother has carried her young (`pregnancy`, Phase 5) — only
//     well-fed time counts, the goods' rule — and the minute it came due.
//
// The farm clock only runs while the owner plays or naps, so nothing here
// happens while the farm is away.

import { LIVESTOCK_STATS, STAT_MAX, STAT_MIN, findLivestockSpecies, type LivestockProduct, type LivestockSpecies, type LivestockStats } from "./farm-catalog/livestock.mjs";
import { DAY_MINUTES } from "./farm-time.mjs";

/**
 * A mother carrying a young one (Phase 5). The sire is remembered as he was
 * the day they were paired — his stats are half of what the young one gets —
 * so selling or losing him later changes nothing. `progress` is well-fed
 * minutes carried; `dueAt` is the farm minute it reached the species'
 * gestation, and stays set while she waits for a free place to give birth in.
 */
export type LivestockPregnancy = Readonly<{
  sireId: string;
  sireName: string;
  sireStats: LivestockStats;
  sireCoatId: string;
  conceivedAt: number;
  progress: number;
  dueAt: number | null;
}>;

export type LivestockCare = Readonly<{
  /** 0–100 at `at`. */
  hunger: number;
  /** The farm minute `hunger` was true at. */
  at: number;
  /** The farm minute hunger reached 0 and stayed there, or null while it has food in it. */
  starvedAt: number | null;
  /** Minutes of well-fed, grown time toward each good, by basket id; a good is ready at its cycle. */
  progress: Readonly<Record<string, number>>;
  /** Minutes grown and hungry since each good was last collected. */
  stress: Readonly<Record<string, number>>;
  /** Lifetime minutes spent hungry (at or below `HUNGRY_AT`), at any age: the Butcher grades the meat by it. */
  neglect: number;
  /** The young one she carries, or null. */
  pregnancy: LivestockPregnancy | null;
  /** She rests after a birth: no pairing before this farm minute. */
  restUntil: number;
}>;

export type CareSubject = Readonly<{ speciesId: string; stats: LivestockStats; bornAt: number }>;

/** Hunger a Hardiness-50 animal loses in a farm day: the pets' rate. */
export const HUNGER_PER_DAY = 25;
/** Hardiness 100 gets hungry at 70% of that, Hardiness 1 at 130%. */
export const HARDINESS_SPREAD = 0.6;
/** One serving of feed or one crop. */
export const SERVING = 35;
export const FULL = 100;
/** At or below this it is Hungry: its goods stop coming and stress starts. */
export const HUNGRY_AT = 40;
/** A whole farm day at nothing and it dies. */
export const STARVE_GRACE_MINUTES = DAY_MINUTES;
/** One more of a good for every this much Yield. */
export const YIELD_STEP = 40;
/** What stress costs a good's grade, at a whole cycle of it. */
export const STRESS_WEIGHT = 60;
/** The grade a good's score earns: at least this for each. */
export const GOOD_GRADE_SCORES = Object.freeze({ perfect: 70, fine: 45, normal: 20 } as const);

export type GoodQuality = "poor" | "normal" | "fine" | "perfect";

/** A freshly arrived animal: fed, nothing owed, from the minute given. */
export function newLivestockCare(at: number): LivestockCare {
  return Object.freeze({ hunger: FULL, at: Math.max(0, at), starvedAt: null, progress: Object.freeze({}), stress: Object.freeze({}), neglect: 0, pregnancy: null, restUntil: 0 });
}

/** Hunger lost per farm minute for this individual. */
export function hungerPerMinute(stats: LivestockStats): number {
  return (HUNGER_PER_DAY * (1 + HARDINESS_SPREAD * (0.5 - stats.hardiness / STAT_MAX))) / DAY_MINUTES;
}

/** Growth 50 grows up in the species' `adultDays`; Growth 100 in 70% of it, Growth 1 in 130%. */
export const GROWTH_SPREAD = 0.6;

/** Farm days from birth to grown for this individual. */
export function adultAgeDays(species: Pick<LivestockSpecies, "adultDays">, stats: LivestockStats): number {
  return species.adultDays * (1 + GROWTH_SPREAD * (0.5 - stats.growth / STAT_MAX));
}

/** The farm minute it is grown (its goods only come once it is). */
export function adultMinute(subject: CareSubject, species: LivestockSpecies): number {
  return subject.bornAt + adultAgeDays(species, subject.stats) * DAY_MINUTES;
}

export function goodCycleMinutes(product: Pick<LivestockProduct, "everyDays">): number {
  return product.everyDays * DAY_MINUTES;
}

function overlap(start: number, end: number, from: number): number {
  return Math.max(0, end - Math.max(start, from));
}

function finite(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

const STOCK_ID = /^stock-[A-Za-z0-9-]{8,64}$/;

function statOf(value: unknown): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(STAT_MAX, Math.max(STAT_MIN, number)) : STAT_MIN;
}

/** A stored pregnancy made safe, or null when it is not one. */
export function normalizeLivestockPregnancy(value: unknown): LivestockPregnancy | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, any>;
  const sireId = typeof source.sireId === "string" && STOCK_ID.test(source.sireId) ? source.sireId : "";
  if (!sireId) return null;
  const stats = source.sireStats && typeof source.sireStats === "object" ? source.sireStats : {};
  const due = source.dueAt === null || source.dueAt === undefined ? null : Math.max(0, finite(source.dueAt));
  return Object.freeze({
    sireId,
    sireName: typeof source.sireName === "string" ? source.sireName.slice(0, 40) : "",
    sireStats: Object.freeze(Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, statOf(stats[key])]))) as LivestockStats,
    sireCoatId: typeof source.sireCoatId === "string" ? source.sireCoatId.slice(0, 40) : "",
    conceivedAt: Math.max(0, finite(source.conceivedAt)),
    progress: Math.max(0, finite(source.progress)),
    dueAt: due,
  });
}

/** A stored care record made safe; a missing one is a fed animal from `fallbackAt`. */
export function normalizeLivestockCare(value: unknown, fallbackAt: number): LivestockCare {
  if (!value || typeof value !== "object") return newLivestockCare(fallbackAt);
  const source = value as Record<string, any>;
  const minutes = (table: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    if (table && typeof table === "object") {
      for (const [id, raw] of Object.entries(table as Record<string, unknown>).slice(0, 8)) {
        if (/^[a-z0-9-]{1,40}$/.test(id)) out[id] = Math.max(0, finite(raw));
      }
    }
    return out;
  };
  const starved = source.starvedAt === null || source.starvedAt === undefined ? null : Math.max(0, finite(source.starvedAt));
  return Object.freeze({
    hunger: Math.min(FULL, Math.max(0, finite(source.hunger, FULL))),
    at: Math.max(0, finite(source.at, fallbackAt)),
    starvedAt: starved,
    progress: Object.freeze(minutes(source.progress)),
    stress: Object.freeze(minutes(source.stress)),
    neglect: Math.max(0, finite(source.neglect)),
    pregnancy: normalizeLivestockPregnancy(source.pregnancy),
    restUntil: Math.max(0, finite(source.restUntil)),
  });
}

/**
 * Care carried to farm minute `now`. A clock behind the checkpoint changes
 * nothing (time never runs backwards on an animal). Goods fill only while it
 * is grown and well fed, and stop at their cycle; stress counts grown hungry
 * minutes toward a good not yet ready.
 */
export function advanceLivestockCare(subject: CareSubject, care: LivestockCare, now: number): LivestockCare {
  const species = findLivestockSpecies(subject.speciesId);
  if (!species || !(now > care.at)) return care;
  const start = care.at;
  const end = now;
  const rate = hungerPerMinute(subject.stats);
  const wellUntil = Math.min(end, care.hunger > HUNGRY_AT ? start + (care.hunger - HUNGRY_AT) / rate : start);
  const grownFrom = adultMinute(subject, species);
  const well = overlap(start, wellUntil, grownFrom);
  const hungry = overlap(Math.max(start, wellUntil), end, grownFrom);
  const progress: Record<string, number> = { ...care.progress };
  const stress: Record<string, number> = { ...care.stress };
  for (const product of species.products) {
    const cycle = goodCycleMinutes(product);
    const before = progress[product.itemId] ?? 0;
    if (before < cycle) stress[product.itemId] = Math.min(cycle, (stress[product.itemId] ?? 0) + hungry);
    progress[product.itemId] = Math.min(cycle, before + well);
  }
  const hunger = Math.max(0, care.hunger - rate * (end - start));
  const emptyAt = start + care.hunger / rate;
  const starvedAt = hunger > 0 ? null : care.starvedAt ?? Math.min(end, emptyAt);
  const neglect = care.neglect + Math.max(0, end - Math.max(start, wellUntil));
  const pregnancy = carryPregnancy(care.pregnancy, gestationMinutes(species), Math.max(start, grownFrom), well);
  return Object.freeze({ ...care, hunger, at: end, starvedAt, progress: Object.freeze(progress), stress: Object.freeze(stress), neglect, pregnancy });
}

/** Well-fed farm minutes a mother of this species carries a young one. */
export function gestationMinutes(species: Pick<LivestockSpecies, "gestationDays">): number {
  return species.gestationDays * DAY_MINUTES;
}

/**
 * A pregnancy carried over `well` well-fed minutes that began at `from` (the
 * well-fed stretch is one unbroken run, so the minute it came due is exact).
 * One already due is left as it is.
 */
function carryPregnancy(pregnancy: LivestockPregnancy | null, gestation: number, from: number, well: number): LivestockPregnancy | null {
  if (!pregnancy || pregnancy.dueAt !== null || !(well > 0)) return pregnancy;
  const reached = pregnancy.progress + well >= gestation;
  return Object.freeze({
    ...pregnancy,
    progress: Math.min(gestation, pregnancy.progress + well),
    dueAt: reached ? from + Math.max(0, gestation - pregnancy.progress) : null,
  });
}

/** The farm minute it dies of neglect if nobody feeds it, or null while it has food in it. */
export function livestockDeathMinute(subject: CareSubject, care: LivestockCare): number | null {
  if (care.hunger > 0 && care.starvedAt === null) {
    return care.at + care.hunger / hungerPerMinute(subject.stats) + STARVE_GRACE_MINUTES;
  }
  return (care.starvedAt ?? care.at) + STARVE_GRACE_MINUTES;
}

/** Due to die by `now`? (The server is the one that marks it.) */
export function livestockDueToDie(subject: CareSubject, care: LivestockCare, now: number): boolean {
  return (livestockDeathMinute(subject, care) ?? Infinity) <= now;
}

/** One serving: hunger up by `SERVING`, never past full, and a starving animal is no longer starving. */
export function feedLivestockCare(care: LivestockCare): LivestockCare {
  const hunger = Math.min(FULL, care.hunger + SERVING);
  return Object.freeze({ ...care, hunger, starvedAt: hunger > 0 ? null : care.starvedAt });
}

/** Whether a serving would do anything: a full animal is not fed (nothing is used). */
export function wantsFood(care: LivestockCare): boolean {
  return care.hunger < FULL - 0.5;
}

/** How many of a good one collection gives, from Yield. */
export function goodsPerCollection(stats: LivestockStats): number {
  return 1 + Math.floor(stats.yield / YIELD_STEP);
}

/** A good's grade: the Quality stat, less what hunger took out of this cycle. */
/** Husbandry XP a collection earns per farm day of its good's cycle — the rate a crop pays Farming per growing day. */
export const HUSBANDRY_XP_PER_CYCLE_DAY = 60;

/** A collection's Husbandry XP: the cycle in farm days, less the share of it spent hungry, never below one. The server pays it. */
export function livestockCollectXp(product: Pick<LivestockProduct, "everyDays">, stressMinutes: number): number {
  const cycle = goodCycleMinutes(product);
  const share = Math.min(1, Math.max(0, Number(stressMinutes) || 0) / Math.max(1, cycle));
  return Math.max(1, Math.round(HUSBANDRY_XP_PER_CYCLE_DAY * product.everyDays * (1 - share)));
}

export function goodQuality(stats: LivestockStats, stressMinutes: number, cycleMinutes: number): GoodQuality {
  const score = stats.quality - STRESS_WEIGHT * Math.min(1, Math.max(0, stressMinutes) / Math.max(1, cycleMinutes));
  if (score >= GOOD_GRADE_SCORES.perfect) return "perfect";
  if (score >= GOOD_GRADE_SCORES.fine) return "fine";
  if (score >= GOOD_GRADE_SCORES.normal) return "normal";
  return "poor";
}

/** Each good's state: how far along (0–1) and whether it can be collected now. */
export function goodsState(subject: CareSubject, care: LivestockCare): ReadonlyArray<Readonly<{ product: LivestockProduct; fraction: number; ready: boolean; quality: GoodQuality }>> {
  const species = findLivestockSpecies(subject.speciesId);
  if (!species) return [];
  return species.products.map((product) => {
    const cycle = goodCycleMinutes(product);
    const done = care.progress[product.itemId] ?? 0;
    return Object.freeze({ product, fraction: Math.min(1, done / cycle), ready: done >= cycle, quality: goodQuality(subject.stats, care.stress[product.itemId] ?? 0, cycle) });
  });
}

/** A good collected: its progress and stress start again. */
export function collectedCare(care: LivestockCare, itemId: string): LivestockCare {
  return Object.freeze({
    ...care,
    progress: Object.freeze({ ...care.progress, [itemId]: 0 }),
    stress: Object.freeze({ ...care.stress, [itemId]: 0 }),
  });
}

export type LivestockNeed = Readonly<{ stage: "fed" | "hungry" | "starving"; label: string }>;

/** The words the panel and the prompt use. */
export function livestockNeed(subject: CareSubject, care: LivestockCare, now: number): LivestockNeed {
  if (care.hunger > HUNGRY_AT) return Object.freeze({ stage: "fed", label: "Well fed" });
  if (care.hunger > 0) return Object.freeze({ stage: "hungry", label: "Hungry" });
  const dies = livestockDeathMinute(subject, care) ?? now;
  const hours = Math.max(0, Math.ceil((dies - now) / 60));
  return Object.freeze({ stage: "starving", label: `Starving · life at risk (${hours} h)` });
}
