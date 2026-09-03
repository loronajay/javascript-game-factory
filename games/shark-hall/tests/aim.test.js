// Aim geometry, placement legality, and the shot curve.
//
// The three small pure modules the player feels most directly: where the guide
// line goes, where the cue ball may be put down, and how hard a held button hits.

import { assert, assertClose, assertEqual, finish, suite, test } from "./harness.js";
import {
  BALL_RADIUS,
  FULL_CHARGE_MS,
  HALF_LENGTH,
  HALF_WIDTH,
  HEAD_STRING_X,
  MAX_SHOT_SPEED,
} from "../scripts/sim/constants.js";
import { createBall } from "../scripts/sim/balls.js";
import { aimSolution, angleToDegrees, ballAt, firstContact, railDistance, segmentBlocked } from "../scripts/sim/aim.js";
import {
  ZONE_ANYWHERE,
  ZONE_KITCHEN,
  clampCuePosition,
  findLegalCuePosition,
  isLegalCuePosition,
} from "../scripts/sim/placement.js";
import { clampContact, describeContact, heldPower, shotSpeed } from "../scripts/sim/shot.js";

suite("aim, placement and the stroke");

// --- aim -------------------------------------------------------------------

test("the guide finds the nearest ball on the line, not just any ball", () => {
  const balls = [createBall(0, -1, 0), createBall(5, 0.6, 0), createBall(3, 0.2, 0)];
  const hit = firstContact(balls, balls[0], 0);
  assertEqual(hit.ball.n, 3, "the near ball is what the cue ball reaches first");
});

test("the guide ignores balls behind the cue ball", () => {
  const balls = [createBall(0, 0, 0), createBall(3, -0.5, 0)];
  assertEqual(firstContact(balls, balls[0], 0), null, "aiming away from it must find nothing");
});

test("the ghost-ball contact sits one diameter short of the object ball", () => {
  const balls = [createBall(0, -1, 0), createBall(3, 0, 0)];
  const hit = firstContact(balls, balls[0], 0);
  assertClose(Math.hypot(hit.x - 0, hit.z - 0), 2 * BALL_RADIUS, 1e-9);
});

test("with nothing in the way the guide runs to the rail", () => {
  const balls = [createBall(0, 0, 0)];
  const solution = aimSolution(balls, balls[0], 0);
  assertEqual(solution.contact, null);
  assertClose(solution.end.x, HALF_LENGTH - BALL_RADIUS, 1e-9);
});

test("the object-ball direction is the line of centres through the ghost ball", () => {
  const balls = [createBall(0, -1, 0), createBall(3, 0, 0.02)];
  const solution = aimSolution(balls, balls[0], 0.02);
  assert(solution.object, "expected an object line");
  assertClose(Math.hypot(solution.object.x, solution.object.z), 1, 1e-9, "it is a unit vector");
});

test("rail distance is never zero, even from against the cushion", () => {
  const against = { x: HALF_LENGTH - BALL_RADIUS, z: 0 };
  assert(railDistance(against, 0) > 0, "a zero-length guide line would vanish");
});

test("a ball in the way blocks the segment; the ignored ones do not", () => {
  const balls = [createBall(0, -1, 0), createBall(3, -0.5, 0)];
  assert(segmentBlocked(balls, -1, 0, 0, 0, [0]), "the 3 is squarely in the way");
  assert(!segmentBlocked(balls, -1, 0, 0, 0, [0, 3]), "ignoring it clears the line");
});

test("angles are reported in a range a player can read", () => {
  assertClose(angleToDegrees(0), 0, 1e-9);
  assertClose(angleToDegrees(Math.PI), 180, 1e-9);
  assertClose(angleToDegrees(3 * Math.PI), 180, 1e-9, "a wound-up angle still reads as 180");
  assert(angleToDegrees(-3 * Math.PI) <= 180, "and never falls outside the range");
});

// --- placement -------------------------------------------------------------

test("a spot on top of another ball is illegal", () => {
  const balls = [createBall(0, -1, 0), createBall(3, 0, 0)];
  assert(!isLegalCuePosition(balls, 0.001, 0, ZONE_ANYWHERE));
  assert(isLegalCuePosition(balls, -0.4, 0, ZONE_ANYWHERE));
});

