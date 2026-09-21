// Placing things on the farm: the pure rules behind every build-mode gesture.
//
// No THREE, no DOM. The editor turns a pointer into a wanted placement and
// asks here; this decides, and hands back a new layout or a reason. Every
// rule is about ROTATED boxes on a flat field — there are no walls or ceilings
// to mount on, which is why the farm does not import the room's decor rules
// (they are written against the room's catalog and its three mounts) and
// instead shares only the geometry both agree on.
//
// THE RULES
// - Inside the field: every corner of the item's box stays within the bounds
//   minus the inset. Exact corners, not the rotated bounding box, so a
//   diagonal fence can run right up to the edge.
// - No overlap: two solid or keep-out boxes never cross. The one exception is
//   fences with fences — runs meet at corners and cross to make pens.
// - The gate stays clear: nothing may cover the spawn, or the player would
//   arrive inside a barn.
// - A fence is stretched from ONE end: the far end is anchored and the pulled
//   end follows the hand, then the length is bisected down until the run fits.
//   A pulled end also snaps to another fence's end within the threshold, and
//   the guide that explains it is reported.
// - The last pond cannot go while swimmers live in it.

import { clampFarmDecorLength, farmDecorFootprint, findFarmDecor, type FarmDecorDefinition } from "./farm-catalog/decor.mjs";
import { FARM_BOUNDS, MAX_DECOR, farmHabitats, waterPets, withFarmDecor, type FarmDecorRow, type FarmLayout } from "./farm-layout.mjs";
import { FARM_SPAWN } from "./farm-scene.mjs";
import { obstacleBlocks } from "./arcade-room-walker.mjs";
import type { FloorObstacle, ItemFootprint, RoomBounds, RoomPlacement } from "./arcade-room-layout.mjs";
import type { AlignGuide } from "./arcade-room-decor-align.mjs";
import type { DecorHandle } from "./arcade-room-decor-resize.mjs";

export type FarmDecorResult = Readonly<{ valid: boolean; layout: FarmLayout; instanceId: string; reason: string }>;
export type FarmDecorAligned<T> = Readonly<{ value: T; guides: readonly AlignGuide[] }>;
export type FarmStretchResult = FarmDecorResult & Readonly<{ guides: readonly AlignGuide[] }>;

/** Nothing may stand within this of the gate spawn. */
export const SPAWN_CLEARANCE = 0.9;
const FIT_TOLERANCE = 2e-4;
const BISECTION_STEPS = 24;
const SEARCH_RINGS = 6;
const SEARCH_STEP = 0.8;

const rounded = (value: number): number => Number(value.toFixed(4));

function definitionOf(item: FarmDecorRow): FarmDecorDefinition | undefined {
  return findFarmDecor(item.itemId);
}

/** The box a row covers, in the shape the walker and the pet sim read. */
export function farmDecorBox(item: FarmDecorRow, definition: FarmDecorDefinition = definitionOf(item)!): FloorObstacle {
  return { instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint: farmDecorFootprint(definition, item) };
}

/** The item's along axis in world space: local +x under its rotation, the walker's convention. */
export function alongAxis(rotationY: number): Readonly<{ x: number; z: number }> {
  return { x: Math.cos(rotationY), z: -Math.sin(rotationY) };
}

export function boxCorners(placement: RoomPlacement, footprint: ItemFootprint): ReadonlyArray<Readonly<{ x: number; z: number }>> {
  const cosine = Math.cos(placement.rotationY);
  const sine = Math.sin(placement.rotationY);
  const halfW = footprint.width / 2;
  const halfD = footprint.depth / 2;
  return [[-halfW, -halfD], [halfW, -halfD], [halfW, halfD], [-halfW, halfD]].map(([lx, lz]) => ({
    x: placement.x + lx * cosine + lz * sine,
    z: placement.z - lx * sine + lz * cosine,
  }));
}

