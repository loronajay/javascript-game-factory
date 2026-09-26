// The server's copy of what each crop takes to grow and what it yields. It
// mirrors js/farm-crops.mts (tests/farm-crop-catalog.test.mjs holds the two
// together), because a harvest is decided HERE: the client names a cell, the
// server decides whether it is ripe and how much it pays.

const DAY = 24 * 60;

export const FARM_CROP_RULES: Readonly<Record<string, Readonly<{ growMinutes: number; yield: number }>>> = Object.freeze({
  bean: Object.freeze({ growMinutes: 3 * DAY, yield: 4 }),
  beetroot: Object.freeze({ growMinutes: 2 * DAY, yield: 3 }),
  blueberry: Object.freeze({ growMinutes: 4 * DAY, yield: 6 }),
  cabbage: Object.freeze({ growMinutes: 3 * DAY, yield: 2 }),
  carrot: Object.freeze({ growMinutes: 2 * DAY, yield: 3 }),
  cauliflower: Object.freeze({ growMinutes: 4 * DAY, yield: 2 }),
  corn: Object.freeze({ growMinutes: 3.5 * DAY, yield: 2 }),
  eggplant: Object.freeze({ growMinutes: 3.5 * DAY, yield: 3 }),
  garlic: Object.freeze({ growMinutes: 2.5 * DAY, yield: 4 }),
  potato: Object.freeze({ growMinutes: 3.5 * DAY, yield: 5 }),
  pumpkin: Object.freeze({ growMinutes: 4 * DAY, yield: 1 }),
  radish: Object.freeze({ growMinutes: 2 * DAY, yield: 3 }),
  strawberry: Object.freeze({ growMinutes: 2.5 * DAY, yield: 5 }),
  sunflower: Object.freeze({ growMinutes: 4 * DAY, yield: 1 }),
  tomato: Object.freeze({ growMinutes: 3 * DAY, yield: 4 }),
  watermelon: Object.freeze({ growMinutes: 4 * DAY, yield: 1 }),
});

export const MAX_CARE_PENALTY = 0.6;

export function farmCropRule(cropId: unknown): Readonly<{ growMinutes: number; yield: number }> | null {
  return typeof cropId === "string" && Object.prototype.hasOwnProperty.call(FARM_CROP_RULES, cropId) ? FARM_CROP_RULES[cropId] : null;
}

/** Ripe, alive, and what it pays: the catalog yield less the care penalty, never below one. */
export function farmHarvestYield(row: any): number {
  const rule = farmCropRule(row?.cropId);
  if (!rule || row?.diedOf || !(Number(row?.growthMinutes) >= rule.growMinutes)) return 0;
  const penalty = Math.min(MAX_CARE_PENALTY, Math.max(0, Number(row?.carePenalty) || 0));
  return Math.max(1, Math.round(rule.yield * (1 - penalty)));
}
