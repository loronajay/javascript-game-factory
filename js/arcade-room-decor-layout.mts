// Placing decor: the pure rules for where a strip, sign, rug or prop may go.
//
// No THREE in here. The editor turns a pointer into a point on the floor, a
// wall or the ceiling plane and hands it in; everything that decides where the
// item ends up — which wall is nearest, how far along it may slide, whether a
// prop overlaps a cabinet — is arithmetic that runs under node.
//
// THREE MOUNTS, THREE RULES. A floor item is placed like a cabinet (clamped to
// the room, rotated freely, refused when it overlaps another solid). A wall
// item snaps to the nearest wall's inner face, slides along it, and always
// faces into the room, so it has no free rotation. A ceiling item hangs from
// the ceiling plane and rotates freely. Rugs and lights never block anything,
// so they may overlap whatever they like — that is what a rug is for.

import { clampDecorLength, clampDecorScale, decorExtent, decorFootprint, findDecor, type DecorDefinition, type DecorMount } from "./arcade-room-catalog/decor.mjs";
import {
  ROOM_BOUNDS_DEFAULTS,
  WALL_SIDES,
  clampPlacementToRoom,
  placementBlocked,
  type FootprintCatalog,
  type RoomBounds,
  type RoomDecorItem,
  type RoomLayout,
  type WallSide,
} from "./arcade-room-layout.mjs";

export type RoomPoint = Readonly<{ x: number; y: number; z: number }>;
export type DecorTarget = Readonly<{ mount: DecorMount; point: RoomPoint }>;
export type DecorResult = Readonly<{ valid: boolean; layout: RoomLayout; instanceId: string; reason: string }>;

/** How much of the wall's centre-to-face half thickness plus a hair, so an item hangs on the face not in it. */
function wallFace(room: RoomBounds): { halfWidth: number; halfDepth: number; height: number } {
  const thickness = room.wallThickness ?? ROOM_BOUNDS_DEFAULTS.wallThickness;
  return {
    halfWidth: room.width / 2 - thickness / 2,
    halfDepth: room.depth / 2 - thickness / 2,
    height: room.height ?? ROOM_BOUNDS_DEFAULTS.height,
  };
}

/** The rotation that faces an item hung on `wall` into the room. */
export function wallFacing(wall: WallSide): number {
  switch (wall) {
    case "north": return 0;
    case "south": return Math.PI;
    case "east": return -Math.PI / 2;
    case "west": return Math.PI / 2;
  }
}

/** The wall whose inner face is closest to the point. */
export function nearestWall(point: Readonly<{ x: number; z: number }>, room: RoomBounds): WallSide {
  const face = wallFace(room);
  const distances: Record<WallSide, number> = {
    north: Math.abs(point.z + face.halfDepth),
    south: Math.abs(point.z - face.halfDepth),
    east: Math.abs(point.x - face.halfWidth),
    west: Math.abs(point.x + face.halfWidth),
  };
  return WALL_SIDES.reduce((best, wall) => (distances[wall] < distances[best] ? wall : best), "north");
}

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * Pin a wall item to a wall: on the inner face, slid along it within the
 * corners, at a height that keeps the whole item on the wall.
 */
export function snapToWall(
  point: RoomPoint,
  wall: WallSide,
  room: RoomBounds,
  definition: DecorDefinition,
  length: number,
  scale = 1,
): Readonly<{ x: number; y: number; z: number; rotationY: number; wall: WallSide }> {
  const face = wallFace(room);
  const { width, height } = decorExtent(definition, length, scale);
  const halfHeight = height / 2;
  const y = rounded(Math.min(face.height - halfHeight, Math.max(halfHeight, point.y)));
  const alongLimitX = Math.max(0, face.halfWidth - width / 2);
  const alongLimitZ = Math.max(0, face.halfDepth - width / 2);
  const rotationY = wallFacing(wall);
  switch (wall) {
    case "north": return { x: rounded(Math.min(alongLimitX, Math.max(-alongLimitX, point.x))), y, z: rounded(-face.halfDepth), rotationY, wall };
    case "south": return { x: rounded(Math.min(alongLimitX, Math.max(-alongLimitX, point.x))), y, z: rounded(face.halfDepth), rotationY, wall };
    case "east": return { x: rounded(face.halfWidth), y, z: rounded(Math.min(alongLimitZ, Math.max(-alongLimitZ, point.z))), rotationY, wall };
    case "west": return { x: rounded(-face.halfWidth), y, z: rounded(Math.min(alongLimitZ, Math.max(-alongLimitZ, point.z))), rotationY, wall };
  }
}

