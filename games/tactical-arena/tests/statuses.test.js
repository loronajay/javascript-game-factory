import test from "node:test";
import assert from "node:assert/strict";

import { applyStatus, statusImmunities, tickStatuses } from "../src/rules/statuses.js";

test("Emblem blocks poison while other units receive permanent poison", () => {
  assert.equal(applyStatus({ type: "archer", statuses: [] }, { type: "poison", duration: "permanent" }).applied, false);
  const result = applyStatus({ type: "swordsman", statuses: [] }, { type: "poison", duration: "permanent" });
  assert.equal(result.applied, true);
  assert.deepEqual(result.statuses, [{ type: "poison", duration: "permanent" }]);
});

test("timed statuses decrement at the end of their owner's turn while permanent poison remains", () => {
  assert.deepEqual(tickStatuses([
    { type: "blind", duration: 1 },
    { type: "slow", duration: 2 },
    { type: "poison", duration: "permanent" }
  ]), [
    { type: "slow", duration: 1 },
    { type: "poison", duration: "permanent" }
  ]);
});
