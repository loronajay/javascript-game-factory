// The physics, checked against things that are true of a real table.
//
// These are not regression snapshots of whatever the code happens to do — every
// case asserts a property a pool player would recognise, so a change that breaks
// one of them has broken the game rather than the numbers.

import { assert, assertClose, assertEqual, finish, suite, test } from "./harness.js";
import { BALL_RADIUS, CORNER_GAP, HALF_LENGTH, HALF_WIDTH, JAW_RADIUS, SIDE_GAP, SIM_STEP } from "../scripts/sim/constants.js";
import { createBall, speedOf } from "../scripts/sim/balls.js";
import {
  applyClothFriction,
  clampToCloth,
  collideBalls,
  collideCushion,
  collideRails,
  cushionRestitution,
} from "../scripts/sim/physics.js";
import { strikeCue } from "../scripts/sim/shot.js";
import { findPocket } from "../scripts/sim/pockets.js";
import { JAWS, POCKETS } from "../scripts/sim/table.js";

suite("physics — the table");

/** Roll one ball forward until it stops or the step budget runs out. */
function settle(ball, steps = 4000) {
  for (let i = 0; i < steps && speedOf(ball) > 0.001; i++) {
    ball.x += ball.vx * SIM_STEP;
    ball.z += ball.vz * SIM_STEP;
    collideRails(ball, null);
    applyClothFriction(ball, SIM_STEP);
  }
  return ball;
}

// --- collisions ------------------------------------------------------------

test("a dead-straight full hit stops the cue ball and sends the object ball on", () => {
  const cue = createBall(0, 0, 0);
  cue.vx = 2;
  const object = createBall(1, 2 * BALL_RADIUS * 0.999, 0);

  const impact = collideBalls(cue, object);
  assert(impact > 0, "expected a collision");
  assert(cue.vx < 0.25, `cue ball should nearly stop, got ${cue.vx}`);
  assert(object.vx > 1.7, `object ball should carry the speed, got ${object.vx}`);
});

test("a cut sends the object ball along the line of centres", () => {
  const cue = createBall(0, 0, 0);
  cue.vx = 2;
  // Offset in z: the contact normal points up and to the right.
  const object = createBall(1, 2 * BALL_RADIUS * 0.7, 2 * BALL_RADIUS * 0.7);

  collideBalls(cue, object);
  assert(object.vx > 0 && object.vz > 0, "the object ball leaves along the normal");
  assertClose(object.vx, object.vz, 0.25, "a 45-degree normal sends it out at 45 degrees");
});

test("balls that are already separating are not collided again", () => {
  const a = createBall(0, 0, 0);
  const b = createBall(1, 2 * BALL_RADIUS * 0.9, 0);
  b.vx = 1;
  assertEqual(collideBalls(a, b), 0, "a separating pair reports no impact");
});

test("a collision reports a bigger impact for a harder shot", () => {
  const soft = (() => {
    const cue = createBall(0, 0, 0);
    cue.vx = 0.5;
    return collideBalls(cue, createBall(1, 2 * BALL_RADIUS * 0.999, 0));
  })();
  const hard = (() => {
    const cue = createBall(0, 0, 0);
    cue.vx = 4;
    return collideBalls(cue, createBall(1, 2 * BALL_RADIUS * 0.999, 0));
  })();
  assert(hard > soft * 4, "impact strength tracks speed, which is what the audio rides on");
});

// --- cushions --------------------------------------------------------------

test("a ball bounces off a cushion with less speed than it arrived with", () => {
  const ball = createBall(1, 0, HALF_WIDTH - BALL_RADIUS);
  ball.vz = 2;
  collideCushion(ball, 0, -1);
  assert(ball.vz < 0, "it comes back off the rail");
  assert(Math.abs(ball.vz) < 2, "a cushion is not perfectly elastic");
});

test("English changes the angle a ball leaves a cushion at", () => {
  // The two spins are compared against EACH OTHER rather than against a plain
  // ball, because the tangential impulse is Coulomb-capped: past the cap more
  // spin buys nothing, and the honest test of English is that reversing it
  // sends the ball off the rail somewhere else.
  const off = (wy) => {
    const ball = createBall(1, 0, HALF_WIDTH - BALL_RADIUS);
    ball.vx = 1;
    ball.vz = 1;
    ball.wy = wy;
    collideCushion(ball, 0, -1);
    return ball.vx;
  };

  const right = off(40);
  const left = off(-40);
  assert(left - right > 0.1, `English must survive the rail (${left} vs ${right}), or it is decoration`);
});

