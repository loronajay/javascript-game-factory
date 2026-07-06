import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, useArt } from "../src/core/commands.js";
import { createBattleState, findUnit, getTileAffinity } from "../src/core/state.js";
import { getAvailableArts, getEffectiveStats, isRaging, UNIT_TYPES } from "../src/core/unitCatalog.js";
import { getBasicAttackDamageType, getCritChance, getCritOnHitStatus } from "../src/rules/combat.js";
import { applyStatus } from "../src/rules/statuses.js";

// Pin the rolls so damage/status outcomes are deterministic (combat is stochastic).
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 }; // lands, does NOT crit
const CRIT_HIT = { attackRoll: 0.5, critRoll: 0.0 };     // lands AND crits

function begin(state, unitId, player = 1) {
  const result = applyCommand(state, beginActivation(player, unitId));
  assert.ok(result.accepted, `beginActivation rejected (${result.errorCode})`);
  return result.nextState;
}

test("Angel is a holy Ranger with Blessed Arrow, Anoint, Elevate, and Heaven's Wrath", () => {
  assert.equal(UNIT_TYPES.angel.glyph, "\u{1FABD}");
  assert.deepEqual(UNIT_TYPES.angel.stats, {
    moveRange: 2, attackRange: 5, strength: 3, defense: 3, maxHp: 24, maxMp: 37
  });
  assert.equal(UNIT_TYPES.angel.classType, "ranger");
  assert.equal(UNIT_TYPES.angel.passive.effect.type, "blessedAttack");
  assert.equal(UNIT_TYPES.angel.passive.effect.attackDamageType, "magic");
  assert.deepEqual(UNIT_TYPES.angel.passive.effect.critStatus, { status: "blind", duration: 1 });
  assert.ok(UNIT_TYPES.angel.arts.find((a) => a.id === "anoint"));
  assert.ok(UNIT_TYPES.angel.arts.find((a) => a.id === "elevate"));
  assert.deepEqual(UNIT_TYPES.angel.ragePassive.effect, {
    type: "statModifiers", stats: { strength: 2, moveRange: 2 }
  });
  assert.equal(UNIT_TYPES.angel.rageArt.id, "heavenseeker");
});

test("Blessed Arrow makes basic attacks deal MAGIC damage (ignores DEF)", () => {
  // STR 3 vs a DEF-4 swordsman: physical would be max(1, 3-4) = 1, but magic ignores DEF
  // and lands the full 3.
  assert.equal(getBasicAttackDamageType({ type: "angel" }), "magic");
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 0, y: 2 }
    ]
  });
  const opened = begin(state, "p1-angel");
  const result = applyCommand(opened, attack(1, "p1-angel", "p2-sword", NORMAL_HIT));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "p2-sword").hp, 22); // 25 - 3 magic
});

test("Blessed Arrow reaches through an intervening body (magic ignores body-block)", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
      { id: "p2-block", player: 2, type: "swordsman", hp: 25, x: 0, y: 1 }, // directly between
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 0, y: 2 }
    ]
  });
  const opened = begin(state, "p1-angel");
  const result = applyCommand(opened, attack(1, "p1-angel", "p2-sword", NORMAL_HIT));
  assert.ok(result.accepted, `a magic shot should pass the body (${result.errorCode})`);
  assert.equal(findUnit(result.nextState, "p2-sword").hp, 22);
});

test("a critical basic attack also blinds the target (Blessed Arrow)", () => {
  assert.deepEqual(getCritOnHitStatus({ type: "angel" }), { status: "blind", duration: 1 });
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 0, y: 2 }
    ]
  });
  const opened = begin(state, "p1-angel");
  const result = applyCommand(opened, attack(1, "p1-angel", "p2-sword", CRIT_HIT));
  assert.ok(result.accepted, result.errorCode);
  const target = findUnit(result.nextState, "p2-sword");
  assert.ok(target.hp > 0, "target should survive the crit to be blinded");
  assert.ok(target.statuses.some((s) => s.type === "blind"), "crit should apply blind");
});

test("Inner Strength adds crit chance per 3 HP missing", () => {
  // Base 15%; at 24 - 9 = 15 HP (9 missing → floor(9/3)=3 bands) it is 15% + 3×1.5% = 19.5%.
  assert.ok(Math.abs(getCritChance({ type: "angel", hp: 24, statuses: [] }) - 0.15) < 1e-9);
  assert.ok(Math.abs(getCritChance({ type: "angel", hp: 15, statuses: [] }) - 0.195) < 1e-9);
});

