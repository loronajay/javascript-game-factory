import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, defend, moveUnit, useArt } from "../src/core/commands.js";
import { createBattleState, getTileAffinity } from "../src/core/state.js";
import { getAvailableArts, getEffectiveStats, UNIT_TYPES, isRaging } from "../src/core/unitCatalog.js";
import { applyStatus } from "../src/rules/statuses.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

test("battle states expose default checkerboard light and dark tile affinity with overrides", () => {
  const state = createBattleState({
    size: 3,
    tiles: [
      { x: 0, y: 0, affinity: "dark" },
      { x: 1, y: 0, affinity: "light" }
    ]
  });

  assert.equal(getTileAffinity(state, { x: 0, y: 0 }), "dark");
  assert.equal(getTileAffinity(state, { x: 1, y: 0 }), "light");
  assert.equal(getTileAffinity(state, { x: 1, y: 1 }), "light");
  assert.equal(getTileAffinity(state, { x: 2, y: 1 }), "dark");
});

test("Paladin owns Hand of Life, Chosen, Lightseeker, Heaven's Realm, and Darkseeker", () => {
  assert.deepEqual(UNIT_TYPES.paladin.stats, {
    moveRange: 3,
    attackRange: 1,
    strength: 10,
    defense: 5,
    maxHp: 26,
    maxMp: 24
  });
  assert.equal(UNIT_TYPES.paladin.passive.name, "Hand of Life");
  assert.deepEqual(UNIT_TYPES.paladin.passive.effect, {
    type: "physicalDamageHealAura",
    radius: 2,
    fraction: 0.5,
    rounding: "floor",
    tileAffinityStats: { affinity: "light", stats: { defense: 1 } }
  });
  assert.equal(UNIT_TYPES.paladin.arts.find((art) => art.id === "chosen").kind, "passive");
  assert.deepEqual(UNIT_TYPES.paladin.arts.find((art) => art.id === "chosen").effect, {
    type: "immunity", statuses: ["poison", "slow", "blind", "silence", "stun"]
  });
  assert.deepEqual(UNIT_TYPES.paladin.arts.find((art) => art.id === "lightseeker").effect, {
    type: "tilePulse", affinity: "light", amount: 1, range: 5
  });
  assert.deepEqual(UNIT_TYPES.paladin.ragePassive.effect, {
    type: "statModifiers",
    stats: { strength: 2, attackRange: 1 },
    tileStrikeBonus: { affinity: "light", amount: 2 }
  });
  assert.deepEqual(UNIT_TYPES.paladin.rageArt.effect, {
    type: "tilePulse", affinity: "dark", amount: 2, global: true
  });
});

test("Chosen prevents all current status effects", () => {
  const paladin = { type: "paladin", statuses: [] };

  for (const type of ["poison", "slow", "blind", "silence", "stun"]) {
    assert.equal(applyStatus(paladin, { type, duration: 1 }).applied, false);
  }
});

test("Hand of Life gives Paladin +1 DEF while standing on a white tile", () => {
  const state = createBattleState({
    tiles: [
      { x: 0, y: 0, affinity: "light" },
      { x: 1, y: 0, affinity: "dark" }
    ],
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", x: 0, y: 0 },
      { id: "p1-paladin-dark", player: 1, type: "paladin", x: 1, y: 0 }
    ]
  });

  const paladinOnWhite = state.units.find((unit) => unit.id === "p1-paladin");
  const paladinOnDark = state.units.find((unit) => unit.id === "p1-paladin-dark");

  assert.equal(getEffectiveStats(paladinOnWhite, state).defense, 6);
  assert.equal(getEffectiveStats(paladinOnDark, state).defense, 5);
});

test("Hand of Life heals nearby allies for half physical damage dealt, rounded down", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", x: 0, y: 0 },
      { id: "p1-near", player: 1, type: "swordsman", hp: 20, x: 2, y: 0 },
      { id: "p1-far", player: 1, type: "swordsman", hp: 20, x: 3, y: 0 },
      { id: "p2-target", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });

  const selected = applyCommand(initial, beginActivation(1, "p1-paladin"));
  const result = applyCommand(selected.nextState, attack(1, "p1-paladin", "p2-target", NORMAL_HIT));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-target").hp, 20);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-near").hp, 22);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p1-far").hp, 20);
  assert.deepEqual(result.events[1], {
    type: "HAND_OF_LIFE",
    actorId: "p1-paladin",
    healingByTarget: { "p1-near": 2 }
  });
});

