import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import { GATE_6_SPEED, createGate, gearNodeId, neutralNodeId } from "../scripts/sim/gate.js";
import { gateLayout, gateSlots, createKnob, stepKnob, knobTargetFor } from "../scripts/ui/shifter-gate.js";

suite("shifter-gate — plate geometry and knob motion");

const gate = createGate(GATE_6_SPEED);
const box = { x: 0, y: 0, width: 300, height: 200, padding: 30 };
const layout = gateLayout(gate, box);

// ---------------------------------------------------------------------------
// Plate layout
// ---------------------------------------------------------------------------

test("every gate node gets a position", () => {
  assertEqual(Object.keys(layout.nodes).length, 9, "six gears plus three neutral nodes");
  for (const id of Object.keys(gate.nodes)) {
    assert(layout.nodes[id], `${id} has no position`);
  }
});

test("columns run left to right in gear order", () => {
  const first = layout.nodes[gearNodeId(1)].x;
  const second = layout.nodes[gearNodeId(3)].x;
  const third = layout.nodes[gearNodeId(5)].x;
  assert(first < second && second < third, "1/2 gate must sit left of the 5/6 gate");
});

test("a gear pair shares its column's x with the neutral node", () => {
  assertClose(layout.nodes[gearNodeId(1)].x, layout.nodes[gearNodeId(2)].x, 0.001);
  assertClose(layout.nodes[gearNodeId(1)].x, layout.nodes[neutralNodeId(0)].x, 0.001);
});

test("odd gears sit above the rail and even gears below it", () => {
  const rail = layout.nodes[neutralNodeId(0)].y;
  assert(layout.nodes[gearNodeId(1)].y < rail, "first gear is forward of neutral");
  assert(layout.nodes[gearNodeId(2)].y > rail, "second gear is back from neutral");
});

test("the plate is centred and stays inside its box", () => {
  for (const node of Object.values(layout.nodes)) {
    assert(node.x >= box.x && node.x <= box.x + box.width, `x ${node.x} escaped the box`);
    assert(node.y >= box.y && node.y <= box.y + box.height, `y ${node.y} escaped the box`);
  }
  const rail = layout.nodes[neutralNodeId(0)].y;
  assertClose(rail, box.y + box.height / 2, 0.001, "the neutral rail should be vertically centred");
});

test("layout honours an offset box rather than assuming the origin", () => {
  const shifted = gateLayout(gate, { ...box, x: 100, y: 50 });
  assertClose(shifted.nodes[gearNodeId(1)].x - layout.nodes[gearNodeId(1)].x, 100, 0.001);
  assertClose(shifted.nodes[gearNodeId(1)].y - layout.nodes[gearNodeId(1)].y, 50, 0.001);
});

test("a narrower box produces a narrower plate, not an overflowing one", () => {
  const narrow = gateLayout(gate, { ...box, width: 150 });
  const wideSpan = layout.nodes[gearNodeId(5)].x - layout.nodes[gearNodeId(1)].x;
  const narrowSpan = narrow.nodes[gearNodeId(5)].x - narrow.nodes[gearNodeId(1)].x;
  assert(narrowSpan < wideSpan);
  assert(narrow.nodes[gearNodeId(5)].x <= box.x + 150);
});

// ---------------------------------------------------------------------------
// Slots — the milled channels the knob actually travels in
// ---------------------------------------------------------------------------

test("the plate has one vertical slot per column plus the neutral rail", () => {
  const slots = gateSlots(gate, layout);
  assertEqual(slots.length, 4, "three gate slots and one rail");
  assertEqual(slots.filter((slot) => slot.kind === "gate").length, 3);
  assertEqual(slots.filter((slot) => slot.kind === "rail").length, 1);
});

test("each gate slot spans its column from the top gear to the bottom gear", () => {
  const slots = gateSlots(gate, layout);
  const first = slots.find((slot) => slot.kind === "gate" && slot.col === 0);
  assertClose(first.x1, first.x2, 0.001, "a gate slot is vertical");
  assertClose(first.y1, layout.nodes[gearNodeId(1)].y, 0.001);
  assertClose(first.y2, layout.nodes[gearNodeId(2)].y, 0.001);
});

