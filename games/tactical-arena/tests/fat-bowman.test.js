import test from "node:test";
import assert from "node:assert/strict";

import { attack, beginActivation, cancelMove, defend, moveUnit, useArt } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

const HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

function resetTurn(state, player = 1) {
  state.currentPlayer = player;
  state.activation = null;
  for (const unit of state.units) if (unit.player === player) unit.spent = false;
  return state;
}

test("Fat Bowman is registered with her ranger stat block and arts", () => {
  const def = getUnitType("fat-bowman");
  assert.equal(def.name, "Fat Bowman");
  assert.equal(def.glyph, "🏹");
  assert.equal(def.classType, "ranger");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 4, strength: 7, defense: 5, maxHp: 30, maxMp: 25 });
  assert.deepEqual(def.arts.map((art) => art.id), ["curve-shot", "dragonsbane", "planted", "brothers-in-arms"]);
});

test("Heavy Handed scales physical shot damage by distance and effective range", () => {
  for (const [targetId, distance, expectedDamage] of [["near", 1, 2], ["two", 2, 3], ["three", 3, 4], ["far", 4, 5]]) {
    const testState = scenario([
      { id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0 },
      { id: targetId, type: "swordsman", player: 2, x: distance, y: 0 }
    ]);
    let s = run(testState, beginActivation(1, "fb")).nextState;
    const result = run(s, attack(1, "fb", targetId, HIT));
    assert.equal(findUnit(result.nextState, targetId).hp, 25 - expectedDamage, targetId);
  }

  const buffed = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0, statModifiers: { attackRange: 1 } },
    { id: "five", type: "swordsman", player: 2, x: 5, y: 0 }
  ]);
  let s = run(buffed, beginActivation(1, "fb")).nextState;
  const result = run(s, attack(1, "fb", "five", HIT));
  assert.equal(findUnit(result.nextState, "five").hp, 19, "range 5 grants +3 damage, plus first-turn Planted");
});

test("Curve Shot is a normal piercing attack that can shoot past units", () => {
  const state = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0, mp: 25 },
    { id: "blocker", type: "swordsman", player: 1, x: 1, y: 0 },
    { id: "target", type: "swordsman", player: 2, x: 3, y: 0 }
  ]);

  let s = run(state, beginActivation(1, "fb")).nextState;
  assert.equal(applyCommand(s, attack(1, "fb", "target", HIT)).accepted, false, "basic shot is blocked");

  const result = run(s, useArt(1, "fb", "curve-shot", { targetId: "target", ...HIT }));
  assert.equal(findUnit(result.nextState, "target").hp, 21, "7 STR + 1 Planted - 5 DEF + 1 Heavy Handed");
  assert.equal(findUnit(result.nextState, "fb").mp, 22);
});

test("Dragonsbane uses Fat Bowman's effective range and rolls poison twice, with crit guaranteed", () => {
  const state = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0, mp: 25, statModifiers: { attackRange: 1 } },
    { id: "target", type: "swordsman", player: 2, x: 5, y: 0 }
  ]);
  let s = run(state, beginActivation(1, "fb")).nextState;
  let result = run(s, useArt(1, "fb", "dragonsbane", {
    targetId: "target",
    attackRoll: 0.5,
    critRoll: 0.99,
    effectRoll: 0.9,
    effectRoll2: 0.2
  }));
  assert.deepEqual(findUnit(result.nextState, "target").statuses.map((status) => status.type), ["poison"]);
  assert.equal(findUnit(result.nextState, "fb").mp, 20);

  const critState = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0, mp: 25 },
    { id: "target", type: "swordsman", player: 2, x: 4, y: 0 }
  ]);
  s = run(critState, beginActivation(1, "fb")).nextState;
  result = run(s, useArt(1, "fb", "dragonsbane", { targetId: "target", ...CRIT, effectRoll: 0.99, effectRoll2: 0.99 }));
  assert.deepEqual(findUnit(result.nextState, "target").statuses.map((status) => status.type), ["poison"]);
  assert.equal(result.events[0].effect.guaranteed, true);
});

