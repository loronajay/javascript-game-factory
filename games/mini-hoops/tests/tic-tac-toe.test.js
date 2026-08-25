import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  DIFFICULTIES,
  chooseCpuCell,
  createTicTacToeMatch,
  isHumanControlledTurn,
  markForCell,
  playerLabel,
  resolveAttempt,
  winningLine,
} from "../scripts/sim/tic-tac-toe.js";
import { capturedBinForDraw, isTicTacToeBallVisible } from "../scripts/tic-tac-toe-game.js";

suite("tic-tac-toe — turns, assignment, wins, and adjustable CPU play");

test("the opening assignment is explicit and X takes the first shot", () => {
  const match = createTicTacToeMatch({ humanMark: "o", difficulty: "hard" });
  assertEqual(match.humanMark, "o");
  assertEqual(match.cpuMark, "x");
  assertEqual(match.turn, "x");
  assertEqual(match.difficulty, "hard");
});

test("local multiplayer gives X to player 1 and keeps both turns human-controlled", () => {
  const match = createTicTacToeMatch({ mode: "local", humanMark: "o", difficulty: "hard" });
  assertEqual(match.mode, "local");
  assertEqual(match.humanMark, "x");
  assertEqual(match.cpuMark, null);
  assertEqual(match.turn, "x");
  assertEqual(playerLabel(match), "Player 1");
  assertEqual(isHumanControlledTurn(match), true);

  resolveAttempt(match, 4, false);
  assertEqual(match.turn, "o");
  assertEqual(playerLabel(match), "Player 2");
  assertEqual(isHumanControlledTurn(match), true);
});

test("CPU matches only let the assigned human control their own turn", () => {
  const match = createTicTacToeMatch({ mode: "cpu", humanMark: "o" });
  assertEqual(playerLabel(match), "CPU");
  assertEqual(isHumanControlledTurn(match), false);
  resolveAttempt(match, 0, false);
  assertEqual(playerLabel(match), "You");
  assertEqual(isHumanControlledTurn(match), true);
});

test("online matches only let the local player's assigned mark shoot", () => {
  const match = createTicTacToeMatch({ mode: "online", humanMark: "o" });
  assertEqual(match.mode, "online");
  assertEqual(match.humanMark, "o");
  assertEqual(match.cpuMark, null);
  assertEqual(playerLabel(match), "Opponent");
  assertEqual(isHumanControlledTurn(match), false);
  resolveAttempt(match, 0, false);
  assertEqual(playerLabel(match), "You");
  assertEqual(isHumanControlledTurn(match), true);
});

test("a miss consumes the turn without claiming a cell", () => {
  const match = createTicTacToeMatch({ humanMark: "x" });
  const result = resolveAttempt(match, 4, false);
  assertEqual(result.accepted, true);
  assertEqual(match.board[4], null);
  assertEqual(match.turn, "o");
});

test("a make claims exactly the attempted open cell", () => {
  const match = createTicTacToeMatch({ humanMark: "x" });
  resolveAttempt(match, 7, true);
  assertEqual(match.board[7], "x");
  assertEqual(match.board.filter(Boolean).length, 1);
  assertEqual(match.turn, "o");
});

test("an occupied cell cannot be attempted again", () => {
  const match = createTicTacToeMatch({ humanMark: "x" });
  resolveAttempt(match, 2, true);
  const result = resolveAttempt(match, 2, true);
  assertEqual(result.accepted, false);
  assertEqual(match.turn, "o", "a rejected attempt does not steal the turn");
});

test("three assigned symbols in a row ends the match", () => {
  const match = createTicTacToeMatch({ humanMark: "x" });
  Object.assign(match, { board: ["x", "x", null, "o", "o", null, null, null, null], turn: "x" });
  const result = resolveAttempt(match, 2, true);
  assertEqual(result.winner, "x");
  assertEqual(match.status, "won");
  assertEqual(winningLine(match.board).join(","), "0,1,2");
});

test("difficulty catalog changes both strategy and shooting accuracy", () => {
  assertEqual(DIFFICULTIES.map(({ id }) => id).join(","), "easy,medium,hard");
  assert(DIFFICULTIES[0].makeChance < DIFFICULTIES[1].makeChance);
  assert(DIFFICULTIES[1].makeChance < DIFFICULTIES[2].makeChance);
  assert(DIFFICULTIES[0].strategy < DIFFICULTIES[1].strategy);
  assert(DIFFICULTIES[1].strategy < DIFFICULTIES[2].strategy);
});

test("hard CPU takes a win, then a block, before positional preference", () => {
  assertEqual(chooseCpuCell(["o", "o", null, "x", null, "x", null, null, null], "o", "hard", () => 0.9), 2);
  assertEqual(chooseCpuCell(["x", "x", null, "o", null, null, null, null, null], "o", "hard", () => 0.9), 2);
});

test("cell marks stay hidden for one second, then replace the scored bin", () => {
  const board = [null, null, null, null, "x", null, null, null, null];
  const scoredAt = new Map([[4, 12]]);
  assertEqual(markForCell(board, scoredAt, 4, 12.999), null);
  assertEqual(markForCell(board, scoredAt, 4, 13), "x");
});

test("the bin occlusion pass is safely absent between shots", () => {
  assertEqual(capturedBinForDraw(null), null);
  assertEqual(capturedBinForDraw({ capturedBin: null }), null);
  assertEqual(capturedBinForDraw({ capturedBin: 6 }), 6);
});

test("the visible ball ends when it crosses into a bin", () => {
  assertEqual(isTicTacToeBallVisible(null), true);
  assertEqual(isTicTacToeBallVisible({ capturedBin: null }), true);
  assertEqual(isTicTacToeBallVisible({ capturedBin: 6 }), false);
});

finish();
