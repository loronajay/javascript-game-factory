import test from "node:test";
import assert from "node:assert/strict";

import { getAvailableArts, getEffectiveStats, UNIT_TYPES } from "../src/core/unitCatalog.js";
import { getFootworkSteps } from "../src/rules/arts.js";
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
  assert.deepEqual(UNIT_TYPES.swordsman.arts.map((art) => art.id), [
    "footwork", "moonstrike", "mage-killer", "life-sap"
  ]);
  assert.equal(UNIT_TYPES.swordsman.rageArt.name, "Quick");
  const [footwork, moonstrike, mageKiller, lifeSap] = UNIT_TYPES.swordsman.arts;
  assert.equal(footwork.mpCost, 4);
  assert.equal(moonstrike.mpCost, 5);
  assert.deepEqual(moonstrike.effect, {
    type: "status", status: "blind", chance: 0.7, durationTurns: null
  });
  assert.deepEqual(mageKiller.effect, {
    type: "status", status: "silence", chance: 0.7, durationTurns: null
  });
  assert.deepEqual(lifeSap.effect, {
    type: "heal", chance: 0.7, amount: "damageDealt"
  });
});

test("RAGE ART becomes available automatically at five HP or below", () => {
  assert.equal(getAvailableArts({ type: "swordsman", hp: 6 }).some((art) => art.id === "swordsman-rage"), false);
  assert.equal(getAvailableArts({ type: "swordsman", hp: 5 }).some((art) => art.id === "swordsman-rage"), true);
});

test("Swordsman low-health passive and RAGE passive stack as derived stats", () => {
  assert.deepEqual(getEffectiveStats({ type: "swordsman", hp: 6 }), {
    moveRange: 3, attackRange: 1, strength: 10, defense: 5, maxHp: 26, maxMp: 15
  });
  assert.equal(getEffectiveStats({ type: "swordsman", hp: 3 }).strength, 11);
  assert.deepEqual(getEffectiveStats({ type: "swordsman", hp: 5 }), {
    moveRange: 6, attackRange: 1, strength: 11, defense: 5, maxHp: 26, maxMp: 15
  });
  assert.equal(getEffectiveStats({ type: "swordsman", hp: 2 }).strength, 14);
});

test("Footwork uses all current movement plus three, including RAGE and future movement buffs", () => {
  assert.equal(getFootworkSteps({ type: "swordsman", hp: 26 }), 6);
  assert.equal(getFootworkSteps({ type: "swordsman", hp: 5 }), 9);
  assert.equal(getFootworkSteps({ type: "swordsman", hp: 26, statModifiers: { moveRange: 2 } }), 8);
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

test("RAGE extends Footwork to nine tiles in the authoritative reducer", () => {
  const initial = createBattleState({
    size: 10,
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", hp: 5, x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-swordsman", "footwork", [
    { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 },
    { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 6, y: 0 },
    { x: 7, y: 0 }, { x: 8, y: 0 }, { x: 9, y: 0 }
  ]));

  assert.equal(result.accepted, true);
  assert.deepEqual(result.nextState.units.find((unit) => unit.id === "p1-swordsman").position, { x: 9, y: 0 });
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
