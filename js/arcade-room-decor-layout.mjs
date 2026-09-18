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
//
// A WALL ITEM MAY STILL TURN IN THE WALL'S PLANE. A spinnable item (the neon
// strip) carries a `spin`: 0 hangs level, π/2 stands it upright, anything in
// between is a slant. It keeps facing the room — `rotationY` is still the
// wall's — and the room it takes on the wall is its rotated bounding box
// (`wallExtent`), which is what the edge clamp and the neighbour snaps read.
import { clampDecorAspect, clampDecorLength, clampDecorScale, clampDecorSpin, cleanDecorText, decorExtent, decorFootprint, findDecor, isDecorImageUrl } from "./arcade-room-catalog/decor.mjs";
import { ROOM_BOUNDS_DEFAULTS, WALL_SIDES, clampPlacementToRoom, placementBlocked, } from "./arcade-room-layout.mjs";
/** How much of the wall's centre-to-face half thickness plus a hair, so an item hangs on the face not in it. */
function wallFace(room) {
    const thickness = room.wallThickness ?? ROOM_BOUNDS_DEFAULTS.wallThickness;
    return {
        halfWidth: room.width / 2 - thickness / 2,
        halfDepth: room.depth / 2 - thickness / 2,
        height: room.height ?? ROOM_BOUNDS_DEFAULTS.height,
    };
}
/** The rotation that faces an item hung on `wall` into the room. */
export function wallFacing(wall) {
    switch (wall) {
        case "north": return 0;
        case "south": return Math.PI;
        case "east": return -Math.PI / 2;
        case "west": return Math.PI / 2;
    }
}
/** The wall whose inner face is closest to the point. */
export function nearestWall(point, room) {
    const face = wallFace(room);
    const distances = {
        north: Math.abs(point.z + face.halfDepth),
        south: Math.abs(point.z - face.halfDepth),
        east: Math.abs(point.x - face.halfWidth),
        west: Math.abs(point.x + face.halfWidth),
    };
    return WALL_SIDES.reduce((best, wall) => (distances[wall] < distances[best] ? wall : best), "north");
}
function rounded(value) {
    return Number(value.toFixed(4));
}
/**
 * The room an item takes on its wall: its extent turned by its spin, as the
 * axis-aligned box along the wall (`width`) and up it (`height`). A level item
 * is its own extent; an upright strip is as wide as it is thick and as tall as
 * it is long.
 */
export function wallExtent(definition, finish = {}) {
    const { width, height } = decorExtent(definition, finish);
    const spin = clampDecorSpin(definition, finish.spin ?? 0);
    if (spin === 0)
        return { width, height };
    const cosine = Math.abs(Math.cos(spin));
    const sine = Math.abs(Math.sin(spin));
    return {
        width: Number((width * cosine + height * sine).toFixed(6)),
        height: Number((width * sine + height * cosine).toFixed(6)),
    };
}
/**
 * Pin a wall item to a wall: on the inner face, slid along it within the
 * corners, at a height that keeps the whole item on the wall.
 */
