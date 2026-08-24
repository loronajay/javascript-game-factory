// The shot gesture: one drag, three outputs.
//
// The whole control scheme of this cabinet is a single pull-back, and it has to
// carry more than one dimension of intent without ever asking the player to
// operate two controls at once:
//
//   LENGTH  -> power. Strictly. Length is never borrowed for anything else,
//              which is what lets the power readout be honest.
//   ANGLE   -> lateral aim (mirrored, like a slingshot) and, coupled to it, arc.
//              A straight backward pull is the steepest, most forgiving shot; an
//              angled pull trades that arc away for lateral reach.
//
// Aim is measured against the hoop's REST position, never the live rim. Letting
// the reticle track a moving hoop would quietly do the leading for the player,
// which is exactly the skill the moving modes exist to ask for.
//
// Pure functions only. Takes an anchor and a pointer position, returns a
// description. It holds no state and touches no DOM.

import {
  AIM_MAX_X,
  AIM_MIN_X,
  AIM_RIM_Y_OFFSET,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  LOFT_RATIO_FLOOR,
  LOFT_RATIO_SPAN,
  PULL_AIM_GAIN,
  PULL_ANGLE_MIN_BACK,
  PULL_ANGLE_RATIO_LIMIT,
  PULL_MAX,
  PULL_MIN,
  PULL_MIN_SIDE,
  PULL_SIDE_LIMIT,
  PULL_VISUAL_GAIN,
} from "./constants.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** The pull as it stands before the player has moved: centred, no power, full loft. */
export function neutralPull(anchor) {
  return {
    anchorX: anchor.x,
    anchorY: anchor.y,
    x: anchor.x,
    y: anchor.y,
    visualX: anchor.x,
    visualY: anchor.y,
    dx: 0,
    dy: 0,
    distance: 0,
    power: 0,
    loft: 1,
    aimX: HOOP_BASE_X,
    aimY: HOOP_BASE_RIM_Y + AIM_RIM_Y_OFFSET,
  };
}

/**
 * Resolve a live pointer position against the anchor into a full pull.
 *
 * Returns a fresh object every call; neither argument is mutated.
 */
export function resolvePull(anchor, point) {
  let dx = point.x - anchor.x;
  // Screen y grows downward, so a backward pull toward the player is positive dy.
  // Forward travel is discarded rather than mirrored: a shove away from the
  // player is not a shot, and treating it as one would fire on a mis-swipe.
  let dy = Math.max(0, point.y - anchor.y);

  // Sideways travel is bounded by backward travel, so the gesture always reads
  // as a pull *back* — you cannot swipe purely across and call it a shot.
  const maxSide = Math.max(PULL_MIN_SIDE, dy * PULL_SIDE_LIMIT);
  dx = clamp(dx, -maxSide, maxSide);

  let distance = Math.hypot(dx, dy);
  if (distance > PULL_MAX) {
    const scale = PULL_MAX / distance;
    dx *= scale;
    dy *= scale;
    distance = PULL_MAX;
  }

  const power = clamp(distance / PULL_MAX, 0, 1);

  // Aim mirrors the pull, slingshot style. The floor on the backward term keeps
  // a barely-begun pull from snapping the reticle to full lock.
  const angleRatio = clamp(
    dx / Math.max(PULL_ANGLE_MIN_BACK, dy),
    -PULL_ANGLE_RATIO_LIMIT,
    PULL_ANGLE_RATIO_LIMIT,
  );
  const aimX = clamp(HOOP_BASE_X - angleRatio * PULL_AIM_GAIN, AIM_MIN_X, AIM_MAX_X);

  // How vertical the pull is, remapped into the loft window. A pull with almost
  // no length is treated as fully vertical so the arc does not flicker while the
  // gesture is still starting.
  const verticalRatio = distance > 1 ? clamp(dy / distance, 0, 1) : 1;
  const loft = clamp((verticalRatio - LOFT_RATIO_FLOOR) / LOFT_RATIO_SPAN, 0, 1);

  return {
    anchorX: anchor.x,
    anchorY: anchor.y,
    // Where the finger is.
    x: anchor.x + dx,
    y: anchor.y + dy,
    // Where the ball is drawn — most of the way, not all of it. The gap between
    // the two is the elastic, and it is what makes the pull read as tension.
    visualX: anchor.x + dx * PULL_VISUAL_GAIN,
    visualY: anchor.y + dy * PULL_VISUAL_GAIN,
    dx,
    dy,
    distance,
    power,
    loft,
    aimX,
    aimY: HOOP_BASE_RIM_Y + AIM_RIM_Y_OFFSET,
  };
}

/** Whether releasing this pull should fire a shot, or quietly cancel as a tap. */
export function isShootablePull(pull) {
  return pull.distance >= PULL_MIN;
}
