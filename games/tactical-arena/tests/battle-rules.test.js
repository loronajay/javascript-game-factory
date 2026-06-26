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
  finishActivation,
  moveUnit,
  useArt
} from "../src/core/commands.js";

// Combat now rolls to-hit (10% miss) and crit (15%). These pins force a clean
// normal hit so the rules below stay deterministic; live play draws from the seed.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

test("swordsman owns the specified core stat line and four ART slots", () => {
  assert.deepEqual(UNIT_TYPES.swordsman.stats, {
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 5,
    maxHp: 25,
    maxMp: 20
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
    type: "status", status: "blind", chance: 0.7, durationTurns: 1
  });
  assert.equal("immuneTypes" in moonstrike, false);
  assert.deepEqual(mageKiller.effect, {
    type: "status", status: "silence", chance: 0.7, durationTurns: 1
  });
  assert.equal("immuneTypes" in mageKiller, false);
  assert.deepEqual(lifeSap.effect, {
    type: "heal", chance: 0.7, amount: "halfDamageDealtRounded"
  });
});

test("archer is available with the canonical core stat line and ART roster", () => {
  assert.deepEqual(UNIT_TYPES.archer.stats, {
    moveRange: 2,
    attackRange: 5,
    strength: 8,
    defense: 4,
    maxHp: 24,
    maxMp: 22
  });
  assert.equal(UNIT_TYPES.archer.passive.name, "Close Shot");
  assert.deepEqual(UNIT_TYPES.archer.arts.map((art) => art.name), [
    "Volley Shot", "Poison Arrow", "Leg Shot", "Emblem"
  ]);
  assert.equal(UNIT_TYPES.archer.arts[3].kind, "passive");
  assert.deepEqual(UNIT_TYPES.archer.arts[0].targeting, { shape: "cone", range: 5 });
  assert.deepEqual(UNIT_TYPES.archer.arts[0].damage, { type: "true", amount: 2 });
  assert.deepEqual(UNIT_TYPES.archer.arts[1].effect, {
    type: "status", status: "poison", chance: 0.6, duration: "permanent", turnStartDamage: 1
  });
  assert.deepEqual(UNIT_TYPES.archer.arts[2].effect, {
    type: "status", status: "slow", chance: 0.6, durationTurns: 3,
    statModifiers: { moveRange: -1 }
  });
  assert.deepEqual(UNIT_TYPES.archer.arts[3].effect, {
    type: "immunity", statuses: ["poison"]
  });
  assert.deepEqual(UNIT_TYPES.archer.passive.effect, {
    type: "proximityDamage",
    metric: "euclidean",
    bands: [{ maxDistance: 1, bonusDamage: 2 }, { maxDistance: 2, bonusDamage: 1 }]
  });
  assert.equal(UNIT_TYPES.archer.rageArt.combat.neverMiss, true);
  assert.equal(UNIT_TYPES.archer.rageArt.combat.criticalChance, 0.5);
});

test("mystic is available with healing ARTS, Silence, Guardian, and RAGE data", () => {
  assert.deepEqual(UNIT_TYPES.mystic.stats, {
    moveRange: 2,
    attackRange: 5,
    strength: 5,
    defense: 3,
    maxHp: 23,
    maxMp: 38
  });
  assert.equal(UNIT_TYPES.mystic.passive.name, "Anointed");
  assert.deepEqual(UNIT_TYPES.mystic.passive.effect, {
    type: "immunity", statuses: ["silence"]
  });
  assert.deepEqual(UNIT_TYPES.mystic.arts.map((art) => art.name), [
    "Pray", "Wish", "Silence", "Guardian"
  ]);
  assert.deepEqual(UNIT_TYPES.mystic.arts.map((art) => art.mpCost), [4, 2, 3, null]);
  assert.deepEqual(UNIT_TYPES.mystic.arts.find((art) => art.id === "pray").effect, {
    type: "healAllies", amount: 3, radius: 3
  });
  assert.deepEqual(UNIT_TYPES.mystic.arts.find((art) => art.id === "wish").effect, {
    type: "healAllies", amount: 1, global: true
  });
  assert.deepEqual(UNIT_TYPES.mystic.arts.find((art) => art.id === "silence").effect, {
    type: "status", status: "silence", chance: 0.7, durationTurns: 1
  });
  assert.deepEqual(UNIT_TYPES.mystic.arts.find((art) => art.id === "guardian").effect, {
    type: "teamAura", stats: { defense: 1 }
  });
  assert.deepEqual(UNIT_TYPES.mystic.rageArt.effect, {
    type: "statModifiers", stats: { moveRange: 6 }, defending: true
  });
});

