import test from "node:test";
import assert from "node:assert/strict";

import { yawForFacing } from "../scripts/presentation.js";

test("pet yaw follows the farm model's forward-axis convention", () => {
  assert.ok(Math.abs(yawForFacing(0, -1)) < 1e-9);
  assert.ok(Math.abs(yawForFacing(1, 0) + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(yawForFacing(-1, 0) - Math.PI / 2) < 1e-9);
});
