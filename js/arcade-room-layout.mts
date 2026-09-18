import { DECOR_MOUNTS, clampDecorLength, clampDecorScale, decorFootprint, findDecor, type DecorMount } from "./arcade-room-catalog/decor.mjs";
import { DEFAULT_SURFACE_IDS, SURFACE_KINDS, findSurface, type SurfaceKind } from "./arcade-room-catalog/surfaces.mjs";
import { findJukeboxTrack } from "./arcade-room-catalog/jukebox.mjs";

export const ROOM_LAYOUT_STORAGE_KEY = "jgf.player-arcade.layout.v1";

export type RoomPlacement = Readonly<{
  x: number;
  z: number;
  rotationY: number;
}>;

export type RoomLayoutItem = RoomPlacement & Readonly<{
  instanceId: string;
  cabinetId: string;
  /**
   * A hidden cabinet is off the floor but still in the layout: it keeps its
   * placement so showing it again puts it back where it was, and it stays in
   * the document so the normalizer does not re-seed it as a starter cabinet.
   */
  hidden: boolean;
}>;

export type WallSide = "north" | "south" | "east" | "west";
export const WALL_SIDES: readonly WallSide[] = Object.freeze(["north", "south", "east", "west"]);

/**
 * A placed decor item. `x/z` is the item's centre on the floor plane; `y` is
 * the centre height for a wall item, the floor (0) for a floor item and the
 * ceiling height for a ceiling item. `wall` names which wall a wall-mounted
 * item hangs on, and its `rotationY` always faces into the room from there.
 */
export type RoomDecorItem = Readonly<{
  instanceId: string;
  itemId: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  mount: DecorMount;
  wall: WallSide | "";
  /** A `#rrggbb` tint for tintable items, "" for the catalog default. */
  color: string;
  /** The stretched width for stretchable items, 0 for the catalog default. */
  length: number;
  /** The size multiplier for resizable items; 1 is the catalog size and the only value a non-resizable item holds. */
  scale: number;
}>;

export type RoomSurfaces = Readonly<Record<SurfaceKind, string>>;

/**
 * The room's music. `defaultTrackId` is the house record — the jukebox track
 * that starts playing for anyone who walks in, through every jukebox and
 * speaker on the floor — or "" for a quiet room until somebody picks a record.
 */
export type RoomMusic = Readonly<{ defaultTrackId: string }>;

export type RoomLayout = Readonly<{
  version: 2;
  surfaces: RoomSurfaces;
  music: RoomMusic;
  items: readonly RoomLayoutItem[];
  decor: readonly RoomDecorItem[];
}>;

export type RoomBounds = Readonly<{
  width: number;
  depth: number;
  /** How far in from the wall's centre line a floor item's edge must stay. */
  wallInset: number;
  height?: number;
  wallThickness?: number;
}>;

export const ROOM_BOUNDS_DEFAULTS = Object.freeze({ height: 4.8, wallThickness: 0.24 });

export type ItemFootprint = Readonly<{ width: number; depth: number }>;
export type FootprintCatalog = Readonly<Record<string, ItemFootprint>>;

/** Anything standing on the floor that takes space: a visible cabinet or a solid decor item. */
export type FloorObstacle = RoomPlacement & Readonly<{ footprint: ItemFootprint; instanceId: string }>;

const DEFAULT_CABINETS: readonly RoomLayoutItem[] = Object.freeze([
  Object.freeze({
    instanceId: "bird-duty-1",
    cabinetId: "cabinet.bird-duty.standard",
    x: -1.35,
    z: -2.8,
    rotationY: 0,
    hidden: false,
  }),
  Object.freeze({
    instanceId: "lovers-lost-1",
    cabinetId: "cabinet.lovers-lost.standard",
    x: 1.35,
    z: -2.8,
    rotationY: 0,
    hidden: false,
  }),
  Object.freeze({
    instanceId: "sumorai-1",
    cabinetId: "cabinet.sumorai.standard",
    x: 0,
    z: -2.8,
    rotationY: 0,
    hidden: false,
  }),
]);

