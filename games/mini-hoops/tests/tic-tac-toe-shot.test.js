import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { TICK_SECONDS } from "../scripts/sim/constants.js";
import { createBinTargets, stepBallAgainstBins } from "../scripts/sim/bin-physics.js";
import { createBall, launchBall } from "../scripts/sim/physics.js";
import { launchSpin } from "../scripts/sim/launch.js";
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

finish();
