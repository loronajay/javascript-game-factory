import test from "node:test";
import assert from "node:assert/strict";

import { bumpPowerForSpeed, movementProfile } from "../scripts/balance.js";

test("pet speed stays a modest influence while forward momentum supplies the larger payoff", () => {
  const slow = movementProfile({ speed: 0, strength: 50, size: 1 });
  const fast = movementProfile({ speed: 100, strength: 50, size: 1 });

  assert.equal(slow.maxSpeed, 180);
  assert.equal(fast.maxSpeed, 220);
  assert.equal(slow.acceleration, fast.acceleration);
  assert.ok(slow.acceleration >= 280, "pets should get up to fighting speed quickly");
  assert.ok(slow.momentumBuildSeconds > 1);
});

test("bump power rises primarily with current movement speed and modestly with strength", () => {
  const standing = bumpPowerForSpeed(0, { strength: 50 });
  const running = bumpPowerForSpeed(180, { strength: 50 });
  const strong = bumpPowerForSpeed(180, { strength: 100 });

  assert.ok(standing >= 160, "even a point-blank bump should have authority");
  assert.ok(running > standing * 2);
  assert.ok(strong > running);
  assert.ok(strong < running * 1.2);
});