/**
 * The three neon bars the room shipped with, now ordinary decor on the north
 * wall so they can be moved, recoloured or taken down. `z` is the wall's inner
 * face for the 20 m starter room (wall centre −10, thickness 0.24).
 */
const DEFAULT_DECOR: readonly RoomDecorItem[] = Object.freeze([
  Object.freeze({ instanceId: "neon-strip-1", itemId: "decor.neon.strip", x: -3.1, y: 2.8, z: -9.88, rotationY: 0, mount: "wall" as const, wall: "north" as const, color: "#ff4d91", length: 2.4, scale: 1 }),
  Object.freeze({ instanceId: "neon-strip-2", itemId: "decor.neon.strip", x: 3.1, y: 2.8, z: -9.88, rotationY: 0, mount: "wall" as const, wall: "north" as const, color: "#53d8ff", length: 2.4, scale: 1 }),
  Object.freeze({ instanceId: "neon-strip-3", itemId: "decor.neon.strip", x: 0, y: 3.35, z: -9.88, rotationY: 0, mount: "wall" as const, wall: "north" as const, color: "#ffd33d", length: 1.8, scale: 1 }),
]);
const STARTER_NEON_INSTANCE_IDS = new Set(DEFAULT_DECOR.map((item) => item.instanceId));

function rounded(value: number): number {
  return Number(value.toFixed(4));
}

/** The axis-aligned box a footprint covers once its rotation is applied. */
export function rotatedFootprint(placement: RoomPlacement, footprint: ItemFootprint): ItemFootprint {
  const cosine = Math.abs(Math.cos(placement.rotationY));
  const sine = Math.abs(Math.sin(placement.rotationY));
  return {
    width: cosine * footprint.width + sine * footprint.depth,
    depth: sine * footprint.width + cosine * footprint.depth,
  };
}

export function defaultRoomSurfaces(): Record<SurfaceKind, string> {
  return { ...DEFAULT_SURFACE_IDS };
}

export function defaultRoomMusic(): RoomMusic {
  return { defaultTrackId: "" };
}

export function createDefaultRoomLayout(): RoomLayout {
  return {
    version: 2,
    surfaces: defaultRoomSurfaces(),
    music: defaultRoomMusic(),
    items: DEFAULT_CABINETS.map((item) => ({ ...item })),
    decor: DEFAULT_DECOR.map((item) => ({ ...item })),
  };
}

/** Take down only the three neon strips shipped with the starter room. */
export function removeStarterNeon(layout: RoomLayout): RoomLayout {
  const decor = layout.decor.filter((item) => !STARTER_NEON_INSTANCE_IDS.has(item.instanceId));
  return decor.length === layout.decor.length ? layout : { ...layout, decor };
}

export function clampPlacementToRoom(
  placement: RoomPlacement,
  room: RoomBounds,
  footprint: ItemFootprint,
): RoomPlacement {
  const rotated = rotatedFootprint(placement, footprint);
  const limitX = Math.max(0, room.width / 2 - room.wallInset - rotated.width / 2);
  const limitZ = Math.max(0, room.depth / 2 - room.wallInset - rotated.depth / 2);
  return {
    x: rounded(Math.min(limitX, Math.max(-limitX, placement.x))),
    z: rounded(Math.min(limitZ, Math.max(-limitZ, placement.z))),
    rotationY: placement.rotationY,
  };
}

export function rotatePlacement(placement: RoomPlacement, direction: -1 | 1, snapDegrees: number): RoomPlacement {
  const snapRadians = snapDegrees * Math.PI / 180;
  return {
    ...placement,
    rotationY: placement.rotationY + direction * snapRadians,
  };
}

export function worldPointFromPlacement(
  placement: RoomPlacement,
  localPoint: Readonly<{ x: number; z: number }>,
): { x: number; z: number } {
  const cosine = Math.cos(placement.rotationY);
  const sine = Math.sin(placement.rotationY);
  return {
    x: placement.x + localPoint.x * cosine + localPoint.z * sine,
    z: placement.z - localPoint.x * sine + localPoint.z * cosine,
  };
}