export function snapToWall(point, wall, room, definition, finish = {}) {
    const face = wallFace(room);
    const { width, height } = wallExtent(definition, finish);
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
function replaceDecor(layout, item) {
    return { ...layout, decor: layout.decor.map((candidate) => candidate.instanceId === item.instanceId ? item : candidate) };
}
function findItem(layout, instanceId) {
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
export function placeDecorItem(layout, instanceId, target, room, catalog, rotationY) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    const { item, definition } = found;
    const mount = definition.mounts.includes(target.mount) ? target.mount : item.mount;
    const rotation = rotationY ?? item.rotationY;
    const face = wallFace(room);
    if (mount === "wall") {
        const wall = nearestWall(target.point, room);
        const snapped = snapToWall(target.point, wall, room, definition, item);
        return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...item, ...snapped, mount }) };
    }
    // Off the wall the turn is `rotationY`; a spin only means something on a wall.
    const footprint = decorFootprint(definition, item);
    const clamped = clampPlacementToRoom({ x: target.point.x, z: target.point.z, rotationY: rotation }, room, footprint);
    if (mount === "ceiling") {
        return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...item, ...clamped, y: rounded(face.height), mount, wall: "", spin: 0 }) };
    }
    if (definition.blocksWalking && placementBlocked(layout, instanceId, clamped, footprint, catalog)) {
        return { valid: false, layout, instanceId, reason: "blocked" };
    }
    return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...item, ...clamped, y: 0, mount, wall: "", spin: 0 }) };
}
export function rotateDecorItem(layout, instanceId, direction, snapDegrees, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    const { item, definition } = found;
    // A wall item always faces the room; rotating it would turn it into the wall. A
    // spinnable one turns in the wall's plane instead.
    if (item.mount === "wall") {
        if (!definition.spin.enabled)
            return { valid: false, layout, instanceId, reason: "wall" };
        return setDecorSpin(layout, instanceId, item.spin * 180 / Math.PI + direction * snapDegrees, room, catalog);
    }
    const rotationY = item.rotationY + direction * snapDegrees * Math.PI / 180;
    return placeDecorItem(layout, instanceId, { mount: item.mount, point: item }, room, catalog, rotationY);
}
/**
 * Turn a wall item in its wall's plane to `degrees` (0 level, 90 upright) and
 * re-place it, because an upright strip near the ceiling needs to slide down
 * to stay on the wall. Refused for an item that cannot spin or is not on a wall.
 */
export function setDecorSpin(layout, instanceId, degrees, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    if (!found.definition.spin.enabled)
        return { valid: false, layout, instanceId, reason: "not-spinnable" };
    if (found.item.mount !== "wall")
        return { valid: false, layout, instanceId, reason: "not-on-wall" };
    if (!Number.isFinite(degrees))
        return { valid: false, layout, instanceId, reason: "bad-spin" };
    const spin = clampDecorSpin(found.definition, degrees * Math.PI / 180);
    const next = replaceDecor(layout, { ...found.item, spin });
    return placeDecorItem(next, instanceId, { mount: "wall", point: found.item }, room, catalog);
}
export function setDecorColor(layout, instanceId, color) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    if (!found.definition.tint.enabled)
        return { valid: false, layout, instanceId, reason: "not-tintable" };
    if (!/^#[0-9a-fA-F]{6}$/.test(color))
        return { valid: false, layout, instanceId, reason: "bad-color" };
    return { valid: true, instanceId, reason: "", layout: replaceDecor(layout, { ...found.item, color: color.toLowerCase() }) };
}
/** Change a stretchable item's length and re-place it so the new extent still fits. */
export function setDecorLength(layout, instanceId, length, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    if (!found.definition.length.enabled)
        return { valid: false, layout, instanceId, reason: "not-stretchable" };
    const next = replaceDecor(layout, { ...found.item, length: clampDecorLength(found.definition, length) });
    const placed = placeDecorItem(next, instanceId, { mount: found.item.mount, point: found.item }, room, catalog);
    // A longer prop that now overlaps a neighbour keeps its old length rather than sitting inside it.
    return placed.valid ? placed : { valid: false, layout, instanceId, reason: placed.reason };
}
/** Resize a resizable item and re-place it so the new extent still fits; refused when it would grow into a neighbour. */
export function setDecorScale(layout, instanceId, scale, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    if (!found.definition.scale.enabled)
        return { valid: false, layout, instanceId, reason: "not-scalable" };
    const next = replaceDecor(layout, { ...found.item, scale: clampDecorScale(found.definition, scale) });
    const placed = placeDecorItem(next, instanceId, { mount: found.item.mount, point: found.item }, room, catalog);
    return placed.valid ? placed : { valid: false, layout, instanceId, reason: placed.reason };
}
/**
 * Put the player's words on a custom sign and re-place it, because a longer
 * line is a wider sign and it may now hang off the end of the wall. An item
 * not built to carry words is refused; empty words are the catalog placeholder.
 */
export function setDecorText(layout, instanceId, text, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    if (!found.definition.text.enabled)
        return { valid: false, layout, instanceId, reason: "not-text" };
    const next = replaceDecor(layout, { ...found.item, text: cleanDecorText(text, found.definition.text.maxLength) });
    const placed = placeDecorItem(next, instanceId, { mount: found.item.mount, point: found.item }, room, catalog);
    return placed.valid ? placed : { valid: false, layout, instanceId, reason: placed.reason };
}
/**
 * Hang an uploaded picture in a custom poster. The frame takes the picture's
 * shape, so the item is re-placed for the same reason as a resize. Only a
 * platform upload URL is accepted; "" empties the frame.
 */
