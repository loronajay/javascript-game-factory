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
