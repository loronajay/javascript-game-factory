import test from "node:test";
import assert from "node:assert/strict";

import {
  clumsySplashTargets,
  healingPresentationTargets,
  orderedHitTargets,
  shouldUseRangedAttackAnimation,
  wallOreGainFloat
} from "../src/ui/combatPresentation.js";

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

test("Miner basic attack animation uses a melee lunge only at adjacent range", () => {
  const miner = { id: "miner", type: "miner", position: { x: 2, y: 2 } };
  const adjacent = { id: "adjacent", type: "swordsman", position: { x: 3, y: 2 } };
  const distant = { id: "distant", type: "swordsman", position: { x: 4, y: 2 } };

  assert.equal(shouldUseRangedAttackAnimation(miner, adjacent), false);
  assert.equal(shouldUseRangedAttackAnimation(miner, distant), true);
});

test("Ranged presentation keeps existing projectile behavior outside Miner basic attacks", () => {
  const archer = { id: "archer", type: "archer", position: { x: 2, y: 2 } };
  const clod = { id: "clod", type: "clod", position: { x: 2, y: 2 } };
  const adjacent = { id: "adjacent", type: "swordsman", position: { x: 3, y: 2 } };

  assert.equal(shouldUseRangedAttackAnimation(archer, adjacent), true);
  assert.equal(shouldUseRangedAttackAnimation(clod, adjacent, { artRange: 4 }), true);
});

test("wall presentation floats Miner ore gained from adjacent wall breaks", () => {
  assert.deepEqual(
    wallOreGainFloat({ type: "WALL_ATTACKED", oreGained: 2 }),
    { text: "+2 ORE", color: "#d8b35e" }
  );
  assert.equal(wallOreGainFloat({ type: "WALL_ATTACKED", destroyed: true }), null);
  assert.equal(wallOreGainFloat({ type: "WALL_ATTACKED", oreGained: 0 }), null);
});
