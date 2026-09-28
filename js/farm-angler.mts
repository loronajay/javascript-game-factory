// The angler as the Cove page holds it: tackle, Fishing level, the creel and
// the Fishdex, exactly as the server last answered (`GET /games/farm/fishing`,
// db/farm-fishing.mts). PURE — no DOM, no storage. The server owns every
// number here; this only shapes an answer for the page and says what the
// page may offer (which rods and baits are in the box, what a new catch means
// to the Fishdex).

import {
  CREEL_CAPACITY,
  FISH_CATALOG,
  FISHING_LURES,
  FISHING_RODS,
  STARTER_ROD_ID,
  STARTER_WORMS,
  WORM_ID,
  findFishSpecies,
  findFishingLure,
  findFishingRod,
  type FishingRod,
} from "./farm-catalog/fish.mjs";
import { isFishGrade, isFishVariant, type FishGrade, type FishVariant } from "./farm-fish.mjs";
import { farmingLevelForXp } from "./farm-skills.mjs";

export type AnglerFish = Readonly<{
  id: string;
  speciesId: string;
  weightG: number;
  lengthMm: number;
  sizeClass: string;
  grade: FishGrade;
  variant: FishVariant;
  zone: string;
  locked: boolean;
  caughtAt: number;
  value: number;
}>;

export type DexEntry = Readonly<{ caught: number; bestG: number; firstAt: number; shiny: boolean; golden: boolean }>;

export type Angler = Readonly<{
  tackle: Readonly<{ rods: readonly string[]; lures: Readonly<Record<string, number>>; worms: number }>;
  xp: number;
  level: number;
  catches: number;
  creel: readonly AnglerFish[];
  capacity: number;
  dex: Readonly<Record<string, DexEntry>>;
  caughtShadows: ReadonlySet<string>;
  /** Fish mounted on plaques: off the creel, onto the farm's Trophy Mounts. */
  mounted: readonly AnglerFish[];
}>;

/** A signed-out angler (practice): the starter rod, a tub of worms, nothing kept. */
export const PRACTICE_ANGLER: Angler = Object.freeze({
  tackle: Object.freeze({ rods: Object.freeze([STARTER_ROD_ID]), lures: Object.freeze({}), worms: STARTER_WORMS }),
  xp: 0,
  level: 1,
  catches: 0,
  creel: Object.freeze([]),
  capacity: CREEL_CAPACITY,
  dex: Object.freeze({}),
  caughtShadows: new Set<string>(),
  mounted: Object.freeze([]),
});

function count(value: unknown, limit = 1e9): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(limit, Math.max(0, Math.floor(number))) : 0;
}

export function normalizeAnglerFish(value: unknown): AnglerFish | null {
  const source: any = value && typeof value === "object" ? value : null;
  if (!source || typeof source.id !== "string" || !findFishSpecies(source.speciesId)) return null;
  return Object.freeze({
    id: source.id,
    speciesId: source.speciesId,
    weightG: Math.max(1, count(source.weightG)),
    lengthMm: Math.max(1, count(source.lengthMm)),
    sizeClass: typeof source.sizeClass === "string" ? source.sizeClass : "average",
    grade: isFishGrade(source.grade) ? source.grade : "normal",
    variant: isFishVariant(source.variant) ? source.variant : "normal",
    zone: typeof source.zone === "string" ? source.zone : "",
    locked: source.locked === true,
    caughtAt: count(source.caughtAt, 1e15),
    value: count(source.value),
  });
}

export function normalizeTackle(value: unknown): Angler["tackle"] {
  const source: any = value && typeof value === "object" ? value : {};
  const rods = new Set<string>([STARTER_ROD_ID]);
  for (const id of Array.isArray(source.rods) ? source.rods : []) if (findFishingRod(id)) rods.add(id);
  const lures: Record<string, number> = {};
  for (const lure of FISHING_LURES) {
    const held = count(source.lures?.[lure.id], 99);
    if (held > 0) lures[lure.id] = held;
  }
  return Object.freeze({ rods: Object.freeze(FISHING_RODS.map((rod) => rod.id).filter((id) => rods.has(id))), lures: Object.freeze(lures), worms: count(source.worms, 999) });
}