function replaceDecor(layout: RoomLayout, item: RoomDecorItem): RoomLayout {
  return { ...layout, decor: layout.decor.map((candidate) => candidate.instanceId === item.instanceId ? item : candidate) };
}

function findItem(layout: RoomLayout, instanceId: string): Readonly<{ item: RoomDecorItem; definition: DecorDefinition }> | null {
  const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
  const definition = item ? findDecor(item.itemId) : undefined;
  return item && definition ? { item, definition } : null;
}

/**
 * Move a decor item to a target. The mount is the one requested when the item
 * supports it, else the item's current mount; a strip dragged from the wall onto
 * the floor changes mount, a poster dragged toward the floor stays a wall item
 * and slides down the nearest wall instead.
 */
export function placeDecorItem(
  layout: RoomLayout,
  instanceId: string,
  target: DecorTarget,
  room: RoomBounds,
  catalog: FootprintCatalog,
  rotationY?: number,
): DecorResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing" };
  const { item, definition } = found;
  const mount = definition.mounts.includes(target.mount) ? target.mount : item.mount;
  const rotation = rotationY ?? item.rotationY;
  const face = wallFace(room);

  if (mount === "wall") {
    const wall = nearestWall(target.point, room);
    const snapped = snapToWall(target.point, wall, room, definition, item.length, item.scale);
    return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...item, ...snapped, mount }) };
  }

  const footprint = decorFootprint(definition, item.length, item.scale);
  const clamped = clampPlacementToRoom({ x: target.point.x, z: target.point.z, rotationY: rotation }, room, footprint);
  if (mount === "ceiling") {
    return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...item, ...clamped, y: rounded(face.height), mount, wall: "" }) };
  }
  if (definition.blocksWalking && placementBlocked(layout, instanceId, clamped, footprint, catalog)) {
    return { valid: false, layout, instanceId, reason: "blocked" };
  }
  return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...item, ...clamped, y: 0, mount, wall: "" }) };
}

export function rotateDecorItem(
  layout: RoomLayout,
  instanceId: string,
  direction: -1 | 1,
  snapDegrees: number,
  room: RoomBounds,
  catalog: FootprintCatalog,
): DecorResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing" };
  const { item } = found;
  // A wall item always faces the room; rotating it would turn it into the wall.
  if (item.mount === "wall") return { valid: false, layout, instanceId, reason: "wall" };
  const rotationY = item.rotationY + direction * snapDegrees * Math.PI / 180;
  return placeDecorItem(layout, instanceId, { mount: item.mount, point: item }, room, catalog, rotationY);
}

export function setDecorColor(layout: RoomLayout, instanceId: string, color: string): DecorResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing" };
  if (!found.definition.tint.enabled) return { valid: false, layout, instanceId, reason: "not-tintable" };
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { valid: false, layout, instanceId, reason: "bad-color" };
  return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...found.item, color: color.toLowerCase() }) };
}

/** Change a stretchable item's length and re-place it so the new extent still fits. */
export function setDecorLength(
  layout: RoomLayout,
  instanceId: string,
  length: number,
  room: RoomBounds,
  catalog: FootprintCatalog,
): DecorResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing" };
  if (!found.definition.length.enabled) return { valid: false, layout, instanceId, reason: "not-stretchable" };
  const next = replaceDecor(layout, { ...found.item, length: clampDecorLength(found.definition, length) });
  const placed = placeDecorItem(next, instanceId, { mount: found.item.mount, point: found.item }, room, catalog);
  // A longer prop that now overlaps a neighbour keeps its old length rather than sitting inside it.
  return placed.valid ? placed : { valid: false, layout, instanceId, reason: placed.reason };
}

/** Resize a resizable item and re-place it so the new extent still fits; refused when it would grow into a neighbour. */
export function setDecorScale(
  layout: RoomLayout,
  instanceId: string,
  scale: number,
  room: RoomBounds,
  catalog: FootprintCatalog,
): DecorResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing" };
  if (!found.definition.scale.enabled) return { valid: false, layout, instanceId, reason: "not-scalable" };
  const next = replaceDecor(layout, { ...found.item, scale: clampDecorScale(found.definition, scale) });
  const placed = placeDecorItem(next, instanceId, { mount: found.item.mount, point: found.item }, room, catalog);
  return placed.valid ? placed : { valid: false, layout, instanceId, reason: placed.reason };
}