/** Exact rotated-box overlap by the separating-axis test; touching edges do not overlap. */
export function boxesOverlap(first: RoomPlacement, firstFootprint: ItemFootprint, second: RoomPlacement, secondFootprint: ItemFootprint): boolean {
  const a = boxCorners(first, firstFootprint);
  const b = boxCorners(second, secondFootprint);
  const axes = [alongAxis(first.rotationY), alongAxis(first.rotationY + Math.PI / 2), alongAxis(second.rotationY), alongAxis(second.rotationY + Math.PI / 2)];
  for (const axis of axes) {
    let minA = Infinity; let maxA = -Infinity; let minB = Infinity; let maxB = -Infinity;
    for (const corner of a) { const p = corner.x * axis.x + corner.z * axis.z; minA = Math.min(minA, p); maxA = Math.max(maxA, p); }
    for (const corner of b) { const p = corner.x * axis.x + corner.z * axis.z; minB = Math.min(minB, p); maxB = Math.max(maxB, p); }
    if (maxA <= minB + 1e-9 || maxB <= minA + 1e-9) return false;
  }
  return true;
}

/** Slide the placement so every corner is inside the field; a box wider than the field is centred. */
export function clampBoxToField(placement: RoomPlacement, footprint: ItemFootprint, bounds: RoomBounds = FARM_BOUNDS): RoomPlacement {
  const limitX = bounds.width / 2 - bounds.wallInset;
  const limitZ = bounds.depth / 2 - bounds.wallInset;
  const corners = boxCorners({ ...placement, x: 0, z: 0 }, footprint);
  const reachX = Math.max(...corners.map((corner) => Math.abs(corner.x)));
  const reachZ = Math.max(...corners.map((corner) => Math.abs(corner.z)));
  const freeX = Math.max(0, limitX - reachX);
  const freeZ = Math.max(0, limitZ - reachZ);
  return {
    x: rounded(Math.min(freeX, Math.max(-freeX, placement.x))),
    z: rounded(Math.min(freeZ, Math.max(-freeZ, placement.z))),
    rotationY: placement.rotationY,
  };
}

export function insideFieldBox(placement: RoomPlacement, footprint: ItemFootprint, bounds: RoomBounds = FARM_BOUNDS): boolean {
  const limitX = bounds.width / 2 - bounds.wallInset + 1e-6;
  const limitZ = bounds.depth / 2 - bounds.wallInset + 1e-6;
  return boxCorners(placement, footprint).every((corner) => Math.abs(corner.x) <= limitX && Math.abs(corner.z) <= limitZ);
}

/** Whether two rows may not share ground. Fences pass through fences; everything else keeps apart. */
export function farmDecorCollides(first: FarmDecorDefinition, second: FarmDecorDefinition): boolean {
  if (first.category === "fence" && second.category === "fence") return false;
  const takesSpace = (definition: FarmDecorDefinition): boolean => definition.solid || definition.keepOut;
  return takesSpace(first) && takesSpace(second);
}

export type PlacementVerdict = "ok" | "outside" | "blocked" | "spawn";

/** Why a box may not stand where it is asked to, or "ok". */
export function judgePlacement(layout: FarmLayout, instanceId: string, definition: FarmDecorDefinition, box: FloorObstacle, bounds: RoomBounds = FARM_BOUNDS): PlacementVerdict {
  if (!insideFieldBox(box, box.footprint, bounds)) return "outside";
  if ((definition.solid || definition.keepOut) && obstacleBlocks(FARM_SPAWN, box, SPAWN_CLEARANCE)) return "spawn";
  for (const other of layout.decor) {
    if (other.instanceId === instanceId) continue;
    const otherDefinition = definitionOf(other);
    if (!otherDefinition || !farmDecorCollides(definition, otherDefinition)) continue;
    if (boxesOverlap(box, box.footprint, other, farmDecorFootprint(otherDefinition, other))) return "blocked";
  }
  return "ok";
}