export function normalizeAngler(value: unknown): Angler | null {
  const source: any = value && typeof value === "object" ? value : null;
  if (!source) return null;
  const xp = count(source.fishing?.xp);
  const dex: Record<string, DexEntry> = {};
  for (const [speciesId, entry] of Object.entries(source.dex && typeof source.dex === "object" ? source.dex : {})) {
    if (!findFishSpecies(speciesId)) continue;
    const row: any = entry;
    dex[speciesId] = Object.freeze({ caught: count(row?.caught), bestG: count(row?.bestG), firstAt: count(row?.firstAt, 1e15), shiny: row?.shiny === true, golden: row?.golden === true });
  }
  return Object.freeze({
    tackle: normalizeTackle(source.tackle),
    xp,
    level: farmingLevelForXp(xp),
    catches: count(source.fishing?.catches),
    creel: Object.freeze((Array.isArray(source.creel) ? source.creel : []).map(normalizeAnglerFish).filter((entry: AnglerFish | null): entry is AnglerFish => Boolean(entry))),
    capacity: count(source.capacity) || CREEL_CAPACITY,
    dex: Object.freeze(dex),
    caughtShadows: new Set<string>((Array.isArray(source.caughtShadows) ? source.caughtShadows : []).filter((id: unknown): id is string => typeof id === "string")),
    mounted: Object.freeze((Array.isArray(source.mounted) ? source.mounted : []).map(normalizeAnglerFish).filter((entry: AnglerFish | null): entry is AnglerFish => Boolean(entry))),
  });
}

/** What the angler can put on the hook: worms (if any are left), then every lure in the box. */
export function baitChoices(angler: Angler): string[] {
  const choices: string[] = [];
  if (angler.tackle.worms > 0) choices.push(WORM_ID);
  for (const lure of FISHING_LURES) if ((angler.tackle.lures[lure.id] ?? 0) > 0) choices.push(lure.id);
  return choices;
}

/** The next bait after `current` in the box, wrapping; worms when nothing else. */
export function nextBait(angler: Angler, current: string): string {
  const choices = baitChoices(angler);
  if (!choices.length) return WORM_ID;
  const at = choices.indexOf(current);
  return choices[(at + 1) % choices.length]!;
}

/** The best rod owned: what a new session picks up first. */
export function bestRod(angler: Angler): FishingRod {
  const owned = FISHING_RODS.filter((rod) => angler.tackle.rods.includes(rod.id));
  return owned[owned.length - 1] ?? findFishingRod(STARTER_ROD_ID)!;
}

export function nextRod(angler: Angler, current: string): FishingRod {
  const owned = FISHING_RODS.filter((rod) => angler.tackle.rods.includes(rod.id));
  const at = owned.findIndex((rod) => rod.id === current);
  return owned[(at + 1) % owned.length] ?? findFishingRod(STARTER_ROD_ID)!;
}

export function baitTitle(baitId: string): string {
  return baitId === WORM_ID ? "Worm" : findFishingLure(baitId)?.title ?? baitId;
}

export function baitCount(angler: Angler, baitId: string): number {
  return baitId === WORM_ID ? angler.tackle.worms : angler.tackle.lures[baitId] ?? 0;
}

/** What a fish just landed means to the Fishdex before it was landed. */
export function catchNews(angler: Angler, speciesId: string, weightG: number): Readonly<{ firstOfKind: boolean; personalBest: boolean }> {
  const entry = angler.dex[speciesId];
  return Object.freeze({ firstOfKind: !entry || entry.caught === 0, personalBest: !entry || weightG > entry.bestG });
}

/** How many of the Cove's fish this angler has landed at least once. */
export function dexProgress(angler: Angler): Readonly<{ caught: number; total: number }> {
  return Object.freeze({ caught: FISH_CATALOG.filter((species) => (angler.dex[species.id]?.caught ?? 0) > 0).length, total: FISH_CATALOG.length });
}
