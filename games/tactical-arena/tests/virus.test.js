import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, useArt } from "../src/core/commands.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getAvailableArts, getGuaranteedStatuses, getPoisonMpRefund, getStatusSpreadConfig, isRaging, UNIT_TYPES } from "../src/core/unitCatalog.js";
import { getCritOnHitStatus } from "../src/rules/combat.js";
import { applyStatus } from "../src/rules/statuses.js";

// Pin the rolls so damage/status outcomes are deterministic (combat is stochastic).
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };            // lands, no crit
const CRIT_HIT = { attackRoll: 0.5, critRoll: 0.0 };               // lands AND crits
const NORMAL_POISON = { attackRoll: 0.5, critRoll: 0.99, effectRoll: 0.0 };   // lands, poison passes
const NORMAL_NOPOISON = { attackRoll: 0.5, critRoll: 0.99, effectRoll: 0.99 }; // lands, poison fails 60%

function begin(state, unitId, player = 1) {
  const result = applyCommand(state, beginActivation(player, unitId));
  assert.ok(result.accepted, `beginActivation rejected (${result.errorCode})`);
  return result.nextState;
}

const poison = () => ({ type: "poison", duration: "permanent" });

test("Virus is a contagion support-caster with Spread, Cough, Poison Tick, Smog, and Explosion", () => {
  const virus = UNIT_TYPES.virus;
  assert.equal(virus.glyph, "\u{1F9A0}");
  assert.equal(virus.classType, "mage");
  assert.deepEqual(virus.stats, { moveRange: 3, attackRange: 5, strength: 6, defense: 3, maxHp: 25, maxMp: 36 });
  assert.equal(virus.passive.effect.type, "statusSpread");
  assert.deepEqual(virus.passive.effect.critStatus, { status: "poison", duration: "permanent" });
  assert.ok(virus.arts.find((a) => a.id === "cough"));
  assert.ok(virus.arts.find((a) => a.id === "poison-tick"));
  assert.ok(virus.arts.find((a) => a.id === "smog"));
  assert.equal(virus.rageArt.id, "explosion");
});

test("Cough deals a FIXED 5 magic (ignores DEF) and poisons on the roll, refunding 2 MP via Growth", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p1-ally", player: 1, type: "swordsman", x: 0, y: 6 }, // keeps P1's turn open (no poison-tick rollover)
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 } // DEF 4
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "cough", { targetId: "p2-sword", ...NORMAL_POISON }));
  assert.ok(result.accepted, result.errorCode);
  const target = findUnit(result.nextState, "p2-sword");
  assert.equal(target.hp, 20, "5 magic ignores DEF (not STR-6 scaled)");
  assert.ok(target.statuses.some((s) => s.type === "poison"), "poison should apply");
  // 36 - 5 cost + 2 Growth = 33
  assert.equal(findUnit(result.nextState, "p1-virus").mp, 33);
});

test("Cough's poison check can fail; then no poison and no Growth refund", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 }
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "cough", { targetId: "p2-sword", ...NORMAL_NOPOISON }));
  assert.ok(result.accepted, result.errorCode);
  assert.ok(!findUnit(result.nextState, "p2-sword").statuses.some((s) => s.type === "poison"));
  assert.equal(findUnit(result.nextState, "p1-virus").mp, 31, "no Growth refund when poison whiffs");
});

test("Spread: a NEW poison on an enemy propagates to that enemy's allies within 2 tiles", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p2-hit", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 }, // Cough target
      { id: "p2-near", player: 2, type: "swordsman", hp: 25, x: 3, y: 0 }, // 1 tile from p2-hit
      { id: "p2-far", player: 2, type: "swordsman", hp: 25, x: 6, y: 0 }   // 4 tiles from p2-hit
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "cough", { targetId: "p2-hit", ...NORMAL_POISON }));
  assert.ok(result.accepted, result.errorCode);
  const next = result.nextState;
  assert.ok(findUnit(next, "p2-hit").statuses.some((s) => s.type === "poison"), "the struck enemy is poisoned");
  assert.ok(findUnit(next, "p2-near").statuses.some((s) => s.type === "poison"), "a nearby ally catches it");
  assert.ok(!findUnit(next, "p2-far").statuses.some((s) => s.type === "poison"), "an ally beyond the radius is spared");
});

