import { normalizeFarmLayout } from "./farm-layout.mjs";
import { stepWalker } from "./arcade-room-walker.mjs";
import { HARBOR_DOCKS, harborFishingZoneAt, harborWalkHeight } from "./farm-harbor-geometry.mjs";
export const HARBOR_SPAWN = Object.freeze({ x: 0, z: 34, yaw: 0 });
export const HARBOR_COVE_EXIT = Object.freeze({ x: 0, z: 40 });
const buildings = [-17, 15].map((x, index) => ({ instanceId: `harbor-building-${index}`, x, z: 30, rotationY: 0, footprint: { width: 7, depth: 5 }, bottom: 0, top: Infinity }));
/** Use the farm's existing walker, with the harbor's actual land and dock surfaces. */
export function stepHarborWalker(pose, keys, dt) {
    const next = stepWalker(pose, keys, dt, { halfWidth: 70, halfDepth: 100, margin: 1 }, buildings);
    const point = next.pose;
    const safe = [[0, 0], [-0.18, 0], [0.18, 0], [0, -0.18], [0, 0.18]].every(([x, z]) => harborWalkHeight({ x: point.x + x, z: point.z + z }) !== null);
    return safe ? next : { pose, moved: false };
}
export function harborCastOrigin(pose) {
    for (let distance = 1; distance <= 4; distance += 0.2) {
        const point = { x: pose.x + pose.forward.x * distance, z: pose.z + pose.forward.z * distance };
        if (harborFishingZoneAt(point))
            return point;
    }
    return null;
}
export const harborScene = {
    COVE_BOUNDS: { width: 140, depth: 200, wallInset: 1 }, COVE_SPAWN: HARBOR_SPAWN, COVE_PRESENCE_ROOM: "farm:harbor",
    COVE_MARKET_GATE: "", COVE_RAIL_ID: "", COVE_STALLS: [],
    coveLayout: () => normalizeFarmLayout({ version: 3, onboarding: { status: "complete", introSeen: true }, pets: [], decor: [] }),
    coveObstacles: () => buildings,
    covePlatforms: () => HARBOR_DOCKS.map((dock) => ({ id: dock.id, x: (dock.minX + dock.maxX) / 2, z: (dock.minZ + dock.maxZ) / 2, rotationY: 0, width: dock.maxX - dock.minX, depth: dock.maxZ - dock.minZ, top: 0.87 })),
    coveGroundAt: (point) => harborWalkHeight(point) ?? -3,
    coveWaterDepthAt: (point) => harborWalkHeight(point) === null ? 3 : 0,
    coveWaterDistance: (point) => harborWalkHeight(point) === null ? 1 : -1,
    castOrigin: harborCastOrigin,
};
