import { findDecor } from "./arcade-room-catalog/decor.mjs";
export const CABINET_SESSION_READY = "ready";
export const CABINET_SESSION_PLAYING = "playing";
export const CABINET_SESSION_CLOSED = "closed";
function normalizedDot(a, b) {
    const aLength = Math.hypot(a.x, a.z);
    const bLength = Math.hypot(b.x, b.z);
    if (aLength === 0 || bLength === 0)
        return -1;
    return (a.x * b.x + a.z * b.z) / (aLength * bLength);
}
export function canInteractWithCabinet(player, cabinet) {
    const cabinetToPlayer = {
        x: player.x - cabinet.position.x,
        z: player.z - cabinet.position.z,
    };
    const distance = Math.hypot(cabinetToPlayer.x, cabinetToPlayer.z);
    if (distance > cabinet.radius)
        return false;
    const playerToCabinet = { x: -cabinetToPlayer.x, z: -cabinetToPlayer.z };
    const playerIsFacingCabinet = normalizedDot(player.forward, playerToCabinet) >= cabinet.facingThreshold;
    const playerIsInFront = normalizedDot(cabinet.forward, cabinetToPlayer) >= 0;
    return playerIsFacingCabinet && playerIsInFront;
}
/**
 * The nearest placed decor item the player can open right now, by the same reach rules a
 * cabinet uses. A wall item's local +Z faces into the room, so its forward is its rotation.
 */
export function findInteractiveDecor(decor, player) {
    let hit = null;
    let nearest = Infinity;
    for (const item of decor) {
        const definition = findDecor(item.itemId);
        if (!definition?.interaction)
            continue;
        const reachable = canInteractWithCabinet(player, {
            position: { x: item.x, z: item.z },
            forward: { x: Math.sin(item.rotationY), z: Math.cos(item.rotationY) },
            radius: definition.interaction.radius,
            facingThreshold: definition.interaction.facingThreshold,
        });
        if (!reachable)
            continue;
        const distance = Math.hypot(player.x - item.x, player.z - item.z);
        if (distance < nearest) {
            nearest = distance;
            hit = { item, definition };
        }
    }
    return hit;
}
export const VISITOR_REACH = Object.freeze({ radius: 2.6, facingThreshold: 0.45 });
export function findVisitorInReach(player, visitors, rules = VISITOR_REACH) {
    let best = null;
    let bestDistance = Infinity;
    for (const visitor of visitors) {
        const toVisitor = { x: visitor.pose.x - player.x, z: visitor.pose.z - player.z };
        const distance = Math.hypot(toVisitor.x, toVisitor.z);
        if (distance > rules.radius || distance < 1e-6)
            continue;
        if (normalizedDot(player.forward, toVisitor) < rules.facingThreshold)
            continue;
        if (distance < bestDistance) {
            best = visitor;
            bestDistance = distance;
        }
    }
    return best;
}
/**
 * Where to stand on entering: the spawn point, unless somebody is already on it.
 * Everyone enters at the same spot, so two players who arrive together would
 * otherwise be inside each other. The offsets fan out sideways, nearest first.
 */
export const SPAWN_CLEARANCE = 0.7;
const SPAWN_OFFSETS = Object.freeze([0, 0.9, -0.9, 1.8, -1.8, 2.7, -2.7]);
export function spawnOffsetForCompany(spawn, company, clearance = SPAWN_CLEARANCE) {
    for (const offset of SPAWN_OFFSETS) {
        const x = spawn.x + offset;
        const clear = company.every((other) => Math.hypot(other.pose.x - x, other.pose.z - spawn.z) >= clearance);
        if (clear)
            return offset;
    }
    return SPAWN_OFFSETS[SPAWN_OFFSETS.length - 1];
}
export function getVisitorPrompt(name) {
    return `Press E to wave at ${name}`;
}
export function getCabinetPrompt(canInteract, title) {
    return canInteract ? `Press E to play ${title}` : "";
}
export function createCabinetSession(cabinetId) {
    return Object.freeze({ cabinetId, status: CABINET_SESSION_READY });
}
export function openCabinetSession(session) {
    if (session.status === CABINET_SESSION_PLAYING)
        return session;
    return Object.freeze({ ...session, status: CABINET_SESSION_PLAYING });
}
export function closeCabinetSession(session) {
    if (session.status === CABINET_SESSION_CLOSED)
        return session;
    return Object.freeze({ ...session, status: CABINET_SESSION_CLOSED });
}