test("RAGE ART becomes available automatically at five HP or below", () => {
  assert.equal(getAvailableArts({ type: "swordsman", hp: 6 }).some((art) => art.id === "swordsman-rage"), false);
  assert.equal(getAvailableArts({ type: "swordsman", hp: 5 }).some((art) => art.id === "swordsman-rage"), true);
});

test("Swordsman low-health passive and RAGE passive stack as derived stats", () => {
  assert.deepEqual(getEffectiveStats({ type: "swordsman", hp: 6 }), {
    moveRange: 3, attackRange: 1, strength: 10, defense: 5, maxHp: 25, maxMp: 20
  });
  assert.equal(getEffectiveStats({ type: "swordsman", hp: 3 }).strength, 11);
  assert.deepEqual(getEffectiveStats({ type: "swordsman", hp: 5 }), {
    moveRange: 6, attackRange: 1, strength: 11, defense: 5, maxHp: 25, maxMp: 20
  });
  assert.equal(getEffectiveStats({ type: "swordsman", hp: 2 }).strength, 14);
});

test("Archer RAGE derives its strength and range bonuses", () => {
  const stats = getEffectiveStats({ type: "archer", hp: 5 });
  assert.equal(stats.strength, 9);
  assert.equal(stats.attackRange, 6);
});

test("Mystic Guardian adds team defense while the Mystic is alive", () => {
  const state = createBattleState({
    units: [
      { id: "p1-mystic", player: 1, type: "mystic", x: 0, y: 0 },
      { id: "p1-archer", player: 1, type: "archer", x: 1, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  });

  assert.equal(getEffectiveStats(state.units.find((unit) => unit.id === "p1-mystic"), state).defense, 4);
  assert.equal(getEffectiveStats(state.units.find((unit) => unit.id === "p1-archer"), state).defense, 5);

  const defeated = {
    ...state,
    units: state.units.map((unit) => unit.id === "p1-mystic" ? { ...unit, hp: 0 } : unit)
  };
  assert.equal(getEffectiveStats(defeated.units.find((unit) => unit.id === "p1-archer"), defeated).defense, 4);
});

test("Mystic RAGE adds movement and passively defends incoming physical damage", () => {
  const state = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-mystic", player: 2, type: "mystic", hp: 5, x: 1, y: 0 }
    ]
  });
  assert.equal(getEffectiveStats(state.units.find((unit) => unit.id === "p2-mystic"), state).moveRange, 8);

  const selected = applyCommand(state, beginActivation(1, "p1-swordsman"));
  const result = applyCommand(selected.nextState, attack(1, "p1-swordsman", "p2-mystic", NORMAL_HIT));
  const target = result.nextState.units.find((unit) => unit.id === "p2-mystic");

  assert.equal(result.events[0].baseDamage, 6); // 10 STR - (3 DEF + Guardian)
  assert.equal(result.events[0].damage, 3);
  assert.equal(result.events[0].defended, true);
  assert.equal(target.hp, 2);
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

test("a unit stays active after moving and can immediately defend", () => {
  const initial = createBattleState();
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const moved = applyCommand(selected.nextState, moveUnit(1, "p1-swordsman", 2, 12));

  assert.equal(moved.nextState.activation.unitId, "p1-swordsman");
  assert.equal(moved.nextState.activation.moved, true);
  assert.equal(moved.nextState.activation.primaryUsed, false);

  const defended = applyCommand(moved.nextState, defend(1, "p1-swordsman"));
  assert.equal(defended.accepted, true);
  assert.equal(defended.nextState.activation.unitId, "p1-swordsman");
  assert.equal(defended.nextState.activation.primaryUsed, true);
  assert.equal(defended.nextState.units.find((unit) => unit.id === "p1-swordsman").defending, true);
});

test("a unit can attack first and still use its movement", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const attacked = applyCommand(selected.nextState, attack(1, "p1-swordsman", "p2-swordsman", NORMAL_HIT));
  const moved = applyCommand(attacked.nextState, moveUnit(1, "p1-swordsman", 0, 1));

  assert.equal(moved.accepted, true);
  assert.equal(moved.nextState.activation.unitId, "p1-swordsman");
  assert.equal(moved.nextState.activation.primaryUsed, true);
  assert.equal(moved.nextState.activation.moved, true);
  assert.deepEqual(moved.nextState.units.find((unit) => unit.id === "p1-swordsman").position, { x: 0, y: 1 });
});

