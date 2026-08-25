import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { BALL_RADIUS_WORLD, REFERENCE_POWER, TICK_SECONDS } from "../scripts/sim/constants.js";
import { createBall, launchBall } from "../scripts/sim/physics.js";
import { launchSpin, solveLaunch } from "../scripts/sim/launch.js";
import { projectPoint } from "../scripts/sim/projection.js";
import {
  BIN_MOUTH_Y,
  createBinTargets,
  detectBinScore,
  resolveBinRimContact,
  stepBallAgainstBins,
} from "../scripts/sim/bin-physics.js";

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

finish();
