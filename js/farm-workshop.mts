// The workshop's rules: which patterns a farmer can make right now, what is on
// the furniture shelf, what a mill saws, and where the Workbench and the
// Sawmill are in reach. PURE — no THREE, no DOM, no storage.
//
// Carpentry is account progression end to end. Planks come only from a
// Sawmill and pieces only from the Workbench, and both are made by the server
// (`POST /games/farm/workshop/mills` and `/crafts`,
// platform-api/src/db/farm-workshop.mts); a signed-out farm can walk up to a
// bench and read the pattern book, and is told to sign in to use it. There is
// no local fallback here, unlike the kitchen's: a signed-out farm cannot get
// timber (saplings are a ticket purchase) so it would never have a plank to use.
//
// THE SHELF IS DERIVED. `inventory.furniture` counts every piece the farm owns,
// placed or not; a placed row carries its stars; the shelf is the difference.
// Nothing moves between two counts when a piece is set down or picked up, so
// the two can never disagree.

import { PATTERN_CATALOG, PIECE_STARS, PLANKS_PER_LOG, PLANK_SPECIES, findPattern, pieceKey, type Pattern, type PieceStars } from "./farm-catalog/carpentry.mjs";
import type { FarmInventory } from "./farm-crops.mjs";
import type { FarmDecorRow } from "./farm-layout.mjs";

// ---------------------------------------------------------------- the pattern book

export type PlankLine = Readonly<{ id: string; title: string; need: number; held: number; short: number }>;
export type PatternState = "locked" | "short" | "ready";
export type PatternAvailability = Readonly<{ pattern: Pattern; state: PatternState; lines: readonly PlankLine[] }>;

export function patternAvailability(pattern: Pattern, planks: Readonly<Record<string, number>>, level: number): PatternAvailability {
  const lines = Object.entries(pattern.planks).map(([id, need]) => {
    const held = Math.max(0, Math.floor(Number(planks[id]) || 0));
    const title = PLANK_SPECIES.find((species) => species.id === id)?.title ?? id;
    return Object.freeze({ id, title, need, held, short: Math.max(0, need - held) });
  });
  const state: PatternState = level < pattern.minLevel ? "locked" : lines.some((line) => line.short > 0) ? "short" : "ready";
  return Object.freeze({ pattern, state, lines: Object.freeze(lines) });
}

/** The pattern book in catalog order (which is level order). */
export function patternBook(planks: Readonly<Record<string, number>>, level: number): readonly PatternAvailability[] {
  return Object.freeze(PATTERN_CATALOG.map((pattern) => patternAvailability(pattern, planks, level)));
}

// ---------------------------------------------------------------- the shelf

/** How many of each "item@stars" stand on the field. */
export function placedPieces(decor: readonly FarmDecorRow[]): Record<string, number> {
  const placed: Record<string, number> = {};
  for (const row of decor) {
    if (!row.stars || !findPattern(row.itemId)) continue;
    const key = pieceKey(row.itemId, row.stars);
    placed[key] = (placed[key] ?? 0) + 1;
  }
  return placed;
}

/** What is on the shelf: owned minus placed, never below zero. Every key there can be. */
export function furnitureShelf(furniture: Readonly<Record<string, number>>, decor: readonly FarmDecorRow[]): Record<string, number> {
  const placed = placedPieces(decor);
  const shelf: Record<string, number> = {};
  for (const pattern of PATTERN_CATALOG) {
    for (const stars of PIECE_STARS) {
      const key = pieceKey(pattern.id, stars);
      shelf[key] = Math.max(0, Math.floor(Number(furniture[key]) || 0) - (placed[key] ?? 0));
    }
  }
  return shelf;
}

export type ShelfEntry = Readonly<{
  pattern: Pattern;
  /** On the shelf by stars, and in all. */
  byStars: Readonly<Record<PieceStars, number>>;
  onShelf: number;
  placed: number;
  /** The best piece on the shelf, which is the one a placement takes; null when the shelf holds none. */
  best: PieceStars | null;
}>;

