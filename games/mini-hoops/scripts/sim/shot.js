// One shot, from release to the moment the ball is handed back.
//
// The physics reports raw contacts; this file decides what they MEAN — whether
// the shot is over, whether it scored, and what the game should say about it.
// It is the only place that turns "the ball touched the rim" into "RIM".
//
// The central idea is RESOLUTION SEPARATE FROM SETTLING. A shot is *resolved* the
// moment its outcome is certain, and the ball is only handed back a short beat
// later. That gap is what lets the game call a miss the instant it is dead
// instead of making the player watch a ball roll under the bed — while still
// never cutting off a bank or a rattle that might yet drop.
//
// Holds its own state, but no DOM and no clock: time arrives as `dt`.

import {
  ABORT_DEPTH_MARGIN,
  ABORT_DEPTH_SPEED,
  ABORT_HEIGHT_MARGIN,
  CONTACT_DEBOUNCE_SECONDS,
  ON_FIRE_STREAK,
  OUT_OF_PLAY_Z,
  SHORT_DEPTH_THRESHOLD,
  SHOT_MAX_SECONDS,
  SHOT_SETTLE_SECONDS,
} from "./constants.js";
import { projectPoint } from "./projection.js";

export const SHOT_IDLE = "idle";
export const SHOT_FLIGHT = "flight";
export const SHOT_FINISHED = "finished";

/** A shot that has not been taken. */
export function createShot() {
  return {
    state: SHOT_IDLE,
    /** Seconds since release. */
    elapsed: 0,
    scored: false,
    /** `elapsed` at the moment the outcome became certain, or -1. */
    resolvedAt: -1,
    /** The last thing the ball hit that could explain a miss. */
    lastContact: "",
    lastContactAt: -Infinity,
  };
}

export function beginShot(shot) {
  Object.assign(shot, createShot(), { state: SHOT_FLIGHT });
}

/**
 * Advance the shot by one tick, given what the physics just reported.
 *
 * Returns `{ announcements, finished }`. `announcements` are short display
 * strings in the order they happened; `finished` means the ball should be
 * handed back now.
 */
export function advanceShot(shot, { ball, hoop, hoopWorld, contacts, scored, settled }, dt) {
  if (shot.state !== SHOT_FLIGHT) return { announcements: [], finished: false };

  const announcements = [];
  shot.elapsed += dt;

  for (const contact of contacts) {
    if (contact === "score") {
      shot.scored = true;
      announcements.push(null);
      resolve(shot, null);
      continue;
    }
    if (contact === "rim" || contact === "backboard") {
      // Two touches inside the debounce window are one collision, and must not
      // stutter the same word twice on screen.
      if (shot.elapsed - shot.lastContactAt <= CONTACT_DEBOUNCE_SECONDS) continue;
      shot.lastContactAt = shot.elapsed;
      shot.lastContact = contact;
      announcements.push(contact === "rim" ? "RIM" : "BACKBOARD");
      continue;
    }
    if (contact === "wall") {
      // Bare wall outside the backboard: there is no route back through the
      // hoop from here, so the miss is called immediately rather than waiting
      // for the ball to finish falling.
      if (!shot.lastContact) shot.lastContact = "wall";
      const label = missDirection(ball, hoop);
      if (resolve(shot, label)) announcements.push(label);
      continue;
    }
    if (contact === "floor" && !shot.scored && shot.resolvedAt < 0) {
      const label = groundedMissLabel(shot, ball);
      if (resolve(shot, label)) announcements.push(label);
    }
  }

  // A contacted ball on its way back into the room, below the rim, is done.
  if (
    !shot.scored &&
    shot.resolvedAt < 0 &&
    shot.lastContact &&
    ball.vz < ABORT_DEPTH_SPEED &&
    ball.z < hoopWorld.rimZ - ABORT_DEPTH_MARGIN &&
    ball.y < hoopWorld.rimY - ABORT_HEIGHT_MARGIN
  ) {
    const label = shot.lastContact === "rim" ? "RIM" : shot.lastContact === "backboard" ? "BACKBOARD" : "MISS";
    if (resolve(shot, label)) announcements.push(label);
  }

  const finished =
    (shot.resolvedAt >= 0 && shot.elapsed - shot.resolvedAt > SHOT_SETTLE_SECONDS) ||
    shot.elapsed > SHOT_MAX_SECONDS ||
    ball.z < OUT_OF_PLAY_Z ||
    settled;

  if (finished) shot.state = SHOT_FINISHED;

  return { announcements: announcements.filter(Boolean), finished };
}

/** The celebration line for a made shot, given the streak it is part of. */
export function madeAnnouncement(streak) {
  return streak >= ON_FIRE_STREAK ? "ON FIRE!" : "BUCKET!";
}

/** Mark the outcome certain. Returns false if it already was. */
function resolve(shot, label) {
  if (shot.resolvedAt >= 0) return false;
  shot.resolvedAt = shot.elapsed;
  shot.resolvedLabel = label;
  return true;
}

/**
 * Which way a shot missed, said in the terms a player can act on.
 *
 * Measured on screen against the drawn rim, because "left" and "right" are what
 * the player sees, not a world-space axis the perspective has already skewed.
 */
function missDirection(ball, hoop) {
  const screenX = projectPoint(ball).x;
  if (screenX < hoop.left) return "LEFT";
  if (screenX > hoop.right) return "RIGHT";
  return "LONG";
}

/** A ball that reached the floor without a verdict: say why as usefully as possible. */
function groundedMissLabel(shot, ball) {
  if (shot.lastContact === "rim") return "RIM";
  if (shot.lastContact === "backboard") return "BACKBOARD";
  return ball.z < SHORT_DEPTH_THRESHOLD ? "SHORT" : "MISS";
}
