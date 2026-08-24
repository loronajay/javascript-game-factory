// World <-> screen mapping for the cabinet's pseudo-3D room.
//
// The room is a flat painted backdrop; the sense of depth comes entirely from
// this file. A point's `z` does two things: it scales the point toward the
// vanishing point (DEPTH_FALLOFF) and it raises the floor line the point is
// measured from (FLOOR_SCREEN_Y_PER_Z). Everything else — the ball, the rim,
// the trajectory preview, the shadow — is drawn by projecting world points
// through here, so the whole scene stays on one consistent perspective.
//
// Every function is pure. No canvas, no state, no DOM.

import {
  BALL_MIN_SCREEN_RADIUS,
  BALL_SCREEN_RADIUS,
  DEPTH_FALLOFF,
  FLOOR_SCREEN_Y,
  FLOOR_SCREEN_Y_PER_Z,
  FLOOR_Y,
  PROJECTION_ORIGIN_X,
  PROJECTION_X_SCALE,
  PROJECTION_Y_SCALE,
} from "./constants.js";

// A ball that overshoots hard can leave the playable depth band. Clamping keeps
// the projection well-defined instead of letting the scale term cross zero and
// flip the scene inside out.
const MIN_Z = -0.12;
const MAX_Z = 1.22;

export function clampDepth(z) {
  return Math.max(MIN_Z, Math.min(MAX_Z, z));
}

/** How much a world unit at depth `z` shrinks on screen. 1 at the camera plane. */
export function depthScaleAt(z) {
  return 1 / (1 + DEPTH_FALLOFF * clampDepth(z));
}

/** The scanline a ground-level point at depth `z` is measured from. */
export function floorScreenY(z) {
  return FLOOR_SCREEN_Y - FLOOR_SCREEN_Y_PER_Z * clampDepth(z);
}

/** Project a world point to canvas pixels. */
export function projectPoint({ x, y, z }) {
  const scale = depthScaleAt(z);
  return {
    x: PROJECTION_ORIGIN_X + x * PROJECTION_X_SCALE * scale,
    y: floorScreenY(z) - (y - FLOOR_Y) * PROJECTION_Y_SCALE * scale,
    scale,
  };
}

/**
 * Invert `projectPoint` onto a known depth plane.
 *
 * A single screen point maps to a whole ray in world space, so the caller has to
 * supply the `z` it means — which is exactly how aiming works here: the player
 * picks a spot on the rim plane, not a spot in free space.
 */
export function screenToWorldAtZ(screenX, screenY, z) {
  const scale = depthScaleAt(z);
  return {
    x: (screenX - PROJECTION_ORIGIN_X) / (PROJECTION_X_SCALE * scale),
    y: (floorScreenY(z) - screenY) / (PROJECTION_Y_SCALE * scale) + FLOOR_Y,
    z,
  };
}

/** Draw radius of the ball sprite at depth `z`. */
export function ballScreenRadius(z) {
  return Math.max(BALL_MIN_SCREEN_RADIUS, BALL_SCREEN_RADIUS * depthScaleAt(z));
}

/**
 * Convert a screen-space velocity at depth `z` into world units.
 *
 * The hoop moves along screen paths (that is how the modes are authored and how
 * they read to the player), but collisions have to resolve against a velocity in
 * the same space as the ball. Note the sign flip on the vertical axis: screen y
 * grows downward, world y grows upward.
 */
export function screenVelocityToWorld(vxScreen, vyScreen, z) {
  const scale = depthScaleAt(z);
  return {
    vx: vxScreen / (PROJECTION_X_SCALE * scale),
    vy: -vyScreen / (PROJECTION_Y_SCALE * scale),
  };
}
