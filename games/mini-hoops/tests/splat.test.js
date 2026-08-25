import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { BALL_RADIUS_WORLD, BOARD_Z, SHOT_SETTLE_SECONDS, TICK_SECONDS } from "../scripts/sim/constants.js";
import { worldToScreenLength } from "../scripts/sim/projection.js";
import { hoopAt } from "../scripts/sim/hoop.js";
import { solveLaunch, launchSpin } from "../scripts/sim/launch.js";
import { createBall, isBallSettled, launchBall, resetBall, stepBall, worldFor } from "../scripts/sim/physics.js";
import { ballFlight } from "../scripts/assets/ball-catalog.js";
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

/**
 * The fewest ticks a dead shot may take to hand the ball back.
 *
 * `SHOT_SETTLE_SECONDS` is the beat a resolved shot waits out before the next
 * ball appears, so anything at or above it is proof the burst did not short-
 * circuit that wait. Derived rather than typed, so retuning the constant moves
 * the floor with it.
 */
const SHOT_MIN_DEAD_TICKS = Math.floor(SHOT_SETTLE_SECONDS / TICK_SECONDS);

const SNOWBALL = "snowball";
const BASKETBALL = "basketball";

/**
 * Fire one shot and play it out, returning what happened to it.
 *
 * Takes the ball id and changes nothing else, so the same aim and power can be
 * put through two balls. Note it solves with the ball's OWN weight, exactly as
 * the game does — the solver compensates weight and not drag, so a shot fired
 * here is the shot the player would have got.
 */
function takeShot({ ballId, aim, power, loft, maxTicks = 400 }) {
  const ball = createBall();
  const shot = createShot();
  const origin = { x: ball.x, y: ball.y, z: ball.z };
  const launch = solveLaunch({ origin, aim, power, loft, weight: ballFlight(ballId).weight });
  launchBall(ball, launch, launchSpin(launch));
  beginShot(shot);

  const hoop = hoopAt("still", 0);
  const world = worldFor(hoop);
  const contacts = [];
  let splats = 0;
  let ticks = 0;
  // WHEN each happened, not just whether: a made shot legitimately bursts on the
  // floor after dropping through the net, so the only way to tell a harmless
  // burst from an outcome-deciding one is the order they occurred in.
  let splatTick = 0;
  let scoredTick = 0;

  while (shot.state === SHOT_FLIGHT && ticks < maxTicks) {
    ticks += 1;
    const stepped = stepBall(ball, world, TICK_SECONDS, { ballId, alreadyScored: shot.scored });
    for (const contact of stepped.contacts) contacts.push(contact);
    if (stepped.splat) {
      splats += 1;
      if (!splatTick) splatTick = ticks;
    }
    if (stepped.scored && !scoredTick) scoredTick = ticks;

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

  return {
    ball,
    shot,
    contacts,
    splats,
    ticks,
    splatTick,
    scoredTick,
    scored: shot.scored,
    label: shot.resolvedLabel,
  };
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
  // A deliberate bank off the glass. The board used to be covered by the rim
  // graze happening to clip it on its way past, which is a fixture that stops
  // covering what it claims to the moment anything about the arc moves — and it
  // did, when the camera was rebuilt. This one is aimed at the board.
  { name: "off the glass", aim: { x: 470, y: 185 }, power: 0.88, loft: 0.4 },
];

// ---------------------------------------------------------------------------
// What a burst may and may not cost
// ---------------------------------------------------------------------------
//
// THIS USED TO BE A CROSS-BALL PARITY TEST — snowball and basketball asserted to
// score identically, shot for shot, because the boards are keyed `mode:duration`
// and the ball was not in the key. Balls now fly differently on purpose, so that
// assertion is gone: it would be asserting the feature does not exist. Boards
// still rank every ball together, and every entry names its ball instead.
//
// What survives is narrower and still load-bearing: BURSTING is not allowed to
// be worth anything. A ball's advantages must come from its published flight
// numbers, which a player can read on the setup screen — never from the side
// effect of it falling apart. So the two things pinned here are that a burst
// never happens on a live shot, and that it never hands the ball back early.

test("a burst only ever happens to a shot that was already dead", () => {
  // SPLAT_SURFACES is bare wall and floor, and `sim/shot.js` calls the miss the
  // instant either is touched. If a burst could land on a live shot it would be
  // deciding outcomes, which is exactly what a cosmetic-adjacent mechanic may
  // not do. Widening SPLAT_SURFACES to the rim or the board fails this.
  let burst = 0;
  for (const spec of SHOTS) {
    const snow = takeShot({ ...spec, ballId: SNOWBALL });
    if (!snow.ball.splat) continue;
    burst += 1;
    assert(
      snow.ball.splat.surface === "wall" || snow.ball.splat.surface === "floor",
      `${spec.name}: burst on ${snow.ball.splat.surface}, which is not a dead surface`,
    );
    // A made shot bursting on the floor a beat after it dropped through is
    // normal and costs nothing. Bursting BEFORE it scored would have stolen the
    // basket, and is the failure this is looking for.
    if (snow.scored) {
      assert(
        snow.splatTick >= snow.scoredTick,
        `${spec.name}: burst on tick ${snow.splatTick}, before scoring on ${snow.scoredTick}`,
      );
    }
  }
  assert(burst > 0, "not one fixture shot ever burst, so this proves nothing");
});

test("a burst ball still runs out the full shot rather than ending it early", () => {
  // The easier half to break: a ball whose dead shots finished sooner would fit
  // more attempts into a 30-second round, which is a higher score for the same
  // hand and is not a flight property anyone can read. Compared against the
  // snowball's OWN non-bursting behaviour — `isBallSettled` refusing to report a
  // burst ball — rather than against another ball, which now flies differently.
  for (const spec of SHOTS) {
    const snow = takeShot({ ...spec, ballId: SNOWBALL });
    if (!snow.ball.splat) continue;
    assert(
      snow.ticks >= SHOT_MIN_DEAD_TICKS,
      `${spec.name}: handed back after only ${snow.ticks} ticks`,
    );
  }
});

test("balls fly the way their catalog rows say they do", () => {
  // The flight numbers are a promise made to the player on the setup screen, so
  // they are asserted in the DIRECTION the copy claims rather than pinned to
  // exact values — retuning a ball should not need this test edited, but
  // inverting one should fail it.
  const aim = { x: 480, y: 220 };
  const reach = (ballId) => {
    const origin = { x: 0, y: 0.1, z: 0 };
    const launch = solveLaunch({ origin, aim, power: 0.8, loft: 1, weight: ballFlight(ballId).weight });
    const ball = createBall();
    launchBall(ball, launch, launchSpin(launch));
    const world = worldFor(hoopAt("still", 0));
    // Flown free of the colliders: how far it gets under gravity and drag alone.
    let far = 0;
    for (let tick = 0; tick < 60; tick++) {
      stepBall(ball, world, TICK_SECONDS, { ballId, alreadyScored: true });
      far = Math.max(far, ball.z);
    }
    return { far, flightTime: launch.flightTime };
  };

  const house = reach(BASKETBALL);
  const paper = reach("paper");
  const bowling = reach("bowling-ball");

  assert(paper.far < house.far, "the paper wad's drag should land it short of the house ball");
  assert(bowling.far >= house.far * 0.98, "the bowling ball has almost no drag and should not fall short");
  assert(
    bowling.flightTime < house.flightTime && house.flightTime < paper.flightTime,
    "a heavier ball should get there sooner and a lighter one should hang",
  );
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