test("the rail runs along the neutral row across every column", () => {
  const rail = gateSlots(gate, layout).find((slot) => slot.kind === "rail");
  assertClose(rail.y1, rail.y2, 0.001, "the rail is horizontal");
  assertClose(rail.x1, layout.nodes[neutralNodeId(0)].x, 0.001);
  assertClose(rail.x2, layout.nodes[neutralNodeId(2)].x, 0.001);
});

// ---------------------------------------------------------------------------
// Knob motion — discrete input, continuous-looking travel
// ---------------------------------------------------------------------------

const speed = 600; // px/s

test("a knob starts parked exactly on its node", () => {
  const knob = createKnob(layout, gearNodeId(1));
  assertClose(knob.x, layout.nodes[gearNodeId(1)].x, 0.001);
  assertClose(knob.y, layout.nodes[gearNodeId(1)].y, 0.001);
  assert(knob.arrived);
});

test("a knob slides toward its target instead of teleporting", () => {
  const start = layout.nodes[gearNodeId(1)];
  const target = layout.nodes[neutralNodeId(0)];
  const knob = stepKnob(createKnob(layout, gearNodeId(1)), target, speed, 1 / 60);
  assert(knob.y > start.y, "it should have moved toward neutral");
  assert(knob.y < target.y, "but not arrived in a single tick");
  assert(!knob.arrived);
});

test("a knob never overshoots its target", () => {
  const target = layout.nodes[neutralNodeId(0)];
  let knob = createKnob(layout, gearNodeId(1));
  for (let i = 0; i < 600; i += 1) {
    knob = stepKnob(knob, target, speed, 1 / 60);
  }
  assertClose(knob.x, target.x, 0.001);
  assertClose(knob.y, target.y, 0.001);
  assert(knob.arrived);
});

test("a huge timestep snaps to the target rather than flying past it", () => {
  const target = layout.nodes[neutralNodeId(0)];
  const knob = stepKnob(createKnob(layout, gearNodeId(1)), target, speed, 10);
  assertClose(knob.y, target.y, 0.001);
  assert(knob.arrived);
});

test("a knob already on target reports arrival and stops moving", () => {
  const target = layout.nodes[gearNodeId(1)];
  const knob = stepKnob(createKnob(layout, gearNodeId(1)), target, speed, 1 / 60);
  assertClose(knob.x, target.x, 0.001);
  assert(knob.arrived);
});

test("redirecting mid-travel works from wherever the knob actually is", () => {
  const neutral = layout.nodes[neutralNodeId(0)];
  let knob = stepKnob(createKnob(layout, gearNodeId(1)), neutral, speed, 1 / 60);
  const midY = knob.y;
  const back = layout.nodes[gearNodeId(1)];
  knob = stepKnob(knob, back, speed, 1 / 60);
  assert(knob.y < midY, "the knob should reverse from its current position");
});

test("stepKnob is pure", () => {
  const knob = createKnob(layout, gearNodeId(1));
  const next = stepKnob(knob, layout.nodes[neutralNodeId(0)], speed, 1 / 60);
  assertClose(knob.y, layout.nodes[gearNodeId(1)].y, 0.001, "input knob must be untouched");
  assert(next !== knob);
});

// ---------------------------------------------------------------------------
// Binding the knob to the sim
// ---------------------------------------------------------------------------

test("with the gate closed the knob rests in the current gear", () => {
  const target = knobTargetFor(layout, { shift: null, vehicle: { gear: 3 } });
  assertClose(target.x, layout.nodes[gearNodeId(3)].x, 0.001);
  assertClose(target.y, layout.nodes[gearNodeId(3)].y, 0.001);
});

test("with the gate open the knob follows the attempt's node", () => {
  const target = knobTargetFor(layout, {
    shift: { node: neutralNodeId(1) },
    vehicle: { gear: 3 },
  });
  assertClose(target.x, layout.nodes[neutralNodeId(1)].x, 0.001);
});

finish();