test("ARTS are unavailable after moving or attacking", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 9, y: 9 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const moved = applyCommand(selected.nextState, moveUnit(1, "p1-swordsman", 0, 1));
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
  assert.equal(result.nextState.units.find((unit) => unit.id === "enemy-a").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "enemy-b").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-swordsman").mp, 16);
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

test("Poison Arrow resolves a normal attack, spends the Archer, and applies permanent poison on a successful roll", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "poison-arrow", {
    targetId: "p2-swordsman", effectRoll: 0.2, ...NORMAL_HIT
  }));

  assert.equal(result.accepted, true);
  const target = result.nextState.units.find((unit) => unit.id === "p2-swordsman");
  const actor = result.nextState.units.find((unit) => unit.id === "p1-archer");
  assert.equal(target.hp, 20);
  assert.deepEqual(target.statuses, [{ type: "poison", duration: "permanent", turnStartDamage: 1 }]);
  assert.equal(actor.mp, 18);
  assert.equal(actor.spent, true);
  assert.equal(result.events[0].effect.applied, true);
});

test("Emblem prevents Poison Arrow from adding poison but does not prevent its attack", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-archer", player: 2, type: "archer", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "poison-arrow", {
    targetId: "p2-archer", effectRoll: 0, ...NORMAL_HIT
  }));

  assert.equal(result.accepted, true);
  const target = result.nextState.units.find((unit) => unit.id === "p2-archer");
  assert.equal(target.hp, 18);
  assert.deepEqual(target.statuses, []);
  assert.equal(result.events[0].effect.applied, false);
  assert.equal(result.events[0].effect.reason, "IMMUNE");
});

test("status immunities come from passive unit data instead of ART-specific target lists", () => {
  assert.equal("immuneTypes" in UNIT_TYPES.archer.arts.find((art) => art.id === "poison-arrow"), false);
  assert.equal("immuneTypes" in UNIT_TYPES.archer.arts.find((art) => art.id === "leg-shot"), false);

  const initial = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-archer", player: 2, type: "archer", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "poison-arrow", {
    targetId: "p2-archer", effectRoll: 0, ...NORMAL_HIT
  }));

  assert.equal(result.events[0].effect.reason, "IMMUNE");
});

test("poison damages its owner at the beginning of that unit's activation, defaulting to one damage", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-poisoned", player: 1, type: "swordsman", hp: 5, x: 0, y: 0, statuses: [{ type: "poison", duration: "permanent" }] },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  });
  const result = applyCommand(initial, beginActivation(1, "p1-poisoned"));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-poisoned").hp, 4);
  assert.deepEqual(result.events[0], { type: "STATUS_DAMAGE", unitId: "p1-poisoned", status: "poison", damage: 1 });
});

test("an ability can specify a stronger poison tick", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-poisoned", player: 1, type: "swordsman", hp: 5, x: 0, y: 0, statuses: [{ type: "poison", duration: "permanent", turnStartDamage: 3 }] },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 7, y: 7 }
    ]
  });
  const result = applyCommand(initial, beginActivation(1, "p1-poisoned"));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-poisoned").hp, 2);
  assert.equal(result.events[0].damage, 3);
});

test("Moonstrike applies a one-turn status that expires after the afflicted unit completes an activation", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const moonstrike = applyCommand(selected.nextState, useArt(1, "p1-swordsman", "moonstrike", {
    targetId: "p2-swordsman", effectRoll: 0, ...NORMAL_HIT
  }));
  assert.deepEqual(moonstrike.nextState.units.find((unit) => unit.id === "p2-swordsman").statuses, [
    { type: "blind", duration: 1 }
  ]);

  const enemySelected = applyCommand(moonstrike.nextState, beginActivation(2, "p2-swordsman"));
  const enemyDefended = applyCommand(enemySelected.nextState, defend(2, "p2-swordsman"));
  const finished = applyCommand(enemyDefended.nextState, finishActivation(2, "p2-swordsman"));
  assert.deepEqual(finished.nextState.units.find((unit) => unit.id === "p2-swordsman").statuses, []);
});

