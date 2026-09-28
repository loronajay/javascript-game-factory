// Produce quality: Poor, Normal, Fine, Perfect. PURE — no DOM, no THREE, and
// no catalog of its own (farm-crops.mts says which ids a basket holds).
//
// The server decides a harvest's grade (platform-api/src/services/
// farm-quality-catalog.mts); this is the same rule, so the prompt can say what a
// crop is on course for and a signed-out farm can grade its own harvests, and
// platform-api/tests/farm-quality.test.mjs holds the two equal.
//
// Quality is care, never a roll: the permanent care penalty (a wilt left a
// mark) and the minutes a crop spent stressed — dry, or waiting at the care
// gate — over its life. Compost worked in lifts it one grade. A basket stack is
// keyed "<crop>@<grade>", except Normal, which is the bare crop id — every
// basket from before quality existed is already Normal produce.

export const QUALITIES = Object.freeze(["poor", "normal", "fine", "perfect"] as const);
export type Quality = (typeof QUALITIES)[number];

/** What the Produce Merchant pays for each grade, against the Normal price. */
export const QUALITY_PRICE: Readonly<Record<Quality, number>> = Object.freeze({ poor: 0.75, normal: 1, fine: 1.2, perfect: 1.4 });
export const PERFECT_STRESS_MINUTES = 2 * 60;
export const FINE_STRESS_MINUTES = 12 * 60;
export const POOR_CARE_PENALTY = 0.3;

export const QUALITY_TITLES: Readonly<Record<Quality, string>> = Object.freeze({ poor: "Poor", normal: "Normal", fine: "Fine", perfect: "Perfect" });

const bump: Readonly<Record<Quality, Quality>> = Object.freeze({ poor: "normal", normal: "fine", fine: "perfect", perfect: "perfect" });

export type GradedCrop = Readonly<{ carePenalty: number; stressMinutes: number; fertilized: boolean }>;

/** What care alone has earned so far, before compost. */
export function caredQuality(row: Pick<GradedCrop, "carePenalty" | "stressMinutes">): Quality {
  const penalty = Math.max(0, Number(row.carePenalty) || 0);
  const stress = Math.max(0, Number(row.stressMinutes) || 0);
  if (penalty > POOR_CARE_PENALTY) return "poor";
  if (penalty > 0) return "normal";
  if (stress <= PERFECT_STRESS_MINUTES) return "perfect";
  if (stress <= FINE_STRESS_MINUTES) return "fine";
  return "normal";
}

/** The grade a crop would harvest at now: its care, lifted a grade by compost. */
export function cropQuality(row: GradedCrop): Quality {
  const cared = caredQuality(row);
  return row.fertilized ? bump[cared] : cared;
}

export function produceKey(itemId: string, quality: Quality): string {
  return quality === "normal" ? itemId : `${itemId}@${quality}`;
}

/** A basket key's id and grade; null when it is not shaped like one. Whether the id is a crop is the caller's to say. */
export function parseProduceKey(key: string): Readonly<{ itemId: string; quality: Quality }> | null {
  const [itemId = "", suffix, extra] = key.split("@");
  // Normal is only ever the bare id, so one stack has one key.
  if (!itemId || extra !== undefined || suffix === "normal") return null;
  const quality = suffix ?? "normal";
  if (!(QUALITIES as readonly string[]).includes(quality)) return null;
  return Object.freeze({ itemId, quality: quality as Quality });
}

/** How much of a crop or fruit the basket holds, every grade together. */
export function produceHeld(produce: Readonly<Record<string, number>>, itemId: string): number {
  return QUALITIES.reduce((sum, quality) => sum + (Number(produce[produceKey(itemId, quality)]) || 0), 0);
}

/** Take `count` of a crop out of the basket, plainest grade first; null when it cannot cover it. */
export function takeProduce(produce: Readonly<Record<string, number>>, itemId: string, count: number): Record<string, number> | null {
  const next: Record<string, number> = { ...produce };
  let remaining = count;
  for (const quality of QUALITIES) {
    if (remaining <= 0) break;
    const key = produceKey(itemId, quality);
    const taken = Math.min(remaining, next[key] ?? 0);
    if (taken > 0) {
      next[key] = (next[key] ?? 0) - taken;
      remaining -= taken;
    }
  }
  return remaining > 0 ? null : next;
}

/** "Perfect Tomato", "Tomato" for Normal. */
export function gradedTitle(title: string, quality: Quality): string {
  return quality === "normal" ? title : `${QUALITY_TITLES[quality]} ${title}`;
}
