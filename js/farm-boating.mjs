export const HARBOR_BOUNDS = Object.freeze({ minX: -70, maxX: 70, minZ: -95, maxZ: 22 });
export const HARBOR_ISLANDS = Object.freeze([
    Object.freeze({ x: -28, z: -36, radius: 12, title: "Gull Island" }),
    Object.freeze({ x: 29, z: -56, radius: 15, title: "The Pines" }),
]);
export const HARBOR_DOCKS = Object.freeze([
    Object.freeze({ id: "mainland-harbor", title: "Mainland Harbor", x: 8, z: 12, yaw: 0, minX: -4, maxX: 4, minZ: 8, maxZ: 22 }),
    Object.freeze({ id: "gull-landing", title: "Gull Landing", x: -22, z: -18, yaw: Math.PI, minX: -31, maxX: -25, minZ: -26, maxZ: -16 }),
]);
export const BOAT_HANDLING = Object.freeze({ maxSpeed: 5, reverseSpeed: 1.8, acceleration: 1.8, drag: 0.25, turnRate: 0.85, hullRadius: 1, hullSampleOffset: 1.2, dockRadius: 4, dockingSpeed: 0.9 });
export function dockedBoat(dockId = HARBOR_DOCKS[0].id) {
    const dock = HARBOR_DOCKS.find((entry) => entry.id === dockId) ?? HARBOR_DOCKS[0];
    return { x: dock.x, z: dock.z, yaw: dock.yaw, speed: 0, mode: "docked", dockId: dock.id };
}
/** Signed clearance: positive in navigable water, negative in a bank, shallow or pier. */
export function harborWaterClearance(point) {
    let distance = Math.min(point.x - HARBOR_BOUNDS.minX, HARBOR_BOUNDS.maxX - point.x, point.z - HARBOR_BOUNDS.minZ, HARBOR_BOUNDS.maxZ - point.z);
    for (const island of HARBOR_ISLANDS)
        distance = Math.min(distance, Math.hypot(point.x - island.x, point.z - island.z) - island.radius - 1.8);
    for (const dock of HARBOR_DOCKS) {
        const dx = Math.max(dock.minX - point.x, 0, point.x - dock.maxX);
        const dz = Math.max(dock.minZ - point.z, 0, point.z - dock.maxZ);
        distance = Math.min(distance, Math.hypot(dx, dz));
    }
    return distance;
}
export function boatFitsWater(point, yaw) {
    return [-BOAT_HANDLING.hullSampleOffset, 0, BOAT_HANDLING.hullSampleOffset].every((offset) => harborWaterClearance({ x: point.x - Math.sin(yaw) * offset, z: point.z - Math.cos(yaw) * offset }) >= BOAT_HANDLING.hullRadius);
}
export function nearbyBoatDock(state) {
    return HARBOR_DOCKS.find((dock) => Math.hypot(state.x - dock.x, state.z - dock.z) <= BOAT_HANDLING.dockRadius);
}
export function useBoatDock(state) {
    if (state.mode === "docked")
        return { ...state, mode: "sailing", dockId: null };
    const dock = nearbyBoatDock(state);
    return dock && Math.abs(state.speed) <= BOAT_HANDLING.dockingSpeed ? dockedBoat(dock.id) : state;
}
export function toggleBoatAnchor(state) {
    return state.mode === "docked" ? state : { ...state, mode: state.mode === "anchored" ? "sailing" : "anchored", speed: 0 };
}
/** Bounded substeps prevent a long frame skipping a thin pier or turning the hull into shore. */
export function stepBoat(state, input, dt) {
    if (state.mode !== "sailing" || !Number.isFinite(dt) || dt <= 0)
        return { state, blocked: false };
    const span = Math.min(dt, 0.25), count = Math.ceil(span * 60), step = span / count;
    const throttle = Number.isFinite(input.throttle) ? Math.max(-1, Math.min(1, input.throttle)) : 0;
    const turn = Number.isFinite(input.turn) ? Math.max(-1, Math.min(1, input.turn)) : 0;
    let current = state, blocked = false;
    for (let i = 0; i < count; i++) {
        const drag = input.brake ? 4 : BOAT_HANDLING.drag;
        const speed = Math.max(-BOAT_HANDLING.reverseSpeed, Math.min(BOAT_HANDLING.maxSpeed, (current.speed + throttle * BOAT_HANDLING.acceleration * step) * Math.exp(-drag * step)));
        const turnAmount = turn * BOAT_HANDLING.turnRate * (0.2 + Math.min(1, Math.abs(speed) / 2)) * step * (speed < -0.1 ? -1 : 1);
        const yaw = Math.atan2(Math.sin(current.yaw + turnAmount), Math.cos(current.yaw + turnAmount));
        const next = { ...current, yaw, speed, x: current.x - Math.sin(yaw) * speed * step, z: current.z - Math.cos(yaw) * speed * step };
        if (boatFitsWater(next, yaw))
            current = next;
        else {
            current = { ...current, speed: 0 };
            blocked = true;
        }
    }
    return { state: current, blocked };
}
