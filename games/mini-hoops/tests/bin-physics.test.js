import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { BALL_RADIUS_WORLD, REFERENCE_POWER, TICK_SECONDS } from "../scripts/sim/constants.js";
import { createBall, launchBall, resetBall } from "../scripts/sim/physics.js";
import { launchSpin, solveLaunch } from "../scripts/sim/launch.js";
import { projectPoint } from "../scripts/sim/projection.js";
import {
  BIN_MOUTH_Y,
  BIN_WALL_THICKNESS,
  createBinTargets,
  detectBinScore,
  resolveBinRimContact,
  resolveBinWallContact,
  stepBallAgainstBins,
} from "../scripts/sim/bin-physics.js";
import { createTicTacToeShot } from "../scripts/sim/tic-tac-toe-shot.js";

suite("bin physics — reusable depth targets with real rim behaviour");

const bins = createBinTargets();

test("the reusable target field creates nine world-space bins", () => {
  assertEqual(bins.length, 9);
  assertEqual(new Set(bins.map(({ row, column }) => `${row}:${column}`)).size, 9);
  assert(bins[0].z > bins[6].z, "back row must be deeper than front row");
});

test("a descending plane crossing through the mouth scores", () => {
  const bin = bins[4];
  const previous = { x: bin.x, y: BIN_MOUTH_Y + 0.04, z: bin.z };
  const ball = { ...previous, y: BIN_MOUTH_Y - 0.04, vy: -5 };
  assert(detectBinScore(ball, previous, bin));
});

test("a rising ball and a ball outside the opening do not score", () => {
  const bin = bins[4];
  const above = { x: bin.x, y: BIN_MOUTH_Y + 0.04, z: bin.z };
  assert(!detectBinScore({ ...above, y: BIN_MOUTH_Y - 0.04, vy: 5 }, above, bin));
  assert(!detectBinScore({ ...above, x: bin.x + 0.35, y: BIN_MOUTH_Y - 0.04, vy: -5 }, above, bin));
});

test("the bin lip resolves as a torus and sends an incoming graze away", () => {
  const bin = bins[4];
  const ball = createBall();
  Object.assign(ball, {
    x: bin.x + bin.mouthRadius,
    y: bin.topY + BALL_RADIUS_WORLD * 0.45,
    z: bin.z,
    vx: -0.4,
    vy: -2,
  });
  const before = ball.vy;
  assertEqual(resolveBinRimContact(ball, bin), "bin-rim");
  assert(ball.vy > before, "the rim changes the incoming normal velocity");
});

test("a calibrated shot to each row can visibly enter the selected bin", () => {
  for (const index of [1, 4, 7]) {
    const bin = bins[index];
    const ball = createBall();
    const target = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z },
      aim: target,
      targetZ: bin.z,
      entryVelocity: -4,
      power: REFERENCE_POWER,
      loft: 1,
    });
    launchBall(ball, launch, launchSpin(launch));
    let scored = null;
    for (let tick = 0; tick < 240 && scored === null; tick++) {
      const result = stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: "basketball" });
      if (result.scoredBin !== null) scored = result.scoredBin;
    }
    assertEqual(scored, index, `reference shot should enter row target ${index}`);
    assert(ball.y < bin.topY, "the scored ball must continue below the lip, not vanish on contact");
  }
});

test("the visible mouth gives the front row a playable make window", () => {
  const bin = bins[7];
  for (const power of [0.78, 0.8, 0.82]) {
    const ball = createBall();
    const target = projectPoint({ x: bin.x, y: bin.topY, z: bin.z });
    const launch = solveLaunch({
      origin: { x: ball.x, y: ball.y, z: ball.z }, aim: target, targetZ: bin.z,
      power, loft: 1, entryVelocity: -4,
    });
    launchBall(ball, launch, launchSpin(launch));
    let scored = null;
    for (let tick = 0; tick < 240 && scored === null; tick++) {
      const result = stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: "basketball" });
      if (result.scoredBin !== null) scored = result.scoredBin;
    }
    assertEqual(scored, bin.index, `${Math.round(power * 100)}% should fit through the visible mouth`);
  }
});

