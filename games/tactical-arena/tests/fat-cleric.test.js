import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, defend, finishActivation, moveUnit, useArt } from "../src/core/commands.js";
import { getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { NEGATIVE_STATUS_TYPES } from "../src/rules/statuses.js";
import { generatePlans, toCommands } from "../src/ai/plans.js";

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// Attacking-style rolls are pinned so deterministic outcomes hold. Focus Prayer's to-hit
// reuses the shared rollToHit: attackRoll ≥ miss-chance hits, below it misses.
const HIT = { attackRoll: 0.5, critRoll: 0.99 };
const MISS = { attackRoll: 0.01, critRoll: 0.99 };

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

test("Fat Cleric is registered with her support stat block", () => {
  const def = getUnitType("fat-cleric");
  assert.equal(def.name, "Fat Cleric");
  assert.equal(def.classType, "support");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 4, strength: 7, defense: 6, maxHp: 30, maxMp: 35 });
});

// --- Snack Break ------------------------------------------------------------

test("Snack Break: defending WITHOUT moving restores 1 HP and 1 MP", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 20, mp: 20 }]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  const res = run(s, defend(1, "fc"));
  assert.equal(findUnit(res.nextState, "fc").hp, 21, "+1 HP");
  assert.equal(findUnit(res.nextState, "fc").mp, 21, "+1 MP");
  assert.ok(res.events.some((e) => e.type === "SNACK_BREAK" && e.unitId === "fc"));
});

test("Snack Break: does NOT trigger if she moved first", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 20, mp: 20 },
    { id: "e", type: "swordsman", player: 2, x: 11, y: 11 }
  ]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  s = run(s, moveUnit(1, "fc", 5, 6)).nextState;
  const res = run(s, defend(1, "fc"));
  assert.equal(findUnit(res.nextState, "fc").hp, 20, "no HP restore after moving");
  assert.equal(findUnit(res.nextState, "fc").mp, 20, "no MP restore after moving");
  assert.ok(!res.events.some((e) => e.type === "SNACK_BREAK"));
});

test("Snack Break: never exceeds max HP/MP", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 30, mp: 35 }]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  const res = run(s, defend(1, "fc"));
  assert.equal(findUnit(res.nextState, "fc").hp, 30);
  assert.equal(findUnit(res.nextState, "fc").mp, 35);
  assert.ok(!res.events.some((e) => e.type === "SNACK_BREAK"), "no event when nothing was restored");
});

// --- Hope -------------------------------------------------------------------

test("Hope: heals the Cleric and allies within 3 by a rolled 1–4 value", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 10, mp: 20 },
    { id: "near", type: "swordsman", player: 1, x: 5, y: 7, hp: 5 }, // dist 2 (in radius)
    { id: "far", type: "swordsman", player: 1, x: 5, y: 10, hp: 5 } // dist 5 (out of radius)
  ]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  // effectRoll 0.99 → 1 + floor(0.99 * 4) = 4 across the board.
  const res = run(s, useArt(1, "fc", "hope", { effectRoll: 0.99 }));
  assert.equal(findUnit(res.nextState, "fc").hp, 14, "Cleric heals herself (10 → 14)");
  assert.equal(findUnit(res.nextState, "near").hp, 9, "an ally within 3 heals (5 → 9)");
  assert.equal(findUnit(res.nextState, "far").hp, 5, "an ally beyond 3 is untouched");
  assert.equal(findUnit(res.nextState, "fc").mp, 17, "3 MP spent");
});

test("Hope: the rolled amount tracks the effectRoll (low roll heals less)", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 10, mp: 20 }]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  // effectRoll 0 → 1 + floor(0) = 1.
  const res = run(s, useArt(1, "fc", "hope", { effectRoll: 0 }));
  assert.equal(findUnit(res.nextState, "fc").hp, 11, "minimum roll heals 1");
});

// --- Cleanse ----------------------------------------------------------------

