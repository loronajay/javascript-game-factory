import test from "node:test";
import assert from "node:assert/strict";

import { clumsySplashTargets, healingPresentationTargets, orderedHitTargets } from "../src/ui/combatPresentation.js";

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

test("Surge presentation separates the rolled heal target from Clumsy splash healing", () => {
  const units = new Map([
    ["target", { id: "target" }],
    ["near-ally", { id: "near-ally" }],
    ["near-foe", { id: "near-foe" }]
  ]);
  const resolved = {
    artId: "surge",
    targetId: "target",
    healTargetIds: ["target"],
    healingByTarget: { target: 4 },
    splashTargetIds: ["near-ally", "near-foe"],
    splashHealingByTarget: { "near-ally": 2, "near-foe": 2 }
  };

  assert.deepEqual(
    healingPresentationTargets(resolved, (id) => units.get(id)).map((unit) => unit.id),
    ["target"]
  );
  assert.deepEqual(
    clumsySplashTargets(resolved, (id) => units.get(id), "healing").map((unit) => unit.id),
    ["near-ally", "near-foe"]
  );
});

test("Clumsy splash presentation can read keyed splash payloads without targetIds", () => {
  const resolved = { splashDamageByTarget: { left: 2, right: 2 } };

  assert.deepEqual(
    clumsySplashTargets(resolved, (id) => ({ id })).map((unit) => unit.id),
    ["left", "right"]
  );
});