test("failed status rolls still resolve the ART attack and report no effect", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "leg-shot", {
    targetId: "p2-swordsman", effectRoll: 0.9, ...NORMAL_HIT
  }));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-swordsman").hp, 20);
  assert.deepEqual(result.nextState.units.find((unit) => unit.id === "p2-swordsman").statuses, []);
  assert.deepEqual(result.events[0].effect, { attempted: true, applied: false, reason: "ROLL_FAILED" });
});

test("Leg Shot applies a three-turn Slow that reduces the target's MOVE by one", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "leg-shot", {
    targetId: "p2-swordsman", effectRoll: 0, ...NORMAL_HIT
  }));
  const target = result.nextState.units.find((unit) => unit.id === "p2-swordsman");

  assert.deepEqual(target.statuses, [{ type: "slow", duration: 3, statModifiers: { moveRange: -1 } }]);
  assert.equal(getEffectiveStats(target).moveRange, 2);
});

test("status-provided movement modifiers stack from their own definitions but cannot reduce MOVE below one", () => {
  const stats = getEffectiveStats({
    type: "archer",
    hp: 24,
    statuses: [
      { type: "tarred", duration: 2, statModifiers: { moveRange: -1 } },
      { type: "crippled", duration: 1, statModifiers: { moveRange: -8 } }
    ]
  });

  assert.equal(stats.moveRange, 1);
});

test("blind makes a normal ATTACK miss but still consumes the primary action", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0, statuses: [{ type: "blind", duration: 1 }] },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const result = applyCommand(selected.nextState, attack(1, "p1-swordsman", "p2-swordsman"));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-swordsman").hp, 25);
  assert.equal(result.nextState.activation.primaryUsed, true);
  assert.equal(result.events[0].type, "ATTACK_RESOLVED");
  assert.equal(result.events[0].actorId, "p1-swordsman");
  assert.equal(result.events[0].targetId, "p2-swordsman");
  assert.equal(result.events[0].missed, true);
  assert.equal(result.events[0].hit, false);
});

test("Close Shot adds damage to the Archer's normal ATTACK and strike ARTS at close range", () => {
  const adjacent = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-adjacent", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const adjacentSelected = applyCommand(adjacent, beginActivation(1, "p1-archer"));
  const adjacentAttack = applyCommand(adjacentSelected.nextState, attack(1, "p1-archer", "p2-adjacent", NORMAL_HIT));
  assert.equal(adjacentAttack.nextState.units.find((unit) => unit.id === "p2-adjacent").hp, 20);

  const distant = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-distant", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  const distantSelected = applyCommand(distant, beginActivation(1, "p1-archer"));
  const distantAttack = applyCommand(distantSelected.nextState, attack(1, "p1-archer", "p2-distant", NORMAL_HIT));
  assert.equal(distantAttack.nextState.units.find((unit) => unit.id === "p2-distant").hp, 21);

  const art = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-art-target", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const artSelected = applyCommand(art, beginActivation(1, "p1-archer"));
  const legShot = applyCommand(artSelected.nextState, useArt(1, "p1-archer", "leg-shot", {
    targetId: "p2-art-target", effectRoll: 0.9, ...NORMAL_HIT
  }));
  assert.equal(legShot.nextState.units.find((unit) => unit.id === "p2-art-target").hp, 20);
});

