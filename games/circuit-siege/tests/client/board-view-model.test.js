import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadBoardDefinition } from "../../scripts/shared/circuit-board.js";
import { buildBoardViewModel } from "../../scripts/client/board-view-model.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gameRoot = path.resolve(__dirname, "..", "..");
const boardPath = path.join(gameRoot, "data", "authored-board.v1.json");
const board = loadBoardDefinition(JSON.parse(fs.readFileSync(boardPath, "utf8")));

console.log("\nboard-view-model");

test("buildBoardViewModel exposes the full 41x20 board with wall and slot metadata", () => {
  const viewModel = buildBoardViewModel({
    board,
    snapshot: null,
    selectedSide: "blue"
  });

  assertEqual(viewModel.board.cols, 41);
  assertEqual(viewModel.board.rows, 20);
  assertEqual(viewModel.cells.length, 820);
  assertEqual(viewModel.wallCells.length, 20);
  assert(viewModel.cells.some((cell) => cell.slotId === "blue_route_01_rp_1"), "expected repair slot cell in view model");
});

test("buildBoardViewModel marks editable ownership and scoreboard state from the authoritative snapshot", () => {
  const viewModel = buildBoardViewModel({
    board,
    selectedSide: "blue",
    snapshot: {
      phase: "live",
      timerMsRemaining: 240000,
      scores: { blue: 2, red: 1 },
      routes: {
        blue_route_03: { completed: true }
      },
      terminals: {
        blue_terminal_01: { completed: true }
      },
      slots: {
        blue_route_01_rp_1: { placedMask: "NS", locked: false },
        red_route_01_rp_1: { placedMask: "NS", locked: false }
      },
      result: null
    }
  });

  assertEqual(viewModel.scoreText.blue, "2 / 5");
  assertEqual(viewModel.scoreText.red, "1 / 5");
  assertEqual(viewModel.timerText, "4:00");

  const mySlot = viewModel.cells.find((cell) => cell.slotId === "blue_route_01_rp_1");
  const opponentSlot = viewModel.cells.find((cell) => cell.slotId === "red_route_01_rp_1");
  assertEqual(mySlot.editableByLocalPlayer, true);
  assertEqual(opponentSlot.editableByLocalPlayer, false);
});

test("buildBoardViewModel surfaces end-state copy for results", () => {
  const viewModel = buildBoardViewModel({
    board,
    selectedSide: "red",
    snapshot: {
      phase: "ended",
      timerMsRemaining: 0,
      scores: { blue: 5, red: 3 },
      routes: {},
      terminals: {},
      slots: {},
      result: {
        type: "win",
        reason: "score",
        winnerSide: "blue"
      }
    }
  });

  assertEqual(viewModel.statusText, "Blue wins.");
  assertEqual(viewModel.resultTone, "loss");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
