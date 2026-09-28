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
  for (const triangle of triangles) {
    const [origin, along, third] = triangle;
    const uVector = [along[0] - origin[0], along[1] - origin[1], along[2] - origin[2]] as const;
    const uLength = Math.hypot(...uVector);
    const uAxis = uVector.map((value) => value / uLength);
    const thirdVector = [third[0] - origin[0], third[1] - origin[1], third[2] - origin[2]] as const;
    const thirdU = thirdVector[0] * uAxis[0]! + thirdVector[1] * uAxis[1]! + thirdVector[2] * uAxis[2]!;
    const thirdVVector = thirdVector.map((value, index) => value - thirdU * uAxis[index]!);
    const thirdV = Math.hypot(...thirdVVector);
    positions.push(...origin, ...along, ...third);
    uvs.push(0, 0, uLength, 0, thirdU, thirdV);
  }
  return Object.freeze({ positions: Object.freeze(positions), uvs: Object.freeze(uvs) });
}