export function placementsOverlap(
  first: RoomPlacement,
  firstFootprint: ItemFootprint,
  second: RoomPlacement,
  secondFootprint: ItemFootprint,
): boolean {
  const firstRotated = rotatedFootprint(first, firstFootprint);
  const secondRotated = rotatedFootprint(second, secondFootprint);
  return Math.abs(first.x - second.x) < (firstRotated.width + secondRotated.width) / 2
    && Math.abs(first.z - second.z) < (firstRotated.depth + secondRotated.depth) / 2;
}

/** The cabinets actually standing on the floor. */
export function visibleRoomItems(layout: RoomLayout): readonly RoomLayoutItem[] {
  return layout.items.filter((item) => !item.hidden);
}

/**
 * Everything on the floor that takes space: visible cabinets plus solid floor
 * decor. Rugs, wall and ceiling items are not obstacles. This is the one list
 * placement checks and the walking player both consult.
 */
export function floorObstacles(layout: RoomLayout, catalog: FootprintCatalog): FloorObstacle[] {
  const obstacles: FloorObstacle[] = [];
  for (const item of layout.items) {
    if (item.hidden) continue;
    const footprint = catalog[item.cabinetId];
    if (footprint) obstacles.push({ instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint });
  }
  for (const item of layout.decor) {
    if (item.mount !== "floor") continue;
    const definition = findDecor(item.itemId);
    if (!definition || !definition.blocksWalking) continue;
    obstacles.push({ instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint: decorFootprint(definition, item.length, item.scale) });
  }
  return obstacles;
}

/** True when the spot is taken by some other obstacle. */
export function placementBlocked(
  layout: RoomLayout,
  instanceId: string,
  placement: RoomPlacement,
  footprint: ItemFootprint,
  catalog: FootprintCatalog,
): boolean {
  return floorObstacles(layout, catalog).some((other) =>
    other.instanceId !== instanceId && placementsOverlap(placement, footprint, other, other.footprint));
}

export function updateItemPlacement(
  layout: RoomLayout,
  instanceId: string,
  placement: RoomPlacement,
  room: RoomBounds,
  catalog: FootprintCatalog,
): Readonly<{ valid: boolean; layout: RoomLayout; placement: RoomPlacement }> {
  const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
  const footprint = item ? catalog[item.cabinetId] : undefined;
  if (!item || !footprint) return { valid: false, layout, placement };

  const clamped = clampPlacementToRoom(placement, room, footprint);
  if (placementBlocked(layout, instanceId, clamped, footprint, catalog)) return { valid: false, layout, placement: clamped };

  return {
    valid: true,
    placement: clamped,
    layout: {
      ...layout,
      items: layout.items.map((candidate) => candidate.instanceId === instanceId
        ? { ...candidate, ...clamped }
        : candidate),
    },
  };
}

/**
 * Take a cabinet off the floor or put it back.
 *
 * Hiding always succeeds. Showing tries the cabinet's remembered spot first and
 * its starter spot second, because the floor may have been rearranged over the
 * hole it left; when both are taken the caller is told so and nothing changes.
 */
export function setItemHidden(
  layout: RoomLayout,
  instanceId: string,
  hidden: boolean,
  room: RoomBounds,
  catalog: FootprintCatalog,
): Readonly<{ valid: boolean; layout: RoomLayout }> {
  const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
  const footprint = item ? catalog[item.cabinetId] : undefined;
  if (!item || !footprint) return { valid: false, layout };
  if (item.hidden === hidden) return { valid: true, layout };

  const withItem = (replacement: RoomLayoutItem): RoomLayout => ({
    ...layout,
    items: layout.items.map((candidate) => candidate.instanceId === instanceId ? replacement : candidate),
  });
  if (hidden) return { valid: true, layout: withItem({ ...item, hidden: true }) };

  const starter = DEFAULT_CABINETS.find((candidate) => candidate.cabinetId === item.cabinetId);
  const candidates: RoomPlacement[] = starter ? [item, starter] : [item];
  for (const candidate of candidates) {
    const clamped = clampPlacementToRoom(candidate, room, footprint);
    if (placementBlocked(layout, instanceId, clamped, footprint, catalog)) continue;
    return { valid: true, layout: withItem({ ...item, ...clamped, hidden: false }) };
  }
  return { valid: false, layout };
}

