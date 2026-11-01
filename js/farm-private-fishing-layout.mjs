/** One entrance plan drives the models, signs, paths and walking collision. */
export function privateFishingLayout(region) {
    const entry = region.entry;
    const creek = region.id === "cedar-creek";
    const right = { x: Math.cos(entry.yaw), z: -Math.sin(entry.yaw) };
    const outward = { x: Math.sin(entry.yaw), z: Math.cos(entry.yaw) };
    // A compact board fits in both arrival and shore-to-exit views, while
    // staying beside the path rather than occupying the walking lane.
    const sign = { x: entry.x + right.x * 2.2 - outward.x * 1.5, z: entry.z + right.z * 2.2 - outward.z * 1.5, yaw: entry.yaw, scale: .75 };
    const bench = creek ? { x: 12, z: 18 } : { x: -6, z: 25 };
    const view = creek ? { x: 0, z: 8 } : { x: 0, z: -4 };
    // Benches face the water; their backs face the entrance path.
    const decor = [
        ...[-1, 1].map(side => ({ instanceId: `${region.id}-entrance-wing-${side}`, itemId: "decor.fence.post-rail", x: entry.x + right.x * side * 3.4, z: entry.z + right.z * side * 3.4, rotationY: entry.yaw, length: 3.6 })),
        { instanceId: `${region.id}-rail`, itemId: "decor.prop.hitching-rail", x: creek ? 26 : 8, z: creek ? 23 : 28, rotationY: creek ? entry.yaw : Math.PI / 2, length: 0 },
        { instanceId: `${region.id}-bench`, itemId: "decor.prop.bench", ...bench, rotationY: Math.atan2(view.x - bench.x, view.z - bench.z), length: 0 },
        { instanceId: `${region.id}-lamp`, itemId: "decor.prop.lamp-post", x: creek ? 16 : -9, z: creek ? 20 : 26, rotationY: 0, length: 0 },
    ];
    if (!creek)
        decor.push({ instanceId: "lake-pavilion", itemId: "decor.building.gazebo", x: -17, z: 26, rotationY: 0, length: 0 });
    const obstacles = [{ instanceId: `${region.id}-entrance-sign`, x: sign.x, z: sign.z, rotationY: sign.yaw, footprint: { width: 2.6 * sign.scale, depth: .3 }, bottom: 0, top: 1.375 + .65 * sign.scale }];
    return { entry, sign, decor, obstacles, path: [region.exit, entry, region.fishingSpot] };
}
