// Walking out through a gate. PURE — no THREE, no DOM.
//
// The farm and the Market Square are two fenced fields joined by a road. A gate
// that stands on a field's PERIMETER (on the fence line, not somewhere inside
// the field as a pen gate) is a way out: open it, walk into the gap, and you
// leave. The walker already keeps the body inside the field's bounds and a
// shut gate is solid, so the only way to stand in the last half metre before
// the fence line inside a gate's span is through an open perimeter gate — this
// module just names that moment. The farm uses it to leave for the square and
// the square uses the very same rule to go home.
import { findFarmDecor } from "./farm-catalog/decor.mjs";
/** A gate counts as a way out when its centre is this close to the field's edge. */
export const PERIMETER_TOLERANCE = 0.6;
/**
 * The body is in the gateway once it is on the gate's own line (this much
 * slack): a shut gate's padding stops the body short of it, an open one lets it
 * on through to the walker's edge.
 */
export const GATEWAY_DEPTH = 0.1;
/** Kept off each gate post so brushing the fence beside a gate never counts as walking through it. */
export const GATEWAY_POST_MARGIN = 0.2;
/** How far a point is from the nearest edge of the field. */
function edgeDistance(point, bounds) {
    return Math.min(bounds.width / 2 - Math.abs(point.x), bounds.depth / 2 - Math.abs(point.z));
}
/** The gates standing on the field's fence line. */
export function perimeterGates(decor, bounds) {
    return decor.filter((row) => Boolean(findFarmDecor(row.itemId)?.gate) && edgeDistance(row, bounds) <= bounds.wallInset + PERIMETER_TOLERANCE);
}
/**
 * The open perimeter gate the body is walking out through, or null. The body
 * must be inside the gate's span (clear of its posts) and on or past the
 * gate's line toward the field's edge.
 */
export function gatewayAt(decor, openDoors, pose, bounds) {
    for (const gate of perimeterGates(decor, bounds)) {
        if (!openDoors.has(gate.instanceId))
            continue;
        if (edgeDistance(pose, bounds) > edgeDistance(gate, bounds) + GATEWAY_DEPTH)
            continue;
        const width = findFarmDecor(gate.itemId).footprint.width;
        const dx = pose.x - gate.x;
        const dz = pose.z - gate.z;
        // Along the gate's own x axis (three's y rotation: +x maps to (cos, -sin)).
        const along = dx * Math.cos(gate.rotationY) - dz * Math.sin(gate.rotationY);
        const across = dx * Math.sin(gate.rotationY) + dz * Math.cos(gate.rotationY);
        if (Math.abs(along) <= width / 2 - GATEWAY_POST_MARGIN && Math.abs(across) <= 1)
            return gate;
    }
    return null;
}