test("Lightseeker damages light-tile enemies within five and still leaves a full activation", () => {
  const initial = createBattleState({
    size: 8,
    tiles: [
      { x: 3, y: 0, affinity: "light" },
      { x: 6, y: 0, affinity: "light" },
      { x: 1, y: 0, affinity: "dark" }
    ],
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", x: 0, y: 0 },
      { id: "p2-light-near", player: 2, type: "swordsman", x: 3, y: 0 },
      { id: "p2-light-far", player: 2, type: "swordsman", x: 6, y: 0 },
      { id: "p2-dark-near", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });

  const selected = applyCommand(initial, beginActivation(1, "p1-paladin"));
  const lightseeker = applyCommand(selected.nextState, useArt(1, "p1-paladin", "lightseeker"));

  assert.equal(lightseeker.accepted, true);
  assert.equal(lightseeker.nextState.units.find((unit) => unit.id === "p1-paladin").mp, 20);
  assert.equal(lightseeker.nextState.units.find((unit) => unit.id === "p2-light-near").hp, 24);
  assert.equal(lightseeker.nextState.units.find((unit) => unit.id === "p2-light-far").hp, 25);
  assert.equal(lightseeker.nextState.units.find((unit) => unit.id === "p2-dark-near").hp, 25);
  assert.equal(lightseeker.nextState.activation.unitId, "p1-paladin");
  assert.equal(lightseeker.nextState.activation.primaryUsed, false);
  assert.equal(lightseeker.nextState.activation.moved, false);

  const attacked = applyCommand(lightseeker.nextState, attack(1, "p1-paladin", "p2-dark-near", NORMAL_HIT));
  assert.equal(attacked.accepted, true);
  const moved = applyCommand(attacked.nextState, moveUnit(1, "p1-paladin", 0, 1));
  assert.equal(moved.accepted, true);
});

test("Paladin can use a seeker bonus action before Defend, but Defend still spends the turn", () => {
  const initial = createBattleState({
    size: 8,
    tiles: [{ x: 3, y: 0, affinity: "light" }],
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", x: 0, y: 0 },
      { id: "p2-light-near", player: 2, type: "swordsman", x: 3, y: 0 }
    ]
  });

  const selected = applyCommand(initial, beginActivation(1, "p1-paladin"));
  const lightseeker = applyCommand(selected.nextState, useArt(1, "p1-paladin", "lightseeker"));
  const defended = applyCommand(lightseeker.nextState, defend(1, "p1-paladin"));

  assert.equal(lightseeker.accepted, true);
  assert.equal(lightseeker.nextState.activation.unitId, "p1-paladin");
  assert.equal(lightseeker.nextState.activation.primaryUsed, false);
  assert.deepEqual(lightseeker.nextState.activation.bonusActionGroups, ["seeker"]);
  assert.equal(defended.accepted, true);
  assert.equal(defended.nextState.activation, null);
  assert.equal(defended.nextState.units.find((unit) => unit.id === "p1-paladin").spent, true);
  assert.equal(defended.nextState.units.find((unit) => unit.id === "p1-paladin").defending, true);
});

test("Lightseeker and Darkseeker share a one-cast seeker lockout", () => {
  const initial = createBattleState({
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", hp: 5, x: 0, y: 0 },
      { id: "p2-target", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-paladin"));

  assert.equal(isRaging(selected.nextState.units.find((unit) => unit.id === "p1-paladin")), true);
  assert.equal(getAvailableArts(selected.nextState.units.find((unit) => unit.id === "p1-paladin")).some((art) => art.id === "darkseeker"), true);

  const lightseeker = applyCommand(selected.nextState, useArt(1, "p1-paladin", "lightseeker"));
  assert.equal(lightseeker.accepted, true);
  const blocked = applyCommand(lightseeker.nextState, useArt(1, "p1-paladin", "darkseeker"));
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "ART_NOT_AVAILABLE");
});

test("Darkseeker is RAGE-only and damages dark-tile enemies anywhere", () => {
  const initial = createBattleState({
    size: 8,
    tiles: [
      { x: 7, y: 7, affinity: "dark" },
      { x: 1, y: 0, affinity: "light" }
    ],
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", hp: 5, x: 0, y: 0 },
      { id: "p2-dark-far", player: 2, type: "swordsman", x: 7, y: 7 },
      { id: "p2-light-near", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const selected = applyCommand(initial, beginActivation(1, "p1-paladin"));
  const result = applyCommand(selected.nextState, useArt(1, "p1-paladin", "darkseeker"));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-dark-far").hp, 23);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-light-near").hp, 25);
  assert.equal(result.nextState.activation.unitId, "p1-paladin");
  assert.deepEqual(result.events[0].targetIds, ["p2-dark-far"]);
  assert.deepEqual(result.events[0].damageByTarget, { "p2-dark-far": 2 });
});

test("Heaven's Realm gives raging Paladin stats and extra physical damage on light-to-light strikes", () => {
  const initial = createBattleState({
    tiles: [
      { x: 0, y: 0, affinity: "light" },
      { x: 2, y: 0, affinity: "light" }
    ],
    units: [
      { id: "p1-paladin", player: 1, type: "paladin", hp: 5, x: 0, y: 0 },
      { id: "p2-target", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });

  const paladin = initial.units.find((unit) => unit.id === "p1-paladin");
  assert.equal(getEffectiveStats(paladin, initial).strength, 12);
  assert.equal(getEffectiveStats(paladin, initial).attackRange, 2);

  const selected = applyCommand(initial, beginActivation(1, "p1-paladin"));
  const result = applyCommand(selected.nextState, attack(1, "p1-paladin", "p2-target", NORMAL_HIT));

  assert.equal(result.accepted, true);
  assert.equal(result.nextState.units.find((unit) => unit.id === "p2-target").hp, 16);
  assert.equal(result.events[0].tileStrikeBonus, 2);
});
