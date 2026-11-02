export const HARBOR_BOUNDS = Object.freeze({ minX: -70, maxX: 70, minZ: -95, maxZ: 22 });
export const HARBOR_ISLANDS = Object.freeze([
// Offshore land is a separately loaded settlement, reached through the sea route.
// Keep this typed roster for coastal collision, without decorative destination islands.
]);
export const HARBOR_DOCKS = Object.freeze([
    Object.freeze({ id: "mainland-harbor", title: "Mainland Harbor", x: 8, z: 12, yaw: 0, minX: -4, maxX: 4, minZ: 8, maxZ: 22 }),
]);
export function harborWalkHeight(point) {
    if (point.x < -69 || point.x > 69 || point.z > 65 || point.z < -94)
        return null;
    for (const dock of HARBOR_DOCKS)
        if (point.x >= dock.minX && point.x <= dock.maxX && point.z >= dock.minZ && point.z <= dock.maxZ)
            return 0.87;
    if (point.z >= 22)
        return 0.5 + Math.min(1, (point.z - 22) / 3.5) * 0.9;
    for (const island of HARBOR_ISLANDS)
        if (Math.hypot(point.x - island.x, point.z - island.z) <= island.radius)
            return 1.8;
    return null;
}
export function harborFishingZoneAt(point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z) || point.x < HARBOR_BOUNDS.minX || point.x > HARBOR_BOUNDS.maxX || point.z < HARBOR_BOUNDS.minZ || point.z > HARBOR_BOUNDS.maxZ)
        return null;
    if (harborWalkHeight(point) !== null)
        return null;
    if (HARBOR_ISLANDS.some(island => Math.hypot(point.x - island.x, point.z - island.z) <= island.radius + 1.8))
        return null;
    return point.z < -40 ? "deep" : "reef";
}
export function harborDockFoot(dock) {
    const point = { x: Math.max(dock.minX + 0.65, Math.min(dock.maxX - 0.65, dock.x)), z: Math.max(dock.minZ + 0.65, Math.min(dock.maxZ - 0.65, dock.z)) };
    return { ...point, yaw: dock.x > point.x ? -Math.PI / 2 : Math.PI / 2 };
}
