import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit, livingUnits } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { generatePlans, toCommands, projectPlan, planMpCost } from "../src/ai/plans.js";

// The headline guarantee: generatePlans only ever yields plans the reducer accepts.
// If this holds, the CPU driver can replay any chosen plan's command stream without a
// mid-activation rejection breaking the turn.

// A rich mid-board skirmish that exercises every intent: melee + footwork, ranged,
// caster (raging → Nuke), healer (wounded allies), necromancer (summon), sniper
// (tile placement), and a Paladin in range of a light-tile enemy (bonus tile pulse).
function skirmish() {
  return createBattleState({
    size: 13,
    seed: 1,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 5, y: 5 },
      { id: "p1-archer", type: "archer", player: 1, x: 4, y: 6 },
      { id: "p1-mystic", type: "mystic", player: 1, x: 3, y: 6, hp: 10 },
      { id: "p1-mage", type: "magician", player: 1, x: 4, y: 7, hp: 5 }, // raging → Nuke
      { id: "p1-paladin", type: "paladin", player: 1, x: 5, y: 7 },
      { id: "p1-necro", type: "necromancer", player: 1, x: 3, y: 7 },
      { id: "p1-sniper", type: "sniper", player: 1, x: 2, y: 7 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 6, y: 5 },
      { id: "p2-archer", type: "archer", player: 2, x: 9, y: 5 },
      { id: "p2-mystic", type: "mystic", player: 2, x: 7, y: 7 },
      { id: "p2-sword2", type: "swordsman", player: 2, x: 7, y: 6 }
    ]
  });
}

function assertPlanReplays(state, player, plan) {
  let s = state;
  for (const command of toCommands(player, plan)) {
    const result = applyCommand(s, command);
    const label = plan.primary.kind === "art" ? `art:${plan.primary.artId}` : plan.primary.kind;
    const bonus = plan.bonus ? `+bonus:${plan.bonus.artId}` : "";
    assert.ok(result.accepted, `${label}${bonus} → ${command.type} rejected (${result.errorCode})`);
    s = result.nextState;
  }
}

test("every generated plan replays cleanly through the reducer", () => {
  const state = skirmish();
  let total = 0;
  for (const unit of livingUnits(state, 1)) {
    const plans = generatePlans(state, unit);
    assert.ok(plans.length > 0, `${unit.id} produced no plans`);
    for (const plan of plans) assertPlanReplays(state, 1, plan);
    total += plans.length;
  }
  assert.ok(total > 30, `expected a broad plan set, got ${total}`);
});