export function nextFarmDecorInstanceId(layout: FarmLayout, definition: FarmDecorDefinition): string {
  const stem = definition.id.split(".").pop()!;
  let highest = 0;
  for (const item of layout.decor) {
    const match = new RegExp(`^${stem}-(\\d+)$`).exec(item.instanceId);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${stem}-${highest + 1}`;
}

function replaceRow(layout: FarmLayout, next: FarmDecorRow): FarmLayout {
  return withFarmDecor(layout, layout.decor.map((item) => (item.instanceId === next.instanceId ? next : item)));
}

function tryPlace(layout: FarmLayout, item: FarmDecorRow, definition: FarmDecorDefinition, wanted: RoomPlacement, bounds: RoomBounds): FarmDecorResult {
  const footprint = farmDecorFootprint(definition, item);
  const clamped = clampBoxToField(wanted, footprint, bounds);
  const next: FarmDecorRow = { ...item, x: clamped.x, z: clamped.z, rotationY: rounded(clamped.rotationY) };
  const verdict = judgePlacement(layout, item.instanceId, definition, farmDecorBox(next, definition), bounds);
  if (verdict !== "ok") return { valid: false, layout, instanceId: item.instanceId, reason: verdict };
  return { valid: true, layout: replaceRow(layout, next), instanceId: item.instanceId, reason: "" };
}

/** Move (and turn) a placed item; the spot is clamped to the field and refused when taken. */
export function placeFarmDecor(layout: FarmLayout, instanceId: string, wanted: RoomPlacement, bounds: RoomBounds = FARM_BOUNDS): FarmDecorResult {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition) return { valid: false, layout, instanceId, reason: "missing" };
  return tryPlace(layout, item, definition, wanted, bounds);
}

export function rotateFarmDecor(layout: FarmLayout, instanceId: string, direction: -1 | 1, bounds: RoomBounds = FARM_BOUNDS): FarmDecorResult {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition) return { valid: false, layout, instanceId, reason: "missing" };
  const turn = Math.PI * 2;
  const rotationY = ((item.rotationY + direction * definition.snapDegrees * Math.PI / 180) % turn + turn) % turn;
  return tryPlace(layout, item, definition, { x: item.x, z: item.z, rotationY }, bounds);
}

/**
 * Largest length in [min, wanted] at which the run, grown from `anchor` toward
 * `direction`, fits. Bisection, so no rule here is restated.
 */
function fitLength(layout: FarmLayout, item: FarmDecorRow, definition: FarmDecorDefinition, anchor: Readonly<{ x: number; z: number }>, direction: Readonly<{ x: number; z: number }>, wanted: number, bounds: RoomBounds): number | null {
  const rowAt = (length: number): FarmDecorRow => ({ ...item, length: rounded(length), x: rounded(anchor.x + direction.x * length / 2), z: rounded(anchor.z + direction.z * length / 2) });
  const fits = (length: number): boolean => judgePlacement(layout, item.instanceId, definition, farmDecorBox(rowAt(length), definition), bounds) === "ok";
  if (fits(wanted)) return wanted;
  const smallest = definition.length.min;
  if (!fits(smallest)) return null;
  let low = smallest;
  let high = wanted;
  for (let step = 0; step < BISECTION_STEPS && high - low > FIT_TOLERANCE; step += 1) {
    const middle = (low + high) / 2;
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

/** Set a stretchable item's length about its centre, shrinking until it fits. */
export function setFarmDecorLength(layout: FarmLayout, instanceId: string, length: number, bounds: RoomBounds = FARM_BOUNDS): FarmDecorResult {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition) return { valid: false, layout, instanceId, reason: "missing" };
  if (!definition.length.enabled) return { valid: false, layout, instanceId, reason: "fixed" };
  const wanted = clampFarmDecorLength(definition, length);
  // Grown about the centre, so a typed number never walks the run across the field.
  const grow = (candidate: number): FarmDecorRow => ({ ...item, length: rounded(candidate) });
  const fits = (candidate: number): boolean => judgePlacement(layout, item.instanceId, definition, farmDecorBox(grow(candidate), definition), bounds) === "ok";
  let final = wanted;
  if (!fits(wanted)) {
    if (!fits(definition.length.min)) return { valid: false, layout, instanceId, reason: "blocked" };
    let low = definition.length.min;
    let high = wanted;
    for (let step = 0; step < BISECTION_STEPS && high - low > FIT_TOLERANCE; step += 1) {
      const middle = (low + high) / 2;
      if (fits(middle)) low = middle;
      else high = middle;
    }
    final = low;
  }
  return { valid: true, layout: replaceRow(layout, grow(final)), instanceId, reason: "" };
}

/** Both ends of a stretchable row on the ground. */
export function farmDecorEnds(item: FarmDecorRow, definition: FarmDecorDefinition = definitionOf(item)!): Readonly<{ start: { x: number; z: number }; end: { x: number; z: number } }> {
  const half = farmDecorFootprint(definition, item).width / 2;
  const along = alongAxis(item.rotationY);
  return {
    start: { x: item.x - along.x * half, z: item.z - along.z * half },
    end: { x: item.x + along.x * half, z: item.z + along.z * half },
  };
}

/** Every other fence's end points: what a pulled end may snap to. */
function otherFenceEnds(layout: FarmLayout, instanceId: string): Array<{ x: number; z: number }> {
  const points: Array<{ x: number; z: number }> = [];
  for (const other of layout.decor) {
    if (other.instanceId === instanceId) continue;
    const definition = definitionOf(other);
    if (!definition || definition.category !== "fence") continue;
    const ends = farmDecorEnds(other, definition);
    points.push(ends.start, ends.end);
  }
  return points;
}

/**
 * Pull one end of a stretchable row to a point on the ground. The other end
 * stays put; the length is what the hand asks for, snapped to a neighbouring
 * fence end within `snap` metres, then shrunk until the run fits.
 */
export function stretchFarmDecorEnd(layout: FarmLayout, instanceId: string, end: -1 | 1, point: Readonly<{ x: number; z: number }>, bounds: RoomBounds = FARM_BOUNDS, snap = 0): FarmStretchResult {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition) return { valid: false, layout, instanceId, reason: "missing", guides: [] };
  if (!definition.length.enabled) return { valid: false, layout, instanceId, reason: "fixed", guides: [] };
  const along = alongAxis(item.rotationY);
  const direction = { x: along.x * end, z: along.z * end };
  const ends = farmDecorEnds(item, definition);
  const anchor = end > 0 ? ends.start : ends.end;
  let wanted = (point.x - anchor.x) * direction.x + (point.z - anchor.z) * direction.z;
  const guides: AlignGuide[] = [];
  if (snap > 0) {
    let best: { length: number; distance: number; target: { x: number; z: number } } | null = null;
    for (const candidate of otherFenceEnds(layout, instanceId)) {
      const projected = (candidate.x - anchor.x) * direction.x + (candidate.z - anchor.z) * direction.z;
      if (projected < definition.length.min || projected > definition.length.max) continue;
      const tip = { x: anchor.x + direction.x * projected, z: anchor.z + direction.z * projected };
      const distance = Math.hypot(tip.x - candidate.x, tip.z - candidate.z);
      // Close to the free end as the hand has it, and near enough to the line the run lies on.
      if (distance > snap || Math.abs(projected - wanted) > snap * 2) continue;
      if (!best || distance < best.distance) best = { length: projected, distance, target: candidate };
    }
    if (best) {
      wanted = best.length;
      guides.push({ from: { x: best.target.x, y: 0.02, z: best.target.z }, to: { x: anchor.x + direction.x * wanted, y: 0.02, z: anchor.z + direction.z * wanted } });
    }
  }
  wanted = clampFarmDecorLength(definition, wanted);
  const length = fitLength(layout, item, definition, anchor, direction, wanted, bounds);
  if (length === null) return { valid: false, layout, instanceId, reason: "blocked", guides: [] };
  const next: FarmDecorRow = { ...item, length: rounded(length), x: rounded(anchor.x + direction.x * length / 2), z: rounded(anchor.z + direction.z * length / 2) };
  return { valid: true, layout: replaceRow(layout, next), instanceId, reason: "", guides: length === wanted ? guides : [] };
}

/**
 * Where a drag wants to put an item, after snapping: a fence's ends catch on
 * other fences' ends within `snap` metres and the whole run shifts to meet
 * them. Other items do not snap.
 */
export function alignFarmDecorPlacement(layout: FarmLayout, instanceId: string, wanted: RoomPlacement, snap: number): FarmDecorAligned<RoomPlacement> {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition || definition.category !== "fence" || snap <= 0) return { value: wanted, guides: [] };
  const moved: FarmDecorRow = { ...item, ...wanted };
  const ends = farmDecorEnds(moved, definition);
  let best: { shift: { x: number; z: number }; distance: number; from: { x: number; z: number }; to: { x: number; z: number } } | null = null;
  for (const own of [ends.start, ends.end]) {
    for (const candidate of otherFenceEnds(layout, instanceId)) {
      const distance = Math.hypot(candidate.x - own.x, candidate.z - own.z);
      if (distance > snap || (best && distance >= best.distance)) continue;
      best = { shift: { x: candidate.x - own.x, z: candidate.z - own.z }, distance, from: own, to: candidate };
    }
  }
  if (!best) return { value: wanted, guides: [] };
  return {
    value: { x: rounded(wanted.x + best.shift.x), z: rounded(wanted.z + best.shift.z), rotationY: wanted.rotationY },
    guides: [{ from: { x: best.to.x, y: 0.02, z: best.to.z }, to: { x: best.to.x, y: 1.2, z: best.to.z } }],
  };
}

/** The end arrows on a selected stretchable item, lifted just off the ground. */
export function farmDecorHandles(layout: FarmLayout, instanceId: string): readonly DecorHandle[] {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition || !definition.length.enabled) return [];
  const along = alongAxis(item.rotationY);
  const ends = farmDecorEnds(item, definition);
  const y = 0.6;
  return [
    { kind: "stretch", end: -1, point: { x: ends.start.x, y, z: ends.start.z }, direction: { x: -along.x, y: 0, z: -along.z } },
    { kind: "stretch", end: 1, point: { x: ends.end.x, y, z: ends.end.z }, direction: { x: along.x, y: 0, z: along.z } },
  ];
}

/** Add a catalog item near a point: the point itself, then rings of spots around it until one is free. */
export function addFarmDecor(layout: FarmLayout, definition: FarmDecorDefinition, near: Readonly<{ x: number; z: number; rotationY?: number }>, bounds: RoomBounds = FARM_BOUNDS): FarmDecorResult {
  if (layout.decor.length >= MAX_DECOR) return { valid: false, layout, instanceId: "", reason: "full" };
  const instanceId = nextFarmDecorInstanceId(layout, definition);
  const item: FarmDecorRow = { instanceId, itemId: definition.id, x: near.x, z: near.z, rotationY: near.rotationY ?? 0, length: definition.length.enabled ? definition.length.default : 0 };
  const candidate = withFarmDecor(layout, [...layout.decor, item]);
  const attempt = (x: number, z: number): FarmDecorResult => tryPlace(candidate, item, definition, { x, z, rotationY: item.rotationY }, bounds);
  const first = attempt(near.x, near.z);
  if (first.valid) return first;
  for (let ring = 1; ring <= SEARCH_RINGS; ring += 1) {
    const radius = ring * SEARCH_STEP * Math.max(1, Math.max(definition.footprint.width, definition.footprint.depth) / 2);
    const spots = ring * 8;
    for (let index = 0; index < spots; index += 1) {
      const angle = (index / spots) * Math.PI * 2;
      const result = attempt(near.x + Math.cos(angle) * radius, near.z + Math.sin(angle) * radius);
      if (result.valid) return result;
    }
  }
  return { valid: false, layout, instanceId: "", reason: "blocked" };
}

export function duplicateFarmDecor(layout: FarmLayout, instanceId: string, bounds: RoomBounds = FARM_BOUNDS): FarmDecorResult {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item && definitionOf(item);
  if (!item || !definition) return { valid: false, layout, instanceId, reason: "missing" };
  if (layout.decor.length >= MAX_DECOR) return { valid: false, layout, instanceId, reason: "full" };
  const footprint = farmDecorFootprint(definition, item);
  const across = alongAxis(item.rotationY + Math.PI / 2);
  const copyId = nextFarmDecorInstanceId(layout, definition);
  const copy: FarmDecorRow = { ...item, instanceId: copyId };
  const candidate = withFarmDecor(layout, [...layout.decor, copy]);
  // Beside it first (across its depth), then the search rings.
  const gap = footprint.depth + 0.3;
  for (const sign of [1, -1]) {
    const result = tryPlace(candidate, copy, definition, { x: item.x + across.x * gap * sign, z: item.z + across.z * gap * sign, rotationY: item.rotationY }, bounds);
    if (result.valid) return result;
  }
  const spread = addFarmDecor(layout, definition, { x: item.x, z: item.z, rotationY: item.rotationY }, bounds);
  if (!spread.valid) return spread;
  // Keep the copy's length: addFarmDecor placed a default-length row.
  const placed = spread.layout.decor.find((row) => row.instanceId === spread.instanceId)!;
  const resized = setFarmDecorLength(spread.layout, placed.instanceId, item.length, bounds);
  return resized.valid ? resized : spread;
}

export function removeFarmDecor(layout: FarmLayout, instanceId: string): FarmDecorResult {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  if (!item) return { valid: false, layout, instanceId, reason: "missing" };
  const remaining = layout.decor.filter((candidate) => candidate.instanceId !== instanceId);
  if (waterPets(layout).length > 0 && !farmHabitats({ decor: remaining }).water) {
    return { valid: false, layout, instanceId, reason: "habitat" };
  }
  return { valid: true, layout: withFarmDecor(layout, remaining), instanceId, reason: "" };
}
