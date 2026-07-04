import test from "node:test";
import assert from "node:assert/strict";

import { orderedHitTargets } from "../src/ui/combatPresentation.js";

test("line attack hit presentation follows the reducer's closest-first target order", () => {
  const units = new Map([
    ["near", { id: "near" }],
    ["mark", { id: "mark" }],
    ["far", { id: "far" }]
  ]);
  const rolled = { targetId: "mark", targetIds: ["near", "mark", "far"] };

  assert.deepEqual(
    orderedHitTargets(rolled, (id) => units.get(id)).map((unit) => unit.id),
    ["near", "mark", "far"]
  );
});

test("single-target hit presentation falls back to the primary target", () => {
  const rolled = { targetId: "mark" };

  assert.deepEqual(
    orderedHitTargets(rolled, (id) => ({ id })).map((unit) => unit.id),
    ["mark"]
  );
});
