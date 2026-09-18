// Alignment guides: snapping a moving item to its neighbours.
//
// No THREE in here. While an item is dragged (or an end of it is stretched)
// its edges and centre are compared with every neighbour that shares its
// surface — floor items and cabinets against each other, wall items against
// the items on the same wall, ceiling items against ceiling items — plus the
// room's own edges and centre line. Within the threshold the item jumps onto
// the line and a guide is reported for the editor to draw. The threshold is
// the editor's to choose, in metres, because what counts as "close" depends
// on how far the camera is.
//
// A guide is a world-space segment: for a floor snap a line on the floor
// through both items along the aligned edge, for a wall snap a line on the
// wall face. The editor draws exactly what it is handed and nothing more, so
// what a player sees is precisely what snapped.
import { decorExtent, findDecor } from "./arcade-room-catalog/decor.mjs";
import { nearestWall } from "./arcade-room-decor-layout.mjs";
import { ROOM_BOUNDS_DEFAULTS, rotatedFootprint, } from "./arcade-room-layout.mjs";
const GUIDE_PAD = 0.3;
/** How far off a surface a guide is drawn so it is not swallowed by the floor or wall. */
const GUIDE_LIFT = 0.02;
function spanOf(centre, size) {
    return { lo: centre - size / 2, mid: centre, hi: centre + size / 2 };
}
function candidatesOf(span, across) {
    return [
        { value: span.lo, match: "edge", span: across },
        { value: span.hi, match: "edge", span: across },
        { value: span.mid, match: "mid", span: across },
    ];
}
/** The closest candidate within the threshold, as the shift that lands on it. */
function snapAxis(mine, candidates, threshold) {
    if (threshold <= 0)
        return null;
    let best = null;
    for (const candidate of candidates) {
        const points = candidate.match === "edge" ? [mine.lo, mine.hi] : [mine.mid];
        for (const point of points) {
            const delta = candidate.value - point;
            if (Math.abs(delta) >= threshold)
                continue;
            if (!best || Math.abs(delta) < Math.abs(best.delta))
                best = { delta, value: candidate.value, span: candidate.span };
        }
    }
    return best;
}
function union(first, second) {
    return [Math.min(first[0], second[0]) - GUIDE_PAD, Math.max(first[1], second[1]) + GUIDE_PAD];
}
function rounded(value) {
    return Number(value.toFixed(4));
}
function boxOf(placement, footprint) {
    const rotated = rotatedFootprint(placement, footprint);
    return { x: spanOf(placement.x, rotated.width), z: spanOf(placement.z, rotated.depth) };
}
/** Everything on the floor or ceiling the mover may line up with, as axis-aligned boxes. */
function neighbourBoxes(layout, movingId, mount, catalog) {
    const boxes = [];
    if (mount === "floor") {
        for (const item of layout.items) {
            if (item.hidden || item.instanceId === movingId)
                continue;
            const footprint = catalog[item.cabinetId];
            if (footprint)
                boxes.push(boxOf(item, footprint));
        }
    }
    for (const item of layout.decor) {
        if (item.mount !== mount || item.instanceId === movingId)
            continue;
        const definition = findDecor(item.itemId);
        if (!definition)
            continue;
        const extent = decorExtent(definition, item.length, item.scale);
        boxes.push(boxOf(item, { width: extent.width, depth: extent.depth }));
    }
    return boxes;
}
/**
 * Snap a placement on the floor (or ceiling) plane. Returns the placement to
 * use and the guides that explain it; with nothing in reach both are untouched.
 */
