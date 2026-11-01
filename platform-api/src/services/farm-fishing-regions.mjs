export const FISHING_REGIONS = Object.freeze([
    { id: "grotto", title: "Fernfall Grotto", direction: "west", minLevel: 8,
        description: "Follow the western jungle path to a waterfall-fed sanctuary. Fish beneath the falls, explore the fern-lined banks, and seek the Royal Arapaima in the emerald pools.",
        water: "#36bba1", ground: "#4c7545", rock: "#52665b", accent: "#a0e7c7",
        pools: [{ x: -9, z: -10, rx: 18, rz: 21 }, { x: 14, z: 0, rx: 12, rz: 13 }],
        spawn: { x: 30, z: 20, yaw: Math.PI / 3 }, exit: { x: 35, z: 20 },
        shadowWaters: [{ minX: -19, maxX: 0, minZ: -22, maxZ: 2 }, { minX: 8, maxX: 19, minZ: -7, maxZ: 7 }],
    },
    { id: "volcanic", title: "Emberglass Lagoon", direction: "east", minLevel: 20,
        description: "Beyond the eastern headland, black basalt shelters a luminous tropical lagoon. Explore the tide pools and look for brilliant reef fish beneath glowing coral.",
        water: "#3869a8", ground: "#49434d", rock: "#282a38", accent: "#f49a79",
        pools: [{ x: -10, z: -3, rx: 18, rz: 21 }, { x: 15, z: -10, rx: 13, rz: 15 }, { x: 19, z: 13, rx: 9, rz: 9 }],
        spawn: { x: -30, z: 20, yaw: -Math.PI / 3 }, exit: { x: -35, z: 20 },
        shadowWaters: [{ minX: -19, maxX: -2, minZ: -16, maxZ: 8 }, { minX: 9, maxX: 21, minZ: -18, maxZ: -3 }, { minX: 15, maxX: 22, minZ: 9, maxZ: 17 }],
    },
    { id: "cedar-creek", title: "Cedar Creek", direction: "west", minLevel: 1, requiredProperty: "lot.smallholding",
        description: "Step through Cedar Hollow's fishing gate into a sheltered woodland creek. A short bank path leads from the entrance to the pools, home to Cedar Trout and Amber Chub.",
        water: "#4caaad", ground: "#536d48", rock: "#67736c", accent: "#b7d6b0",
        pools: [{ x: -13, z: -12, rx: 11, rz: 21 }, { x: 0, z: 8, rx: 13, rz: 14 }, { x: 12, z: -10, rx: 10, rz: 17 }],
        entry: { x: 24, z: 15, yaw: Math.atan2(9.6, 6) },
        spawn: { x: 25.696, z: 16.06, yaw: Math.atan2(9.6, 6) }, exit: { x: 28.24, z: 17.65 },
        fishingSpot: { x: 14.4, z: 9, yaw: Math.PI / 2 },
        shadowWaters: [{ minX: -18, maxX: -8, minZ: -23, maxZ: -2 }, { minX: -6, maxX: 6, minZ: 2, maxZ: 14 }, { minX: 7, maxX: 17, minZ: -19, maxZ: -2 }],
    },
    { id: "estate-lake", title: "Sunwater Private Lake", direction: "east", minLevel: 1, requiredProperty: "lot.estate",
        description: "The estate's private lake: quiet banks, broad water and your own fishing pavilion. Golden Perch and Pearl Carp live here, with heavier visitors cruising beneath the surface.",
        water: "#4f91b1", ground: "#7e9553", rock: "#a09c82", accent: "#eadcb0",
        pools: [{ x: 0, z: -4, rx: 28, rz: 25 }],
        entry: { x: 0, z: 29, yaw: 0 },
        spawn: { x: 0, z: 31, yaw: 0 }, exit: { x: 0, z: 35 },
        fishingSpot: { x: 0, z: 22, yaw: 0 },
        shadowWaters: [{ minX: -19, maxX: -3, minZ: -17, maxZ: 8 }, { minX: 3, maxX: 19, minZ: -17, maxZ: 8 }],
    },
]);
export const REGION_BOUNDS = Object.freeze({ width: 74, depth: 72, wallInset: 0.4 });
export function findFishingRegion(id) {
    return FISHING_REGIONS.find((region) => region.id === id);
}
/** Metres inside the nearest elliptical bank, negative on land. */
export function regionWaterDistance(region, point) {
    return Math.max(...region.pools.map((pool) => (1 - Math.hypot((point.x - pool.x) / pool.rx, (point.z - pool.z) / pool.rz)) * Math.min(pool.rx, pool.rz)));
}
export function regionZoneAt(region, point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z))
        return null;
    return regionWaterDistance(region, point) >= 0.9 ? region.id : null;
}
export function regionGroundAt(region, point) {
    const inside = Math.max(0, regionWaterDistance(region, point));
    const t = Math.min(1, inside / 4);
    return -3 * t * t * (3 - 2 * t);
}
/** Trees on the playable banks, shared by scenery and trunk collision. */
export function regionShoreTrees(region) {
    if (region.id === "cedar-creek")
        return [[-29, -18], [-27, 12], [29, -7], [30, 25], [-12, 29], [4, -32]].map(([x, z]) => ({ x: x, z: z }));
    if (region.id === "estate-lake")
        return [[-32, -12], [-28, 18], [32, -10], [30, 19], [-15, -32], [12, -32]].map(([x, z]) => ({ x: x, z: z }));
    const points = region.id !== "volcanic"
        ? [[-31, -12], [-29, 16], [27, -8], [27, 8], [-14, 25], [8, -31]]
        : [[-31, -12], [-28, 24], [-16, 23], [4, 23], [30, -22], [30, 5], [30, 24], [-8, -30]];
    return points.map(([x, z]) => ({ x: x, z: z }));
}
