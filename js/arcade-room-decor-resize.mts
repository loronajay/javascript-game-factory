// Resizing decor by hand: the handles on a selected item and what dragging one does.
//
// No THREE in here. A stretchable item (a neon strip, a runner, a shelf) gets
// an arrow at each END; a resizable item (a sign, a poster, a prop) gets a
// handle at each CORNER. Dragging a handle anchors the OPPOSITE end or corner
// and moves only the side under the hand — grab the right end of a strip and
// pull it to the wall's corner, and the left end stays where it was. That is
// the gesture that runs a strip wall to wall.
//
// The limit is the room. A requested size is first clamped to the item's own
// range, then shrunk until the item fits — the far end still inside the wall
// or floor it is on and, for a solid prop, not inside a neighbour. "Fits" is
// answered by the same placement rules a drag uses, and the largest size that
// fits is found by bisection, so no builder here re-states a room rule.
//
// The free end also snaps: a neighbour's edge or the wall's corner within the
// editor's threshold catches it, and the guide that explains it is reported.

import { clampDecorLength, clampDecorScale, decorExtent, findDecor, type DecorDefinition } from "./arcade-room-catalog/decor.mjs";
import { alignStretchEnd, type AlignGuide } from "./arcade-room-decor-align.mjs";
import { placeDecorItem, type DecorResult, type RoomPoint } from "./arcade-room-decor-layout.mjs";
import { ROOM_BOUNDS_DEFAULTS, type FootprintCatalog, type RoomBounds, type RoomDecorItem, type RoomLayout, type WallSide } from "./arcade-room-layout.mjs";

export type DecorHandle =
  /** An arrow on one end of a stretchable item, pointing outward along it. */
  | Readonly<{ kind: "stretch"; end: -1 | 1; point: RoomPoint; direction: RoomPoint }>
  /** A grip on one corner of a resizable item; `u` is along, `v` across (up on a wall). */
  | Readonly<{ kind: "scale"; u: -1 | 1; v: -1 | 1; point: RoomPoint }>;

export type ResizeResult = DecorResult & Readonly<{ guides: readonly AlignGuide[] }>;

/**
 * The item's own axes in world space. `along` is its width axis, `across` its
 * second face axis — depth on the floor and ceiling, up on a wall — and
 * `normal` points out of the surface it is on, which is where a handle sits
 * so it is not buried in the wall.
 */
export type DecorFrame = Readonly<{
  centre: RoomPoint;
  along: RoomPoint;
  across: RoomPoint;
  normal: RoomPoint;
  halfAlong: number;
  halfAcross: number;
  /** The plane the handles are dragged on, as `normal · p = constant`. */
  plane: Readonly<{ normal: RoomPoint; constant: number }>;
}>;

// Placement rounds to four decimals, so anything beyond that is a real clamp, not noise.
const FIT_TOLERANCE = 2e-4;
const BISECTION_STEPS = 24;

function dot(a: RoomPoint, b: RoomPoint): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function add(a: RoomPoint, b: RoomPoint, scale = 1): RoomPoint {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale };
}

