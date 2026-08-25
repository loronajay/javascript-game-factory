import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { BALL_RADIUS_WORLD, BOARD_Z, TICK_SECONDS } from "../scripts/sim/constants.js";
import { worldToScreenLength } from "../scripts/sim/projection.js";
import { hoopAt } from "../scripts/sim/hoop.js";
import { solveLaunch, launchSpin } from "../scripts/sim/launch.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "../scripts/sim/physics.js";
import { SHOT_FLIGHT, advanceShot, beginShot, createShot } from "../scripts/sim/shot.js";
import {
  MAX_DECALS,
  addSplat,
  clearSplatField,
  createSplatField,
  particleAlpha,
  tickSplatField,
} from "../scripts/effects/splat-field.js";

suite("splats — a ball that does not survive its landing");

const SNOWBALL = "snowball";
const BASKETBALL = "basketball";

/**
 * Fire one shot and play it out, returning what happened to it.
 *
 * The whole point of this helper is that it takes the ball id and CHANGES
 * NOTHING ELSE, so the same aim and power can be put through two balls and the
 * two results compared directly. That comparison is the board-key guarantee.
 */
function takeShot({ ballId, aim, power, loft, maxTicks = 400 }) {
  const ball = createBall();
  const shot = createShot();
  const origin = { x: ball.x, y: ball.y, z: ball.z };
  const launch = solveLaunch({ origin, aim, power, loft });
  launchBall(ball, launch, launchSpin(launch));
  beginShot(shot);

  const hoop = hoopAt("still", 0);
  const world = worldFor(hoop);
  const contacts = [];
  let splats = 0;
  let ticks = 0;

  while (shot.state === SHOT_FLIGHT && ticks < maxTicks) {
    ticks += 1;
    const stepped = stepBall(ball, world, TICK_SECONDS, { ballId, alreadyScored: shot.scored });
    for (const contact of stepped.contacts) contacts.push(contact);
    if (stepped.splat) splats += 1;

    advanceShot(
      shot,
      {
        ball,
        hoop,
        hoopWorld: world.hoopWorld,
        contacts: stepped.contacts,
        scored: shot.scored,
        settled: isBallSettled(ball),
      },
      TICK_SECONDS,
    );
  }

  return { ball, shot, contacts, splats, ticks, scored: shot.scored, label: shot.resolvedLabel };
}

/** A spread of shots that between them hit the wall, the board, the rim and the floor. */
const SHOTS = [
  { name: "swish", aim: { x: 480, y: 220 }, power: 0.8, loft: 1 },
  { name: "short", aim: { x: 480, y: 220 }, power: 0.42, loft: 1 },
  { name: "over-powered bank", aim: { x: 480, y: 220 }, power: 1, loft: 1 },
  { name: "long left", aim: { x: 360, y: 210 }, power: 0.95, loft: 0.6 },
  { name: "long right", aim: { x: 600, y: 210 }, power: 0.95, loft: 0.6 },
  { name: "flat right", aim: { x: 585, y: 235 }, power: 0.78, loft: 0.2 },
  { name: "flat left", aim: { x: 375, y: 235 }, power: 0.78, loft: 0.2 },
  { name: "rim graze", aim: { x: 480, y: 220 }, power: 0.86, loft: 0.9 },
  { name: "heave", aim: { x: 520, y: 200 }, power: 1, loft: 0.35 },
];

// ---------------------------------------------------------------------------
// The board-key guarantee
// ---------------------------------------------------------------------------

test("a snowball scores exactly what a basketball scores, shot for shot", () => {
  // The cabinet's boards are keyed on `mode:duration` — the ball is not in the
  // key, so it may not change an outcome. If this ever fails, the fix is not to
  // relax the test: it is either to stop the snowball bursting where it now
  // does, or to migrate the board key. See `assets/ball-catalog.js`.
  for (const spec of SHOTS) {
    const snow = takeShot({ ...spec, ballId: SNOWBALL });
    const basket = takeShot({ ...spec, ballId: BASKETBALL });
    assertEqual(snow.scored, basket.scored, `${spec.name}: made/missed`);
    assertEqual(snow.label, basket.label, `${spec.name}: what the game says about it`);
  }
});

test("a snowball takes exactly as long to hand back as a basketball does", () => {
  // The second half of the same guarantee, and the easier one to break: a ball
  // that ended its dead shots sooner would fit more attempts into a 30-second
  // round, which is a higher score for the same hand.
  for (const spec of SHOTS) {
    const snow = takeShot({ ...spec, ballId: SNOWBALL });
    const basket = takeShot({ ...spec, ballId: BASKETBALL });
    assertEqual(snow.ticks, basket.ticks, `${spec.name}: ticks until the ball comes back`);
  }
});

test("the spread really does cover the contacts this rests on", () => {
  // A guarantee proven only over shots that never touched anything would be
  // worth nothing, so this asserts the fixtures above are doing their job.
  const seen = new Set();
  for (const spec of SHOTS) {
    for (const contact of takeShot({ ...spec, ballId: BASKETBALL }).contacts) seen.add(contact);
  }
  for (const contact of ["rim", "backboard", "wall", "floor", "score"]) {
    assert(seen.has(contact), `no fixture shot ever produced a ${contact} contact`);
  }
});