test("Spread only propagates a DEBUFF the Virus counts as an enemy affliction (not the Virus's own team)", () => {
  // A poison already sitting on a Virus ally must not spread — Virus is not that unit's enemy.
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p1-ally", player: 1, type: "swordsman", hp: 25, x: 2, y: 0 },
      { id: "p1-ally2", player: 1, type: "swordsman", hp: 25, x: 3, y: 0 },
      { id: "p2-foe", player: 2, type: "swordsman", hp: 25, x: 5, y: 0 }
    ]
  });
  // Virus defends (a benign command) after we manually poison an ally — spread must NOT fire.
  const opened = begin(state, "p1-virus");
  findUnit(opened, "p1-ally").statuses.push(poison());
  const result = applyCommand(opened, useArt(1, "p1-virus", "cough", { targetId: "p2-foe", ...NORMAL_NOPOISON }));
  assert.ok(result.accepted, result.errorCode);
  assert.ok(!findUnit(result.nextState, "p1-ally2").statuses.some((s) => s.type === "poison"),
    "an ally's pre-existing poison never spreads through the Virus's own team");
});

test("a critical basic attack poisons the target (Spread's crit rider)", () => {
  assert.deepEqual(getCritOnHitStatus({ type: "virus" }), { status: "poison", duration: "permanent" });
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 }
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, attack(1, "p1-virus", "p2-sword", CRIT_HIT));
  assert.ok(result.accepted, result.errorCode);
  const target = findUnit(result.nextState, "p2-sword");
  assert.ok(target.hp > 0, "target survives the crit");
  assert.ok(target.statuses.some((s) => s.type === "poison"), "a crit poisons");
});

test("a NON-crit basic attack does not poison while Virus is at full HP", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p2-sword", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 }
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, attack(1, "p1-virus", "p2-sword", NORMAL_HIT));
  assert.ok(result.accepted, result.errorCode);
  assert.ok(!findUnit(result.nextState, "p2-sword").statuses.some((s) => s.type === "poison"));
});

test("Poison Tick deals 2 true damage to every poisoned enemy and ignores the rest", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p1-ally", player: 1, type: "swordsman", x: 0, y: 8 }, // keeps P1's turn open (no poison-tick rollover)
      { id: "p2-poison", player: 2, type: "swordsman", hp: 25, x: 4, y: 4, statuses: [poison()] },
      { id: "p2-clean", player: 2, type: "swordsman", hp: 25, x: 5, y: 5 }
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "poison-tick"));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "p2-poison").hp, 23, "poisoned enemy takes 2 true");
  assert.equal(findUnit(result.nextState, "p2-clean").hp, 25, "an unpoisoned enemy is untouched");
  assert.equal(findUnit(result.nextState, "p1-virus").mp, 34, "costs 2 MP");
});

test("Smog blinds every enemy within 2 tiles with no roll (and Spread widens the cloud)", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p2-in", player: 2, type: "swordsman", hp: 25, x: 2, y: 0 },   // within 2 of Virus
      { id: "p2-edge", player: 2, type: "swordsman", hp: 25, x: 3, y: 0 }, // 3 from Virus, but 1 from p2-in
      { id: "p2-out", player: 2, type: "swordsman", hp: 25, x: 6, y: 0 }   // far from everyone
    ]
  });
  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "smog"));
  assert.ok(result.accepted, result.errorCode);
  const next = result.nextState;
  assert.ok(findUnit(next, "p2-in").statuses.some((s) => s.type === "blind"), "an enemy in the cloud is blinded");
  // p2-edge is out of the cloud but adjacent to a blinded enemy, so Spread carries the blind.
  assert.ok(findUnit(next, "p2-edge").statuses.some((s) => s.type === "blind"), "Spread carries the blind one tile further");
  assert.ok(!findUnit(next, "p2-out").statuses.some((s) => s.type === "blind"), "a far enemy stays clear");
});

test("Gaseous Entity: Virus is immune to poison and blind, but not slow/silence/stun", () => {
  const virus = { type: "virus", statuses: [] };
  assert.equal(applyStatus(virus, { type: "poison", duration: "permanent" }).applied, false);
  assert.equal(applyStatus(virus, { type: "blind", duration: 1 }).applied, false);
  assert.equal(applyStatus(virus, { type: "slow", duration: 2 }).applied, true);
  assert.equal(applyStatus(virus, { type: "silence", duration: 1 }).applied, true);
});