export function alignPlanePlacement(layout, movingId, placement, footprint, mount, room, catalog, threshold) {
    if (threshold <= 0)
        return { placement, guides: [] };
    const mine = boxOf(placement, footprint);
    const limitX = room.width / 2 - room.wallInset;
    const limitZ = room.depth / 2 - room.wallInset;
    const fullX = [-limitX, limitX];
    const fullZ = [-limitZ, limitZ];
    const xCandidates = [
        { value: -limitX, match: "edge", span: fullZ },
        { value: limitX, match: "edge", span: fullZ },
        { value: 0, match: "mid", span: fullZ },
    ];
    const zCandidates = [
        { value: -limitZ, match: "edge", span: fullX },
        { value: limitZ, match: "edge", span: fullX },
        { value: 0, match: "mid", span: fullX },
    ];
    for (const box of neighbourBoxes(layout, movingId, mount, catalog)) {
        xCandidates.push(...candidatesOf(box.x, [box.z.lo, box.z.hi]));
        zCandidates.push(...candidatesOf(box.z, [box.x.lo, box.x.hi]));
    }
    const snapX = snapAxis(mine.x, xCandidates, threshold);
    const snapZ = snapAxis(mine.z, zCandidates, threshold);
    const x = snapX ? rounded(placement.x + snapX.delta) : placement.x;
    const z = snapZ ? rounded(placement.z + snapZ.delta) : placement.z;
    const y = mount === "ceiling" ? (room.height ?? ROOM_BOUNDS_DEFAULTS.height) - GUIDE_LIFT : GUIDE_LIFT;
    const guides = [];
    if (snapX) {
        const [from, to] = union(snapX.span, [mine.z.lo + (z - placement.z), mine.z.hi + (z - placement.z)]);
        guides.push({ from: { x: snapX.value, y, z: from }, to: { x: snapX.value, y, z: to } });
    }
    if (snapZ) {
        const [from, to] = union(snapZ.span, [mine.x.lo + (x - placement.x), mine.x.hi + (x - placement.x)]);
        guides.push({ from: { x: from, y, z: snapZ.value }, to: { x: to, y, z: snapZ.value } });
    }
    return { placement: { x, z, rotationY: placement.rotationY }, guides };
}
/** The coordinate that runs along a wall, and the room's half-length along it. */
export function wallAlong(wall) {
    return wall === "north" || wall === "south" ? "x" : "z";
}
function wallLimits(wall, room) {
    const thickness = room.wallThickness ?? ROOM_BOUNDS_DEFAULTS.wallThickness;
    const halfWidth = room.width / 2 - thickness / 2;
    const halfDepth = room.depth / 2 - thickness / 2;
    const height = room.height ?? ROOM_BOUNDS_DEFAULTS.height;
    switch (wall) {
        case "north": return { half: halfWidth, face: -halfDepth, height };
        case "south": return { half: halfWidth, face: halfDepth, height };
        case "east": return { half: halfDepth, face: halfWidth, height };
        case "west": return { half: halfDepth, face: -halfWidth, height };
    }
}
/** A point on a wall face in world space, lifted a hair into the room. */
export function wallPointToWorld(wall, along, y, room) {
    const { face } = wallLimits(wall, room);
    const lift = face < 0 ? GUIDE_LIFT : -GUIDE_LIFT;
    return wallAlong(wall) === "x" ? { x: along, y, z: face + lift } : { x: face + lift, y, z: along };
}
function wallNeighbours(layout, movingId, wall) {
    const axis = wallAlong(wall);
    const boxes = [];
    for (const item of layout.decor) {
        if (item.mount !== "wall" || item.wall !== wall || item.instanceId === movingId)
            continue;
        const definition = findDecor(item.itemId);
        if (!definition)
            continue;
        const extent = decorExtent(definition, item.length, item.scale);
        boxes.push({ along: spanOf(item[axis], extent.width), y: spanOf(item.y, extent.height) });
    }
    return boxes;
}
/**
 * Snap a wall item's centre to the items on the same wall, the wall's corners,
 * the floor and the ceiling. `point` is the intended centre on the wall face.
 */
export function alignWallPoint(layout, movingId, point, wall, extent, room, threshold) {
    if (threshold <= 0)
        return { point, guides: [] };
    const axis = wallAlong(wall);
    const { half, height } = wallLimits(wall, room);
    const mine = { along: spanOf(point[axis], extent.width), y: spanOf(point.y, extent.height) };
    const fullAlong = [-half, half];
    const fullY = [0, height];
    const alongCandidates = [
        { value: -half, match: "edge", span: fullY },
        { value: half, match: "edge", span: fullY },
        { value: 0, match: "mid", span: fullY },
    ];
    const yCandidates = [
        { value: 0, match: "edge", span: fullAlong },
        { value: height, match: "edge", span: fullAlong },
    ];
    for (const box of wallNeighbours(layout, movingId, wall)) {
        alongCandidates.push(...candidatesOf(box.along, [box.y.lo, box.y.hi]));
        yCandidates.push(...candidatesOf(box.y, [box.along.lo, box.along.hi]));
    }
    const snapAlong = snapAxis(mine.along, alongCandidates, threshold);
    const snapY = snapAxis(mine.y, yCandidates, threshold);
    const along = snapAlong ? rounded(point[axis] + snapAlong.delta) : point[axis];
    const y = snapY ? rounded(point.y + snapY.delta) : point.y;
    const guides = [];
    if (snapAlong) {
        const [from, to] = union(snapAlong.span, [mine.y.lo + (y - point.y), mine.y.hi + (y - point.y)]);
        guides.push({ from: wallPointToWorld(wall, snapAlong.value, Math.max(0, from), room), to: wallPointToWorld(wall, snapAlong.value, Math.min(height, to), room) });
    }
    if (snapY) {
        const [from, to] = union(snapY.span, [mine.along.lo + (along - point[axis]), mine.along.hi + (along - point[axis])]);
        guides.push({ from: wallPointToWorld(wall, Math.max(-half, from), snapY.value, room), to: wallPointToWorld(wall, Math.min(half, to), snapY.value, room) });
    }
    const snapped = axis === "x" ? { x: along, y, z: point.z } : { x: point.x, y, z: along };
    return { point: snapped, guides };
}
/**
 * Snap a decor drag target. The mover's own extent comes from the layout; the
 * wall is the nearest one to the target, the same choice placement will make.
 */
