// Server mirror of the horse's rules (planning-docs/FARM_RIDING_PLAN.md):
// its riding stats (`js/farm-horse-riding.mts`) and Hollis's daily paddock
// (`js/farm-horse-stock.mts`). The server DECIDES — it rolls the horse it
// sells from the day's seed, checks the Riding level for its grade, charges
// the price, and pins the riding block on every save — and a parity test holds
// the two sides equal.
//
// No import of the economy catalog (it imports this file for the roll); the
// db layer puts the two together to roll a stock horse.

import { baseGrowthRate, maxGrowthRate } from "./farm-pet-growth-policy.mjs";

export const FARM_HORSE_SPECIES_ID = "pet.horse";
export const FARM_HORSE_LIFE_DAYS = 160;
export const FARM_HORSE_STOCK_DAY_MS = 24 * 60 * 60 * 1000;
export const FARM_HORSE_STOCK_SIZE = 3;
export const FARM_HORSE_TRAINING_CAP = 12;
export const FARM_HORSE_TRAINING_PER_DAY = 1.5;

type Range = Readonly<{ min: number; max: number }>;
const RIDING_STATS = ["stamina", "agility"] as const;
const HORSE_STATS = ["speed", "strength", "stamina", "agility"] as const;

export const FARM_HORSE_RIDING_RANGES: Readonly<Record<(typeof RIDING_STATS)[number], Range>> = Object.freeze({
  stamina: Object.freeze({ min: 30, max: 65 }),
  agility: Object.freeze({ min: 28, max: 62 }),
});

const GRADE_MULTIPLIERS: Readonly<Record<string, number>> = Object.freeze({ steady: 1, gifted: 1.35, exceptional: 1.8, prodigy: 2.5 });
const RATE_JITTER = Object.freeze({ min: 0.85, max: 1.15 });

/** Price by potential, and the Riding level Hollis sells it from (js/farm-horse-stock.mts HORSE_GRADE_RULES). */
export const FARM_HORSE_GRADE_RULES: Readonly<Record<string, Readonly<{ price: number; minRidingLevel: number }>>> = Object.freeze({
  steady: Object.freeze({ price: 2500, minRidingLevel: 1 }),
  gifted: Object.freeze({ price: 4500, minRidingLevel: 1 }),
  exceptional: Object.freeze({ price: 8000, minRidingLevel: 20 }),
  prodigy: Object.freeze({ price: 15000, minRidingLevel: 60 }),
});

const unit = (value: number): number => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const round = (value: number, places: number): number => Number(value.toFixed(places));
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const finite = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

/** The riding block, consuming four random values: stamina base, agility base, stamina jitter, agility jitter. */
export function rollFarmHorseRiding(gradeId: string, random: () => number): any {
  const multiplier = GRADE_MULTIPLIERS[gradeId] ?? 1;
  const base = (id: (typeof RIDING_STATS)[number]) => {
    const range = FARM_HORSE_RIDING_RANGES[id];
    return round(range.min + (range.max - range.min) * unit(random()), 5);
  };
  const stamina = base("stamina");
  const agility = base("agility");
  const rate = (id: (typeof RIDING_STATS)[number]) => round(baseGrowthRate(FARM_HORSE_RIDING_RANGES[id], FARM_HORSE_LIFE_DAYS) * multiplier * (RATE_JITTER.min + (RATE_JITTER.max - RATE_JITTER.min) * unit(random())), 5);
  const rates = { stamina: rate("stamina"), agility: rate("agility") };
  return {
    base: { stamina, agility },
    rates,
    trained: { speed: 0, strength: 0, stamina: 0, agility: 0 },
    trainedDay: 0,
    trainedToday: 0,
  };
}

/** Shape-bounded riding block (species bounds and training caps). */
export function normalizeFarmHorseRiding(value: any): any | null {
  if (!value || typeof value !== "object") return null;
  const base: any = {};
  const rates: any = {};
  for (const id of RIDING_STATS) {
    const range = FARM_HORSE_RIDING_RANGES[id];
    base[id] = round(clamp(finite(value.base?.[id]) ?? range.min, range.min, range.max), 5);
    const maxRate = maxGrowthRate(range, FARM_HORSE_LIFE_DAYS);
    rates[id] = Math.min(maxRate, round(clamp(finite(value.rates?.[id]) ?? 0, 0, maxRate), 5));
  }
  const trained: any = {};
  for (const id of HORSE_STATS) trained[id] = round(clamp(finite(value.trained?.[id]) ?? 0, 0, FARM_HORSE_TRAINING_CAP), 4);
  return {
    base, rates, trained,
    trainedDay: Math.floor(clamp(finite(value.trainedDay) ?? 0, 0, 1e7)),
    trainedToday: round(clamp(finite(value.trainedToday) ?? 0, 0, FARM_HORSE_TRAINING_PER_DAY), 4),
  };
}

/**
 * A save may never change a horse's riding block: it is rolled at purchase
 * and trained only by the server's verified-ride routes. The stored block is
 * kept as it is (a horse stored without one keeps none).
 */
export function pinFarmHorseRiding(stored: any): any | null {
  return normalizeFarmHorseRiding(stored);
}

/**
 * Credit a verified ride's training (js/farm-horse-riding.mts `trainHorse`):
 * the day's allowance is shared by the four stats in order, each capped for life.
 */
export function trainFarmHorse(riding: any, gains: any, farmDay: number): { riding: any; applied: Record<string, number> } {
  const day = Math.max(0, Math.floor(Number.isFinite(farmDay) ? farmDay : 0));
  const current = normalizeFarmHorseRiding(riding) ?? rollFarmHorseRiding("steady", () => 0);
  let left = FARM_HORSE_TRAINING_PER_DAY - (day === current.trainedDay ? current.trainedToday : 0);
  const trained: any = { ...current.trained };
  const applied: Record<string, number> = { speed: 0, strength: 0, stamina: 0, agility: 0 };
  for (const id of HORSE_STATS) {
    const want = Math.max(0, finite(gains?.[id]) ?? 0);
    const take = Math.max(0, Math.min(want, left, FARM_HORSE_TRAINING_CAP - trained[id]));
    trained[id] = round(trained[id] + take, 4);
    applied[id] = round(take, 4);
    left -= take;
  }
  const used = HORSE_STATS.reduce((sum, id) => sum + applied[id]!, 0);
  return {
    applied,
    riding: { ...current, trained, trainedDay: day, trainedToday: round((day === current.trainedDay ? current.trainedToday : 0) + used, 4) },
  };
}

export function farmHorseStockDay(now: number): number {
  return Math.floor(now / FARM_HORSE_STOCK_DAY_MS);
}

/** The seed text of one of the day's horses (js/farm-horse-stock.mts `horseStockSeed`). */
export function farmHorseStockSeed(day: number, slot: number): string {
  return `farm-horses:v1:${day}:${slot}`;
}

/** The ticket-ledger key that makes each of the day's horses one sale per player. */
export function farmHorseTransactionKey(day: number, slot: number): string {
  return `farm:horse:${day}:${slot}`;
}
