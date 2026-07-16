import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, useArt, defend, finishActivation, attack } from "../src/core/commands.js";
import { getEffectiveStats, getUnitType, isRaging } from "../src/core/unitCatalog.js";
import { statusImmunities } from "../src/rules/statuses.js";
import { ERR } from "../src/core/reducerResult.js";

// Deterministic combat rolls where a test asserts a damage outcome.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// A small custom board: Father Time (p1) plus an ally and enemies at chosen tiles.
function scenario(overrides = {}) {
  return createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-ft", type: "father-time", player: 1, x: 5, y: 5, ...overrides.ft },
      { id: "p1-ally", type: "swordsman", player: 1, x: 5, y: 6, ...overrides.ally },
      { id: "p2-foe", type: "swordsman", player: 2, x: 6, y: 5, ...overrides.foe },
      { id: "p2-far", type: "archer", player: 2, x: 10, y: 10, ...overrides.far }
    ]
  });
}

test("Father Time is registered with its recovered stat block", () => {
  const def = getUnitType("father-time");
  assert.equal(def.name, "Father Time");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 5, strength: 7, defense: 3, maxHp: 25, maxMp: 30 });
});

test("Father of Time makes Father Time immune to Stun and Slow", () => {
  const immune = statusImmunities({ type: "father-time" });
  assert.ok(immune.has("stun"));
  assert.ok(immune.has("slow"));
  assert.ok(!immune.has("blind"));
});

test("Time Steal drains enemies within 2 tiles at the rollover and refunds MP", () => {
  // FT alone on p1 so finishing its activation rolls the turn (and fires the tick).
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-ft", type: "father-time", player: 1, x: 5, y: 5, mp: 20 }, // below max so the refund shows
      { id: "p2-near", type: "swordsman", player: 2, x: 6, y: 5 },   // distance 1 — burned
      { id: "p2-edge", type: "swordsman", player: 2, x: 7, y: 7 },   // distance 2 — burned
      { id: "p2-out", type: "archer", player: 2, x: 9, y: 9 }        // distance 4 — safe
    ]
  });
  let r = run(state, beginActivation(1, "p1-ft"));
  r = run(r.nextState, defend(1, "p1-ft"));
  r = run(r.nextState, finishActivation(1, "p1-ft"));
  const next = r.nextState;

  assert.equal(findUnit(next, "p2-near").hp, 24); // 25 - 1 true
  assert.equal(findUnit(next, "p2-edge").hp, 24);
  assert.equal(findUnit(next, "p2-out").hp, getUnitType("archer").stats.maxHp); // out of radius — untouched
  assert.equal(findUnit(next, "p1-ft").mp, 22);   // 20 + 1 MP per point dealt (2 dealt)

  const steals = r.events.filter((e) => e.type === "TIME_STEAL");
  assert.equal(steals.length, 2);
  assert.ok(r.events.some((e) => e.type === "TIME_STEAL_MP" && e.mpGained === 2));
});

test("Age grants an ally +1 STR until Father Time is defeated", () => {
  const state = scenario();
  const baseStr = getEffectiveStats(findUnit(state, "p1-ally"), state).strength;
  let r = run(state, beginActivation(1, "p1-ft"));
  r = run(r.nextState, useArt(1, "p1-ft", "age", { targetId: "p1-ally", stat: "strength" }));
  let s = r.nextState;

  assert.equal(getEffectiveStats(findUnit(s, "p1-ally"), s).strength, baseStr + 1);
  assert.equal(findUnit(s, "p1-ft").mp, getUnitType("father-time").stats.maxMp - 5); // MP spent

  // Persists — a fresh clone still carries it.
  const r2 = run(s, beginActivation(1, "p1-ally"));
  assert.equal(getEffectiveStats(findUnit(r2.nextState, "p1-ally"), r2.nextState).strength, baseStr + 1);

  // Auto-expires the instant Father Time falls (no cleanup path).
  s = r.nextState;
  findUnit(s, "p1-ft").hp = 0;
  assert.equal(getEffectiveStats(findUnit(s, "p1-ally"), s).strength, baseStr);
});

test("Age targets within 4 tiles, not Father Time's full attack range", () => {
  const edge = scenario({ ally: { x: 9, y: 5 } }); // distance 4
  let r = run(edge, beginActivation(1, "p1-ft"));
  r = run(r.nextState, useArt(1, "p1-ft", "age", { targetId: "p1-ally", stat: "strength" }));
  assert.equal(findUnit(r.nextState, "p1-ft").mp, getUnitType("father-time").stats.maxMp - 5);

  const tooFar = scenario({ ally: { x: 10, y: 5 } }); // distance 5
  let r2 = run(tooFar, beginActivation(1, "p1-ft"));
  const denied = applyCommand(r2.nextState, useArt(1, "p1-ft", "age", { targetId: "p1-ally", stat: "strength" }));
  assert.ok(!denied.accepted);
  assert.equal(denied.errorCode, ERR.TARGET_OUT_OF_RANGE);
});

