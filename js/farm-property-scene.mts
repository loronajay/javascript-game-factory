import { farmLotBounds } from "./farm-catalog/lots.mjs";
import type { FarmObstacle, FarmPlatform } from "./farm-body.mjs";

export const PROPERTY_GATE_ID = "property-gate-east";
export const DOWNS_GATE_ID = "property-gate-downs";
export type PropertyPoint = Readonly<{ x: number; z: number }>;
export type PropertyRoute = Readonly<{
  target: string; title: string; gateId: string; x: number; z: number; horse: boolean;
  returnPoint: PropertyPoint & { yaw: number }; sign: PropertyPoint & { yaw: number };
}>;

// Fishing and riding are separate maps, reached through perimeter gates.
export const propertyWalkBounds = farmLotBounds;
export function propertyPlatforms(_layout: { lot?: string }): FarmPlatform[] { return []; }
export function propertyGroundHeight(_layout: { lot?: string }, _point: PropertyPoint): number | undefined { return undefined; }
export function propertyObstacles(_layout: { lot?: string }): FarmObstacle[] { return []; }

export function propertyRoutes(layout: { lot?: string }): PropertyRoute[] {
  const edge = farmLotBounds(layout).width / 2 - 0.37;
  if (!layout.lot) return [];
  if (layout.lot === "lot.orchard") return [{
    target: "orchard-harbor", title: "Orchard Harbor", gateId: PROPERTY_GATE_ID, x: edge, z: 7, horse: false,
    returnPoint: { x: edge - 2.5, z: 7, yaw: Math.PI / 2 },
    sign: { x: edge + 1, z: 10, yaw: -Math.PI / 2 },
  }];
  const fishing: PropertyRoute = {
    target: layout.lot === "lot.smallholding" ? "cedar-creek" : "estate-lake",
    title: layout.lot === "lot.smallholding" ? "Cedar Creek" : "Sunwater Private Lake",
    gateId: PROPERTY_GATE_ID, x: edge, z: 7, horse: false,
    returnPoint: { x: edge - 2.5, z: 7, yaw: Math.PI / 2 },
    sign: { x: edge + 1, z: 10, yaw: -Math.PI / 2 },
  };
  return layout.lot === "lot.estate" ? [fishing, {
    target: "downs", title: "Windrush Downs", gateId: DOWNS_GATE_ID,
    x: 0, z: -edge, horse: true,
    returnPoint: { x: 0, z: -edge + 3, yaw: Math.PI },
    sign: { x: 3.4, z: -edge - 0.8, yaw: 0 },
  }] : [fishing];
}

/** Backdrop trees frame the property without suggesting walkable amenities. */
export function propertyTrees(layout: { lot?: string }): Array<{ x: number; z: number; seed: number; scale: number; kind: "pine" | "birch" | "apple" | "willow" }> {
  const half = farmLotBounds(layout).width / 2;
  const out: ReturnType<typeof propertyTrees> = [];
  if (layout.lot === "lot.smallholding") {
    for (let index = 0; index < 58; index++) {
      const angle = index * 2.399, distance = half + 11 + index % 5 * 4;
      const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance;
      if (Math.max(Math.abs(x), Math.abs(z)) < half + 8 || (z > half && Math.abs(x) < 6) || (x > half && Math.abs(z - 7) < 5)) continue;
      out.push({ x, z, seed: index + 13, scale: 1.5 + index % 3 * .2, kind: index % 5 === 0 ? "birch" : "pine" });
    }
  } else if (layout.lot === "lot.orchard") {
    for (let index = 0; index < 36; index++) {
      const side = index % 2 ? -1 : 1;
      out.push({ x: side * (half + 8 + index % 3 * 5), z: -33 + Math.floor(index / 6) * 13, seed: index + 200, scale: 1.3, kind: index % 4 === 0 ? "willow" : "apple" });
    }
  } else if (layout.lot === "lot.estate") {
    for (let index = 0; index < 20; index++) out.push({ x: -half - 9 - index % 4 * 7, z: -24 + Math.floor(index / 4) * 12, seed: index + 80, scale: 1.3, kind: "apple" });
    for (const [x, z] of [[half + 11, -18], [half + 12, 23], [-half - 8, -half - 9]]) out.push({ x, z, seed: x! + z! + 100, scale: 1.6, kind: "willow" });
  }
  return out;
}