test("every unit always has at least a defend fallback", () => {
  // A lone unit with no enemies anywhere still gets a legal plan.
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 6, y: 6 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 0, y: 0 } // far out of reach
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-sword"));
  assert.ok(plans.some((p) => p.primary.kind === "defend"));
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("an adjacent enemy yields a basic-attack plan", () => {
  const state = skirmish();
  const plans = generatePlans(state, findUnit(state, "p1-sword"));
  assert.ok(plans.some((p) => p.primary.kind === "attack" && p.primary.targetId === "p2-sword"));
});

test("a caster yields targeted ART plans (Spark)", () => {
  const state = skirmish();
  const plans = generatePlans(state, findUnit(state, "p1-mage"));
  assert.ok(plans.some((p) => p.primary.kind === "art" && p.primary.artId === "spark" && p.primary.targetId));
  // raging magician also offers the self-centred Nuke (enemies within radius 3).
  assert.ok(plans.some((p) => p.primary.kind === "art" && p.primary.artId === "nuke"));
});

test("footwork plans are always valid full-length paths", () => {
  const state = skirmish();
  const plans = generatePlans(state, findUnit(state, "p1-sword"))
    .filter((p) => p.primary.kind === "art" && p.primary.artId === "footwork");
  assert.ok(plans.length > 0, "expected at least one footwork plan");
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("the Paladin attaches a bonus tile-pulse variant when it would hit an enemy", () => {
  const state = skirmish();
  const plans = generatePlans(state, findUnit(state, "p1-paladin"));
  assert.ok(plans.some((p) => p.bonus?.artId === "lightseeker"));
  // both the plain and the with-bonus variants must replay legally
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("summon is suppressed only once the Necromancer already has two living Ghouls", () => {
  const state = skirmish();
  // Inject a Ghoul owned by the Necromancer (createBattleState can't set summonerId).
  state.units.push({
    id: "ghoul-1", type: "ghoul", player: 1, position: { x: 4, y: 8 },
    hp: 10, mp: 0, statModifiers: {}, statuses: [], defending: false, spent: true,
    mageChargeCount: 0, summonerId: "p1-necro"
  });
  const plans = generatePlans(state, findUnit(state, "p1-necro"));
  assert.ok(plans.some((p) => p.primary.kind === "art" && p.primary.artId === "summon-ghoul"));

  state.units.push({
    id: "ghoul-2", type: "ghoul", player: 1, position: { x: 5, y: 8 },
    hp: 10, mp: 0, statModifiers: {}, statuses: [], defending: false, spent: true,
    mageChargeCount: 0, summonerId: "p1-necro"
  });
  const cappedPlans = generatePlans(state, findUnit(state, "p1-necro"));
  assert.ok(!cappedPlans.some((p) => p.primary.kind === "art" && p.primary.artId === "summon-ghoul"));
});

test("the Sniper offers legal tile-placement plans (Build Cover / Throw Cigar)", () => {
  const state = skirmish();
  const plans = generatePlans(state, findUnit(state, "p1-sniper"));
  const placements = plans.filter((p) => p.primary.kind === "art" &&
    (p.primary.artId === "build-cover" || p.primary.artId === "throw-cigar"));
  assert.ok(placements.length > 0, "expected placement plans");
  for (const plan of placements) assertPlanReplays(state, 1, plan);
});

test("Father Time offers statBuff / hasten / revive plans that all replay cleanly", () => {
  // A raging Father Time (Rewind unlocked) with a fallen ally and enemies in range.
  const state = createBattleState({
    size: 13, seed: 5,
    units: [
      { id: "p1-ft", type: "father-time", player: 1, x: 5, y: 5, hp: 4, mp: 40 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 5, y: 6 },
      { id: "p1-dead", type: "archer", player: 1, x: 4, y: 6, hp: 0 }, // revivable
      { id: "p2-a", type: "swordsman", player: 2, x: 6, y: 5 },
      { id: "p2-b", type: "mystic", player: 2, x: 7, y: 6 }
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-ft"));
  assert.ok(plans.some((p) => p.primary.artId === "age" && p.primary.stat), "expected an Age plan carrying a stat");
  assert.ok(plans.some((p) => p.primary.artId === "time-stretch"), "expected a Time Stretch plan");
  assert.ok(plans.some((p) => p.primary.artId === "rewind" && p.primary.targetId === "p1-dead" && p.primary.targetPosition),
    "expected a Rewind plan targeting the fallen ally + a tile");
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("a healthy (non-raging) Father Time offers no Rewind plans", () => {
  const state = createBattleState({
    size: 13, seed: 5,
    units: [
      { id: "p1-ft", type: "father-time", player: 1, x: 5, y: 5 },
      { id: "p1-dead", type: "archer", player: 1, x: 4, y: 6, hp: 0 },
      { id: "p2-a", type: "swordsman", player: 2, x: 6, y: 5 }
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-ft"));
  assert.ok(!plans.some((p) => p.primary.artId === "rewind"));
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("projectPlan reduces an attacked enemy's expected HP, and planMpCost sums ART cost", () => {
  const state = skirmish();
  const attackPlan = { unitId: "p1-sword", bonus: null, moveTo: null, movePhase: null,
    primary: { kind: "attack", targetId: "p2-sword" } };
  const { board } = projectPlan(state, attackPlan);
  const projected = board.find((u) => u.id === "p2-sword");
  assert.ok(projected.hp < 25, "expected the target's projected HP to drop");
  assert.equal(planMpCost(state, attackPlan), 0); // basic attack is free

  const sparkPlan = { unitId: "p1-mage", bonus: null, moveTo: null, movePhase: null,
    primary: { kind: "art", artId: "spark", targetId: "p2-sword" } };
  assert.equal(planMpCost(state, sparkPlan), 4); // Spark costs 4 MP
});
