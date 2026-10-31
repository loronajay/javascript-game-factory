import { farmLotBounds } from "./farm-catalog/lots.mjs";
import type { FarmObstacle, FarmPlatform } from "./farm-body.mjs";
import type { RoomBounds } from "./arcade-room-layout.mjs";

export const PROPERTY_GATE_ID = "property-gate-east";
export function propertyWalkBounds(layout: { lot?: string }): RoomBounds {
  if (!layout.lot) return farmLotBounds(layout);
  return layout.lot === "lot.estate" ? { width: 130, depth: 120, wallInset: 0.4 } : { width: 90, depth: 90, wallInset: 0.4 };
}
export function propertyPlatforms(layout: { lot?: string }): FarmPlatform[] {
  const half = farmLotBounds(layout).width / 2;
  if (layout.lot === "lot.estate") return [{ id: "estate-pier", x: half + 8.5, z: 7, width: 12, depth: 3, rotationY: 0, top: 0.27 }];
  if (layout.lot === "lot.smallholding") return [{ id: "cedar-stream-bridge", x: 0, z: -half - 13, width: 4, depth: 9, rotationY: 0, top: 0.27 }];
  return [];
}
export function propertyTrees(layout: { lot?: string }): Array<{ x: number; z: number; seed: number; scale: number; kind: "pine" | "birch" | "apple" | "willow" }> {
  const half = farmLotBounds(layout).width / 2;
  const out: ReturnType<typeof propertyTrees> = [];
  if (layout.lot === "lot.smallholding") {
    for (let index = 0; index < 72; index += 1) {
      const angle = index * 2.399, distance = half + 9 + index % 7 * 4;
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 6 || (z > half && Math.abs(x) < 5) || Math.abs(z + half + 13) < 4) continue;
      out.push({ x, z, seed: index + 13, scale: 1.6 + index % 4 * 0.25, kind: index % 5 === 0 ? "birch" : "pine" });
    }
  } else if (layout.lot === "lot.estate") {
    for (let index = 0; index < 24; index += 1) out.push({ x: -half - 8 - index % 4 * 7, z: -30 + Math.floor(index / 4) * 12, seed: index + 80, scale: 1.3, kind: "apple" });
    for (const [x, z] of [[half + 2, -half - 3], [half + 2, half + 7], [-half - 4, -half - 5]]) out.push({ x, z, seed: x + z + 100, scale: 1.6, kind: "willow" });
  }
  return out;
}
/** Water remains solid except beneath the actual pier or bridge deck. */
export function propertyObstacles(layout: { lot?: string }): FarmObstacle[] {
  if (!layout.lot) return [];
  const half = farmLotBounds(layout).width / 2;
  const lake = layout.lot === "lot.estate";
  const pool = lake ? { x: half + 30, z: -4, rx: 25, rz: 52 } : { x: 0, z: -half - 13, rx: 40, rz: 3.4 };
  const platforms = propertyPlatforms(layout);
  const boxes: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  const steps = Math.ceil(pool.rx * 4), width = pool.rx * 2 / steps;
  for (let index = 0; index < steps; index += 1) {
    const x = -pool.rx + (index + 0.5) * width;
    const halfDepth = pool.rz * Math.sqrt(Math.max(0, 1 - (x / pool.rx) ** 2));
    let parts = [{ minX: pool.x + x - width / 2, maxX: pool.x + x + width / 2, minZ: pool.z - halfDepth, maxZ: pool.z + halfDepth }];
    for (const platform of platforms) parts = parts.flatMap((box) => {
      const minX = platform.x - platform.width / 2, maxX = platform.x + platform.width / 2;
      const minZ = platform.z - platform.depth / 2, maxZ = platform.z + platform.depth / 2;
      if (box.maxX <= minX || box.minX >= maxX || box.maxZ <= minZ || box.minZ >= maxZ) return [box];
      return [
        ...(box.minZ < minZ ? [{ ...box, maxZ: minZ }] : []),
        ...(box.maxZ > maxZ ? [{ ...box, minZ: maxZ }] : []),
        ...(box.minX < minX ? [{ minX: box.minX, maxX: minX, minZ: Math.max(box.minZ, minZ), maxZ: Math.min(box.maxZ, maxZ) }] : []),
        ...(box.maxX > maxX ? [{ minX: maxX, maxX: box.maxX, minZ: Math.max(box.minZ, minZ), maxZ: Math.min(box.maxZ, maxZ) }] : []),
      ];
    });
    boxes.push(...parts);
  }
  return [
    ...boxes.map((box, index) => ({ instanceId: `property-water-${index}`, x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2, rotationY: 0, footprint: { width: box.maxX - box.minX, depth: box.maxZ - box.minZ }, bottom: -Infinity, top: Infinity })),
    ...propertyTrees(layout).map((tree, index) => ({ instanceId: `property-tree-${index}`, x: tree.x, z: tree.z, rotationY: 0, footprint: { width: 0.45 * tree.scale, depth: 0.45 * tree.scale }, bottom: 0, top: Infinity })),
  ];
}

export function propertyRoutes(layout: { lot?: string }): readonly Readonly<{ target: string; title: string; x: number; z: number; horse: boolean }>[] {
  const half = farmLotBounds(layout).width / 2;
  if (layout.lot === "lot.smallholding") return [{ target: "cedar-creek", title: "Cedar Creek - private fishing", x: 0, z: -half - 18, horse: false }];
  if (layout.lot === "lot.estate") return [
    { target: "estate-lake", title: "Sunwater Private Lake - fishing", x: half + 13, z: 7, horse: false },
    { target: "downs", title: "Windrush Downs - estate bridle trail", x: half + 4, z: -half - 5, horse: true },
  ];
  return [];
}
