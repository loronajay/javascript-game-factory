import { DECOR_MOUNTS, clampDecorLength, clampDecorScale, decorFootprint, findDecor } from "./arcade-room-catalog/decor.mjs";
import { DEFAULT_SURFACE_IDS, SURFACE_KINDS, findSurface } from "./arcade-room-catalog/surfaces.mjs";
import { findJukeboxTrack } from "./arcade-room-catalog/jukebox.mjs";
export const ROOM_LAYOUT_STORAGE_KEY = "jgf.player-arcade.layout.v1";
export const WALL_SIDES = Object.freeze(["north", "south", "east", "west"]);
export const ROOM_BOUNDS_DEFAULTS = Object.freeze({ height: 4.8, wallThickness: 0.24 });
const DEFAULT_CABINETS = Object.freeze([
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
const DEFAULT_DECOR = Object.freeze([
    Object.freeze({ instanceId: "neon-strip-1", itemId: "decor.neon.strip", x: -3.1, y: 2.8, z: -9.88, rotationY: 0, mount: "wall", wall: "north", color: "#ff4d91", length: 2.4, scale: 1 }),
    Object.freeze({ instanceId: "neon-strip-2", itemId: "decor.neon.strip", x: 3.1, y: 2.8, z: -9.88, rotationY: 0, mount: "wall", wall: "north", color: "#53d8ff", length: 2.4, scale: 1 }),
    Object.freeze({ instanceId: "neon-strip-3", itemId: "decor.neon.strip", x: 0, y: 3.35, z: -9.88, rotationY: 0, mount: "wall", wall: "north", color: "#ffd33d", length: 1.8, scale: 1 }),
]);
const STARTER_NEON_INSTANCE_IDS = new Set(DEFAULT_DECOR.map((item) => item.instanceId));
function rounded(value) {
    return Number(value.toFixed(4));
}
/** The axis-aligned box a footprint covers once its rotation is applied. */
export function rotatedFootprint(placement, footprint) {
    const cosine = Math.abs(Math.cos(placement.rotationY));
    const sine = Math.abs(Math.sin(placement.rotationY));
    return {
        width: cosine * footprint.width + sine * footprint.depth,
        depth: sine * footprint.width + cosine * footprint.depth,
    };
}
export function defaultRoomSurfaces() {
    return { ...DEFAULT_SURFACE_IDS };
}
export function defaultRoomMusic() {
    return { defaultTrackId: "" };
}
export function createDefaultRoomLayout() {
    return {
        version: 2,
        surfaces: defaultRoomSurfaces(),
        music: defaultRoomMusic(),
        items: DEFAULT_CABINETS.map((item) => ({ ...item })),
        decor: DEFAULT_DECOR.map((item) => ({ ...item })),
    };
}
/** Take down only the three neon strips shipped with the starter room. */
export function removeStarterNeon(layout) {
    const decor = layout.decor.filter((item) => !STARTER_NEON_INSTANCE_IDS.has(item.instanceId));
    return decor.length === layout.decor.length ? layout : { ...layout, decor };
}
export function clampPlacementToRoom(placement, room, footprint) {
    const rotated = rotatedFootprint(placement, footprint);
    const limitX = Math.max(0, room.width / 2 - room.wallInset - rotated.width / 2);
    const limitZ = Math.max(0, room.depth / 2 - room.wallInset - rotated.depth / 2);
    return {
        x: rounded(Math.min(limitX, Math.max(-limitX, placement.x))),
        z: rounded(Math.min(limitZ, Math.max(-limitZ, placement.z))),
        rotationY: placement.rotationY,
    };
}
export function rotatePlacement(placement, direction, snapDegrees) {
    const snapRadians = snapDegrees * Math.PI / 180;
    return {
        ...placement,
        rotationY: placement.rotationY + direction * snapRadians,
    };
}
export function worldPointFromPlacement(placement, localPoint) {
    const cosine = Math.cos(placement.rotationY);
    const sine = Math.sin(placement.rotationY);
    return {
        x: placement.x + localPoint.x * cosine + localPoint.z * sine,
        z: placement.z - localPoint.x * sine + localPoint.z * cosine,
    };
}
export function placementsOverlap(first, firstFootprint, second, secondFootprint) {
    const firstRotated = rotatedFootprint(first, firstFootprint);
    const secondRotated = rotatedFootprint(second, secondFootprint);
    return Math.abs(first.x - second.x) < (firstRotated.width + secondRotated.width) / 2
        && Math.abs(first.z - second.z) < (firstRotated.depth + secondRotated.depth) / 2;
}
/** The cabinets actually standing on the floor. */
export function visibleRoomItems(layout) {
    return layout.items.filter((item) => !item.hidden);
}
/**
 * Everything on the floor that takes space: visible cabinets plus solid floor
 * decor. Rugs, wall and ceiling items are not obstacles. This is the one list
 * placement checks and the walking player both consult.
 */
export function floorObstacles(layout, catalog) {
    const obstacles = [];
    for (const item of layout.items) {
        if (item.hidden)
            continue;
        const footprint = catalog[item.cabinetId];
        if (footprint)
            obstacles.push({ instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint });
    }
    for (const item of layout.decor) {
        if (item.mount !== "floor")
            continue;
        const definition = findDecor(item.itemId);
        if (!definition || !definition.blocksWalking)
            continue;
        obstacles.push({ instanceId: item.instanceId, x: item.x, z: item.z, rotationY: item.rotationY, footprint: decorFootprint(definition, item.length, item.scale) });
    }
    return obstacles;
}
/** True when the spot is taken by some other obstacle. */
export function placementBlocked(layout, instanceId, placement, footprint, catalog) {
    return floorObstacles(layout, catalog).some((other) => other.instanceId !== instanceId && placementsOverlap(placement, footprint, other, other.footprint));
}
export function updateItemPlacement(layout, instanceId, placement, room, catalog) {
    const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
    const footprint = item ? catalog[item.cabinetId] : undefined;
    if (!item || !footprint)
        return { valid: false, layout, placement };
    const clamped = clampPlacementToRoom(placement, room, footprint);
    if (placementBlocked(layout, instanceId, clamped, footprint, catalog))
        return { valid: false, layout, placement: clamped };
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
export function setItemHidden(layout, instanceId, hidden, room, catalog) {
    const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
    const footprint = item ? catalog[item.cabinetId] : undefined;
    if (!item || !footprint)
        return { valid: false, layout };
    if (item.hidden === hidden)
        return { valid: true, layout };
    const withItem = (replacement) => ({
        ...layout,
        items: layout.items.map((candidate) => candidate.instanceId === instanceId ? replacement : candidate),
    });
    if (hidden)
        return { valid: true, layout: withItem({ ...item, hidden: true }) };
    const starter = DEFAULT_CABINETS.find((candidate) => candidate.cabinetId === item.cabinetId);
    const candidates = starter ? [item, starter] : [item];
    for (const candidate of candidates) {
        const clamped = clampPlacementToRoom(candidate, room, footprint);
        if (placementBlocked(layout, instanceId, clamped, footprint, catalog))
            continue;
        return { valid: true, layout: withItem({ ...item, ...clamped, hidden: false }) };
    }
    return { valid: false, layout };
}
/** Swap one surface. Unknown ids are refused rather than stored. */
export function setRoomSurface(layout, kind, id) {
    if (!findSurface(kind, id))
        return { valid: false, layout };
    if (layout.surfaces[kind] === id)
        return { valid: true, layout };
    return { valid: true, layout: { ...layout, surfaces: { ...layout.surfaces, [kind]: id } } };
}
/** Pick the house record, or "" for none. A track the jukebox does not carry is refused rather than stored. */
export function setRoomDefaultTrack(layout, trackId) {
    if (trackId !== "" && !findJukeboxTrack(trackId))
        return { valid: false, layout };
    if (layout.music.defaultTrackId === trackId)
        return { valid: true, layout };
    return { valid: true, layout: { ...layout, music: { defaultTrackId: trackId } } };
}
function isStoredItem(value) {
    if (!value || typeof value !== "object")
        return false;
    const item = value;
    return typeof item.instanceId === "string"
        && item.instanceId.length > 0
        && typeof item.cabinetId === "string"
        && item.cabinetId.length > 0
        && Number.isFinite(item.x)
        && Number.isFinite(item.z)
        && Number.isFinite(item.rotationY);
}
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
export function isHexColor(value) {
    return typeof value === "string" && HEX_COLOR.test(value);
}
/**
 * Coerce one stored decor row, or drop it. An unknown item id is dropped (the
 * catalog entry it named is gone); a mount the item does not support falls back
 * to its first mount; a bad colour, length or scale falls back to the catalog default.
 */
export function normalizeDecorItem(value) {
    if (!value || typeof value !== "object")
        return null;
    const source = value;
    if (typeof source.instanceId !== "string" || !source.instanceId || typeof source.itemId !== "string")
        return null;
    const definition = findDecor(source.itemId);
    if (!definition)
        return null;
    if (!Number.isFinite(source.x) || !Number.isFinite(source.z) || !Number.isFinite(source.rotationY))
        return null;
    const mount = DECOR_MOUNTS.includes(source.mount) && definition.mounts.includes(source.mount)
        ? source.mount
        : definition.mounts[0];
    const wall = mount === "wall" && WALL_SIDES.includes(source.wall) ? source.wall : "";
    if (mount === "wall" && !wall)
        return null;
    return {
        instanceId: source.instanceId,
        itemId: source.itemId,
        x: source.x,
        y: Number.isFinite(source.y) ? source.y : 0,
        z: source.z,
        rotationY: source.rotationY,
        mount,
        wall,
        color: definition.tint.enabled && isHexColor(source.color) ? source.color.toLowerCase() : "",
        length: definition.length.enabled ? clampDecorLength(definition, typeof source.length === "number" ? source.length : 0) : 0,
        scale: clampDecorScale(definition, typeof source.scale === "number" ? source.scale : 1),
    };
}
/** A stale id — a record that left the catalog — comes back as none rather than as a broken room. */
function normalizeMusic(value) {
    const source = (value && typeof value === "object" ? value : {});
    const trackId = typeof source.defaultTrackId === "string" && findJukeboxTrack(source.defaultTrackId) ? source.defaultTrackId : "";
    return { defaultTrackId: trackId };
}
function normalizeSurfaces(value) {
    const source = (value && typeof value === "object" ? value : {});
    const surfaces = defaultRoomSurfaces();
    for (const kind of SURFACE_KINDS) {
        const id = source[kind];
        if (typeof id === "string" && findSurface(kind, id))
            surfaces[kind] = id;
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
export function normalizeRoomLayout(value) {
    if (!value || typeof value !== "object")
        return createDefaultRoomLayout();
    const source = value;
    if ((source.version !== 1 && source.version !== 2) || !Array.isArray(source.items) || !source.items.every(isStoredItem)) {
        return createDefaultRoomLayout();
    }
    const instanceIds = new Set(source.items.map((item) => item.instanceId));
    if (instanceIds.size !== source.items.length)
        return createDefaultRoomLayout();
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
    let decor;
    if (Array.isArray(source.decor)) {
        const seen = new Set(instanceIds);
        decor = [];
        for (const raw of source.decor) {
            const item = normalizeDecorItem(raw);
            if (!item || seen.has(item.instanceId))
                continue;
            seen.add(item.instanceId);
            decor.push(item);
        }
    }
    else {
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
export function parseRoomLayout(serialized) {
    if (!serialized)
        return createDefaultRoomLayout();
    try {
        return normalizeRoomLayout(JSON.parse(serialized));
    }
    catch {
        return createDefaultRoomLayout();
    }
}
function decorItemsEqual(first, second) {
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
export function roomLayoutsEqual(first, second) {
    if (first.items.length !== second.items.length || first.decor.length !== second.decor.length)
        return false;
    if (SURFACE_KINDS.some((kind) => first.surfaces[kind] !== second.surfaces[kind]))
        return false;
    if (first.music.defaultTrackId !== second.music.defaultTrackId)
        return false;
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