/** Swap one surface. Unknown ids are refused rather than stored. */
export function setRoomSurface(layout: RoomLayout, kind: SurfaceKind, id: string): Readonly<{ valid: boolean; layout: RoomLayout }> {
  if (!findSurface(kind, id)) return { valid: false, layout };
  if (layout.surfaces[kind] === id) return { valid: true, layout };
  return { valid: true, layout: { ...layout, surfaces: { ...layout.surfaces, [kind]: id } } };
}

/** Pick the house record, or "" for none. A track the jukebox does not carry is refused rather than stored. */
export function setRoomDefaultTrack(layout: RoomLayout, trackId: string): Readonly<{ valid: boolean; layout: RoomLayout }> {
  if (trackId !== "" && !findJukeboxTrack(trackId)) return { valid: false, layout };
  if (layout.music.defaultTrackId === trackId) return { valid: true, layout };
  return { valid: true, layout: { ...layout, music: { defaultTrackId: trackId } } };
}

function isStoredItem(value: unknown): value is RoomLayoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<RoomLayoutItem>;
  return typeof item.instanceId === "string"
    && item.instanceId.length > 0
    && typeof item.cabinetId === "string"
    && item.cabinetId.length > 0
    && Number.isFinite(item.x)
    && Number.isFinite(item.z)
    && Number.isFinite(item.rotationY);
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value);
}

/**
 * Coerce one stored decor row, or drop it. An unknown item id is dropped (the
 * catalog entry it named is gone); a mount the item does not support falls back
 * to its first mount; a bad colour, length or scale falls back to the catalog default.
 */
export function normalizeDecorItem(value: unknown): RoomDecorItem | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<RoomDecorItem>;
  if (typeof source.instanceId !== "string" || !source.instanceId || typeof source.itemId !== "string") return null;
  const definition = findDecor(source.itemId);
  if (!definition) return null;
  if (!Number.isFinite(source.x) || !Number.isFinite(source.z) || !Number.isFinite(source.rotationY)) return null;
  const mount = (DECOR_MOUNTS as readonly string[]).includes(source.mount as string) && definition.mounts.includes(source.mount as DecorMount)
    ? source.mount as DecorMount
    : definition.mounts[0]!;
  const wall = mount === "wall" && (WALL_SIDES as readonly string[]).includes(source.wall as string) ? source.wall as WallSide : "";
  if (mount === "wall" && !wall) return null;
  return {
    instanceId: source.instanceId,
    itemId: source.itemId,
    x: source.x as number,
    y: Number.isFinite(source.y) ? source.y as number : 0,
    z: source.z as number,
    rotationY: source.rotationY as number,
    mount,
    wall,
    color: definition.tint.enabled && isHexColor(source.color) ? source.color.toLowerCase() : "",
    length: definition.length.enabled ? clampDecorLength(definition, typeof source.length === "number" ? source.length : 0) : 0,
    scale: clampDecorScale(definition, typeof source.scale === "number" ? source.scale : 1),
  };
}

/** A stale id — a record that left the catalog — comes back as none rather than as a broken room. */
function normalizeMusic(value: unknown): RoomMusic {
  const source = (value && typeof value === "object" ? value : {}) as Partial<RoomMusic>;
  const trackId = typeof source.defaultTrackId === "string" && findJukeboxTrack(source.defaultTrackId) ? source.defaultTrackId : "";
  return { defaultTrackId: trackId };
}

function normalizeSurfaces(value: unknown): RoomSurfaces {
  const source = (value && typeof value === "object" ? value : {}) as Partial<Record<SurfaceKind, unknown>>;
  const surfaces: Record<SurfaceKind, string> = defaultRoomSurfaces();
  for (const kind of SURFACE_KINDS) {
    const id = source[kind];
    if (typeof id === "string" && findSurface(kind, id)) surfaces[kind] = id;
  }
  return surfaces;
}