export function removeDecorItem(layout: RoomLayout, instanceId: string): RoomLayout {
  return { ...layout, decor: layout.decor.filter((item) => item.instanceId !== instanceId) };
}

/** An instance id that is unique in the layout: `<slug>-<n>` with the lowest free n. */
export function nextDecorInstanceId(layout: RoomLayout, definition: DecorDefinition): string {
  const slug = definition.id.split(".").pop() ?? "item";
  const taken = new Set([...layout.items.map((item) => item.instanceId), ...layout.decor.map((item) => item.instanceId)]);
  let n = 1;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

/** Search offsets when the first spot is taken: outward rings on the floor. */
const SEARCH_OFFSETS: readonly Readonly<{ x: number; z: number }>[] = Object.freeze([
  { x: 0, z: 0 },
  ...[1, 2, 3, 4, 5].flatMap((ring) => [
    { x: ring, z: 0 }, { x: -ring, z: 0 }, { x: 0, z: ring }, { x: 0, z: -ring },
    { x: ring, z: ring }, { x: -ring, z: ring }, { x: ring, z: -ring }, { x: -ring, z: -ring },
  ]),
]);

/**
 * Add a catalog item to the room. With no `at`, the item goes to a sensible
 * default for its first mount: the middle of the floor, the middle of the north
 * wall at its catalog height, or the middle of the ceiling; a solid prop that
 * finds that spot taken walks outward until it finds room.
 */
export function addDecorItem(
  layout: RoomLayout,
  definition: DecorDefinition,
  room: RoomBounds,
  catalog: FootprintCatalog,
  at?: DecorTarget,
): DecorResult {
  const instanceId = nextDecorInstanceId(layout, definition);
  const mount = at && definition.mounts.includes(at.mount) ? at.mount : definition.mounts[0]!;
  const face = wallFace(room);
  const seed: RoomDecorItem = {
    instanceId,
    itemId: definition.id,
    x: 0,
    y: 0,
    z: 0,
    rotationY: 0,
    mount,
    wall: mount === "wall" ? "north" : "",
    color: definition.tint.enabled ? definition.tint.default : "",
    length: definition.length.enabled ? definition.length.default : 0,
    scale: 1,
  };
  const withSeed: RoomLayout = { ...layout, decor: [...layout.decor, seed] };
  const base: RoomPoint = at?.point ?? (
    mount === "wall" ? { x: 0, y: definition.wallHeight, z: -face.halfDepth }
      : mount === "ceiling" ? { x: 0, y: face.height, z: 0 }
        : { x: 0, y: 0, z: 0 }
  );
  const offsets = mount === "floor" && definition.blocksWalking ? SEARCH_OFFSETS : SEARCH_OFFSETS.slice(0, 1);
  for (const offset of offsets) {
    const point = { x: base.x + offset.x, y: base.y, z: base.z + offset.z };
    const placed = placeDecorItem(withSeed, instanceId, { mount, point }, room, catalog);
    if (placed.valid) return placed;
  }
  return { valid: false, layout, instanceId, reason: "no-room" };
}

/** A copy of an item beside the original, keeping its colour, length and size. */
export function duplicateDecorItem(
  layout: RoomLayout,
  instanceId: string,
  room: RoomBounds,
  catalog: FootprintCatalog,
): DecorResult {
  const found = findItem(layout, instanceId);
  if (!found) return { valid: false, layout, instanceId, reason: "missing" };
  const { item, definition } = found;
  const { width } = decorFootprint(definition, item.length, item.scale);
  const step = width + 0.2;
  const along = item.mount === "wall" && (item.wall === "east" || item.wall === "west")
    ? { x: 0, z: step }
    : { x: step, z: 0 };
  const added = addDecorItem(layout, definition, room, catalog, {
    mount: item.mount,
    point: { x: item.x + along.x, y: item.y, z: item.z + along.z },
  });
  if (!added.valid) return added;
  const copy = added.layout.decor.find((candidate) => candidate.instanceId === added.instanceId)!;
  const finished = { ...copy, color: item.color, length: item.length, scale: item.scale, rotationY: item.mount === "wall" ? copy.rotationY : item.rotationY };
  // The copy was placed at catalog size; re-place it at the original's size so a big sign is not left hanging off the wall.
  const refit = placeDecorItem(replaceDecor(added.layout, finished), finished.instanceId, { mount: finished.mount, point: finished }, room, catalog);
  return refit.valid ? refit : { valid: false, layout, instanceId, reason: refit.reason };
}
