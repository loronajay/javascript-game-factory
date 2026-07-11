import test from "node:test";
import assert from "node:assert/strict";

import { attack, beginActivation, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getArtMpCost, getEffectiveStats, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };
const MISS = { attackRoll: 0.01, critRoll: 0.99 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.equal(result.accepted, true, `${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(extraUnits = [], big = {}) {
  return createBattleState({
    size: 9,
    seed: 23,
    units: [
      { id: "big", player: 1, type: "big-brother", x: 4, y: 4, ...big },
      ...extraUnits
    ]
  });
}

test("Big Brother is registered as a tank with the authored stat block", () => {
  const def = getUnitType("big-brother");
  assert.equal(def.name, "Big Brother");
  assert.equal(def.classType, "tank");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 3, strength: 2, defense: 8, maxHp: 30, maxMp: 5 });
  assert.deepEqual(def.arts.filter((art) => art.kind === "active").map((art) => art.id), [
    "force-tug",
    "force-push",
    "polarity-shift",
    "recharge"
  ]);
});

test("Pissing Contest grants +1 STR while any living Little Brother is in play", () => {
  const withLittle = scenario([{ id: "little", player: 2, type: "little-brother", x: 0, y: 0 }]);
  assert.equal(getEffectiveStats(findUnit(withLittle, "big"), withLittle).strength, 3);

  const defeatedLittle = scenario([{ id: "little", player: 1, type: "little-brother", x: 0, y: 0, hp: 0 }]);
  assert.equal(getEffectiveStats(findUnit(defeatedLittle, "big"), defeatedLittle).strength, 2);
});

test("Super Magnet basic attacks require an 8-way ray and deal true non-crit damage", () => {
  const state = scenario([
    { id: "diag", player: 2, type: "swordsman", x: 6, y: 6 },
    { id: "off", player: 2, type: "swordsman", x: 6, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "big")).nextState;

  const offRay = applyCommand(s, attack(1, "big", "off", NORMAL_HIT));
  assert.equal(offRay.accepted, false, "off-ray basic attack should be illegal");

  const result = run(s, attack(1, "big", "diag", CRIT));
  const target = findUnit(result.nextState, "diag");
  assert.equal(target.hp, getUnitType("swordsman").stats.maxHp - 2, "crit does not add bonus damage");
  assert.deepEqual(target.position, { x: 5, y: 5 }, "crit pulls the target adjacent");
  assert.equal(target.statuses.some((status) => status.type === "stun" && status.duration === 1), true);
});

test("Force Tug is a normal range-3 targeted attack that slows, or stuns on crit", () => {
  const normal = scenario([{ id: "off", player: 2, type: "swordsman", x: 6, y: 5 }]);
  let s = run(normal, beginActivation(1, "big")).nextState;
  let result = run(s, useArt(1, "big", "force-tug", { targetId: "off", ...NORMAL_HIT, effectRoll: 0.1 }));
  assert.equal(findUnit(result.nextState, "off").hp, getUnitType("swordsman").stats.maxHp - 2);
  assert.equal(findUnit(result.nextState, "off").statuses.some((status) => status.type === "slow"), true);
  assert.equal(findUnit(result.nextState, "big").mp, 0);

  const crit = scenario([
    { id: "ally", player: 1, type: "swordsman", x: 0, y: 0 },
    { id: "off", player: 2, type: "swordsman", x: 6, y: 5 }
  ]);
  s = run(crit, beginActivation(1, "big")).nextState;
  result = run(s, useArt(1, "big", "force-tug", { targetId: "off", ...CRIT, effectRoll: 0.1 }));
  const target = findUnit(result.nextState, "off");
  assert.equal(target.statuses.some((status) => status.type === "stun" && status.duration === 1), true);
  assert.equal(target.statuses.some((status) => status.type === "slow"), false);
});

test("Force Tug miss spends MP but does not damage or roll the status", () => {
  const state = scenario([{ id: "target", player: 2, type: "swordsman", x: 6, y: 5 }]);
  let s = run(state, beginActivation(1, "big")).nextState;
  s = run(s, useArt(1, "big", "force-tug", { targetId: "target", ...MISS, effectRoll: 0.01 })).nextState;

  assert.equal(findUnit(s, "target").hp, getUnitType("swordsman").stats.maxHp);
  assert.deepEqual(findUnit(s, "target").statuses, []);
  assert.equal(findUnit(s, "big").mp, 0);
});

test("Force Push shoves nearby allies and enemies, and blocked units take 2 true damage", () => {
  const state = scenario([
    { id: "ally", player: 1, type: "swordsman", x: 5, y: 4 },
    { id: "enemy", player: 2, type: "archer", x: 4, y: 5 },
    { id: "blocked", player: 2, type: "archer", x: 3, y: 4 }
  ]);
  state.tileObjects["2,4"] = { kind: "wall", hp: 1 };

  let s = run(state, beginActivation(1, "big")).nextState;
  s = run(s, useArt(1, "big", "force-push")).nextState;

  assert.deepEqual(findUnit(s, "ally").position, { x: 6, y: 4 });
  assert.deepEqual(findUnit(s, "enemy").position, { x: 4, y: 6 });
  assert.equal(findUnit(s, "blocked").hp, getUnitType("archer").stats.maxHp - 2);
});

test("Polarity Shift swaps HP restores and MP restores until shifted back", () => {
  const state = scenario([
    { id: "mystic", player: 1, type: "mystic", x: 1, y: 1 },
    { id: "ally", player: 1, type: "swordsman", x: 1, y: 2, hp: 10, mp: 0 },
    { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
  ]);

  let s = run(state, beginActivation(1, "big")).nextState;
  s = run(s, useArt(1, "big", "polarity-shift")).nextState;
  assert.equal(s.restorePolarityShift, true);

  s = run(s, beginActivation(1, "mystic")).nextState;
  s = run(s, useArt(1, "mystic", "pray")).nextState;
  const ally = findUnit(s, "ally");
  assert.equal(ally.hp, 10, "Pray no longer restores HP while shifted");
  assert.equal(ally.mp, 3, "Pray restores MP instead");
});

test("Magnetic Field blocks healing on adjacent units but not Big Brother himself", () => {
  const state = scenario([
    { id: "mystic", player: 1, type: "mystic", x: 1, y: 1 },
    { id: "near", player: 1, type: "swordsman", x: 5, y: 4, hp: 10 },
    { id: "far", player: 1, type: "swordsman", x: 1, y: 2, hp: 10 },
    { id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }
  ], { hp: 10 });

  let s = run(state, beginActivation(1, "mystic")).nextState;
  s = run(s, useArt(1, "mystic", "wish")).nextState;

  assert.equal(findUnit(s, "big").hp, 11, "Big Brother can still be healed");
  assert.equal(findUnit(s, "near").hp, 10, "adjacent units cannot be healed");
  assert.equal(findUnit(s, "far").hp, 11);
});

test("Recharge restores MP, or heals and grants next-turn move at full MP, and bypasses Polarity Shift", () => {
  const lowMp = scenario([], { mp: 0 });
  let s = run(lowMp, beginActivation(1, "big")).nextState;
  s.restorePolarityShift = true;
  s = run(s, useArt(1, "big", "recharge")).nextState;
  assert.equal(findUnit(s, "big").mp, 5, "Big Brother Recharge ignores Polarity Shift");

  const full = scenario([{ id: "foe", player: 2, type: "swordsman", x: 8, y: 8 }], { mp: 5, hp: 20 });
  s = run(full, beginActivation(1, "big")).nextState;
  s = run(s, useArt(1, "big", "recharge")).nextState;
  const big = findUnit(s, "big");
  assert.equal(big.hp, 21);
  assert.equal(big.statuses.some((status) => status.type === "empowered" && status.statModifiers.moveRange === 1), true);
});

test("Rogue Mech grants +3 STR, +1 move, and free arts while raging", () => {
  const state = scenario([{ id: "target", player: 2, type: "swordsman", x: 6, y: 5 }], { hp: 5, mp: 0 });
  const big = findUnit(state, "big");
  assert.equal(isRaging(big), true);
  const stats = getEffectiveStats(big, state);
  assert.equal(stats.strength, 5);
  assert.equal(stats.moveRange, 3);
  assert.equal(getArtMpCost(big, getUnitType("big-brother").arts.find((art) => art.id === "force-tug"), state), 0);

  let s = run(state, beginActivation(1, "big")).nextState;
  s = run(s, useArt(1, "big", "force-tug", { targetId: "target", ...NORMAL_HIT, effectRoll: 0.99 })).nextState;
  assert.equal(findUnit(s, "big").mp, 0);
});

test("Big Brother active arts register VFX recipes", () => {
  for (const artId of ["force-tug", "force-push", "polarity-shift", "recharge"]) {
    assert.ok(getAbilityVfx(artId), `${artId} has VFX`);
  }
});