test("a spot off the cloth is illegal", () => {
  const balls = [createBall(0, -1, 0)];
  assert(!isLegalCuePosition(balls, HALF_LENGTH + 0.1, 0, ZONE_ANYWHERE));
});

test("the kitchen rule allows the head string itself but not past it", () => {
  const balls = [createBall(0, -1, 0)];
  assert(isLegalCuePosition(balls, HEAD_STRING_X, 0, ZONE_KITCHEN), "the line itself is legal");
  assert(!isLegalCuePosition(balls, HEAD_STRING_X + 0.001, 0, ZONE_KITCHEN), "one millimetre past is not");
  assert(isLegalCuePosition(balls, HEAD_STRING_X + 0.001, 0, ZONE_ANYWHERE), "a plain foul has no such limit");
});

test("the fallback search always returns a legal spot, even in a crowd", () => {
  // Ring the preferred spot with balls and make sure it still finds somewhere.
  const balls = [createBall(0, -1, 0)];
  let n = 1;
  for (let i = 0; i < 12; i++) {
    const around = (i / 12) * Math.PI * 2;
    balls.push(createBall(n++, -0.72 + Math.cos(around) * 0.05, Math.sin(around) * 0.05));
  }

  const spot = findLegalCuePosition(balls, -0.72, 0, ZONE_ANYWHERE);
  assert(isLegalCuePosition(balls, spot.x, spot.z, ZONE_ANYWHERE), `returned an illegal spot ${spot.x},${spot.z}`);
});

// --- the drag ---------------------------------------------------------------
//
// `clampCuePosition` is what the player's finger is actually connected to, and
// every case here is about the ball CONTINUING to move rather than stopping.

test("a drag off the end of the cloth slides the ball along the rail", () => {
  const balls = [createBall(0, -1, 0)];
  const spot = clampCuePosition(balls, HALF_LENGTH + 3, 0.31, ZONE_ANYWHERE);
  assert(spot.x < HALF_LENGTH, "it stayed on the table");
  assertClose(spot.z, 0.31, 1e-9, "and it kept following the finger along the rail");
  assert(isLegalCuePosition(balls, spot.x, spot.z, ZONE_ANYWHERE));
});

test("a drag past the head string slides along the string", () => {
  const balls = [createBall(0, -1, 0)];
  const spot = clampCuePosition(balls, 0.9, -0.22, ZONE_KITCHEN);
  assert(spot.x <= HEAD_STRING_X, `escaped the kitchen at x=${spot.x}`);
  assertClose(spot.z, -0.22, 1e-9, "and it still tracked the finger across the table");
});

test("a drag into another ball slides around it rather than stopping", () => {
  const balls = [createBall(0, -1, 0), createBall(5, 0, 0)];
  // Straight at the 5 from the left, offset slightly high: the cue ball should
  // end up touching it on the near side, not frozen where it first met it.
  const spot = clampCuePosition(balls, -0.004, 0.006, ZONE_ANYWHERE);
  const gap = Math.hypot(spot.x, spot.z);
  assert(gap >= 2.08 * BALL_RADIUS, `it ended up inside the 5 (gap ${gap})`);
  assert(isLegalCuePosition(balls, spot.x, spot.z, ZONE_ANYWHERE), "and it ended up somewhere legal");
});

test("a drag is never refused, however hopeless the spot", () => {
  // Jammed into a corner, against the string, inside a cluster, off the table.
  const balls = [createBall(0, -1, 0)];
  let n = 1;
  for (let i = 0; i < 14; i++) {
    const around = (i / 14) * Math.PI * 2;
    balls.push(createBall(n++, HEAD_STRING_X + Math.cos(around) * 0.05, Math.sin(around) * 0.05));
  }

  for (const [x, z] of [
    [HEAD_STRING_X, 0],
    [-HALF_LENGTH - 1, -HALF_WIDTH - 1],
    [0, 0],
    [1e6, -1e6],
  ]) {
    for (const zone of [ZONE_ANYWHERE, ZONE_KITCHEN]) {
      const spot = clampCuePosition(balls, x, z, zone);
      assert(
        isLegalCuePosition(balls, spot.x, spot.z, zone),
        `${zone} drag to ${x},${z} produced the illegal spot ${spot.x},${spot.z}`,
      );
    }
  }
});

