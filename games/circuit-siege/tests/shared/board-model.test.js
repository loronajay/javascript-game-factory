import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadBoardDefinition } from "../../scripts/shared/circuit-board.js";
import { getExpectedMaskForSlot } from "../../scripts/shared/route-validator.js";

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

console.log("\nboard-model");

test("board keeps the canonical mirrored 41x20 footprint", () => {
  assertEqual(board.cols, 41);
  assertEqual(board.rows, 20);
  assertEqual(board.sideCols, 20);
  assertEqual(board.centerWallColumn, 20);
});

test("board includes the full 20-route competitive setup", () => {
  const blueRoutes = board.routes.filter((route) => route.owner === "blue");
  const redRoutes = board.routes.filter((route) => route.owner === "red");

  assertEqual(blueRoutes.length, 10);
  assertEqual(redRoutes.length, 10);
  assertEqual(board.routes.length, 20);
});

test("each side exposes 5 damage terminals and 5 dud terminals", () => {
  const blueDamage = board.routes.filter((route) => route.owner === "blue" && route.terminalType === "damage");
  const redDamage = board.routes.filter((route) => route.owner === "red" && route.terminalType === "damage");
  const blueDuds = board.routes.filter((route) => route.owner === "blue" && route.terminalType === "dud");
  const redDuds = board.routes.filter((route) => route.owner === "red" && route.terminalType === "dud");

  assertEqual(blueDamage.length, 5);
  assertEqual(redDamage.length, 5);
  assertEqual(blueDuds.length, 5);
  assertEqual(redDuds.length, 5);
});

test("every route keeps exactly 3 repair slots in the authored v1 board", () => {
  for (const route of board.routes) {
    assertEqual((board.slotsByRouteId[route.routeId] || []).length, 3, `expected 3 repair slots for ${route.routeId}`);
  }
});

test("blue routes mirror red routes by inverse route index", () => {
  const blueRoutes = board.routes.filter((route) => route.owner === "blue");

  for (const blueRoute of blueRoutes) {
    const expectedMirrorRouteId = `red_route_${String(11 - blueRoute.routeIndex).padStart(2, "0")}`;
    const mirrorRoute = board.routesById[blueRoute.mirrorRouteId];

    assertEqual(blueRoute.mirrorRouteId, expectedMirrorRouteId, `unexpected mirror route for ${blueRoute.routeId}`);
    assert(mirrorRoute, `missing mirror route for ${blueRoute.routeId}`);
    assertEqual(mirrorRoute.mirrorRouteId, blueRoute.routeId, `mirror route should point back to ${blueRoute.routeId}`);
  }
});

test("every repair slot sits on its route and matches the canonical mask", () => {
  for (const slot of board.repairSlots) {
    const route = board.routesById[slot.routeId];
    const routeCellKeys = new Set(route.cells.map(([x, y]) => `${x},${y}`));

    assert(routeCellKeys.has(`${slot.x},${slot.y}`), `slot ${slot.slotId} is not on ${slot.routeId}`);
    assertEqual(getExpectedMaskForSlot(board, slot.slotId), slot.expectedMask, `unexpected canonical mask for ${slot.slotId}`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
