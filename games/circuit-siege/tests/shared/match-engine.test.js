import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadBoardDefinition } from "../../scripts/shared/circuit-board.js";
import {
  applyPlayerIntent,
  createAuthoritativeMatchState
} from "../../scripts/shared/match-engine.js";

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

function createState() {
  return createAuthoritativeMatchState(board, { matchId: "test-match" });
}

console.log("\nmatch-engine");

test("createAuthoritativeMatchState initializes holes empty and refactor tiles incorrect but editable", () => {
  const state = createState();

  assertEqual(state.slots.blue_route_01_rp_1.placedMask, null);
  assertEqual(state.slots.blue_route_01_rp_2.placedMask, "NS");
  assertEqual(state.slots.blue_route_01_rp_2.locked, false);
  assertEqual(state.scores.blue, 0);
  assertEqual(state.scores.red, 0);
});

test("applyPlayerIntent rejects edits on the wrong player's side", () => {
  const result = applyPlayerIntent(createState(), {
    playerSide: "red",
    intentType: "PLACE_TILE",
    slotId: "blue_route_01_rp_1",
    pieceType: "straight",
    rotation: 90
  });

  assertEqual(result.ok, false);
  assertEqual(result.errorCode, "WRONG_OWNER");
});

test("ROTATE_TILE advances a placed slot and can complete a route with follow-up placements", () => {
  let result = applyPlayerIntent(createState(), {
    playerSide: "blue",
    intentType: "ROTATE_TILE",
    slotId: "blue_route_01_rp_2"
  });

  assertEqual(result.ok, true);
  assertEqual(result.state.slots.blue_route_01_rp_2.placedMask, "EW");
  assertEqual(result.resolvedRoute, null);

  result = applyPlayerIntent(result.state, {
    playerSide: "blue",
    intentType: "PLACE_TILE",
    slotId: "blue_route_01_rp_1",
    pieceType: "straight",
    rotation: 90
  });

  result = applyPlayerIntent(result.state, {
    playerSide: "blue",
    intentType: "PLACE_TILE",
    slotId: "blue_route_01_rp_3",
    pieceType: "straight",
    rotation: 90
  });

  assertEqual(result.ok, true);
  assertEqual(result.resolvedRoute.routeId, "blue_route_01");
  assertEqual(result.resolvedRoute.terminalType, "dud");
  assertEqual(result.state.scores.blue, 0);
  assertEqual(result.state.routes.blue_route_01.completed, true);
});

test("completing a damage route increments the owner's score and locks all route slots", () => {
  let state = createState();

  state = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "PLACE_TILE",
    slotId: "blue_route_03_rp_1",
    pieceType: "straight",
    rotation: 90
  }).state;

  state = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "REPLACE_TILE",
    slotId: "blue_route_03_rp_2",
    pieceType: "straight",
    rotation: 0
  }).state;

  const result = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "PLACE_TILE",
    slotId: "blue_route_03_rp_3",
    pieceType: "straight",
    rotation: 90
  });

  assertEqual(result.ok, true);
  assertEqual(result.resolvedRoute.routeId, "blue_route_03");
  assertEqual(result.resolvedRoute.terminalType, "damage");
  assertEqual(result.state.scores.blue, 1);
  assertEqual(result.state.terminals.blue_terminal_01.completed, true);
  assertEqual(result.state.slots.blue_route_03_rp_1.locked, true);
  assertEqual(result.state.slots.blue_route_03_rp_2.locked, true);
  assertEqual(result.state.slots.blue_route_03_rp_3.locked, true);
});

test("locked routes reject further edits after completion", () => {
  let state = createState();

  state = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "PLACE_TILE",
    slotId: "blue_route_03_rp_1",
    pieceType: "straight",
    rotation: 90
  }).state;

  state = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "REPLACE_TILE",
    slotId: "blue_route_03_rp_2",
    pieceType: "straight",
    rotation: 0
  }).state;

  state = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "PLACE_TILE",
    slotId: "blue_route_03_rp_3",
    pieceType: "straight",
    rotation: 90
  }).state;

  const result = applyPlayerIntent(state, {
    playerSide: "blue",
    intentType: "ROTATE_TILE",
    slotId: "blue_route_03_rp_2"
  });

  assertEqual(result.ok, false);
  assertEqual(result.errorCode, "SLOT_LOCKED");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
