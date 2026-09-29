// The flat geometry riding needs (planning-docs/FARM_RIDING_PLAN.md): which way
// a heading looks, whether a point is inside a turned box, and the bounds of a
// field. The walker (`arcade-room-walker.mts`) has the same two rules; riding
// keeps its own copy so the riding sim and everything it reads is a closed set
// of pure files with no imports outside it — the set `tools/mirror-riding-sim.mjs`
// copies byte for byte to platform-api (to ride a course run again) and to the
// network server (to run a race). A test holds the two copies equal.

/** A turned box on the ground: its middle, its turn, and its size (width along its own x). */
export type RideBox = Readonly<{ x: number; z: number; rotationY: number; footprint: Readonly<{ width: number; depth: number }> }>;

/** Half extents of a field and how far in from its edge a body must stay. */
export type RideBounds = Readonly<{ halfWidth: number; halfDepth: number; margin: number }>;

/** The horizontal unit vector a heading looks along (0 = down −z), the walker's convention. */
export function forwardOf(yaw: number): Readonly<{ x: number; z: number }> {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** True when the point is inside the box grown by `padding` on every side. */
export function insideBox(point: Readonly<{ x: number; z: number }>, box: RideBox, padding = 0): boolean {
  const dx = point.x - box.x;
  const dz = point.z - box.z;
  const cosine = Math.cos(box.rotationY);
  const sine = Math.sin(box.rotationY);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  return Math.abs(localX) < box.footprint.width / 2 + padding && Math.abs(localZ) < box.footprint.depth / 2 + padding;
}
