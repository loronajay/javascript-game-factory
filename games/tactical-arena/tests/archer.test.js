import test from "node:test";
import assert from "node:assert/strict";

import { beginActivation, moveUnit, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { canMoveAndUseArts, getEffectiveStats } from "../src/core/unitCatalog.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

function archerVsFoe(hp = 24) {
  return createBattleState({
    size: 9,
    units: [
      { id: "archer", player: 1, type: "archer", hp, x: 0, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 4, y: 0 }
    ]
  });
}

test("Archer RAGE grants +1 STR, +1 range, and move-and-ART at <=5 HP", () => {
  const calmUnit = { type: "archer", hp: 24, statModifiers: {}, statuses: [] };
  const calm = getEffectiveStats(calmUnit);
  assert.equal(calm.strength, 8);
  assert.equal(calm.attackRange, 5);
  assert.equal(canMoveAndUseArts(calmUnit), false);

  const ragingUnit = { type: "archer", hp: 5, statModifiers: {}, statuses: [] };
  const raging = getEffectiveStats(ragingUnit);
  assert.equal(raging.strength, 9);
  assert.equal(raging.attackRange, 6);
  assert.equal(canMoveAndUseArts(ragingUnit), true);
});

test("a raging Archer can move before using an ART", () => {
  const healthy = applyCommand(archerVsFoe(), beginActivation(1, "archer")).nextState;
  const healthyMoved = applyCommand(healthy, moveUnit(1, "archer", 1, 0));
  assert.ok(healthyMoved.accepted, healthyMoved.errorCode);
  assert.equal(applyCommand(healthyMoved.nextState, useArt(1, "archer", "poison-arrow", {
    targetId: "foe",
    ...NORMAL_HIT,
    effectRoll: 0.1
  })).accepted, false);

  const raging = applyCommand(archerVsFoe(5), beginActivation(1, "archer")).nextState;
  const rageMoved = applyCommand(raging, moveUnit(1, "archer", 1, 0));
  assert.ok(rageMoved.accepted, rageMoved.errorCode);

  const cast = applyCommand(rageMoved.nextState, useArt(1, "archer", "poison-arrow", {
    targetId: "foe",
    ...NORMAL_HIT,
    effectRoll: 0.1
  }));
  assert.ok(cast.accepted, cast.errorCode);
  assert.equal(cast.nextState.activation.moved, true);
  assert.equal(cast.nextState.activation.primaryUsed, true);
  assert.equal(findUnit(cast.nextState, "archer").spent, false);
  assert.equal(findUnit(cast.nextState, "foe").statuses.some((status) => status.type === "poison"), true);
});
