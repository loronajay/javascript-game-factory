// Pure roof and suspension geometry shared by the farm's building models.
// Keeping these calculations out of the renderer makes "attached" a tested
// invariant instead of a collection of hand-tuned visual offsets.

export type HangingLightChain = Readonly<{ bottomY: number; topY: number; centreY: number; height: number }>;

/** The lantern's top cap ends 0.17m above its light origin. */
export function hangingLightChain(lanternY: number, anchorY: number): HangingLightChain {
  const bottomY = lanternY + 0.17;
  const topY = Math.max(anchorY, bottomY + 0.04);
  return Object.freeze({ bottomY, topY, centreY: (bottomY + topY) / 2, height: topY - bottomY });
}

/** Underside height of a straight gable slope at a coordinate across its ridge. */
export function gableRoofHeightAt(input: Readonly<{ wallHeight: number; rise: number; run: number; across: number }>): number {
  const factor = 1 - Math.min(1, Math.abs(input.across) / input.run);
  return input.wallHeight + input.rise * factor;
}

/** Underside height of the barn's two-part gambrel profile. */
export function gambrelRoofHeightAt(input: Readonly<{ wallHeight: number; rise: number; halfSpan: number; overhang: number; across: number }>): number {
  const kneeAcross = input.halfSpan * 0.55;
  const kneeY = input.wallHeight + input.rise * 0.62;
  const ridgeY = input.wallHeight + input.rise;
  const eaveY = input.wallHeight - input.overhang * 0.3;
  const across = Math.min(Math.abs(input.across), input.halfSpan + input.overhang);
  if (across <= kneeAcross) return ridgeY - (across / kneeAcross) * (ridgeY - kneeY);
  const lowerRun = input.halfSpan + input.overhang - kneeAcross;
  return kneeY - ((across - kneeAcross) / lowerRun) * (kneeY - eaveY);
}

/** The gazebo roof sits on a continuous header whose top is the canopy base. */
export function gazeboCanopy(wallHeight: number, roofHeight: number): Readonly<{ roofBaseY: number; roofCentreY: number; headerCentreY: number; headerHeight: number }> {
  const headerHeight = 0.18;
  return Object.freeze({
    roofBaseY: wallHeight,
    roofCentreY: wallHeight + roofHeight / 2,
    headerCentreY: wallHeight - headerHeight / 2,
    headerHeight,
  });
}

export type HipRoofMesh = Readonly<{ positions: readonly number[]; uvs: readonly number[] }>;

type Point3 = readonly [number, number, number];

/**
 * A hipped roof as six unshared triangles with a metre-scaled planar UV map.
 * Each slope gets its own local texture frame: procedural tiles repeat at a
 * consistent physical size instead of every vertex sampling the same pixel.
 */
export function hipRoofMesh(input: Readonly<{ width: number; depth: number; wallHeight: number; rise: number; overhang: number }>): HipRoofMesh {
  const halfWidth = input.width / 2 + input.overhang;
  const halfDepth = input.depth / 2 + input.overhang;
  const eaveY = input.wallHeight;
  const ridgeY = input.wallHeight + input.rise;
  const ridgeHalfLength = Math.max(0, halfWidth - halfDepth);
  const corners = [
    [-halfWidth, eaveY, halfDepth],
    [halfWidth, eaveY, halfDepth],
    [halfWidth, eaveY, -halfDepth],
    [-halfWidth, eaveY, -halfDepth],
  ] as const;
  const ridgeWest = [-ridgeHalfLength, ridgeY, 0] as const;
  const ridgeEast = [ridgeHalfLength, ridgeY, 0] as const;
  const triangles: readonly (readonly [Point3, Point3, Point3])[] = [
    [corners[0], corners[1], ridgeEast], [corners[0], ridgeEast, ridgeWest],
    [corners[2], corners[3], ridgeWest], [corners[2], ridgeWest, ridgeEast],
    [corners[1], corners[2], ridgeEast],
    [corners[3], corners[0], ridgeWest],
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const slopeV = (point: Point3, edge: "front" | "back" | "east" | "west"): number => {
    const run = edge === "front" ? halfDepth - point[2]
      : edge === "back" ? point[2] + halfDepth
        : edge === "east" ? halfWidth - point[0]
          : point[0] + halfWidth;
    return Math.hypot(run, point[1] - eaveY);
  };
  const faces = ["front", "front", "back", "back", "east", "west"] as const;
  for (let index = 0; index < triangles.length; index += 1) {
    const triangle = triangles[index]!;
    const face = faces[index]!;
    for (const point of triangle) {
      positions.push(...point);
      const u = face === "front" || face === "back" ? point[0] + halfWidth : point[2] + halfDepth;
      uvs.push(u, slopeV(point, face));
    }
  }
  return Object.freeze({ positions: Object.freeze(positions), uvs: Object.freeze(uvs) });
}

/**
 * A lower copy of a hip roof with every triangle wound in the opposite
 * direction. Three.js materials cull back faces by default, so merely lowering
 * the top mesh leaves the roof invisible from underneath.
 */
export function hipRoofUndersideMesh(roof: HipRoofMesh, thickness: number): HipRoofMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let triangle = 0; triangle < roof.positions.length; triangle += 9) {
    const uvTriangle = (triangle / 3) * 2;
    for (const vertex of [2, 1, 0]) {
      const position = triangle + vertex * 3;
      positions.push(roof.positions[position]!, roof.positions[position + 1]! - thickness, roof.positions[position + 2]!);
      const uv = uvTriangle + vertex * 2;
      uvs.push(roof.uvs[uv]!, roof.uvs[uv + 1]!);
    }
  }
  return Object.freeze({ positions: Object.freeze(positions), uvs: Object.freeze(uvs) });
}