test("a legal spot is taken exactly, so the ball sits under the finger", () => {
  const balls = [createBall(0, -1, 0), createBall(5, 0.6, 0.2)];
  const spot = clampCuePosition(balls, -0.3, 0.15, ZONE_ANYWHERE);
  assertClose(spot.x, -0.3, 1e-12);
  assertClose(spot.z, 0.15, 1e-12);
});

test("the kitchen search stays in the kitchen", () => {
  const balls = [createBall(0, -1, 0), createBall(3, -0.82, 0)];
  const spot = findLegalCuePosition(balls, -0.82, 0, ZONE_KITCHEN);
  assert(spot.x <= HEAD_STRING_X, `the search escaped the kitchen at x=${spot.x}`);
});

// --- the stroke ------------------------------------------------------------

test("power runs from a feather to full and never leaves the range", () => {
  assert(heldPower(0) > 0, "even an instant tap plays a shot");
  assert(heldPower(0) < 0.1, "a tap is a feather");
  assertClose(heldPower(FULL_CHARGE_MS), 1, 1e-9);
  assertClose(heldPower(FULL_CHARGE_MS * 10), 1, 1e-9, "holding longer than full is still full");
  assert(heldPower(-500) > 0, "a negative hold cannot produce a negative shot");
});

test("power is eased toward the bottom, where the control is wanted", () => {
  // Half the hold time must give MORE than half the power, or the whole soft
  // half of the meter is unusable.
  assert(heldPower(FULL_CHARGE_MS / 2) > 0.5, "the curve must open up at the bottom");
});

test("speed rises with power and tops out where it should", () => {
  assert(shotSpeed(0) < shotSpeed(0.5), "more power is more speed");
  assert(shotSpeed(0.5) < shotSpeed(1));
  assertClose(shotSpeed(1), MAX_SHOT_SPEED, 1e-9);
  assertClose(shotSpeed(4), MAX_SHOT_SPEED, 1e-9, "over-range power clamps");
});

test("a contact point outside the ball is pulled back to the rim", () => {
  const contact = clampContact(3, 4);
  assertClose(Math.hypot(contact.spinX, contact.spinY), 1, 1e-9);
  assert(contact.spinX > 0 && contact.spinY > 0, "and it keeps its direction");
});

test("the contact point reads in words the player would use", () => {
  assertEqual(describeContact(0, 0), "Center ball");
  assertEqual(describeContact(0, 1), "follow");
  assertEqual(describeContact(0, -1), "draw");
  assertEqual(describeContact(1, 0), "right English");
  assertEqual(describeContact(-1, 1), "follow + left English");
});

// --- picking ---------------------------------------------------------------
//
// What the hover readout is built on. It has to answer from a table position,
// because the render layer owns the meshes and nothing else may raycast them.

test("a point on a ball picks that ball", () => {
  const balls = [createBall(0, -0.7, 0), createBall(9, 0.2, 0.1)];
  assertEqual(ballAt(balls, 0.2, 0.1)?.n, 9);
  assertEqual(ballAt(balls, 0.2 + BALL_RADIUS * 0.7, 0.1)?.n, 9, "anywhere on the face counts");
});

test("empty cloth picks nothing", () => {
  const balls = [createBall(0, -0.7, 0), createBall(9, 0.2, 0.1)];
  assertEqual(ballAt(balls, 0.6, -0.4), null);
});

test("a pocketed ball is never picked", () => {
  const balls = [createBall(9, 0.2, 0.1)];
  balls[0].pocketed = true;
  assertEqual(ballAt(balls, 0.2, 0.1), null);
});

test("two frozen balls pick the nearer centre, not the first in the array", () => {
  const balls = [createBall(1, 0, 0), createBall(2, 2 * BALL_RADIUS, 0)];
  assertEqual(ballAt(balls, 2 * BALL_RADIUS, 0)?.n, 2);
  assertEqual(ballAt(balls, 0, 0)?.n, 1);
});

finish();