test("Holy Being makes Angel immune to every status", () => {
  const angel = { type: "angel", statuses: [] };
  for (const type of ["poison", "slow", "blind", "silence", "stun"]) {
    assert.equal(applyStatus(angel, { type, duration: 1 }).applied, false, `${type} should be resisted`);
  }
});

test("Anoint grants an ally +1 range for a turn, and refuses self / enemy targets", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
      { id: "p1-ally", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "p2-foe", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  const opened = begin(state, "p1-angel");

  // Cannot anoint yourself…
  assert.equal(applyCommand(opened, useArt(1, "p1-angel", "anoint", { targetId: "p1-angel" })).accepted, false);
  // …nor an enemy.
  assert.equal(applyCommand(opened, useArt(1, "p1-angel", "anoint", { targetId: "p2-foe" })).accepted, false);

  const result = applyCommand(opened, useArt(1, "p1-angel", "anoint", { targetId: "p1-ally" }));
  assert.ok(result.accepted, result.errorCode);
  const ally = findUnit(result.nextState, "p1-ally");
  assert.ok(ally.statuses.some((s) => s.type === "empowered" && s.statModifiers?.attackRange === 1));
  // Swordsman base range 1 → 2 while anointed.
  assert.equal(getEffectiveStats(ally, result.nextState).attackRange, 2);
});

test("Elevate heals only allies standing on a white (light) tile", () => {
  // Pick tiles by their default checkerboard affinity: (x+y) even = light.
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
      { id: "p1-onwhite", player: 1, type: "swordsman", hp: 20, x: 2, y: 0 }, // light
      { id: "p1-ondark", player: 1, type: "swordsman", hp: 20, x: 1, y: 0 }   // dark
    ]
  });
  assert.equal(getTileAffinity(state, { x: 2, y: 0 }), "light");
  assert.equal(getTileAffinity(state, { x: 1, y: 0 }), "dark");

  const opened = begin(state, "p1-angel");
  const result = applyCommand(opened, useArt(1, "p1-angel", "elevate"));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "p1-onwhite").hp, 21); // +1
  assert.equal(findUnit(result.nextState, "p1-ondark").hp, 20);  // untouched
});

test("Heaven's Wrath grants +2 STR and +2 MOVE while raging", () => {
  const state = createBattleState({
    size: 7,
    units: [{ id: "p1-angel", player: 1, type: "angel", hp: 4, x: 0, y: 0 }]
  });
  const angel = findUnit(state, "p1-angel");
  assert.ok(isRaging(angel));
  const stats = getEffectiveStats(angel, state);
  assert.equal(stats.strength, 5); // 3 + 2
  assert.equal(stats.moveRange, 4); // 2 + 2
});

test("Heavenseeker (RAGE): white-tile enemies take 2 true, white-tile allies heal 2, keeps the turn", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", hp: 4, x: 0, y: 0 }, // raging
      { id: "p1-ally", player: 1, type: "swordsman", hp: 20, x: 4, y: 0 },  // light tile
      { id: "p2-onwhite", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 }, // light tile
      { id: "p2-ondark", player: 2, type: "swordsman", hp: 25, x: 1, y: 0 }   // dark tile — spared
    ]
  });
  const angel = findUnit(state, "p1-angel");
  assert.ok(getAvailableArts(angel).some((a) => a.id === "heavenseeker"), "rage art should be available");

  const opened = begin(state, "p1-angel");
  const result = applyCommand(opened, useArt(1, "p1-angel", "heavenseeker"));
  assert.ok(result.accepted, result.errorCode);
  const next = result.nextState;
  assert.equal(findUnit(next, "p2-onwhite").hp, 23); // 25 - 2 true
  assert.equal(findUnit(next, "p2-ondark").hp, 25);  // off a white tile — untouched
  assert.equal(findUnit(next, "p1-ally").hp, 22);    // 20 + 2 heal
  // A bonus action does NOT spend the activation — Angel can still act.
  assert.equal(next.activation?.unitId, "p1-angel");
  assert.equal(next.activation?.primaryUsed, false);
});

test("Heavenseeker is rage-locked (unavailable at full HP)", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-angel", player: 1, type: "angel", x: 0, y: 0 },
      { id: "p2-foe", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  const opened = begin(state, "p1-angel");
  assert.equal(applyCommand(opened, useArt(1, "p1-angel", "heavenseeker")).accepted, false);
});