// ---------------------------------------------------------------------------
// The burst itself
// ---------------------------------------------------------------------------

test("a snowball bursts, and does it once", () => {
  // Once, not once per substep: the ball is frozen by the first one, and every
  // later tick must find nothing left to report.
  let burst = 0;
  for (const spec of SHOTS) {
    const result = takeShot({ ...spec, ballId: SNOWBALL });
    assert(result.splats <= 1, `${spec.name} burst ${result.splats} times`);
    if (result.splats === 1) burst += 1;
  }
  assert(burst > 0, "not one fixture shot ever burst the snowball");
});

test("a basketball never bursts, whatever it hits", () => {
  for (const spec of SHOTS) {
    const result = takeShot({ ...spec, ballId: BASKETBALL });
    assertEqual(result.splats, 0, `${spec.name}`);
    assertEqual(result.ball.splat, null, `${spec.name} left a splat on the ball`);
  }
});

test("a burst snowball stops dead and stays where it stopped", () => {
  const ball = createBall();
  const hoop = hoopAt("still", 0);
  const world = worldFor(hoop);

  // Thrown hard and flat into the back wall, wide of the board.
  ball.x = -0.55;
  ball.y = 1.1;
  ball.z = 0.2;
  ball.vx = 0;
  ball.vy = 0.2;
  ball.vz = 6;
  ball.omegaX = 9;

  let splat = null;
  for (let tick = 0; tick < 30 && !splat; tick++) {
    splat = stepBall(ball, world, TICK_SECONDS, { ballId: SNOWBALL }).splat;
  }

  assert(splat, "a flat drive into bare wall should burst");
  assertEqual(splat.surface, "wall");
  assert(splat.speed > 1, "the burst should remember how hard it arrived");
  assertClose(splat.z, BOARD_Z - BALL_RADIUS_WORLD, 0.01, "it sticks on the wall plane");

  const where = { x: ball.x, y: ball.y, z: ball.z };
  for (let tick = 0; tick < 60; tick++) {
    const stepped = stepBall(ball, world, TICK_SECONDS, { ballId: SNOWBALL });
    assertEqual(stepped.splat, null, "a stuck ball has nothing left to report");
    assertEqual(stepped.contacts.length, 0, "a stuck ball touches nothing");
  }
  assertEqual(ball.x, where.x, "it must not slide");
  assertEqual(ball.y, where.y, "it must not fall");
  assertEqual(ball.z, where.z, "it must not sink into the wall");
  assertEqual(ball.vy, 0, "and it must not be accumulating velocity while it sits");
});

test("a burst ball is never reported as settled, so it cannot end the shot early", () => {
  // This is the mechanism the timing guarantee above rests on, pinned directly
  // so a failure says WHY rather than just that a tick count moved.
  const ball = createBall();
  ball.y = BALL_RADIUS_WORLD;
  ball.z = 0.3;
  assert(isBallSettled(ball), "a still ball on the floor is settled");

  ball.splat = { surface: "floor", x: 0, y: BALL_RADIUS_WORLD, z: 0.3, speed: 2 };
  assert(!isBallSettled(ball), "the same ball, burst, must not be");
});

test("handing the ball back clears the splat, so the next shot is a whole ball", () => {
  const ball = createBall();
  ball.splat = { surface: "floor", x: 0, y: 0, z: 0, speed: 1 };
  resetBall(ball);
  assertEqual(ball.splat, null);
});

// ---------------------------------------------------------------------------
// The field: what is left on the room
// ---------------------------------------------------------------------------

/** A deterministic stand-in for Math.random, so a burst can be asserted. */
function sequence(values) {
  let index = 0;
  return () => values[index++ % values.length];
}

test("a splat leaves one decal and a burst of powder", () => {
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0.2, y: 1.1, z: 0.92, speed: 4, scale: 3, color: "#fff", random: sequence([0.5]) });

  assertEqual(field.decals.length, 1);
  assert(field.particles.length > 0, "a burst with no powder is just a sticker");
  assertEqual(field.decals[0].surface, "wall");
  assertEqual(field.decals[0].color, "#fff");
});

test("a floor decal lies on the floor whatever height the ball burst at", () => {
  const field = createSplatField();
  addSplat(field, { surface: "floor", x: 0, y: BALL_RADIUS_WORLD, z: 0.4, speed: 2, random: sequence([0.5]) });
  assertEqual(field.decals[0].y, 0, "a pile on the floor is at floor height, not at the ball's centre");
});

test("a wall decal is rotated and a floor decal never is", () => {
  // The ground art is painted in perspective, so it carries its own horizon.
  // Spinning it would tilt a floor that is baked into the image.
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 3, random: sequence([0.7]) });
  addSplat(field, { surface: "floor", x: 0, y: 0, z: 0.3, speed: 3, random: sequence([0.7]) });
  assert(field.decals[0].rotation !== 0, "a wall splat should not always land the same way up");
  assertEqual(field.decals[1].rotation, 0, "a floor splat must keep its painted horizon");
});