test("Age drains an enemy's DEF (defaulting to STR when no stat is given)", () => {
  const state = scenario();
  const baseDef = getEffectiveStats(findUnit(state, "p2-foe"), state).defense;
  let r = run(state, beginActivation(1, "p1-ft"));
  r = run(r.nextState, useArt(1, "p1-ft", "age", { targetId: "p2-foe", stat: "defense" }));
  const s = r.nextState;
  assert.equal(getEffectiveStats(findUnit(s, "p2-foe"), s).defense, baseDef - 1);

  // A command with no `stat` still resolves (defaults to strength), never rejects.
  const state2 = scenario();
  let r2 = run(state2, beginActivation(1, "p1-ft"));
  r2 = run(r2.nextState, useArt(1, "p1-ft", "age", { targetId: "p2-foe" }));
  const baseFoeStr = getEffectiveStats(findUnit(state2, "p2-foe"), state2).strength;
  assert.equal(getEffectiveStats(findUnit(r2.nextState, "p2-foe"), r2.nextState).strength, baseFoeStr - 1);
});

test("Time Stretch hastes an ally (+1 MOVE, 1 turn) and slows an enemy", () => {
  const state = scenario();
  const allyMove = getEffectiveStats(findUnit(state, "p1-ally"), state).moveRange;
  let r = run(state, beginActivation(1, "p1-ft"));
  r = run(r.nextState, useArt(1, "p1-ft", "time-stretch", { targetId: "p1-ally" }));
  let s = r.nextState;
  assert.equal(getEffectiveStats(findUnit(s, "p1-ally"), s).moveRange, allyMove + 1);
  assert.ok(findUnit(s, "p1-ally").statuses.some((st) => st.type === "empowered"));

  const state2 = scenario();
  const foeMove = getEffectiveStats(findUnit(state2, "p2-foe"), state2).moveRange;
  let r2 = run(state2, beginActivation(1, "p1-ft"));
  r2 = run(r2.nextState, useArt(1, "p1-ft", "time-stretch", { targetId: "p2-foe" }));
  const s2 = r2.nextState;
  assert.equal(getEffectiveStats(findUnit(s2, "p2-foe"), s2).moveRange, foeMove - 1);
  assert.ok(findUnit(s2, "p2-foe").statuses.some((st) => st.type === "slow"));
});

test("Rewind is rage-locked, then revives a fallen ally at full HP with MP untouched", () => {
  // Not raging → Rewind is unavailable.
  const healthy = scenario({ ally: { hp: 0, mp: 3 } });
  let r = run(healthy, beginActivation(1, "p1-ft"));
  const denied = applyCommand(r.nextState, useArt(1, "p1-ft", "rewind", { targetId: "p1-ally", targetPosition: { x: 4, y: 5 } }));
  assert.ok(!denied.accepted);
  assert.equal(denied.errorCode, "ART_NOT_AVAILABLE");

  // Raging (hp ≤ 5) + 20 MP → the fallen ally returns. Foe pushed out of Time Steal
  // range so the rollover's MP refund doesn't muddy the "20 MP spent" check.
  const raging = scenario({ ft: { hp: 4, mp: 20 }, ally: { hp: 0, mp: 3 }, foe: { x: 11, y: 5 } });
  let r2 = run(raging, beginActivation(1, "p1-ft"));
  r2 = run(r2.nextState, useArt(1, "p1-ft", "rewind", { targetId: "p1-ally", targetPosition: { x: 4, y: 5 } }));
  const s = r2.nextState;
  const revived = findUnit(s, "p1-ally");
  assert.equal(revived.hp, getUnitType("swordsman").stats.maxHp); // full HP
  assert.equal(revived.mp, 3);                                     // MP NOT restored
  assert.deepEqual(revived.position, { x: 4, y: 5 });              // placed on the chosen tile
  assert.deepEqual(revived.statuses, []);                          // statuses cleared
  assert.equal(revived.spent, true);                              // no bonus activation this round
  assert.equal(findUnit(s, "p1-ft").mp, 0);                        // 20 MP spent (no refund — foe is far)
});

test("Rewind rejects an illegal placement (occupied / out of range)", () => {
  const raging = scenario({ ft: { hp: 4, mp: 20 }, ally: { hp: 0 } });
  let r = run(raging, beginActivation(1, "p1-ft"));
  // Placing on an occupied tile (the enemy's) is illegal.
  const bad = applyCommand(r.nextState, useArt(1, "p1-ft", "rewind", { targetId: "p1-ally", targetPosition: { x: 6, y: 5 } }));
  assert.ok(!bad.accepted);
  // Out of range (radius 3 from FT at 5,5) is illegal too.
  const far = applyCommand(r.nextState, useArt(1, "p1-ft", "rewind", { targetId: "p1-ally", targetPosition: { x: 0, y: 0 } }));
  assert.ok(!far.accepted);
});

test("a raging Father Time really does reach RAGE (Rewind gating sanity)", () => {
  assert.ok(isRaging({ hp: 5 }));
  assert.ok(!isRaging({ hp: 6 }));
});
