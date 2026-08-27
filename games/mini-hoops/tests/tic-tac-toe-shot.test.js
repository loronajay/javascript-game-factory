import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { TICK_SECONDS } from "../scripts/sim/constants.js";
import { createBinTargets, stepBallAgainstBins } from "../scripts/sim/bin-physics.js";
import { createBall, launchBall } from "../scripts/sim/physics.js";
import { launchSpin } from "../scripts/sim/launch.js";
import { ballFlight, ballIds } from "../scripts/assets/ball-catalog.js";
import {
  createTicTacToeShot,
  nearestOpenCellForShot,
  ticTacToeAimDepth,
} from "../scripts/sim/tic-tac-toe-shot.js";

suite("tic-tac-toe shot — direct pull aiming without target selection");

const bins = createBinTargets();

test("power maps the three playable rows to intuitive pull strengths", () => {
  assertClose(ticTacToeAimDepth(0.5), bins[7].z, 0.015);
  assertClose(ticTacToeAimDepth(0.7), bins[4].z, 0.015);
  assertClose(ticTacToeAimDepth(0.9), bins[1].z, 0.015);
});

test("a straight pull can physically enter every row without selecting a bin first", () => {
  for (const [power, expected] of [[0.5, 7], [0.7, 4], [0.9, 1]]) {
    const ball = createBall();
    const shot = createTicTacToeShot({ power, aimX: 480, loft: 1 }, ball);
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    let scored = null;
    for (let tick = 0; tick < 240 && scored === null; tick++) {
      const result = stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId: "basketball" });
      if (result.scoredBin !== null) scored = result.scoredBin;
    }
    assertEqual(scored, expected, `${Math.round(power * 100)}% should enter cell ${expected + 1}`);
  }
});

test("the launch keeps horizontal aim continuous instead of snapping to a cell", () => {
  const ball = createBall();
  const left = createTicTacToeShot({ power: 0.7, aimX: 405, loft: 1 }, ball);
  const centre = createTicTacToeShot({ power: 0.7, aimX: 480, loft: 1 }, ball);
  assert(left.launch.vx < centre.launch.vx, "leftward aim must produce a leftward launch change");
  assertEqual(left.targetZ, centre.targetZ);
});

test("a missed shot is attributed to the nearest open cell for turn synchronization", () => {
  const board = [null, null, null, null, "x", null, null, null, null];
  assertEqual(nearestOpenCellForShot({ aimX: 480, targetZ: bins[4].z }, bins, board), 7);
  assertEqual(nearestOpenCellForShot({ aimX: 350, targetZ: bins[7].z }, bins, board), 6);
  assert(nearestOpenCellForShot({ aimX: 480, targetZ: bins[4].z }, bins, Array(9).fill("x")) === null);
});

/**
 * Play one pull out and report the cell it dropped into, or the first thing it
 * hit on the way.
 */
function playShot(ballId, power, aimX = 480) {
  const ball = createBall();
  const shot = createTicTacToeShot({ power, aimX, loft: 1 }, ball, { weight: ballFlight(ballId).weight });
  launchBall(ball, shot.launch, launchSpin(shot.launch));
  let captured = null;
  let firstContact = null;
  let firstContactAge = 0;
  for (let tick = 0; tick < 240; tick++) {
    const result = stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId, capturedBin: captured });
    if (result.capturedBin !== null) captured = result.capturedBin;
    if (!firstContact && result.contacts.length) {
      firstContact = result.contacts[0];
      firstContactAge = tick * TICK_SECONDS;
    }
    if (result.scoredBin !== null) return { scored: result.scoredBin, firstContact, firstContactAge };
    if (result.splat) break;
  }
  return { scored: null, firstContact, firstContactAge };
}

test("EVERY ball can reach every row, in increasing order of pull", () => {
  for (const ballId of ballIds()) {
    for (const cell of [7, 4, 1]) {
      let reached = null;
      for (let power = 0.2; power <= 1.0001 && reached === null; power += 0.01) {
        if (playShot(ballId, Number(power.toFixed(2))).scored === cell) reached = power;
      }
      assert(reached !== null, `${ballId} cannot reach cell ${cell + 1} with any pull`);
    }
  }
});

test("no ball clips the front row on its way out of the hand", () => {
  // The arrival speed used to be flat across the roster, so a heavy ball's arc
  // came out fast and flat enough to strike the near lip of the front bin about
  // 50ms after release — a shot aimed at the back row eaten by the nearest one.
  // `binEntryVelocity` scales the arrival by the ball's weight, which makes the
  // path through the room one shape for every ball; this is what says so.
  for (const ballId of ballIds()) {
    const { firstContact, firstContactAge } = playShot(ballId, 0.9);
    if (!firstContact) continue;
    assert(
      firstContactAge > 0.25,
      `${ballId} hit ${firstContact} at ${firstContactAge.toFixed(2)}s — that is still in the shooter's hands`,
    );
  }
});

test("a light ball's arc stays inside the room", () => {
  // The beach ball used to solve to a 2.6-second lob that reached the ceiling
  // and then dropped two rows short of where it was aimed. Asserted as a
  // CONTACT rather than as an apex height, because the collider clamps the ball
  // to the ceiling and an apex test can never see past it.
  for (const ballId of ballIds()) {
    const ball = createBall();
    const shot = createTicTacToeShot({ power: 0.9, aimX: 480, loft: 1 }, ball, { weight: ballFlight(ballId).weight });
    launchBall(ball, shot.launch, launchSpin(shot.launch));
    for (let tick = 0; tick < 240; tick++) {
      const result = stepBallAgainstBins(ball, bins, TICK_SECONDS, { ballId });
      assert(!result.contacts.includes("ceiling"), `${ballId} throws a bin shot into the ceiling`);
      if (result.scoredBin !== null || result.splat) break;
    }
  }
});

finish();