/** One entry per pattern: what the farm has of it on the shelf and on the field. */
export function shelfEntries(furniture: Readonly<Record<string, number>>, decor: readonly FarmDecorRow[]): readonly ShelfEntry[] {
  const shelf = furnitureShelf(furniture, decor);
  const placed = placedPieces(decor);
  return Object.freeze(PATTERN_CATALOG.map((pattern) => {
    const byStars = Object.freeze(Object.fromEntries(PIECE_STARS.map((stars) => [stars, shelf[pieceKey(pattern.id, stars)] ?? 0]))) as Readonly<Record<PieceStars, number>>;
    const onShelf = PIECE_STARS.reduce((sum, stars) => sum + byStars[stars], 0);
    const best = [...PIECE_STARS].reverse().find((stars) => byStars[stars] > 0) ?? null;
    const standing = PIECE_STARS.reduce((sum, stars) => sum + (placed[pieceKey(pattern.id, stars)] ?? 0), 0);
    return Object.freeze({ pattern, byStars, onShelf, placed: standing, best });
  }));
}

/** The stars of the best piece of `itemId` on the shelf, or null. A placement always takes the finest one to hand. */
export function bestOnShelf(furniture: Readonly<Record<string, number>>, decor: readonly FarmDecorRow[], itemId: string): PieceStars | null {
  const shelf = furnitureShelf(furniture, decor);
  return [...PIECE_STARS].reverse().find((stars) => (shelf[pieceKey(itemId, stars)] ?? 0) > 0) ?? null;
}

/** A copy of a placed piece takes one more of the same stars off the shelf; true when there is one. */
export function shelfHas(furniture: Readonly<Record<string, number>>, decor: readonly FarmDecorRow[], itemId: string, stars: PieceStars): boolean {
  return (furnitureShelf(furniture, decor)[pieceKey(itemId, stars)] ?? 0) > 0;
}

// ---------------------------------------------------------------- the sawmill

export type MillLine = Readonly<{ id: string; title: string; logs: number; planks: number }>;

/** What each timber species could be sawn into right now: the logs held and the planks they would make. */
export function millLines(inventory: FarmInventory): readonly MillLine[] {
  return Object.freeze(PLANK_SPECIES.map((species) => {
    const logs = Math.max(0, Math.floor(Number(inventory.logs[species.id]) || 0));
    return Object.freeze({ id: species.id, title: species.title.replace(/ Planks$/, ""), logs, planks: Math.max(0, Math.floor(Number(inventory.planks[species.id]) || 0)) });
  }));
}

/** How many planks `logs` logs saw into. */
export function plankYield(logs: number): number {
  return Math.max(0, Math.floor(logs)) * PLANKS_PER_LOG;
}

// ---------------------------------------------------------------- stations in reach

/**
 * The Workbench and the Sawmill are worked from their front (+z) face, like
 * the Kitchen Range: this is how far from it, and how squarely faced, E works one.
 */
export const STATION_REACH = Object.freeze({ radius: 1.8, facing: 0.35 });

export type StationRow = Readonly<{ instanceId: string; itemId: string; x: number; z: number; rotationY: number }>;
export type StationPose = Readonly<{ x: number; z: number; y: number; forward: Readonly<{ x: number; z: number }> }>;

/** The front of a station in the world (`halfDepth` in from its centre) and the way it faces. */
export function stationFront(row: StationRow, halfDepth: number): Readonly<{ x: number; z: number; normal: Readonly<{ x: number; z: number }> }> {
  const normal = { x: Math.sin(row.rotationY), z: Math.cos(row.rotationY) };
  return Object.freeze({ x: row.x + normal.x * halfDepth, z: row.z + normal.z * halfDepth, normal: Object.freeze(normal) });
}

/** The station of `itemId` the player stands at the front of and looks at, or null. */
export function findStationInReach<T extends StationRow>(decor: readonly T[], pose: StationPose, itemId: string, halfDepth: number): T | null {
  if (Math.abs(pose.y) > 0.3) return null;
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const row of decor) {
    if (row.itemId !== itemId) continue;
    const front = stationFront(row, halfDepth);
    const distance = Math.hypot(pose.x - front.x, pose.z - front.z);
    if (distance > STATION_REACH.radius) continue;
    // In front of it, never round the back.
    if ((pose.x - front.x) * front.normal.x + (pose.z - front.z) * front.normal.z < -0.05) continue;
    const toward = { x: row.x - pose.x, z: row.z - pose.z };
    const length = Math.hypot(toward.x, toward.z) || 1;
    const forward = Math.hypot(pose.forward.x, pose.forward.z) || 1;
    if ((pose.forward.x * toward.x + pose.forward.z * toward.z) / (length * forward) < STATION_REACH.facing) continue;
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
    }
  }
  return best;
}
