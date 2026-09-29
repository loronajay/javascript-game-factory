// Produce quality: Poor, Normal, Fine, Perfect. Server-owned like everything
// else a harvest mints, and mirrored by js/farm-quality.mts
// (tests/farm-quality.test.mjs holds the two together).
//
// QUALITY IS CARE, NEVER A ROLL. A crop's quality is read off its own row at
// harvest: the permanent care penalty (a wilt left a mark) and the minutes it
// spent stressed — dry, or waiting at the care gate — over its whole life. A
// crop watered and tended on time is Perfect; one that went dry now and then
// is Fine; one that wilted is Normal, one that nearly died is Poor. Compost
// worked into the soil lifts a crop one grade (a dead crop cleared makes it).
//
// THE KEY. A basket stack is keyed "<crop>@<quality>", except Normal, which
// keeps the bare crop id: every basket stored before quality existed is
// already a basket of Normal produce, so nothing migrates. Fruit has no care
// and is always Normal.
//
// WHERE IT MATTERS. The Produce Merchant pays by grade (QUALITY_PRICE). An
// order and a recipe ask for the crop, and take the plainest first.

import { FARM_LIVESTOCK_BASKET_IDS } from "./farm-livestock-catalog.mjs";
import { FARM_CROP_RULES } from "./farm-crop-catalog.mjs";
import { FARM_TREE_RULES } from "./farm-tree-catalog.mjs";

export const FARM_QUALITIES = Object.freeze(["poor", "normal", "fine", "perfect"] as const);
export type FarmQuality = (typeof FARM_QUALITIES)[number];

/** What the Produce Merchant pays for each grade, against the Normal price. */
export const QUALITY_PRICE: Readonly<Record<FarmQuality, number>> = Object.freeze({ poor: 0.75, normal: 1, fine: 1.2, perfect: 1.4 });

/** At most this many farm minutes stressed over its life, and no wilt, is Perfect. */
export const PERFECT_STRESS_MINUTES = 2 * 60;
/** At most this many, and no wilt, is Fine. */
export const FINE_STRESS_MINUTES = 12 * 60;
/** A care penalty above this (a wilt that ran on) is Poor. */
export const POOR_CARE_PENALTY = 0.3;

const bump: Readonly<Record<FarmQuality, FarmQuality>> = Object.freeze({ poor: "normal", normal: "fine", fine: "perfect", perfect: "perfect" });

/** The grade a crop row would harvest at: its care, lifted a grade by compost. */
export function farmCropQuality(row: any): FarmQuality {
  const penalty = Math.max(0, Number(row?.carePenalty) || 0);
  const stress = Math.max(0, Number(row?.stressMinutes) || 0);
  const cared: FarmQuality = penalty > POOR_CARE_PENALTY ? "poor"
    : penalty > 0 ? "normal"
      : stress <= PERFECT_STRESS_MINUTES ? "perfect"
        : stress <= FINE_STRESS_MINUTES ? "fine"
          : "normal";
  return row?.fertilized === true ? bump[cared] : cared;
}

// Livestock goods and meat (services/farm-livestock-catalog): milk, wool and the Butcher's cuts, graded by the animal's care like a crop.
const LIVESTOCK_GOOD_IDS: ReadonlySet<string> = new Set(FARM_LIVESTOCK_BASKET_IDS);
const FRUIT_IDS: ReadonlySet<string> = new Set(Object.entries(FARM_TREE_RULES).filter(([, rule]) => rule.kind === "fruit").map(([id]) => id));
const has = (table: object, id: string): boolean => Object.prototype.hasOwnProperty.call(table, id);

export function farmProduceKey(itemId: string, quality: FarmQuality): string {
  return quality === "normal" ? itemId : `${itemId}@${quality}`;
}

/** A basket key's crop or fruit and grade; null for anything the basket cannot hold. */
export function parseFarmProduceKey(key: unknown): Readonly<{ itemId: string; quality: FarmQuality }> | null {
  if (typeof key !== "string") return null;
  const [itemId = "", suffix, extra] = key.split("@");
  // Normal is only ever the bare id, so one stack has one key.
  if (extra !== undefined || suffix === "normal") return null;
  const quality = suffix ?? "normal";
  if (!(FARM_QUALITIES as readonly string[]).includes(quality)) return null;
  if (has(FARM_CROP_RULES, itemId) || LIVESTOCK_GOOD_IDS.has(itemId)) return Object.freeze({ itemId, quality: quality as FarmQuality });
  // Fruit is only ever Normal: a tree has no care to grade.
  if (FRUIT_IDS.has(itemId) && quality === "normal") return Object.freeze({ itemId, quality: "normal" as const });
  return null;
}

/** Every key the basket can hold. */
export const FARM_PRODUCE_KEYS: readonly string[] = Object.freeze([
  ...Object.keys(FARM_CROP_RULES).flatMap((cropId) => FARM_QUALITIES.map((quality) => farmProduceKey(cropId, quality))),
  ...FRUIT_IDS,
  ...[...LIVESTOCK_GOOD_IDS].flatMap((itemId) => FARM_QUALITIES.map((quality) => farmProduceKey(itemId, quality))),
]);

/** How much of a crop or fruit the basket holds, every grade together. */
export function farmProduceHeld(produce: Readonly<Record<string, unknown>> | null | undefined, itemId: string): number {
  return FARM_QUALITIES.reduce((sum, quality) => sum + (Number(produce?.[farmProduceKey(itemId, quality)]) || 0), 0);
}

/**
 * Take `count` of a crop or fruit out of the basket, plainest grade first (an
 * order or a recipe asks for the crop, not its grade). Null when the basket
 * cannot cover it; the input is never changed.
 */
export function takeFarmProduce(produce: Readonly<Record<string, unknown>> | null | undefined, itemId: string, count: number): Record<string, number> | null {
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(produce ?? {})) next[key] = Number(value) || 0;
  let remaining = count;
  for (const quality of FARM_QUALITIES) {
    if (remaining <= 0) break;
    const key = farmProduceKey(itemId, quality);
    const taken = Math.min(remaining, next[key] ?? 0);
    if (taken > 0) {
      next[key] = next[key]! - taken;
      remaining -= taken;
    }
  }
  return remaining > 0 ? null : next;
}
