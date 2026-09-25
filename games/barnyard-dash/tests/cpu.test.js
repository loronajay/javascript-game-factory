import test from "node:test";
import assert from "node:assert/strict";

import { cpuControls } from "../scripts/cpu.js";

test("an off-road CPU steers back toward the course even when its checkpoint would pull it farther out", () => {
  const track = {
    start: { x: 0, y: 0, angle: 0 },
    roadWidth: 20,
    road: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    checkpoints: [{ x: 100, y: 100, radius: 5 }],
    obstacles: [],
  };
  const controls = cpuControls({
    id: "cpu-test",
    x: 50,
    y: 30,
    angle: 0,
    speed: 80,
    checkpoint: 0,
    lastImpact: null,
    profile: { radius: 12, gatePower: 0.65 },
  }, track);

  assert.equal(controls.left, true);
  assert.equal(controls.right, false);
});

test("a CPU that hits an unbreakable gate chooses a deterministic route around an end", () => {
  const track = {
    start: { x: 0, y: 0, angle: 0 },
    roadWidth: 40,
    road: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    checkpoints: [{ x: 100, y: 0, radius: 5 }],
    obstacles: [{ id: "gate", kind: "gate", x: 35, y: 0, length: 28, thickness: 4, angle: Math.PI / 2 }],
  };
  const controls = cpuControls({
    id: "cpu-test",
    x: 25,
    y: 0,
    angle: 0,
    speed: 50,
    checkpoint: 0,
    lastImpact: "gate",
    profile: { radius: 5, gatePower: 0.65 },
  }, track);

  assert.notEqual(controls.left, controls.right);
  assert.equal(controls.throttle, true);
});