test("running English lengthens the angle and holds speed; the rail alone does neither", () => {
  // The direction that matters. Running English is spin whose contact patch is
  // already moving WITH the rail, so friction pushes the ball along it instead
  // of scrubbing it: off the same cushion the ball leaves wider and quicker.
  const off = (wy) => {
    const ball = createBall(1, 0, HALF_WIDTH - BALL_RADIUS);
    ball.vx = 1.77;
    ball.vz = 1.77;
    ball.wy = wy;
    collideCushion(ball, 0, -1);
    return { angle: Math.atan2(Math.abs(ball.vx), Math.abs(ball.vz)), speed: Math.hypot(ball.vx, ball.vz) };
  };

  const plain = off(0);
  const running = off(-0.95 * 1.77 * Math.SQRT2 / BALL_RADIUS);
  assert(running.angle > plain.angle + 0.05, "running English must widen the rebound");
  assert(running.speed > plain.speed * 1.05, "running English must hold speed through the rail");
});

test("the rebound angle off a rail is LONGER than the incidence, the way a real cushion plays", () => {
  // The single most-felt property of a cushion, and the one a naive Coulomb
  // model gets backwards. The normal component is damped by the restitution and
  // the along-rail component is very nearly preserved, so a ball arriving 45
  // degrees off the normal leaves at roughly 48 rather than at 40. Every safety
  // and every two-rail position shot is built on this. See CUSHION_FRICTION.
  for (const incidence of [30, 45, 60]) {
    const radians = (incidence * Math.PI) / 180;
    const ball = createBall(1, 0, HALF_WIDTH - BALL_RADIUS);
    ball.vx = Math.sin(radians) * 2.5;
    ball.vz = Math.cos(radians) * 2.5;
    collideCushion(ball, 0, -1);
    const out = (Math.atan2(Math.abs(ball.vx), Math.abs(ball.vz)) * 180) / Math.PI;
    assert(out >= incidence, `${incidence} degrees in came back at ${out.toFixed(1)}, shorter than it went`);
    assert(out < incidence + 8, `${incidence} degrees in came back at ${out.toFixed(1)}, wildly long`);
  }
});

test("a cushion is livelier for a soft ball than for a hard one", () => {
  // Rubber is not linear. A flat restitution has to pick one speed to be right
  // at, and picking the slow one is what made a hard shot ricochet for seconds.
  const soft = cushionRestitution(0.4);
  const hard = cushionRestitution(5.4);
  assert(soft > hard + 0.1, `a break should die into the rail (${soft} vs ${hard})`);
  assert(hard > 0.5, "a cushion is not a sandbag");
  assert(soft < 1, "and it is not a trampoline");
  assertEqual(cushionRestitution(-3), cushionRestitution(3), "only the magnitude of the closing speed matters");
});

test("a ball shoved into a rail by its neighbour is put back on the cloth", () => {
  // The frame-visible artefact: `collideAll` separates two overlapping balls
  // after the rails have already been resolved, so without this the renderer
  // gets one frame with a ball sunk into the cushion.
  const ball = createBall(1, 0.4, HALF_WIDTH - BALL_RADIUS + 0.004);
  ball.vz = 0.5;
  clampToCloth(ball);
  assertClose(ball.z, HALF_WIDTH - BALL_RADIUS, 1e-9, "it belongs against the nose of the cushion");
  assertEqual(ball.vz, 0.5, "and it was not struck: position only");
});

test("the cloth clamp leaves a ball crossing a pocket mouth alone", () => {
  // There is no cushion over a mouth, and clamping there would bounce a potted
  // ball back out of the pocket it had already entered.
  const ball = createBall(1, HALF_LENGTH - 0.02, HALF_WIDTH + 0.01);
  clampToCloth(ball);
  assertClose(ball.z, HALF_WIDTH + 0.01, 1e-9, "the corner mouth is not a rail");
});

test("a ball rolled at a rail comes back and stays on the table", () => {
  const ball = createBall(1, 0, 0);
  ball.vx = 2.5;
  settle(ball);
  assert(Math.abs(ball.x) <= HALF_LENGTH, `ended off the table at x=${ball.x}`);
  assert(Math.abs(ball.z) <= HALF_WIDTH, `ended off the table at z=${ball.z}`);
});

// --- spin ------------------------------------------------------------------

test("draw brings the cue ball back, follow sends it on", () => {
  const run = (spinY) => {
    const ball = createBall(0, -0.9, 0);
    strikeCue(ball, { angle: 0, power: 0.55, spinX: 0, spinY });
    // Long enough for the skid to finish. Sliding friction is CONSTANT in
    // magnitude, so while all three are still skidding they shed speed at
    // exactly the same rate and a short window sees no difference at all — the
    // three shots separate only once each one reaches natural roll and drops to
    // the far smaller rolling resistance, which follow does first and draw last.
    for (let i = 0; i < 300; i++) applyClothFriction(ball, SIM_STEP);
    return ball.vx;
  };

  const draw = run(-1);
  const centre = run(0);
  const follow = run(1);

  assert(draw < centre, `draw should shed speed faster than centre ball (${draw} vs ${centre})`);
  assert(follow > centre, `follow should hold speed better than centre ball (${follow} vs ${centre})`);
});