test("Planted gains +1 STR per stationary turn up to +4, then resets after a confirmed move", () => {
  const state = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 5, y: 5 },
    { id: "idle", type: "swordsman", player: 1, x: 2, y: 2 },
    { id: "e", type: "swordsman", player: 2, x: 9, y: 9 }
  ]);

  let s = state;
  for (let expected = 1; expected <= 4; expected += 1) {
    s = resetTurn(s);
    s = run(s, beginActivation(1, "fb")).nextState;
    assert.equal(getEffectiveStats(findUnit(s, "fb"), s).strength, 7 + expected);
    s = run(s, defend(1, "fb")).nextState;
  }
  s = resetTurn(s);
  s = run(s, beginActivation(1, "fb")).nextState;
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).strength, 11, "cap stays at +4");

  s = run(s, moveUnit(1, "fb", 5, 6)).nextState;
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).strength, 7, "moving clears the current planted bonus");
  s = run(s, defend(1, "fb")).nextState;
  s = resetTurn(s);
  s = run(s, beginActivation(1, "fb")).nextState;
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).strength, 8, "stationary count restarts at +1 next turn");
});

test("Planted strength is restored when Fat Bowman cancels her move", () => {
  const state = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 5, y: 5, stationaryStrength: 2 },
    { id: "e", type: "swordsman", player: 2, x: 9, y: 9 }
  ]);

  let s = run(state, beginActivation(1, "fb")).nextState;
  assert.equal(findUnit(s, "fb").stationaryStrength, 3);
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).strength, 10);

  s = run(s, moveUnit(1, "fb", 5, 6)).nextState;
  assert.equal(findUnit(s, "fb").stationaryStrength, 0);
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).strength, 7);

  const res = run(s, cancelMove(1, "fb"));
  assert.deepEqual(findUnit(res.nextState, "fb").position, { x: 5, y: 5 });
  assert.equal(findUnit(res.nextState, "fb").stationaryStrength, 3);
  assert.equal(getEffectiveStats(findUnit(res.nextState, "fb"), res.nextState).strength, 10);
});

test("Brothers in Arms grants +1 range with the full fat family on her team", () => {
  const state = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 5, y: 5 },
    { id: "fk", type: "fat-knight", player: 1, x: 6, y: 5 },
    { id: "fw", type: "fat-wizard", player: 1, x: 7, y: 5 },
    { id: "fc", type: "fat-cleric", player: 1, x: 8, y: 5 }
  ]);
  assert.equal(getEffectiveStats(findUnit(state, "fb"), state).attackRange, 5);
});

test("Desperation Shot empowers one shot, then Fat Bowman skips her next turn until rage is re-entered", () => {
  const state = scenario([
    { id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0, hp: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 6 },
    { id: "target", type: "swordsman", player: 2, x: 5, y: 0 }
  ]);

  let s = run(state, beginActivation(1, "fb")).nextState;
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).attackRange, 5);
  const result = run(s, attack(1, "fb", "target", HIT));
  assert.equal(findUnit(result.nextState, "target").hp, 15, "+4 STR, +1 range, and first-turn Planted apply to the shot");
  assert.equal(findUnit(result.nextState, "fb").desperationShotSpent, true);
  assert.equal(findUnit(result.nextState, "fb").skipNextActivation, true);

  s = resetTurn(result.nextState);
  const skipped = run(s, beginActivation(1, "fb"));
  assert.equal(findUnit(skipped.nextState, "fb").spent, true, "next turn is auto-spent");
  assert.ok(skipped.events.some((event) => event.type === "DESPERATION_EXHAUSTED"));

  const fb = findUnit(skipped.nextState, "fb");
  fb.hp = 6;
  s = resetTurn(skipped.nextState);
  s = run(s, beginActivation(1, "fb")).nextState;
  findUnit(s, "fb").hp = 5;
  s = resetTurn(s);
  s = run(s, beginActivation(1, "fb")).nextState;
  assert.equal(findUnit(s, "fb").desperationShotSpent, false, "leaving and re-entering rage restores the shot");
  assert.equal(getEffectiveStats(findUnit(s, "fb"), s).attackRange, 5);
});

test("Fat Bowman's active ARTS register VFX recipes", () => {
  assert.equal(getAbilityVfx("curve-shot").type, "statusStrike");
  assert.equal(getAbilityVfx("dragonsbane").type, "statusStrike");
});
