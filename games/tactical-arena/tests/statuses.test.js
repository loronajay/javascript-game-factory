import test from "node:test";
import assert from "node:assert/strict";

import { applyStatus, isStunned, statusImmunities, tickStatuses } from "../src/rules/statuses.js";

test("Emblem blocks poison while other units receive permanent poison", () => {
  assert.equal(applyStatus({ type: "archer", statuses: [] }, { type: "poison", duration: "permanent" }).applied, false);
  const result = applyStatus({ type: "swordsman", statuses: [] }, { type: "poison", duration: "permanent" });
  assert.equal(result.applied, true);
  assert.deepEqual(result.statuses, [{ type: "poison", duration: "permanent" }]);
});

test("timed statuses decrement at the end of their owner's turn while permanent poison remains", () => {
  assert.deepEqual(tickStatuses([
    { type: "blind", duration: 1 },
    { type: "stun", duration: 2 },
    { type: "slow", duration: 2 },
    { type: "poison", duration: "permanent" }
  ]), [
    { type: "stun", duration: 1 },
    { type: "slow", duration: 1 },
    { type: "poison", duration: "permanent" }
  ]);
});

test("isStunned only treats active stun statuses as unactionable", () => {
  assert.equal(isStunned({ statuses: [{ type: "stun", duration: 1 }] }), true);
  assert.equal(isStunned({ statuses: [{ type: "stun", duration: 0 }] }), false);
  assert.equal(isStunned({ statuses: [{ type: "stun", duration: "permanent" }] }), false);
  assert.equal(isStunned({ statuses: [{ type: "blind", duration: 1 }] }), false);
  assert.equal(isStunned({ statuses: [] }), false);
});

test("stun must be authored with a finite positive duration", () => {
  assert.equal(applyStatus({ type: "swordsman", statuses: [] }, { type: "stun", duration: 1 }).applied, true);
  const missing = applyStatus({ type: "swordsman", statuses: [] }, { type: "stun" });
  assert.equal(missing.applied, false);
  assert.equal(missing.reason, "INVALID_DURATION");
  const permanent = applyStatus({ type: "swordsman", statuses: [] }, { type: "stun", duration: "permanent" });
  assert.equal(permanent.applied, false);
  assert.equal(permanent.reason, "INVALID_DURATION");
});