function sub(a: RoomPoint, b: RoomPoint): RoomPoint {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function findItem(layout: RoomLayout, instanceId: string): Readonly<{ item: RoomDecorItem; definition: DecorDefinition }> | null {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item ? findDecor(item.itemId) : undefined;
  return item && definition ? { item, definition } : null;
}

export function decorFrame(item: RoomDecorItem, definition: DecorDefinition, room: RoomBounds): DecorFrame {
  const extent = decorExtent(definition, item.length, item.scale);
  const cosine = Math.cos(item.rotationY);
  const sine = Math.sin(item.rotationY);
  // Local +X and +Z in world space, the same rotation `worldPointFromPlacement` applies.
  const along: RoomPoint = { x: cosine, y: 0, z: -sine };
  const localZ: RoomPoint = { x: sine, y: 0, z: cosine };
  const height = room.height ?? ROOM_BOUNDS_DEFAULTS.height;
  if (item.mount === "wall") {
    return {
      centre: { x: item.x, y: item.y, z: item.z },
      along,
      across: { x: 0, y: 1, z: 0 },
      normal: localZ,
      halfAlong: extent.width / 2,
      halfAcross: extent.height / 2,
      plane: { normal: localZ, constant: dot(localZ, { x: item.x, y: 0, z: item.z }) },
    };
  }
  const up: RoomPoint = { x: 0, y: 1, z: 0 };
  const y = item.mount === "ceiling" ? height : 0;
  return {
    centre: { x: item.x, y, z: item.z },
    along,
    across: localZ,
    normal: item.mount === "ceiling" ? { x: 0, y: -1, z: 0 } : up,
    halfAlong: extent.width / 2,
    halfAcross: extent.depth / 2,
    plane: { normal: up, constant: y },
  };
}

/** The handles a selected item shows: end arrows when stretchable, corner grips when resizable, none otherwise. */
export function decorHandles(layout: RoomLayout, instanceId: string, room: RoomBounds): readonly DecorHandle[] {
  const found = findItem(layout, instanceId);
  if (!found) return [];
  const { item, definition } = found;
  const frame = decorFrame(item, definition, room);
  if (definition.length.enabled) {
    return ([-1, 1] as const).map((end) => ({
      kind: "stretch",
      end,
      point: add(frame.centre, frame.along, end * frame.halfAlong),
      direction: { x: frame.along.x * end, y: frame.along.y * end, z: frame.along.z * end },
    }));
  }
  if (definition.scale.enabled) {
    const handles: DecorHandle[] = [];
    for (const u of [-1, 1] as const) {
      for (const v of [-1, 1] as const) {
        handles.push({ kind: "scale", u, v, point: add(add(frame.centre, frame.along, u * frame.halfAlong), frame.across, v * frame.halfAcross) });
      }
    }
    return handles;
  }
  return [];
}

/** Which world axis the item's length runs on when it is square to the room, else null. */
function straightAxis(along: RoomPoint): "x" | "z" | null {
  if (Math.abs(along.x) > 0.999) return "x";
  if (Math.abs(along.z) > 0.999) return "z";
  return null;
}

/**
 * The largest value in [min, max] that fits, by bisection. `fits` must be
 * monotone — once a size is too big every bigger one is — which holds for a
 * box growing from a fixed anchor.
 */
function largestFitting(min: number, max: number, fits: (value: number) => boolean): number | null {
  if (max <= min) return fits(min) ? min : null;
  if (fits(max)) return max;
  if (!fits(min)) return null;
  let lo = min;
  let hi = max;
  for (let step = 0; step < BISECTION_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** True when placing the item at `centre` leaves it exactly there: nothing clamped it and nothing blocked it. */
function placedExactly(result: DecorResult, centre: RoomPoint, mount: RoomDecorItem["mount"]): boolean {
  if (!result.valid) return false;
  const placed = result.layout.decor.find((candidate) => candidate.instanceId === result.instanceId);
  if (!placed) return false;
  const dy = mount === "wall" ? Math.abs(placed.y - centre.y) : 0;
  return Math.abs(placed.x - centre.x) < FIT_TOLERANCE && Math.abs(placed.z - centre.z) < FIT_TOLERANCE && dy < FIT_TOLERANCE;
}

function withItem(layout: RoomLayout, item: RoomDecorItem): RoomLayout {
  return { ...layout, decor: layout.decor.map((candidate) => candidate.instanceId === item.instanceId ? item : candidate) };
}

/**
 * Stretch one end of the item to the pointer. The other end is the anchor;
 * the new length is how far the pointer is from it along the item, snapped,
 * clamped to the item's range and shrunk until the item fits.
 */
export function stretchDecorEnd(
  layout: RoomLayout,
  instanceId: string,
  end: -1 | 1,
  point: RoomPoint,
  room: RoomBounds,
  catalog: FootprintCatalog,
  snapThreshold = 0,
): ResizeResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing", guides: [] };
  const { item, definition } = found;
  if (!definition.length.enabled) return { valid: false, layout, instanceId, reason: "not-stretchable", guides: [] };
  const frame = decorFrame(item, definition, room);
  const outward: RoomPoint = { x: frame.along.x * end, y: 0, z: frame.along.z * end };
  const anchor = add(frame.centre, frame.along, -end * frame.halfAlong);
  let requested = dot(sub(point, anchor), outward);
  let guides: readonly AlignGuide[] = [];
  const axis = straightAxis(frame.along);
  if (axis && snapThreshold > 0) {
    const anchorAlong = anchor[axis];
    const freeEnd = anchorAlong + requested * outward[axis];
    const otherAxis = item.mount === "wall" ? "y" : axis === "x" ? "z" : "x";
    const acrossCentre = otherAxis === "y" ? item.y : frame.centre[otherAxis];
    const snapped = alignStretchEnd(
      layout, instanceId, item.mount, item.wall as WallSide, axis, freeEnd,
      [acrossCentre - frame.halfAcross, acrossCentre + frame.halfAcross], room, catalog, snapThreshold,
    );
    if (snapped.guides.length) {
      requested = (snapped.end - anchorAlong) * outward[axis];
      guides = snapped.guides;
    }
  }
  // A pointer dragged back past the anchor asks for a negative length; that means "as short as it goes".
  const wanted = clampDecorLength(definition, Math.max(definition.length.min, requested));
  const attempt = (length: number): DecorResult => {
    const centre = add(anchor, outward, length / 2);
    const next = withItem(layout, { ...item, length });
    return placeDecorItem(next, instanceId, { mount: item.mount, point: centre }, room, catalog);
  };
  const fitted = largestFitting(definition.length.min, wanted, (length) => placedExactly(attempt(length), add(anchor, outward, length / 2), item.mount));
  if (fitted === null) return { valid: false, layout, instanceId, reason: "blocked", guides: [] };
  // Floor to the stored precision: rounding up by a hair would put the free end back outside.
  const length = clampDecorLength(definition, Math.floor(fitted * 1000) / 1000);
  const result = attempt(length);
  // A snap the fit had to back off from is no longer true, so its guide must not be drawn.
  return { ...result, guides: Math.abs(length - wanted) < FIT_TOLERANCE ? guides : [] };
}

/**
 * Scale the item from one corner to the pointer. The opposite corner is the
 * anchor; the pointer's distance along the item's diagonal, relative to the
 * catalog-size diagonal, is the new scale, clamped to the item's range and
 * shrunk until the item fits.
 */
export function scaleDecorCorner(
  layout: RoomLayout,
  instanceId: string,
  u: -1 | 1,
  v: -1 | 1,
  point: RoomPoint,
  room: RoomBounds,
  catalog: FootprintCatalog,
): ResizeResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing", guides: [] };
  const { item, definition } = found;
  if (!definition.scale.enabled) return { valid: false, layout, instanceId, reason: "not-scalable", guides: [] };
  const frame = decorFrame(item, definition, room);
  const base = decorExtent(definition, item.length, 1);
  const baseAcross = item.mount === "wall" ? base.height : base.depth;
  const anchor = add(add(frame.centre, frame.along, -u * frame.halfAlong), frame.across, -v * frame.halfAcross);
  // The full diagonal at scale 1, from the anchor to the dragged corner.
  const diagonal = add({ x: frame.along.x * u * base.width, y: frame.along.y * u * base.width, z: frame.along.z * u * base.width }, frame.across, v * baseAcross);
  const diagonalLength = Math.hypot(diagonal.x, diagonal.y, diagonal.z);
  const requested = dot(sub(point, anchor), diagonal) / (diagonalLength * diagonalLength);
  // A corner dragged back past the anchor asks for a negative size; that means "as small as it goes".
  const wanted = clampDecorScale(definition, Math.max(definition.scale.min, requested));
  const centreAt = (scale: number): RoomPoint => add(anchor, diagonal, scale / 2);
  const attempt = (scale: number): DecorResult => {
    const next = withItem(layout, { ...item, scale });
    return placeDecorItem(next, instanceId, { mount: item.mount, point: centreAt(scale) }, room, catalog);
  };
  const fitted = largestFitting(definition.scale.min, wanted, (scale) => placedExactly(attempt(scale), centreAt(scale), item.mount));
  if (fitted === null) return { valid: false, layout, instanceId, reason: "blocked", guides: [] };
  const result = attempt(clampDecorScale(definition, Math.floor(fitted * 100) / 100));
  return { ...result, guides: [] };
}