/**
 * Coerce any stored or fetched document into a layout.
 *
 * Accepts the object shape directly so the same rules cover a row the platform
 * API hands back and a string the local cache held. An empty item list is not
 * malformed — it is what the server returns for a player with no row — and the
 * starter cabinets are added at their starter positions whenever a stored layout
 * has no placement for one of them, which is also how a newly granted cabinet
 * first appears in an existing room.
 *
 * Version 1 documents (cabinets only) are upgraded in place: they get the
 * starter surfaces and the starter neon, which is exactly the room they had.
 * A version 2 document with an EMPTY decor list keeps it empty — the player
 * took everything down — so starter decor is seeded only when the `decor`
 * array is missing altogether.
 */
export function normalizeRoomLayout(value: unknown): RoomLayout {
  if (!value || typeof value !== "object") return createDefaultRoomLayout();
  const source = value as { version?: unknown; items?: unknown; decor?: unknown; surfaces?: unknown; music?: unknown };
  if ((source.version !== 1 && source.version !== 2) || !Array.isArray(source.items) || !source.items.every(isStoredItem)) {
    return createDefaultRoomLayout();
  }
  const instanceIds = new Set(source.items.map((item) => item.instanceId));
  if (instanceIds.size !== source.items.length) return createDefaultRoomLayout();
  const storedItems = source.items.map((item) => ({
    instanceId: item.instanceId,
    cabinetId: item.cabinetId,
    x: item.x,
    z: item.z,
    rotationY: item.rotationY,
    hidden: item.hidden === true,
  }));
  const storedCabinetIds = new Set(storedItems.map((item) => item.cabinetId));
  const starterAdditions = DEFAULT_CABINETS
    .filter((item) => !storedCabinetIds.has(item.cabinetId))
    .map((item) => ({ ...item }));

  let decor: RoomDecorItem[];
  if (Array.isArray(source.decor)) {
    const seen = new Set<string>(instanceIds);
    decor = [];
    for (const raw of source.decor) {
      const item = normalizeDecorItem(raw);
      if (!item || seen.has(item.instanceId)) continue;
      seen.add(item.instanceId);
      decor.push(item);
    }
  } else {
    decor = DEFAULT_DECOR.map((item) => ({ ...item }));
  }

  return {
    version: 2,
    surfaces: normalizeSurfaces(source.surfaces),
    music: normalizeMusic(source.music),
    items: [...storedItems, ...starterAdditions],
    decor,
  };
}

export function parseRoomLayout(serialized: string | null): RoomLayout {
  if (!serialized) return createDefaultRoomLayout();
  try {
    return normalizeRoomLayout(JSON.parse(serialized));
  } catch {
    return createDefaultRoomLayout();
  }
}

function decorItemsEqual(first: RoomDecorItem, second: RoomDecorItem): boolean {
  return first.instanceId === second.instanceId
    && first.itemId === second.itemId
    && first.x === second.x
    && first.y === second.y
    && first.z === second.z
    && first.rotationY === second.rotationY
    && first.mount === second.mount
    && first.wall === second.wall
    && first.color === second.color
    && first.length === second.length
    && first.scale === second.scale;
}

/** True when both layouts place the same things in the same spots with the same finishes. */
export function roomLayoutsEqual(first: RoomLayout, second: RoomLayout): boolean {
  if (first.items.length !== second.items.length || first.decor.length !== second.decor.length) return false;
  if (SURFACE_KINDS.some((kind) => first.surfaces[kind] !== second.surfaces[kind])) return false;
  if (first.music.defaultTrackId !== second.music.defaultTrackId) return false;
  const itemsEqual = first.items.every((item, index) => {
    const other = second.items[index];
    return other !== undefined
      && item.instanceId === other.instanceId
      && item.cabinetId === other.cabinetId
      && item.x === other.x
      && item.z === other.z
      && item.rotationY === other.rotationY
      && item.hidden === other.hidden;
  });
  return itemsEqual && first.decor.every((item, index) => {
    const other = second.decor[index];
    return other !== undefined && decorItemsEqual(item, other);
  });
}