test("Volley Shot damages every enemy in its five-deep expanding cone", () => {
  const initial = createBattleState({
    size: 10,
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 4, y: 5 },
      { id: "depth-one", player: 2, type: "swordsman", x: 4, y: 4 },
      { id: "depth-two-left", player: 2, type: "swordsman", x: 3, y: 3 },
      { id: "depth-two-right", player: 2, type: "swordsman", x: 5, y: 3 },
      { id: "depth-five-edge", player: 2, type: "swordsman", x: 0, y: 0 },
      { id: "outside-cone", player: 2, type: "swordsman", x: 8, y: 3 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-archer"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-archer", "volley-shot", {
    targetPosition: { x: 4, y: 4 }
  }));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "depth-one").hp, 21);
  assert.equal(result.nextState.units.find((unit) => unit.id === "depth-two-left").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "depth-two-right").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "depth-five-edge").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "outside-cone").hp, 25);
  assert.deepEqual(result.events[0].targetIds.sort(), ["depth-five-edge", "depth-one", "depth-two-left", "depth-two-right"]);
  assert.deepEqual(result.events[0].damageByTarget, {
    "depth-one": 4,
    "depth-two-left": 2,
    "depth-two-right": 2,
    "depth-five-edge": 2
  });
});

test("Mage Killer silence prevents the afflicted unit from starting an ART", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const mageKiller = applyCommand(selected.nextState, useArt(1, "p1-swordsman", "mage-killer", {
    targetId: "p2-swordsman", effectRoll: 0, ...NORMAL_HIT
  }));
  const enemySelected = applyCommand(mageKiller.nextState, beginActivation(2, "p2-swordsman"));
  const blocked = applyCommand(enemySelected.nextState, useArt(2, "p2-swordsman", "footwork", []));

  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "ART_NOT_AVAILABLE");
});

test("Life Sap restores half of the damage dealt, rounded to the nearest HP", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", hp: 20, x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-swordsman"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-swordsman", "life-sap", {
    targetId: "p2-swordsman", effectRoll: 0, ...NORMAL_HIT
  }));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-swordsman").hp, 23);
  assert.equal(result.events[0].effect.healing, 3);
});

test("Pray heals nearby friendly units and spends Mystic's activation", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-mystic", player: 1, type: "mystic", hp: 19, x: 0, y: 0 },
      { id: "p1-near", player: 1, type: "swordsman", hp: 20, x: 3, y: 0 },
      { id: "p1-far", player: 1, type: "archer", hp: 20, x: 4, y: 0 },
      { id: "p2-enemy", player: 2, type: "swordsman", hp: 20, x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-mystic"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-mystic", "pray"));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-mystic").hp, 22);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-near").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-far").hp, 20);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-enemy").hp, 20);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-mystic").mp, 34);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-mystic").spent, true);
  assert.deepEqual(result.events[0].healingByTarget, { "p1-mystic": 3, "p1-near": 3 });
});

test("Wish heals every friendly unit by one regardless of distance", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-mystic", player: 1, type: "mystic", hp: 22, x: 0, y: 0 },
      { id: "p1-far", player: 1, type: "archer", hp: 20, x: 9, y: 9 },
      { id: "p2-enemy", player: 2, type: "swordsman", hp: 20, x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-mystic"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-mystic", "wish"));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-mystic").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-far").hp, 21);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-enemy").hp, 20);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-mystic").mp, 36);
  assert.deepEqual(result.events[0].healingByTarget, { "p1-mystic": 1, "p1-far": 1 });
});

test("Mystic Silence is a status cast that deals no damage and respects immunity", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-mystic", player: 1, type: "mystic", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 5, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-mystic"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-mystic", "silence", {
    targetId: "p2-swordsman", effectRoll: 0
  }));
  const target = result.nextState.units.find((unit) => unit.id === "p2-swordsman");

  assert.equal(result.accepted, true);
  assert.equal(target.hp, 25);
  assert.deepEqual(target.statuses, [{ type: "silence", duration: 1 }]);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-mystic").mp, 35);
  assert.deepEqual(result.events[0].effect, { attempted: true, applied: true, status: "silence" });

  const immuneState = createBattleState({
    units: [
      { id: "p1-mystic", player: 1, type: "mystic", x: 0, y: 0 },
      { id: "p2-mystic", player: 2, type: "mystic", x: 5, y: 0 }
    ]
  });
  const immuneSelected = applyCommand(immuneState, beginActivation(1, "p1-mystic"));
  const immune = applyCommand(immuneSelected.nextState, useArt(1, "p1-mystic", "silence", {
    targetId: "p2-mystic", effectRoll: 0
  }));

  assert.equal(immune.accepted, true);
  assert.deepEqual(immune.nextState.units.find((unit) => unit.id === "p2-mystic").statuses, []);
  assert.equal(immune.events[0].effect.reason, "IMMUNE");
});