test("a decal drawn further into the room is drawn smaller", () => {
  // The depth this whole thing is painted into. `render/splats.js` sizes a
  // decal in world units and lets the projection shrink it, so this is the
  // arithmetic that ends up on the canvas.
  const field = createSplatField();
  for (const z of [0.05, 0.45, 0.92]) {
    addSplat(field, { surface: "floor", x: 0, y: 0, z, speed: 3, scale: 2.7, random: sequence([0.5]) });
  }
  const widths = field.decals.map((d) => worldToScreenLength(BALL_RADIUS_WORLD, d.z) * 2 * d.scale);
  assert(widths[0] > widths[1] && widths[1] > widths[2], `depth did not shrink the decal: ${widths}`);
  assert(widths[0] > widths[2] * 1.4, `the falloff is too weak to read: ${widths}`);
});

test("two identical splats come out the same size, so size only ever means depth", () => {
  // Random size jitter is the thing that broke this once: the perspective is
  // worth about a third across the room, so even a ten-percent wobble is the
  // same order as the depth and drowns it. Variety lives in rotation and
  // mirroring instead.
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 3, scale: 2.7, random: sequence([0.1]) });
  addSplat(field, { surface: "wall", x: 0.4, y: 1.2, z: 0.9, speed: 3, scale: 2.7, random: sequence([0.9]) });
  assertEqual(field.decals[0].scale, field.decals[1].scale, "same surface, same speed, same depth, same size");
  assert(field.decals[0].rotation !== field.decals[1].rotation, "they should still not be the same stamp");
});

test("a harder hit spreads wider than a glancing one", () => {
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 8, scale: 2.7, random: sequence([0.5]) });
  addSplat(field, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 0.3, scale: 2.7, random: sequence([0.5]) });
  assert(field.decals[0].scale > field.decals[1].scale, "impact is the one thing besides depth that sizes a decal");
});

test("the wall fills up to a cap and then paints over its oldest mark", () => {
  const field = createSplatField();
  for (let index = 0; index < MAX_DECALS + 6; index++) {
    addSplat(field, { surface: "wall", x: index, y: 1, z: 0.9, speed: 3, random: sequence([0.5]) });
  }
  assertEqual(field.decals.length, MAX_DECALS, "a whole round of misses must not go solid white");
  assertEqual(field.decals[0].x, 6, "the oldest marks are the ones that go");
  assertEqual(field.decals[field.decals.length - 1].x, MAX_DECALS + 5, "the newest is still there");
});

test("decals do not expire on a timer — they are the record of the round", () => {
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 3, random: sequence([0.5]) });
  for (let tick = 0; tick < 60 * 60; tick++) tickSplatField(field, TICK_SECONDS);
  assertEqual(field.decals.length, 1, "a minute later the wall still remembers");
  assertEqual(field.particles.length, 0, "the powder, on the other hand, is long gone");
});

test("powder falls, fades and is dropped once it is invisible", () => {
  const field = createSplatField();
  addSplat(field, { surface: "floor", x: 0, y: 0.05, z: 0.3, speed: 4, random: sequence([0.4, 0.9, 0.2, 0.6]) });
  const born = field.particles.length;
  assert(born > 0);

  const first = field.particles[0];
  const startAlpha = particleAlpha(first);
  tickSplatField(field, TICK_SECONDS * 10);
  assert(particleAlpha(first) < startAlpha, "powder should fade as it ages");

  for (let tick = 0; tick < 200; tick++) tickSplatField(field, TICK_SECONDS);
  assertEqual(field.particles.length, 0, "dead grains must not accumulate for the whole run");
});

test("powder never falls through the floor", () => {
  const field = createSplatField();
  addSplat(field, { surface: "floor", x: 0, y: 0.02, z: 0.3, speed: 5, random: sequence([0.3, 0.7]) });
  for (let tick = 0; tick < 40; tick++) {
    tickSplatField(field, TICK_SECONDS);
    for (const particle of field.particles) assert(particle.y >= 0, "a grain went under the room");
  }
});

test("a harder hit throws more powder than a glancing one", () => {
  const hard = createSplatField();
  const soft = createSplatField();
  addSplat(hard, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 6, random: sequence([0.5]) });
  addSplat(soft, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 0.4, random: sequence([0.5]) });
  assert(hard.particles.length > soft.particles.length, "the burst should scale with the impact");
});

test("wall powder always sprays back into the room, never into the wall", () => {
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0, y: 1.1, z: 0.92, speed: 5, random: sequence([0.1, 0.55, 0.83, 0.37]) });
  for (const particle of field.particles) {
    assert(particle.vz < 0, "a grain was thrown deeper into a solid plane");
  }
});

test("clearing the field wipes the room for the next run", () => {
  const field = createSplatField();
  addSplat(field, { surface: "wall", x: 0, y: 1, z: 0.9, speed: 3, random: sequence([0.5]) });
  clearSplatField(field);
  assertEqual(field.decals.length, 0);
  assertEqual(field.particles.length, 0);
});

finish();
