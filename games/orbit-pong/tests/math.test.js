import test from "node:test";
import assert from "node:assert/strict";

import {
  angleDifference,
  lerpAngle,
  rayCircleIntersection,
  wrapAngle,
} from "../src/core/math.js";

test("angle helpers take the short route across the zero seam", () => {
  const almostFullTurn = (Math.PI * 2) - 0.1;
  assert.ok(Math.abs(angleDifference(0.1, almostFullTurn) - 0.2) < 1e-9);
  assert.ok(Math.abs(lerpAngle(almostFullTurn, 0.1, 0.5)) < 1e-9);
  assert.ok(wrapAngle(-0.1) > Math.PI * 1.9);
});

test("ray-circle intersection predicts the outward rail contact", () => {
  const hit = rayCircleIntersection({ x: 10, y: 0 }, { x: 3, y: 4 }, 100);
  assert.ok(hit);
  assert.ok(hit.t > 0);
  assert.ok(Math.abs(Math.hypot(hit.x, hit.y) - 100) < 1e-8);
});

test("ray-circle intersection rejects a stationary ray", () => {
  assert.equal(rayCircleIntersection({ x: 0, y: 0 }, { x: 0, y: 0 }, 100), null);
});
