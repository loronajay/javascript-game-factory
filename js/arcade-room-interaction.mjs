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
