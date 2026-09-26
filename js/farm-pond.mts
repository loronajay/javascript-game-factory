// A pond is a HOLE IN THE FIELD, not a thing sitting on it. This file is the
// one description of that hole: how deep the ground goes at any point, where
// the water stands, and what fits inside it.
//
// Pure: no three.js, no page. Four readers share it so none of them can drift:
// - `farm-props.mts` builds the pond's basin mesh by sampling `pondFloorAt`,
//   and `farm-world.mts` cuts the field's ground away over the same ellipse,
//   so the dug-out bowl the eye sees is the only surface there;
// - `farm-body.mts` stands the player on `groundHeightAt`, so walking into a
//   pond walks down its bank, along its bed and up the other side;
// - `farm-pets.mts` gives swimmers the water VOLUME — anywhere the bed is
//   deep enough under the whole body, at any depth between bed and surface;
// - `farm-decor-layout.mts` lets an aquatic dwelling stand on the bed only
//   where every corner of it is under water (`aquaticFits`), and sets it on
//   the bed at `aquaticBase`.
//
// THE SHAPE. A pond row's footprint is a box; the pond is the ellipse
// inscribed in it. In the ellipse's normalised radius `r` (0 at the centre,
// 1 at the rim) the ground falls from the grass at the rim down a short steep
// bank to the shore shelf, then down the slope to a bed that dishes gently to
// the centre. The water surface is flat at `WATER_LEVEL`, a hand below the
// grass, so a pond reads as dug rather than heaped.

import { findFarmDecor } from "./farm-catalog/decor.mjs";
import type { FarmDecorRow } from "./farm-layout.mjs";
import type { FloorObstacle } from "./arcade-room-layout.mjs";

/** The water's surface, in metres above the field: below the grass, so the rim is a real bank. */
export const WATER_LEVEL = -0.28;
/** The shore shelf: the bank drops this far between the rim and `SHORE_RADIUS`. */
export const SHORE_DEPTH = 0.45;
/** Normalised radius where the bank meets the shore shelf; aquatic dwellings stay inside it. */
export const SHORE_RADIUS = 0.86;
/** Normalised radius inside which the bed is (nearly) flat. */
export const BED_RADIUS = 0.45;
/** How much deeper the centre of the bed is than its edge. */
const BED_DISH = 0.08;

/** How many ponds a farm may dig: the ground's shader cuts this many holes. */
export const MAX_PONDS = 12;

/** A pond on the field: its box, and how deep its bed goes. */
export type PondRegion = FloorObstacle & Readonly<{ depth: number }>;

const smooth = (t: number): number => {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
};

/** The ground's height at normalised radius `r` of a pond `depth` deep; 0 on and past the rim. */
export function pondProfile(r: number, depth: number): number {
  if (r >= 1) return 0;
  if (r >= SHORE_RADIUS) return -SHORE_DEPTH * smooth((1 - r) / (1 - SHORE_RADIUS));
  if (r >= BED_RADIUS) return -SHORE_DEPTH - (depth - SHORE_DEPTH) * smooth((SHORE_RADIUS - r) / (SHORE_RADIUS - BED_RADIUS));
  const t = r / BED_RADIUS;
  return -depth - BED_DISH * (1 - t * t);
}