test("Cleanse: strips negative statuses from an ally but keeps friendly buffs", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, mp: 20 },
    {
      id: "ally", type: "swordsman", player: 1, x: 6, y: 5, statuses: [
        { type: "poison", duration: "permanent" },
        { type: "slow", duration: 3, statModifiers: { moveRange: -1 } },
        { type: "empowered", duration: 2, statModifiers: { attackRange: 1 } }
      ]
    }
  ]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  const res = run(s, useArt(1, "fc", "cleanse", { targetId: "ally" }));
  assert.deepEqual(findUnit(res.nextState, "ally").statuses.map((x) => x.type), ["empowered"], "only the buff survives");
  assert.ok(res.events.find((e) => e.type === "ART_RESOLVED").cleansed.includes("ally"));
  assert.equal(findUnit(res.nextState, "fc").mp, 12, "8 MP spent");
});

test("Cleanse: cannot target self or an enemy", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, mp: 20 },
    { id: "enemy", type: "swordsman", player: 2, x: 6, y: 5, statuses: [{ type: "poison", duration: "permanent" }] }
  ]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  assert.equal(applyCommand(s, useArt(1, "fc", "cleanse", { targetId: "fc" })).accepted, false, "no self-cast");
  assert.equal(applyCommand(s, useArt(1, "fc", "cleanse", { targetId: "enemy" })).accepted, false, "no enemy target");
});

// --- Focus Prayer -----------------------------------------------------------

test("Focus Prayer: a landed prayer restores 5 HP to an ally", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, mp: 20 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 5, hp: 10 }
  ]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  const res = run(s, useArt(1, "fc", "focus-prayer", { targetId: "ally", ...HIT }));
  assert.equal(findUnit(res.nextState, "ally").hp, 15, "5 HP restored on a hit");
  assert.equal(findUnit(res.nextState, "fc").mp, 15, "5 MP spent");
});

test("Focus Prayer: a MISS backfires and inflicts a random negative status on the ally", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, mp: 20 },
    { id: "ally", type: "swordsman", player: 1, x: 6, y: 5, hp: 10 }
  ]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  // effectRoll 0 → picks NEGATIVE_STATUS_TYPES[0] === "blind".
  const res = run(s, useArt(1, "fc", "focus-prayer", { targetId: "ally", ...MISS, effectRoll: 0 }));
  assert.equal(findUnit(res.nextState, "ally").hp, 10, "no healing on a miss");
  const statuses = findUnit(res.nextState, "ally").statuses.map((x) => x.type);
  assert.deepEqual(statuses, [NEGATIVE_STATUS_TYPES[0]], "the botched prayer inflicts the seeded status");
  const ev = res.events.find((e) => e.type === "ART_RESOLVED");
  assert.equal(ev.effect.applied, true);
  assert.ok(!("hit" in ev), "Focus Prayer is not a rolled strike event (routes to the instant path)");
});

test("Focus Prayer: the misfire status is weighted — stun sits only in a narrow high-roll band", () => {
  const cast = (effectRoll) => {
    const state = scenario([
      { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, mp: 20 },
      { id: "ally", type: "swordsman", player: 1, x: 6, y: 5, hp: 10 }
    ]);
    const s = run(state, beginActivation(1, "fc")).nextState;
    const res = run(s, useArt(1, "fc", "focus-prayer", { targetId: "ally", ...MISS, effectRoll }));
    return findUnit(res.nextState, "ally").statuses.map((x) => x.type)[0];
  };
  // pool weights blind/silence/poison/slow = 3 each, stun = 1 (total 13): stun only in the
  // top 1/13 ≈ 7.7% of the roll range, so a mid-high roll lands the common slow instead.
  assert.equal(cast(0.99), "stun", "a roll in the narrow top band backfires as the rare stun");
  assert.equal(cast(0.80), "slow", "a mid-high roll lands a common negative, not stun");
  assert.equal(cast(0), "blind", "the low end lands the first weighted entry");
});

test("Focus Prayer: cannot target self", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 10, mp: 20 }]);
  let s = run(state, beginActivation(1, "fc")).nextState;
  assert.equal(applyCommand(s, useArt(1, "fc", "focus-prayer", { targetId: "fc", ...HIT })).accepted, false);
});

// --- Brothers in Arms -------------------------------------------------------

