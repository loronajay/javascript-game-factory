import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadBoardDefinition } from "../../scripts/shared/circuit-board.js";
import {
  deriveCanonicalMasksForRoute,
  getExpectedMaskForSlot,
  isRouteComplete
} from "../../scripts/shared/route-validator.js";

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

console.log("\nroute-validator");

test("deriveCanonicalMasksForRoute builds the expected masks for a simple authored route", () => {
  const route = board.routesById.blue_route_01;
  const canonicalMasks = deriveCanonicalMasksForRoute(route);

  assertEqual(canonicalMasks["0,2"], "NS");
  assertEqual(canonicalMasks["0,3"], "NE");
  assertEqual(canonicalMasks["1,3"], "EW");
  assertEqual(canonicalMasks["2,3"], "SW");
  assertEqual(canonicalMasks["2,10"], "NS");
});

test("getExpectedMaskForSlot resolves the authored slot mask from route geometry", () => {
  assertEqual(getExpectedMaskForSlot(board, "blue_route_01_rp_1"), "NS");
  assertEqual(getExpectedMaskForSlot(board, "blue_route_01_rp_2"), "EW");
  assertEqual(getExpectedMaskForSlot(board, "blue_route_01_rp_3"), "NS");
});

test("isRouteComplete rejects incomplete routes", () => {
  assert(!isRouteComplete(board, "blue_route_01", {
    blue_route_01_rp_1: "NS",
    blue_route_01_rp_2: "EW"
  }));
});

test("isRouteComplete rejects routes with wrong repair masks", () => {
  assert(!isRouteComplete(board, "blue_route_01", {
    blue_route_01_rp_1: "EW",
    blue_route_01_rp_2: "EW",
    blue_route_01_rp_3: "NS"
  }));
});

test("isRouteComplete accepts a route once all repair slots match canonical geometry", () => {
  assert(isRouteComplete(board, "blue_route_01", {
    blue_route_01_rp_1: "NS",
    blue_route_01_rp_2: "EW",
    blue_route_01_rp_3: "NS"
  }));
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
