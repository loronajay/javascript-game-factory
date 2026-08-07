import { suite, test, assert, assertEqual, assertDeepEqual, assertThrows, finish } from "./harness.js";

import {
  GATE_6_SPEED,
  createGate,
  gearNodeId,
  neutralNodeId,
  neighbor,
  pathBetweenGears,
  beginShift,
  applyShiftInput,
  SHIFT_IN_GATE,
  SHIFT_COMPLETED,
  SHIFT_MISSED,
} from "../scripts/sim/gate.js";

suite("gate — H-pattern topology and traversal");

const gate = createGate(GATE_6_SPEED);

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

test("a 6-speed gate exposes six gears across three columns", () => {
  assertEqual(gate.columns, 3);
  assertDeepEqual(gate.gears, [1, 2, 3, 4, 5, 6]);
});

test("odd gears sit on the top row, even gears on the bottom row", () => {
  assertEqual(gate.nodes[gearNodeId(1)].row, -1);
  assertEqual(gate.nodes[gearNodeId(3)].row, -1);
  assertEqual(gate.nodes[gearNodeId(5)].row, -1);
  assertEqual(gate.nodes[gearNodeId(2)].row, 1);
  assertEqual(gate.nodes[gearNodeId(4)].row, 1);
  assertEqual(gate.nodes[gearNodeId(6)].row, 1);
});

test("gear pairs share a column with their neutral rail node", () => {
  assertEqual(gate.nodes[gearNodeId(1)].col, 0);
  assertEqual(gate.nodes[gearNodeId(2)].col, 0);
  assertEqual(gate.nodes[gearNodeId(3)].col, 1);
  assertEqual(gate.nodes[gearNodeId(4)].col, 1);
  assertEqual(gate.nodes[gearNodeId(5)].col, 2);
  assertEqual(gate.nodes[gearNodeId(6)].col, 2);
  assertEqual(gate.nodes[neutralNodeId(0)].row, 0);
});

test("an unknown gear has no node", () => {
  assertEqual(gate.nodes[gearNodeId(7)], undefined);
});

// ---------------------------------------------------------------------------
// Edge traversal
// ---------------------------------------------------------------------------

test("a top-row gear drops into its own neutral node", () => {
  assertEqual(neighbor(gate, gearNodeId(1), "down"), neutralNodeId(0));
  assertEqual(neighbor(gate, gearNodeId(3), "down"), neutralNodeId(1));
});

test("a bottom-row gear lifts into its own neutral node", () => {
  assertEqual(neighbor(gate, gearNodeId(2), "up"), neutralNodeId(0));
  assertEqual(neighbor(gate, gearNodeId(4), "up"), neutralNodeId(1));
});

test("gears are walled in every direction except back toward neutral", () => {
  assertEqual(neighbor(gate, gearNodeId(1), "up"), null);
  assertEqual(neighbor(gate, gearNodeId(1), "left"), null);
  assertEqual(neighbor(gate, gearNodeId(1), "right"), null);
  assertEqual(neighbor(gate, gearNodeId(2), "down"), null);
  assertEqual(neighbor(gate, gearNodeId(2), "left"), null);
});

test("the neutral rail connects sideways between adjacent columns", () => {
  assertEqual(neighbor(gate, neutralNodeId(0), "right"), neutralNodeId(1));
  assertEqual(neighbor(gate, neutralNodeId(1), "right"), neutralNodeId(2));
  assertEqual(neighbor(gate, neutralNodeId(1), "left"), neutralNodeId(0));
});

test("the neutral rail is walled at both ends", () => {
  assertEqual(neighbor(gate, neutralNodeId(0), "left"), null);
  assertEqual(neighbor(gate, neutralNodeId(2), "right"), null);
});

test("a neutral node reaches both of its column's gears", () => {
  assertEqual(neighbor(gate, neutralNodeId(2), "up"), gearNodeId(5));
  assertEqual(neighbor(gate, neutralNodeId(2), "down"), gearNodeId(6));
});

// ---------------------------------------------------------------------------
// The design brief's shift sequences must fall out of the geometry, not be
// hardcoded. This is the load-bearing test for the whole gate-as-data approach.
// ---------------------------------------------------------------------------

test("1 -> 2 is Down, Down", () => {
  assertDeepEqual(pathBetweenGears(gate, 1, 2), ["down", "down"]);
});

test("2 -> 3 is Up, Right, Up", () => {
  assertDeepEqual(pathBetweenGears(gate, 2, 3), ["up", "right", "up"]);
});

test("3 -> 4 is Down, Down", () => {
  assertDeepEqual(pathBetweenGears(gate, 3, 4), ["down", "down"]);
});

test("4 -> 5 is Up, Right, Up", () => {
  assertDeepEqual(pathBetweenGears(gate, 4, 5), ["up", "right", "up"]);
});

test("5 -> 6 is Down, Down", () => {
  assertDeepEqual(pathBetweenGears(gate, 5, 6), ["down", "down"]);
});

test("downshifts mirror upshifts", () => {
  assertDeepEqual(pathBetweenGears(gate, 2, 1), ["up", "up"]);
  assertDeepEqual(pathBetweenGears(gate, 3, 2), ["down", "left", "down"]);
});

