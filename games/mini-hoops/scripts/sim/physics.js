// The integrator: advances the ball and runs the colliders in the right order.
//
// This file owns *when* things are checked, `collision.js` owns *how* each one
// resolves, and `shot.js` owns what any of it means. Keeping the ordering here
// and alone matters, because the order is load-bearing:
//
//   1. Integrate.
//   2. Did it go in? — asked FIRST, so a clean make is never stolen by the rim
//      resolver nudging the ball a fraction out of the ring.
//   3. Rim, then back wall — only if it did not go in.
//   4. Floor, always.
//
// A tick is integrated in substeps (PHYSICS_SUBSTEP_SECONDS). At full speed the
// ball crosses the whole rim in well under a 60Hz tick, so a single-step
// integration would let it teleport past the ring and turn a made basket into a
// coin flip on frame phase.

import { rollPhasePerRadian } from "../assets/ball-catalog.js";
import {
  BALL_RADIUS_WORLD,
  GRAVITY,
  PHYSICS_SUBSTEP_SECONDS,
  SPIN_DECAY_PER_TICK,
} from "./constants.js";
import {
  applyNetDrag,
  detectMadeBasket,
  resolveBackWallContact,
  resolveFloorContact,
  resolveRimContact,
} from "./collision.js";
import { boardWorldBounds, hoopWorldState } from "./hoop.js";

/** A ball at rest in the shooter's hands. */
export function createBall() {
  return {
    x: 0,
    y: 0.1,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    // Angular velocity about the screen-horizontal axis, radians/second.
    omegaX: 0,
    // Continuous frame position, accumulated from omegaX. Fractional, and
    // negative when the ball rolls backward.
    rollPhase: 0,
  };
}

/** Return a ball to the shooting position, in place. */
export function resetBall(ball) {
  Object.assign(ball, createBall());
}

/** Launch the ball with a solved velocity and spin. */
export function launchBall(ball, launch, spin) {
  ball.vx = launch.vx;
  ball.vy = launch.vy;
  ball.vz = launch.vz;
  ball.omegaX = spin;
}

/**
 * The world the ball is being stepped against, derived once per tick.
 *
 * Deriving it once and reusing it across every substep is deliberate: within a
 * single tick the hoop is treated as moving at a constant velocity, which keeps
 * the substeps consistent with each other.
 */
export function worldFor(hoop) {
  return {
    hoopWorld: hoopWorldState(hoop),
    boardBounds: boardWorldBounds(hoop),
  };
}

/**
 * Advance the ball by one fixed tick.
 *
 * Mutates `ball` in place and returns what happened. `alreadyScored` suppresses
 * the hoop colliders for a ball that is already dropping through the net.
 *
 * @returns `{ contacts, scored }` — `contacts` in the order they occurred.
 */
export function stepBall(ball, world, tickSeconds, { ballId, alreadyScored = false } = {}) {
  const substeps = Math.max(1, Math.ceil(tickSeconds / PHYSICS_SUBSTEP_SECONDS));
  const dt = tickSeconds / substeps;
  const phasePerRadian = rollPhasePerRadian(ballId);

  const contacts = [];
  let scored = false;

  for (let step = 0; step < substeps; step++) {
    const previous = { x: ball.x, y: ball.y, z: ball.z };

    ball.vy -= GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;

    // Spin bleeds off slowly, and drives the animation frame. Raising the decay
    // to dt*60 keeps it identical whatever the substep count works out to.
    ball.omegaX *= Math.pow(SPIN_DECAY_PER_TICK, dt * 60);
    ball.rollPhase += ball.omegaX * dt * phasePerRadian;

    if (!alreadyScored && !scored) {
      if (detectMadeBasket(ball, previous, world.hoopWorld)) {
        scored = true;
        applyNetDrag(ball, world.hoopWorld);
        contacts.push("score");
      } else {
        // Rim and back wall are checked independently, not as alternatives: a
        // ball can clip the ring and still cross the board plane inside the same
        // substep, and collapsing that into one contact loses the second bounce.
        const rim = resolveRimContact(ball, world.hoopWorld);
        if (rim) contacts.push(rim);
        const wall = resolveBackWallContact(ball, previous.z, world.hoopWorld, world.boardBounds);
        if (wall) contacts.push(wall);
      }
    }

    const floor = resolveFloorContact(ball, dt);
    if (floor) contacts.push(floor);
  }

  return { contacts, scored };
}

/** Whether the ball has come to rest on the floor and is done being interesting. */
export function isBallSettled(ball) {
  return (
    ball.z < 0.92 &&
    ball.y <= BALL_RADIUS_WORLD + 0.015 &&
    Math.abs(ball.vy) < 0.08 &&
    Math.abs(ball.vz) < 0.08
  );
}
