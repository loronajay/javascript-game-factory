export const ROOM_LAYOUT_STORAGE_KEY = "jgf.player-arcade.layout.v1";
const DEFAULT_LAYOUT = Object.freeze({
    version: 1,
    items: Object.freeze([
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
    ]),
});
function rounded(value) {
    return Number(value.toFixed(4));
}
function rotatedFootprint(placement, footprint) {
    const cosine = Math.abs(Math.cos(placement.rotationY));
    const sine = Math.abs(Math.sin(placement.rotationY));
    return {
        width: cosine * footprint.width + sine * footprint.depth,
        depth: sine * footprint.width + cosine * footprint.depth,
    };
}
export function createDefaultRoomLayout() {
    return {
        version: 1,
        items: DEFAULT_LAYOUT.items.map((item) => ({ ...item })),
    };
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
/** Hidden cabinets take no floor space, so only the visible ones can block a spot. */
function placementBlocked(layout, instanceId, placement, footprint, catalog) {
    return layout.items.some((other) => {
        if (other.instanceId === instanceId || other.hidden)
            return false;
        const otherFootprint = catalog[other.cabinetId];
        return otherFootprint ? placementsOverlap(placement, footprint, other, otherFootprint) : false;
    });
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
    const starter = DEFAULT_LAYOUT.items.find((candidate) => candidate.cabinetId === item.cabinetId);
    const candidates = starter ? [item, starter] : [item];
    for (const candidate of candidates) {
        const clamped = clampPlacementToRoom(candidate, room, footprint);
        if (placementBlocked(layout, instanceId, clamped, footprint, catalog))
            continue;
        return { valid: true, layout: withItem({ ...item, ...clamped, hidden: false }) };
    }
    return { valid: false, layout };
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
/**
 * Coerce any stored or fetched document into a layout.
 *
 * Accepts the object shape directly so the same rules cover a row the platform
 * API hands back and a string the local cache held. An empty item list is not
 * malformed — it is what the server returns for a player with no row — and the
 * starter cabinets are added at their starter positions whenever a stored layout
 * has no placement for one of them, which is also how a newly granted cabinet
 * first appears in an existing room.
 */
export function normalizeRoomLayout(value) {
    if (!value || typeof value !== "object")
        return createDefaultRoomLayout();
    const source = value;
    if (source.version !== 1 || !Array.isArray(source.items) || !source.items.every(isStoredItem)) {
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
    const starterAdditions = DEFAULT_LAYOUT.items
        .filter((item) => !storedCabinetIds.has(item.cabinetId))
        .map((item) => ({ ...item }));
    return { version: 1, items: [...storedItems, ...starterAdditions] };
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
/** True when both layouts place the same items in the same spots. */
export function roomLayoutsEqual(first, second) {
    if (first.items.length !== second.items.length)
        return false;
    return first.items.every((item, index) => {
        const other = second.items[index];
        return other !== undefined
            && item.instanceId === other.instanceId
            && item.cabinetId === other.cabinetId
            && item.x === other.x
            && item.z === other.z
            && item.rotationY === other.rotationY
            && item.hidden === other.hidden;
    });
}