/** Where the water meets the bank, in normalised radius: the profile crosses `WATER_LEVEL` once, inside the shore band. */
export function waterlineRadius(): number {
  let low = SHORE_RADIUS;
  let high = 1;
  for (let step = 0; step < 40; step += 1) {
    const middle = (low + high) / 2;
    if (pondProfile(middle, SHORE_DEPTH) < WATER_LEVEL) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

/** The waterline, computed once: every pond's surface is the ellipse at this fraction of its box. */
export const WATERLINE_RADIUS = waterlineRadius();

/** A point in the pond's own frame (the walker's rotation convention). */
export function pondLocal(region: FloorObstacle, point: Readonly<{ x: number; z: number }>): Readonly<{ x: number; z: number }> {
  const dx = point.x - region.x;
  const dz = point.z - region.z;
  const cosine = Math.cos(region.rotationY);
  const sine = Math.sin(region.rotationY);
  return { x: dx * cosine - dz * sine, z: dx * sine + dz * cosine };
}

/** The point's normalised radius in the pond's ellipse: below 1 is inside the dug ground. */
export function pondRadius(region: FloorObstacle, point: Readonly<{ x: number; z: number }>): number {
  const local = pondLocal(region, point);
  const a = region.footprint.width / 2;
  const b = region.footprint.depth / 2;
  return Math.hypot(local.x / a, local.z / b);
}

/** The ground's height under the point from this pond alone (0 outside it). */
export function pondFloorAt(region: PondRegion, point: Readonly<{ x: number; z: number }>): number {
  return pondProfile(pondRadius(region, point), region.depth);
}

/** The field's height at a point: the grass, or the deepest pond bed under it. */
export function groundHeightAt(regions: readonly PondRegion[], point: Readonly<{ x: number; z: number }>): number {
  let height = 0;
  for (const region of regions) height = Math.min(height, pondFloorAt(region, point));
  return height;
}

/** The pond whose dug ground the point is in, or null. `grow` widens every pond by that many metres. */
export function pondAt(regions: readonly PondRegion[], point: Readonly<{ x: number; z: number }>, grow = 0): PondRegion | null {
  for (const region of regions) {
    const local = pondLocal(region, point);
    const a = region.footprint.width / 2 + grow;
    const b = region.footprint.depth / 2 + grow;
    if ((local.x / a) ** 2 + (local.z / b) ** 2 < 1) return region;
  }
  return null;
}

/** How much water stands over the point: 0 on dry ground. */
export function waterDepthAt(regions: readonly PondRegion[], point: Readonly<{ x: number; z: number }>): number {
  return Math.max(0, WATER_LEVEL - groundHeightAt(regions, point));
}

/** True when a point at height `y` is under water in a pond. */
export function underwater(regions: readonly PondRegion[], point: Readonly<{ x: number; z: number }>, y: number): boolean {
  return y < WATER_LEVEL && waterDepthAt(regions, point) > 0 && y > groundHeightAt(regions, point) - 0.05;
}

/** True when the point is inside the pond's water surface, `margin` metres in from the waterline. */
export function insidePondWater(region: FloorObstacle, point: Readonly<{ x: number; z: number }>, margin = 0): boolean {
  const local = pondLocal(region, point);
  const a = region.footprint.width / 2 * WATERLINE_RADIUS - margin;
  const b = region.footprint.depth / 2 * WATERLINE_RADIUS - margin;
  if (a <= 0 || b <= 0) return false;
  return (local.x / a) ** 2 + (local.z / b) ** 2 <= 1;
}

/** Every pond on the field, with the depth its catalog row gives it. */
export function pondRegions(layout: Readonly<{ decor: readonly FarmDecorRow[] }>): PondRegion[] {
  return layout.decor.flatMap((item) => {
    const definition = findFarmDecor(item.itemId);
    if (!definition?.pond) return [];
    return [{ instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint: definition.footprint, depth: definition.pond.depth }];
  });
}

/** The corners and edge midpoints of a box, plus its centre: where a dwelling's footing is sampled. */
function footingPoints(box: FloorObstacle): Array<{ x: number; z: number }> {
  const cosine = Math.cos(box.rotationY);
  const sine = Math.sin(box.rotationY);
  const halfW = box.footprint.width / 2;
  const halfD = box.footprint.depth / 2;
  const points: Array<{ x: number; z: number }> = [];
  for (const lx of [-halfW, 0, halfW]) {
    for (const lz of [-halfD, 0, halfD]) points.push({ x: box.x + lx * cosine + lz * sine, z: box.z - lx * sine + lz * cosine });
  }
  return points;
}

/** True when every corner and edge of the box is inside the pond's shore line: an aquatic dwelling stands wholly in the water. */
export function aquaticFits(box: FloorObstacle, region: FloorObstacle): boolean {
  return footingPoints(box).every((point) => pondRadius(region, point) <= SHORE_RADIUS + 1e-9);
}

/** Where an aquatic dwelling's base sits: the lowest bed under its footing, so no side of it floats off the slope. */
export function aquaticBase(box: FloorObstacle, region: PondRegion): number {
  return Math.min(...footingPoints(box).map((point) => pondFloorAt(region, point)));
}

/** The pond an aquatic row stands in (the one its centre is in), or null for one left on dry ground. */
export function homePond(regions: readonly PondRegion[], item: Readonly<{ x: number; z: number }>): PondRegion | null {
  return pondAt(regions, item);
}
