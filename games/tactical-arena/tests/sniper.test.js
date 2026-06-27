import test from "node:test";
import assert from "node:assert/strict";

import { attackerPierces, isShotBlocked, resolvePhysicalStrike } from "../src/rules/combat.js";
import { getEffectiveStats } from "../src/core/unitCatalog.js";
import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, useArt } from "../src/core/commands.js";

// Pin a clean normal hit so reducer damage is deterministic.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

test("Rifle Powered adds +1 to the Sniper's physical strike", () => {
  const sniper = { type: "sniper", hp: 23, position: { x: 0, y: 0 } };
  const archer = { type: "archer", hp: 24, position: { x: 0, y: 0 } };
  const target = { type: "swordsman", hp: 25, defending: false, position: { x: 3, y: 0 } };

  // Both have STR 8; the Sniper's hit is one higher thanks to Rifle Powered.
  assert.equal(resolvePhysicalStrike(archer, target).damage, 3); // 8 STR - 5 DEF
  assert.equal(resolvePhysicalStrike(sniper, target).damage, 4); // +1 Rifle Powered
});

test("Rifle Powered guarantees at least 2 damage against heavy defense", () => {
  const sniper = { type: "sniper", hp: 23, position: { x: 0, y: 0 } };
  // Pile DEF onto the target so STR - DEF would chip for the physical floor of 1.
  const tank = {
    type: "swordsman", hp: 25, defending: false, position: { x: 3, y: 0 },
    statModifiers: { defense: 10 }
  };
  assert.equal(resolvePhysicalStrike(sniper, tank).damage, 2);
});

test("Sniper RAGE grants +1 STR, +1 range, and +2 MOVE at <=5 HP", () => {
  const calm = getEffectiveStats({ type: "sniper", hp: 23, statModifiers: {}, statuses: [] });
  assert.equal(calm.strength, 8);
  assert.equal(calm.attackRange, 6);
  assert.equal(calm.moveRange, 2);

  const raging = getEffectiveStats({ type: "sniper", hp: 5, statModifiers: {}, statuses: [] });
  assert.equal(raging.strength, 9);
  assert.equal(raging.attackRange, 7);
  assert.equal(raging.moveRange, 4);
});

test("attackerPierces is true only for the Sniper", () => {
  assert.equal(attackerPierces({ type: "sniper" }), true);
  assert.equal(attackerPierces({ type: "archer" }), false);
});

function sniperVsFoe(foeX = 3, foeY = 0) {
  return createBattleState({
    units: [
      { id: "sniper", player: 1, type: "sniper", x: 0, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: foeX, y: foeY }
    ]
  });
}

test("Smoke Bomb blinds an enemy in range for no damage and costs 3 MP", () => {
  const begun = applyCommand(sniperVsFoe(), beginActivation(1, "sniper"));
  const result = applyCommand(begun.nextState, useArt(1, "sniper", "smoke-bomb", { targetId: "foe", effectRoll: 0.1 }));
  assert.equal(result.accepted, true);
  const foe = result.nextState.units.find((u) => u.id === "foe");
  assert.equal(foe.statuses.some((s) => s.type === "blind"), true);
  assert.equal(foe.hp, 25); // pure utility — no damage
  assert.equal(result.nextState.units.find((u) => u.id === "sniper").mp, 15); // 18 - 3
});

test("Smoke Bomb's 70% check can fail (no blind on a high roll), still spending MP", () => {
  const begun = applyCommand(sniperVsFoe(), beginActivation(1, "sniper"));
  const result = applyCommand(begun.nextState, useArt(1, "sniper", "smoke-bomb", { targetId: "foe", effectRoll: 0.9 }));
  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.units.find((u) => u.id === "foe").statuses, []);
  assert.equal(result.nextState.units.find((u) => u.id === "sniper").mp, 15);
});

test("Build Cover places a 1-HP wall on an empty tile within range", () => {
  const begun = applyCommand(sniperVsFoe(9, 9), beginActivation(1, "sniper"));
  const result = applyCommand(begun.nextState, useArt(1, "sniper", "build-cover", { targetPosition: { x: 2, y: 0 } }));
  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.tileObjects["2,0"], { kind: "wall", hp: 1 });
  assert.equal(result.nextState.units.find((u) => u.id === "sniper").mp, 15);
});

test("Build Cover rejects an out-of-range tile and an occupied tile", () => {
  const farState = applyCommand(sniperVsFoe(2, 0), beginActivation(1, "sniper")).nextState;
  const tooFar = applyCommand(farState, useArt(1, "sniper", "build-cover", { targetPosition: { x: 5, y: 0 } }));
  assert.equal(tooFar.accepted, false); // distance 5 > radius 3
  assert.equal(tooFar.errorCode, "INVALID_TARGET");

  const onFoe = applyCommand(farState, useArt(1, "sniper", "build-cover", { targetPosition: { x: 2, y: 0 } }));
  assert.equal(onFoe.accepted, false); // foe is standing there
  assert.equal(onFoe.errorCode, "INVALID_TARGET");
});

test("Throw Cigar sets a tile alight — even one an enemy stands on", () => {
  // A second P1 unit keeps the turn open, so we observe the placement before the
  // rollover tick would burn/decrement it.
  const state = createBattleState({
    units: [
      { id: "sniper", player: 1, type: "sniper", x: 0, y: 0 },
      { id: "ally", player: 1, type: "swordsman", x: 0, y: 1 },
      { id: "foe", player: 2, type: "swordsman", x: 3, y: 0 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "sniper"));
  const result = applyCommand(begun.nextState, useArt(1, "sniper", "throw-cigar", { targetPosition: { x: 3, y: 0 } }));
  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.tileObjects["3,0"], { kind: "fire", turnsLeft: 3 });
  assert.equal(result.nextState.units.find((u) => u.id === "sniper").mp, 15);
});

test("a Sniper shot pierces an intervening body and the reducer applies the +1", () => {
  const state = createBattleState({
    units: [
      { id: "sniper", player: 1, type: "sniper", x: 0, y: 0 },
      { id: "blocker", player: 2, type: "swordsman", x: 1, y: 0 },
      { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  // Predicate: the body between is ignored for a piercing attacker.
  const sniper = state.units.find((u) => u.id === "sniper");
  assert.equal(isShotBlocked(state, { x: 0, y: 0 }, { x: 2, y: 0 }), true); // no attacker → blocked
  assert.equal(isShotBlocked(state, { x: 0, y: 0 }, { x: 2, y: 0 }, sniper), false); // pierces

  // End to end: the shot lands through the blocker for 4 (3 base + 1 Rifle Powered).
  const begun = applyCommand(state, beginActivation(1, "sniper"));
  const result = applyCommand(begun.nextState, attack(1, "sniper", "mark", NORMAL_HIT));
  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((u) => u.id === "mark").hp, 21); // 25 - 4
});
