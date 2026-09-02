// The opponent.
//
// Pure, and it plays through the same front door the player does: it produces a
// stroke — angle, power, contact point — and `world.strike` runs it through the
// same physics. There is no branch anywhere that lets the CPU move a ball
// directly, and its shots can miss for the same reasons a player's do.
//
// DIFFICULTY IS HANDS, NOT PHYSICS. Every rung plays the identical table with
// the identical ball; what changes is how precisely it can execute what it
// picked and how far down its list of options it can see. The same rule
// Speed Demon's rivals follow, for the same reason: a CPU given a better table
// is not a harder opponent, it is a cheat.
//
// No THREE, no DOM.

import { BALL_RADIUS } from "./constants.js";
import { EIGHT, CUE, cueBall, inGroup, remaining } from "./balls.js";
import { POCKETS } from "./table.js";
import { segmentBlocked } from "./aim.js";

/**
 * @typedef {object} Difficulty
 * @property {string} id
 * @property {string} label
 * @property {number} aimError    radians of random error on the chosen angle
 * @property {number} powerError  random error on the chosen power, 0..1
 * @property {number} cutFloor    the sharpest cut it is willing to attempt
 * @property {number} thinkMs     how long it takes to line up
 */
export const DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "casual", label: "Casual", aimError: 0.045, powerError: 0.1, cutFloor: 0.52, thinkMs: 700 }),
  Object.freeze({ id: "club", label: "Club", aimError: 0.016, powerError: 0.045, cutFloor: 0.42, thinkMs: 520 }),
  Object.freeze({ id: "sharp", label: "Sharp", aimError: 0.005, powerError: 0.018, cutFloor: 0.34, thinkMs: 430 }),
]);

export const DEFAULT_DIFFICULTY = "club";

export function difficultyById(id) {
  return DIFFICULTIES.find((rung) => rung.id === id) || DIFFICULTIES.find((rung) => rung.id === DEFAULT_DIFFICULTY);
}

/**
 * Which balls this seat is allowed to shoot at.
 *
 * The 8 is a target only once the group is cleared, which mirrors rule 3 in
 * `rules.js` exactly — the CPU aiming at a ball the rules would call a foul is
 * the classic way a pool opponent looks broken.
 */
export function legalTargets(balls, group) {
  if (group && remaining(balls, group) === 0) {
    return balls.filter((ball) => !ball.pocketed && ball.n === EIGHT);
  }
  const live = balls.filter((ball) => !ball.pocketed && ball.n !== CUE && ball.n !== EIGHT);
  return group ? live.filter((ball) => inGroup(ball.n, group)) : live;
}

/**
 * Search every target against every pocket and pick the best line.
 *
 * The score is a cost, lowest wins, and it is three terms: how far the cue ball
 * must travel, how far the object ball must travel (weighted lower, because a
 * long straight pot is easier than a short thin one), and how much of a cut the
 * shot is. That last term is why it prefers a plain shot to a spectacular one.
 *
 * @returns `{ angle, power, target, pocket }` or null if nothing is on.
 */
export function planShot(balls, group, difficulty = difficultyById(DEFAULT_DIFFICULTY)) {
  const cue = cueBall(balls);
  let targets = legalTargets(balls, group);
  // Nothing legal to shoot at — an open table cleared down to the 8. Roll at
  // whatever is left rather than returning null: `match.js` reads a null plan as
  // "no stroke", so the CPU would simply never shoot and the turn would hang.
  if (!targets.length) targets = balls.filter((ball) => !ball.pocketed && ball.n !== CUE);
  if (!cue || cue.pocketed || !targets.length) return null;

  let best = null;

  for (const target of targets) {
    for (const pocket of POCKETS) {
      // Unit vector from the object ball to the pocket, and the ghost-ball
      // position the cue ball has to arrive at to send it there.
      let ox = pocket.x - target.x;
      let oz = pocket.z - target.z;
      const objectDistance = Math.hypot(ox, oz) || 1;
      ox /= objectDistance;
      oz /= objectDistance;

      const ghostX = target.x - ox * 2 * BALL_RADIUS;
      const ghostZ = target.z - oz * 2 * BALL_RADIUS;

      let sx = ghostX - cue.x;
      let sz = ghostZ - cue.z;
      const cueDistance = Math.hypot(sx, sz) || 1;
      sx /= cueDistance;
      sz /= cueDistance;

      // How square the shot is: 1 is dead straight, 0 is a ninety-degree cut.
      const cut = sx * ox + sz * oz;
      if (cut < difficulty.cutFloor) continue;

      if (segmentBlocked(balls, cue.x, cue.z, ghostX, ghostZ, [CUE, target.n])) continue;
      if (segmentBlocked(balls, target.x, target.z, pocket.x, pocket.z, [target.n])) continue;

      const score = cueDistance + objectDistance * 0.44 + (1 - cut) * 1.55;
      if (!best || score < best.score) {
        best = {
          score,
          target,
          pocket,
          angle: Math.atan2(sz, sx),
          power: Math.min(0.9, 0.27 + cueDistance * 0.3 + objectDistance * 0.11),
        };
      }
    }
  }

  if (best) return best;

  // Nothing is on. Roll at the nearest legal ball rather than passing, because
  // failing to hit one at all is a foul and a weak contact is not.
  let fallback = targets[0];
  let closest = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(target.x - cue.x, target.z - cue.z);
    if (distance < closest) {
      closest = distance;
      fallback = target;
    }
  }

  return {
    score: Infinity,
    target: fallback,
    pocket: null,
    angle: Math.atan2(fallback.z - cue.z, fallback.x - cue.x),
    power: 0.48,
  };
}

/**
 * Add the difficulty's hands to a plan, producing the stroke it actually plays.
 *
 * The small random contact point is not noise for its own sake: it is what keeps
 * the CPU's cue ball from finishing in exactly the same place every time, which
 * is what a human's imperfect stroke does and what makes its position play read
 * as play rather than as a script.
 *
 * @param random injectable 0..1 source, so the tests are deterministic
 */
export function strokeFor(plan, difficulty, random = Math.random) {
  if (!plan) return null;
  const jitter = (spread) => (random() - 0.5) * spread;

  return {
    angle: plan.angle + jitter(difficulty.aimError),
    power: Math.max(0.08, Math.min(0.98, plan.power + jitter(difficulty.powerError))),
    spinX: jitter(0.1),
    spinY: jitter(0.14),
  };
}
