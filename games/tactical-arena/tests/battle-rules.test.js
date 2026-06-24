import test from "node:test";
import assert from "node:assert/strict";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { resolveDamage } from "../src/rules/damage.js";
import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import {
  attack,
  beginActivation,
  defend,
  moveUnit,
  useArt
} from "../src/core/commands.js";

test("swordsman owns the specified core stat line and four ART slots", () => {
  assert.deepEqual(UNIT_TYPES.swordsman.stats, {
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 5,
    maxHp: 26,
    maxMp: 15
  });
  assert.equal(UNIT_TYPES.swordsman.arts.length, 4);
  assert.equal(UNIT_TYPES.swordsman.arts[0].id, "footwork");
});

test("physical damage uses strength minus defense, with defend halving the result", () => {
  const attacker = { strength: 10 };
  const defender = { defense: 5, defending: true };

  assert.deepEqual(resolveDamage({ attacker, defender, type: "physical" }), {
    type: "physical",
    baseDamage: 5,
    damage: 3,
    defended: true
  });
});

test("magic ignores defense but defend still halves it, while true damage bypasses both", () => {
  const attacker = { strength: 10 };
  const defender = { defense: 999, defending: true };

  assert.equal(resolveDamage({ attacker, defender, type: "magic", amount: 7 }).damage, 4);
  assert.equal(resolveDamage({ attacker, defender, type: "true", amount: 7 }).damage, 7);
});

test("physical damage never falls below one before defend is applied", () => {
  assert.equal(resolveDamage({
    attacker: { strength: 2 },
    defender: { defense: 9, defending: false },
    type: "physical"
  }).damage, 1);
});

test("defend is a primary action and clears when that unit begins its next activation", () => {
  const initial = createBattleState();
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const defended = applyCommand(selected.nextState, defend(1, "p1-swordsman"));

  assert.equal(defended.nextState.units[0].defending, true);
  assert.equal(defended.nextState.activation.primaryUsed, true);

  const reset = applyCommand(
    { ...defended.nextState, activation: null, units: defended.nextState.units.map((unit) => ({
      ...unit,
      spent: false
    })) },
    beginActivation(1, "p1-swordsman")
  );
  assert.equal(reset.nextState.units[0].defending, false);
});

test("ARTS are unavailable after moving or attacking", () => {
  const initial = createBattleState();
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const moved = applyCommand(selected.nextState, moveUnit(1, "p1-swordsman", 1, 0));
  const artAfterMove = applyCommand(moved.nextState, useArt(1, "p1-swordsman", "footwork", []));

  assert.equal(artAfterMove.accepted, false);
  assert.equal(artAfterMove.errorCode, "ART_NOT_AVAILABLE");

  const attackState = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const attackSelected = applyCommand(attackState, beginActivation(1, "p1-swordsman"));
  const attacked = applyCommand(attackSelected.nextState, attack(1, "p1-swordsman", "p2-swordsman"));
  const artAfterAttack = applyCommand(attacked.nextState, useArt(1, "p1-swordsman", "footwork", []));

  assert.equal(artAfterAttack.accepted, false);
  assert.equal(artAfterAttack.errorCode, "ART_NOT_AVAILABLE");
});

test("Footwork requires six sequential unique steps, crosses enemies for true damage, and ends on empty ground", () => {
  const initial = createBattleState({
    size: 8,
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "enemy-a", player: 2, type: "swordsman", x: 1, y: 0 },
      { id: "enemy-b", player: 2, type: "swordsman", x: 3, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-swordsman", "footwork", [
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 3, y: 0 },
    { x: 4, y: 0 },
    { x: 5, y: 0 },
    { x: 6, y: 0 }
  ]));

  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.units.find((unit) => unit.id === "p1-swordsman").position, { x: 6, y: 0 });
  assert.equal(result.nextState.units.find((unit) => unit.id === "enemy-a").hp, 24);
  assert.equal(result.nextState.units.find((unit) => unit.id === "enemy-b").hp, 24);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-swordsman").mp, 11);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-swordsman").spent, true);
});

test("Footwork rejects repeated tiles and a final occupied tile", () => {
  const initial = createBattleState({ size: 8 });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const repeated = applyCommand(selected.nextState, useArt(1, "p1-swordsman", "footwork", [
    { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 0 },
    { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }
  ]));
  assert.equal(repeated.accepted, false);
  assert.equal(repeated.errorCode, "INVALID_ART_PATH");
});