test("a captured ball loses lateral energy and stays inside its bin", () => {
  const bin = bins[4];
  const ball = createBall();
  Object.assign(ball, { x: bin.x, y: bin.topY - 0.03, z: bin.z, vx: 2, vy: -2, vz: 1 });
  stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: "basketball", capturedBin: 4 });
  assert(Math.abs(ball.vx) < 2 && Math.abs(ball.vz) < 1, "the bin interior should arrest sideways travel");
  assertClose(Math.hypot(ball.x - bin.x, ball.z - bin.z) < bin.mouthRadius ? 1 : 0, 1, 0);
});

test("a fragile turn ball still splats on the bare room around the bins", () => {
  const ball = createBall();
  Object.assign(ball, { y: 0.22, vy: -2.4, z: 0.12 });
  let splat = null;
  for (let tick = 0; tick < 30 && !splat; tick += 1) {
    splat = stepBallAgainstBins(ball, [], TICK_SECONDS, { ballId: "snowball" }).splat;
  }
  assertEqual(splat?.surface, "floor", "the snowball bounced like a permanent ball");
  assertEqual(ball.splat?.surface, "floor", "the burst was reported but not frozen onto the ball");
});

test("the side wall stops at the mouth plane, so a lob can clear a row", () => {
  // The bug this pins: the wall used to run to `topY + BALL_RADIUS_WORLD`, which
  // put a full-height cylinder of horizontal normal in the 7.8cm of air ABOVE
  // the mouth — where only the rim torus exists. A back-row lob leaves the floor
  // climbing steeply and passes through that phantom band a hand's width to the
  // near side of the front bin, so a full-power shot came straight back at the
  // player off a surface that was neither drawn nor there.
  const bin = bins[7];
  const above = createBall();
  Object.assign(above, {
    x: bin.x,
    y: bin.topY + 0.05,
    z: bin.z - (bin.mouthRadius + BIN_WALL_THICKNESS + 0.077),
    vx: 0, vy: 3, vz: 1,
  });
  const previous = { x: above.x, y: above.y - 0.05, z: above.z - 0.02 };
  assertEqual(resolveBinWallContact(above, previous, bin), null, "nothing above the mouth is wall");

  // Still a wall where the wall is.
  const beside = createBall();
  Object.assign(beside, { x: bin.x, y: bin.topY * 0.5, z: bin.z - 0.22, vx: 0, vy: 0, vz: 2 });
  const before = { x: beside.x, y: beside.y, z: beside.z - 0.05 };
  assertEqual(resolveBinWallContact(beside, before, bin), "bin-wall", "the body is still solid below the mouth");
  assert(beside.vz < 0, "and it still turns the ball away");
});

test("a full-power lob reaches the back row instead of bouncing back", () => {
  const target = bins[1];
  const screen = projectPoint({ x: target.x, y: target.topY, z: target.z });
  const ball = createBall();
  resetBall(ball);
  const shot = createTicTacToeShot(
    { power: 1, aimX: screen.x, aimY: screen.y, loft: 0.5, distance: 100 },
    ball,
    { weight: 1 },
  );
  launchBall(ball, shot.launch);
  let captured = null;
  let scored = null;
  for (let tick = 0; tick < 300 && scored === null; tick++) {
    const result = stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: "basketball", capturedBin: captured });
    if (result.capturedBin !== null) captured = result.capturedBin;
    if (result.scoredBin !== null) scored = result.scoredBin;
    assert(ball.z > -0.2, "the ball must never be turned back toward the player on the way out");
  }
  assertEqual(scored, target.index, "a maximum pull must reach the back row");
});

finish();