export function alignDecorTarget(layout, instanceId, target, room, catalog, threshold) {
    const item = layout.decor.find((candidate) => candidate.instanceId === instanceId);
    const definition = item && findDecor(item.itemId);
    if (!item || !definition || threshold <= 0)
        return { target, guides: [] };
    const extent = decorExtent(definition, item.length, item.scale);
    if (target.mount === "wall") {
        const aligned = alignWallPoint(layout, instanceId, target.point, nearestWall(target.point, room), extent, room, threshold);
        return { target: { mount: "wall", point: aligned.point }, guides: aligned.guides };
    }
    const placement = { x: target.point.x, z: target.point.z, rotationY: item.rotationY };
    const aligned = alignPlanePlacement(layout, instanceId, placement, { width: extent.width, depth: extent.depth }, target.mount, room, catalog, threshold);
    return {
        target: { mount: target.mount, point: { x: aligned.placement.x, y: target.point.y, z: aligned.placement.z } },
        guides: aligned.guides,
    };
}
/** Snap a cabinet drag against the other cabinets, the solid floor decor and the room. */
export function alignCabinetPlacement(layout, instanceId, placement, room, catalog, threshold) {
    const item = layout.items.find((candidate) => candidate.instanceId === instanceId);
    const footprint = item && catalog[item.cabinetId];
    if (!footprint)
        return { placement, guides: [] };
    return alignPlanePlacement(layout, instanceId, placement, footprint, "floor", room, catalog, threshold);
}
/**
 * Snap the free end of a stretch to a neighbour's edge or the surface's end.
 * `along` is the axis the item runs on ("x"/"z" on a wall or an axis-aligned
 * floor item; anything else has no straight neighbours to line up with), and
 * `end` is the coordinate the pointer asked for on that axis.
 */
export function alignStretchEnd(layout, instanceId, mount, wall, along, end, across, room, catalog, threshold) {
    if (threshold <= 0)
        return { end, guides: [] };
    const mine = { lo: end, mid: end, hi: end };
    const candidates = [];
    let toWorld;
    if (mount === "wall") {
        const { half, height } = wallLimits(wall, room);
        candidates.push({ value: -half, match: "edge", span: [0, height] }, { value: half, match: "edge", span: [0, height] });
        for (const box of wallNeighbours(layout, instanceId, wall)) {
            candidates.push({ value: box.along.lo, match: "edge", span: [box.y.lo, box.y.hi] }, { value: box.along.hi, match: "edge", span: [box.y.lo, box.y.hi] });
        }
        toWorld = (value, acrossValue) => wallPointToWorld(wall, value, Math.min(height, Math.max(0, acrossValue)), room);
    }
    else {
        const limit = along === "x" ? room.width / 2 - room.wallInset : room.depth / 2 - room.wallInset;
        const other = along === "x" ? "z" : "x";
        const otherLimit = other === "x" ? room.width / 2 - room.wallInset : room.depth / 2 - room.wallInset;
        candidates.push({ value: -limit, match: "edge", span: [-otherLimit, otherLimit] }, { value: limit, match: "edge", span: [-otherLimit, otherLimit] });
        for (const box of neighbourBoxes(layout, instanceId, mount, catalog)) {
            const span = [box[other].lo, box[other].hi];
            candidates.push({ value: box[along].lo, match: "edge", span }, { value: box[along].hi, match: "edge", span });
        }
        const y = mount === "ceiling" ? (room.height ?? ROOM_BOUNDS_DEFAULTS.height) - GUIDE_LIFT : GUIDE_LIFT;
        toWorld = (value, acrossValue) => along === "x" ? { x: value, y, z: acrossValue } : { x: acrossValue, y, z: value };
    }
    const snap = snapAxis(mine, candidates, threshold);
    if (!snap)
        return { end, guides: [] };
    const [from, to] = union(snap.span, across);
    return { end: rounded(snap.value), guides: [{ from: toWorld(snap.value, from), to: toWorld(snap.value, to) }] };
}
