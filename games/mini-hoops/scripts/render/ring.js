// Drawing arithmetic for a HORIZONTAL RING seen through this cabinet's camera.
//
// `sim/projection.js` answers where a ring's ellipse IS; this file answers the
// two questions a renderer then has about it — where a given angle around it
// lands, and which half of it is nearer the camera. Both used to live privately
// inside `render/hoop.js`, which was fine while the rim was the only ring in the
// game. The floor bins are rings too, and they are BELOW eye level where the rim
// is above it, so the near/far split has to invert between them. Getting that
// from one shared answer rather than two copies is the whole point: a near/far
// rule that disagrees with itself draws a ball through the front of one ring and
// behind the front of another.
//
// Pure arithmetic. No canvas, no state.

const TAU = Math.PI * 2;

/** A point on a projected ring at angle `a`. Screen-space; `a = 0` is stage right. */
export function ringPoint(ellipse, a) {
  return {
    x: ellipse.cx + Math.cos(a) * ellipse.radiusX,
    y: ellipse.cy + Math.sin(a) * ellipse.radiusY,
  };
}

/**
 * Is the point at angle `a` on the NEAR side of this ring?
 *
 * Increasing screen y is downward, so a positive sine puts a point below the
 * ring's centre — which is the near side ONLY when the ring is seen from above.
 * Looking up at it, the whole thing inverts. `fromBelow` on the ellipse is what
 * carries which case we are in, and every near/far decision goes through here so
 * there is exactly one place that can be wrong.
 */
export function isNear(ellipse, a) {
  return (Math.sin(a) >= 0) !== ellipse.fromBelow;
}

/** The angular span of one half of a ring: `[start, end]`, near or far. */
export function halfSpan(ellipse, wantNear) {
  const lowerIsNear = !ellipse.fromBelow;
  return wantNear === lowerIsNear ? [0, Math.PI] : [Math.PI, TAU];
}