test("full follow is above natural roll, so the cue ball speeds up rather than skidding", () => {
  // The property the demo did not have. A ball spinning slower than `v/R` is
  // still skidding forward and the cloth is slowing it; only topspin ABOVE
  // natural roll accelerates it, and only that is a follow shot.
  const ball = createBall(0, -0.9, 0);
  const shot = strikeCue(ball, { angle: 0, power: 0.6, spinX: 0, spinY: 1 });
  const naturalRoll = shot.speed / BALL_RADIUS;
  assert(-ball.wz > naturalRoll, `full follow must exceed natural roll (${-ball.wz} vs ${naturalRoll})`);

  const before = ball.vx;
  for (let i = 0; i < 12; i++) applyClothFriction(ball, SIM_STEP);
  assert(ball.vx > before, `the cue ball should accelerate off a follow shot (${before} -> ${ball.vx})`);
});

test("full draw reverses the spin, so the cue ball can come back", () => {
  const ball = createBall(0, -0.9, 0);
  strikeCue(ball, { angle: 0, power: 0.6, spinX: 0, spinY: -1 });
  assert(ball.wz > 0, "draw is backspin: the roll axis is reversed, not merely reduced");
});

test("a ball always stops eventually", () => {
  const ball = createBall(1, 0, 0);
  ball.vx = 5;
  settle(ball, 20000);
  assert(speedOf(ball) < 0.01, `still moving at ${speedOf(ball)}`);
});

// --- the jaws ---------------------------------------------------------------
// A jaw is the rounded END of a cushion, not an obstacle standing on the cloth.
// These two cases are the difference, and they are here because the game
// shipped with the jaw circles centred ON the nose line: each one bulged a full
// jaw radius over the playing surface, and every shot rolled along a wall was
// bumped away from the rail before it reached the pocket.

test("no jaw reaches out over the cloth", () => {
  for (const jaw of JAWS) {
    // A jaw belongs to one rail, so it is clear of the cloth as soon as it is
    // outside EITHER nose line — the other axis is the run it caps.
    const intoCloth = Math.min(HALF_LENGTH - Math.abs(jaw.x), HALF_WIDTH - Math.abs(jaw.z));
    assert(
      intoCloth <= JAW_RADIUS + 1e-9,
      `a jaw at (${jaw.x}, ${jaw.z}) sits ${intoCloth - JAW_RADIUS}m proud of the nose line`,
    );
  }
});

test("a ball rolled frozen to a rail passes every jaw and reaches the corner", () => {
  for (const side of [-1, 1]) {
    const ball = createBall(1, -HALF_LENGTH + 0.3, side * (HALF_WIDTH - BALL_RADIUS));
    ball.vx = 1.6;
    for (let i = 0; i < 900 && ball.x < HALF_LENGTH - CORNER_GAP; i++) {
      ball.x += ball.vx * SIM_STEP;
      ball.z += ball.vz * SIM_STEP;
      collideRails(ball, null);
    }
    assertClose(
      ball.z,
      side * (HALF_WIDTH - BALL_RADIUS),
      1e-6,
      "a rail-frozen ball was pushed off the rail on its way to the corner",
    );
    assert(ball.x >= HALF_LENGTH - CORNER_GAP, "the ball never reached the corner mouth");
  }
});

test("a ball driven at a pocket facing still rattles the jaw", () => {
  const jaw = { x: SIDE_GAP, z: HALF_WIDTH + JAW_RADIUS };
  const ball = createBall(1, 0, HALF_WIDTH - BALL_RADIUS - 0.03);
  const dx = jaw.x - ball.x;
  const dz = jaw.z - ball.z;
  const length = Math.hypot(dx, dz);
  ball.vx = (dx / length) * 1.5;
  ball.vz = (dz / length) * 1.5;
  let hit = 0;
  for (let i = 0; i < 120; i++) {
    ball.x += ball.vx * SIM_STEP;
    ball.z += ball.vz * SIM_STEP;
    const events = [];
    collideRails(ball, events);
    hit += events.filter((event) => event.kind === "jaw").length;
  }
  assert(hit > 0, "a ball driven into the side pocket facing must strike the jaw");
});

// --- pockets ---------------------------------------------------------------

test("a ball at a pocket centre is in the pocket", () => {
  for (const pocket of POCKETS) {
    const ball = createBall(1, pocket.x, pocket.z);
    assert(findPocket(ball), `${pocket.id} did not take a ball sitting in it`);
  }
});

test("a ball on the cloth is not in any pocket", () => {
  assertEqual(findPocket(createBall(1, 0.4, 0)), null);
  assertEqual(findPocket(createBall(1, 0, 0)), null, "the middle of the table is not the side pocket");
});

test("a ball that left the cloth past a mouth is taken rather than lost", () => {
  const escaped = createBall(1, HALF_LENGTH + 0.05, HALF_WIDTH - 0.02);
  assert(findPocket(escaped), "a ball past the corner must be pocketed, not sail off forever");
});

finish();