test("Brothers in Arms: dormant without the full fat family on her team", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5 },
    { id: "fk", type: "fat-knight", player: 1, x: 6, y: 5 },
    { id: "fw", type: "fat-wizard", player: 1, x: 7, y: 5 }
    // no Fat Bowman → the synergy is not active yet
  ]);
  const stats = getEffectiveStats(findUnit(state, "fc"), state);
  assert.equal(stats.moveRange, 2, "no +1 MOVE without the whole family");
  assert.equal(stats.defense, 6, "no +1 DEF without the whole family");
  // The passive requires all three siblings, so it lights up once Fat Bowman exists.
  const passive = getUnitType("fat-cleric").arts.find((a) => a.id === "brothers-in-arms");
  assert.deepEqual([...passive.effect.requiredTypes].sort(), ["fat-bowman", "fat-knight", "fat-wizard"]);
});

// --- Emergency Snacks (RAGE) ------------------------------------------------

test("Emergency Snacks: regains 1 HP at turn start while raging, +5 MP when it lifts her over the threshold", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 5, mp: 10 }]);
  const res = run(state, beginActivation(1, "fc"));
  const fc = findUnit(res.nextState, "fc");
  assert.equal(fc.hp, 6, "+1 HP at the start of a raging turn");
  assert.equal(fc.mp, 15, "+5 MP for crossing back above 5 HP");
  assert.equal(fc.emergencySnackCount, 1, "one proc counted");
  assert.ok(res.events.some((e) => e.type === "EMERGENCY_SNACK" && e.unitId === "fc"));
});

test("Emergency Snacks: no MP bonus when the heal keeps her at or below the threshold", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 3, mp: 10 }]);
  const res = run(state, beginActivation(1, "fc"));
  const fc = findUnit(res.nextState, "fc");
  assert.equal(fc.hp, 4, "+1 HP (still ≤5)");
  assert.equal(fc.mp, 10, "no MP bonus while still raging");
});

test("Emergency Snacks: stops after 3 procs in a battle", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 4, mp: 10, emergencySnackCount: 3 }]);
  const res = run(state, beginActivation(1, "fc"));
  const fc = findUnit(res.nextState, "fc");
  assert.equal(fc.hp, 4, "no more regen once the 3-proc cap is spent");
  assert.equal(fc.emergencySnackCount, 3, "count is untouched at the cap");
  assert.ok(!res.events.some((e) => e.type === "EMERGENCY_SNACK"));
});

test("Emergency Snacks: does not trigger when she is not raging", () => {
  const state = scenario([{ id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, hp: 20, mp: 10 }]);
  const res = run(state, beginActivation(1, "fc"));
  assert.equal(findUnit(res.nextState, "fc").hp, 20, "healthy Cleric does not self-heal");
  assert.equal(findUnit(res.nextState, "fc").emergencySnackCount, 0);
});

// --- assets / VFX / AI ------------------------------------------------------

test("Fat Cleric's active ARTS all register a VFX recipe", () => {
  assert.equal(getAbilityVfx("hope").type, "healPulse");
  assert.equal(getAbilityVfx("cleanse").type, "projectileFan");
  assert.equal(getAbilityVfx("focus-prayer").type, "healPulse");
});

test("CPU: Fat Cleric's support plans (Hope/Cleanse/Focus Prayer) replay cleanly", () => {
  const state = scenario([
    { id: "fc", type: "fat-cleric", player: 1, x: 5, y: 5, mp: 35 },
    { id: "hurt", type: "swordsman", player: 1, x: 6, y: 5, hp: 8, statuses: [{ type: "poison", duration: "permanent" }] },
    { id: "e", type: "archer", player: 2, x: 8, y: 8 }
  ]);
  const plans = generatePlans(state, findUnit(state, "fc"));
  assert.ok(plans.some((p) => p.primary.artId === "hope"), "expected a Hope plan (wounded ally in reach)");
  assert.ok(plans.some((p) => p.primary.artId === "cleanse" && p.primary.targetId === "hurt"), "expected a Cleanse plan on the poisoned ally");
  assert.ok(plans.some((p) => p.primary.artId === "focus-prayer" && p.primary.targetId === "hurt"), "expected a Focus Prayer plan on the wounded ally");
  for (const plan of plans) {
    let s = state;
    for (const command of toCommands(1, plan)) {
      const result = applyCommand(s, command);
      assert.ok(result.accepted, `${plan.primary.artId ?? plan.primary.kind} → ${command.type} rejected (${result.errorCode})`);
      s = result.nextState;
    }
  }
});