test("a long skip-shift crosses the whole rail", () => {
  assertDeepEqual(pathBetweenGears(gate, 1, 6), ["down", "right", "right", "down"]);
});

// ---------------------------------------------------------------------------
// Shift attempts
// ---------------------------------------------------------------------------

test("a shift attempt starts parked in the origin gear with no errors", () => {
  const attempt = beginShift(gate, 1, 2);
  assertEqual(attempt.node, gearNodeId(1));
  assertEqual(attempt.fromGear, 1);
  assertEqual(attempt.toGear, 2);
  assertEqual(attempt.gateErrors, 0);
  assertEqual(attempt.status, SHIFT_IN_GATE);
});

test("beginShift rejects a gear the gate does not have", () => {
  assertThrows(() => beginShift(gate, 6, 7));
});

test("a clean 1 -> 2 completes on the second input", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "down");
  assertEqual(attempt.node, neutralNodeId(0));
  assertEqual(attempt.status, SHIFT_IN_GATE);
  attempt = applyShiftInput(gate, attempt, "down");
  assertEqual(attempt.status, SHIFT_COMPLETED);
  assertEqual(attempt.gateErrors, 0);
  assertEqual(attempt.landedGear, 2);
});

test("a clean 2 -> 3 completes on the third input", () => {
  let attempt = beginShift(gate, 2, 3);
  for (const direction of ["up", "right", "up"]) {
    attempt = applyShiftInput(gate, attempt, direction);
  }
  assertEqual(attempt.status, SHIFT_COMPLETED);
  assertEqual(attempt.gateErrors, 0);
});

test("driving the knob into a gate wall records an error and does not move it", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "up");
  assertEqual(attempt.node, gearNodeId(1), "knob should stay put against a wall");
  assertEqual(attempt.gateErrors, 1);
  assertEqual(attempt.status, SHIFT_IN_GATE);
});

test("wall bumps accumulate but never fail the shift outright", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "left");
  attempt = applyShiftInput(gate, attempt, "right");
  attempt = applyShiftInput(gate, attempt, "up");
  assertEqual(attempt.gateErrors, 3);
  assertEqual(attempt.status, SHIFT_IN_GATE);
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "down");
  assertEqual(attempt.status, SHIFT_COMPLETED, "a fumbled but correct shift still completes");
  assertEqual(attempt.gateErrors, 3, "errors are carried out for grading to downgrade");
});

test("landing in the wrong gear is a misshift", () => {
  // 2 -> 3 fumbled: up to neutral, right past the target column, then up into 5.
  let attempt = beginShift(gate, 2, 3);
  attempt = applyShiftInput(gate, attempt, "up");
  attempt = applyShiftInput(gate, attempt, "right");
  attempt = applyShiftInput(gate, attempt, "right");
  attempt = applyShiftInput(gate, attempt, "up");
  assertEqual(attempt.status, SHIFT_MISSED);
  assertEqual(attempt.landedGear, 5);
});

test("falling back into the origin gear resets the attempt rather than failing it", () => {
  // Mechanically harmless: you are simply back where you started, so this costs
  // a gate error and time, not the whole shift.
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "up");
  assertEqual(attempt.status, SHIFT_IN_GATE);
  assertEqual(attempt.node, gearNodeId(1));
  assertEqual(attempt.gateErrors, 1);
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "down");
  assertEqual(attempt.status, SHIFT_COMPLETED);
});

test("a resolved attempt ignores further input", () => {
  let attempt = beginShift(gate, 1, 2);
  attempt = applyShiftInput(gate, attempt, "down");
  attempt = applyShiftInput(gate, attempt, "down");
  const settled = applyShiftInput(gate, attempt, "up");
  assertEqual(settled.status, SHIFT_COMPLETED);
  assertEqual(settled.gateErrors, 0);
  assertEqual(settled.node, gearNodeId(2));
});

test("applyShiftInput never mutates the attempt it is given", () => {
  const attempt = beginShift(gate, 1, 2);
  const next = applyShiftInput(gate, attempt, "down");
  assertEqual(attempt.node, gearNodeId(1), "original attempt must be untouched");
  assert(next !== attempt, "a new attempt object should be returned");
});

test("an unrecognised direction is ignored rather than counted as an error", () => {
  const attempt = beginShift(gate, 1, 2);
  const next = applyShiftInput(gate, attempt, "diagonal");
  assertEqual(next.gateErrors, 0);
  assertEqual(next.node, gearNodeId(1));
});

// ---------------------------------------------------------------------------
// Gate-as-data: alternate transmissions must need no new code
// ---------------------------------------------------------------------------

test("a 4-speed gate is just a smaller definition", () => {
  const short = createGate({ id: "h4", label: "4-Speed", gears: { 1: 0, 2: 0, 3: 1, 4: 1 } });
  assertEqual(short.columns, 2);
  assertDeepEqual(pathBetweenGears(short, 1, 2), ["down", "down"]);
  assertDeepEqual(pathBetweenGears(short, 2, 3), ["up", "right", "up"]);
  assertEqual(neighbor(short, neutralNodeId(1), "right"), null, "rail ends after the last column");
});

finish();