export function setDecorImage(layout, instanceId, image, aspect, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    if (!found.definition.image.enabled)
        return { valid: false, layout, instanceId, reason: "not-picture" };
    if (image !== "" && !isDecorImageUrl(image))
        return { valid: false, layout, instanceId, reason: "bad-image" };
    const next = replaceDecor(layout, { ...found.item, image, aspect: image ? clampDecorAspect(aspect) : 1 });
    const placed = placeDecorItem(next, instanceId, { mount: found.item.mount, point: found.item }, room, catalog);
    return placed.valid ? placed : { valid: false, layout, instanceId, reason: placed.reason };
}
export function removeDecorItem(layout, instanceId) {
    return { ...layout, decor: layout.decor.filter((item) => item.instanceId !== instanceId) };
}
/** An instance id that is unique in the layout: `<slug>-<n>` with the lowest free n. */
export function nextDecorInstanceId(layout, definition) {
    const slug = definition.id.split(".").pop() ?? "item";
    const taken = new Set([...layout.items.map((item) => item.instanceId), ...layout.decor.map((item) => item.instanceId)]);
    let n = 1;
    while (taken.has(`${slug}-${n}`))
        n += 1;
    return `${slug}-${n}`;
}
/** Search offsets when the first spot is taken: outward rings on the floor. */
const SEARCH_OFFSETS = Object.freeze([
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
export function addDecorItem(layout, definition, room, catalog, at) {
    const instanceId = nextDecorInstanceId(layout, definition);
    const mount = at && definition.mounts.includes(at.mount) ? at.mount : definition.mounts[0];
    const face = wallFace(room);
    const seed = {
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
        spin: 0,
        text: "",
        image: "",
        aspect: 1,
    };
    const withSeed = { ...layout, decor: [...layout.decor, seed] };
    const base = at?.point ?? (mount === "wall" ? { x: 0, y: definition.wallHeight, z: -face.halfDepth }
        : mount === "ceiling" ? { x: 0, y: face.height, z: 0 }
            : { x: 0, y: 0, z: 0 });
    const offsets = mount === "floor" && definition.blocksWalking ? SEARCH_OFFSETS : SEARCH_OFFSETS.slice(0, 1);
    for (const offset of offsets) {
        const point = { x: base.x + offset.x, y: base.y, z: base.z + offset.z };
        const placed = placeDecorItem(withSeed, instanceId, { mount, point }, room, catalog);
        if (placed.valid)
            return placed;
    }
    return { valid: false, layout, instanceId, reason: "no-room" };
}
/** A copy of an item beside the original, keeping its colour, length and size. */
export function duplicateDecorItem(layout, instanceId, room, catalog) {
    const found = findItem(layout, instanceId);
    if (!found)
        return { valid: false, layout, instanceId, reason: "missing" };
    const { item, definition } = found;
    const { width } = item.mount === "wall" ? wallExtent(definition, item) : decorFootprint(definition, item);
    const step = width + 0.2;
    const along = item.mount === "wall" && (item.wall === "east" || item.wall === "west")
        ? { x: 0, z: step }
        : { x: step, z: 0 };
    const added = addDecorItem(layout, definition, room, catalog, {
        mount: item.mount,
        point: { x: item.x + along.x, y: item.y, z: item.z + along.z },
    });
    if (!added.valid)
        return added;
    const copy = added.layout.decor.find((candidate) => candidate.instanceId === added.instanceId);
    const finished = { ...copy, color: item.color, length: item.length, scale: item.scale, spin: item.spin, text: item.text, image: item.image, aspect: item.aspect, rotationY: item.mount === "wall" ? copy.rotationY : item.rotationY };
    // The copy was placed at catalog size; re-place it at the original's size so a big sign is not left hanging off the wall.
    const refit = placeDecorItem(replaceDecor(added.layout, finished), finished.instanceId, { mount: finished.mount, point: finished }, room, catalog);
    return refit.valid ? refit : { valid: false, layout, instanceId, reason: refit.reason };
}