test("Infectious Affinity (RAGE): every landed basic attack poisons, and Cough's poison is guaranteed", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", hp: 4, x: 0, y: 0 }, // raging
      { id: "p2-a", player: 2, type: "swordsman", hp: 25, x: 1, y: 0 },
      { id: "p2-b", player: 2, type: "swordsman", hp: 25, x: 4, y: 0 }
    ]
  });
  const virus = findUnit(state, "p1-virus");
  assert.ok(isRaging(virus));
  assert.deepEqual(getGuaranteedStatuses(virus), new Set(["poison"]));

  // A non-crit melee still poisons while raging.
  const opened = begin(state, "p1-virus");
  const hit = applyCommand(opened, attack(1, "p1-virus", "p2-a", NORMAL_HIT));
  assert.ok(hit.accepted, hit.errorCode);
  assert.ok(findUnit(hit.nextState, "p2-a").statuses.some((s) => s.type === "poison"), "rage poisons every hit");

  // Cough's poison lands even on a failing effect roll (guaranteed while raging).
  const opened2 = begin(state, "p1-virus");
  const cough = applyCommand(opened2, useArt(1, "p1-virus", "cough", { targetId: "p2-b", ...NORMAL_NOPOISON }));
  assert.ok(cough.accepted, cough.errorCode);
  assert.ok(findUnit(cough.nextState, "p2-b").statuses.some((s) => s.type === "poison"), "raging Cough poison is guaranteed");
});

test("Spread radius grows by 1 while Virus rages", () => {
  assert.equal(getStatusSpreadConfig({ type: "virus", hp: 25 }).radius, 2);
  assert.equal(getStatusSpreadConfig({ type: "virus", hp: 4 }).radius, 3);
});

test("Explosion (RAGE) detonates poisoned enemies for 10, splashes 5, and consumes Virus", () => {
  const state = createBattleState({
    size: 9,
    units: [
      { id: "p1-virus", player: 1, type: "virus", hp: 4, x: 0, y: 0 }, // raging
      { id: "p1-ally", player: 1, type: "swordsman", hp: 25, x: 0, y: 8 }, // keeps the match alive
      { id: "p2-poison", player: 2, type: "swordsman", hp: 25, x: 4, y: 4, statuses: [poison()] },
      { id: "p2-near", player: 2, type: "swordsman", hp: 25, x: 5, y: 4 },  // 1 tile from a poisoned enemy
      { id: "p2-far", player: 2, type: "swordsman", hp: 25, x: 8, y: 8 }    // out of splash
    ]
  });
  const virus = findUnit(state, "p1-virus");
  assert.ok(getAvailableArts(virus).some((a) => a.id === "explosion"), "rage art is available");

  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "explosion"));
  assert.ok(result.accepted, result.errorCode);
  const next = result.nextState;
  assert.equal(findUnit(next, "p2-poison").hp, 15, "poisoned enemy takes 10 true");
  assert.equal(findUnit(next, "p2-near").hp, 20, "a neighbor of the poisoned enemy takes 5 splash");
  assert.equal(findUnit(next, "p2-far").hp, 25, "a far enemy is untouched");
  assert.equal(findUnit(next, "p1-virus").hp, 0, "Virus is consumed");
});

test("Explosion awards the match to Virus when the sacrifice defeats the last enemy", () => {
  const state = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", hp: 4, x: 0, y: 0 },
      { id: "p2-poison", player: 2, type: "swordsman", hp: 10, x: 4, y: 4, statuses: [poison()] }
    ]
  });

  const opened = begin(state, "p1-virus");
  const result = applyCommand(opened, useArt(1, "p1-virus", "explosion"));
  assert.ok(result.accepted, result.errorCode);
  assert.equal(findUnit(result.nextState, "p2-poison").hp, 0, "the last enemy falls");
  assert.equal(findUnit(result.nextState, "p1-virus").hp, 0, "Virus still pays the sacrifice");
  assert.equal(result.nextState.phase, "complete");
  assert.equal(result.nextState.winner, 1);
});

test("Explosion is unusable with no poisoned enemy, and unusable at full HP", () => {
  const raging = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", hp: 4, x: 0, y: 0 },
      { id: "p2-clean", player: 2, type: "swordsman", hp: 25, x: 3, y: 0 }
    ]
  });
  const openedRaging = begin(raging, "p1-virus");
  assert.equal(applyCommand(openedRaging, useArt(1, "p1-virus", "explosion")).accepted, false,
    "no poisoned enemy → unusable");

  const healthy = createBattleState({
    size: 7,
    units: [
      { id: "p1-virus", player: 1, type: "virus", x: 0, y: 0 },
      { id: "p2-poison", player: 2, type: "swordsman", hp: 25, x: 3, y: 0, statuses: [poison()] }
    ]
  });
  const openedHealthy = begin(healthy, "p1-virus");
  assert.equal(applyCommand(openedHealthy, useArt(1, "p1-virus", "explosion")).accepted, false,
    "not raging → rage-locked");
});

test("Growth refund is read off passive data", () => {
  assert.equal(getPoisonMpRefund({ type: "virus" }), 2);
  assert.equal(getPoisonMpRefund({ type: "swordsman" }), 0);
});
