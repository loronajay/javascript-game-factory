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

test("a unit can generate and replay wall-attack plans", () => {
  const state = createBattleState({
    size: 5, seed: 2,
    units: [
      { id: "p1-miner", type: "miner", player: 1, x: 0, y: 4 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 4, y: 0 }
    ],
    tileObjects: [{ x: 1, y: 4, kind: "wall", hp: 1 }]
  });
  const plans = generatePlans(state, findUnit(state, "p1-miner"));
  const wallPlan = plans.find((p) => p.primary.kind === "attackTile" && p.primary.targetPosition.x === 1 && p.primary.targetPosition.y === 4);
  assert.ok(wallPlan, "expected the adjacent wall to be attackable");
  assertPlanReplays(state, 1, wallPlan);
});

test("a caster yields targeted ART plans (Spark)", () => {
  const state = skirmish();
  const plans = generatePlans(state, findUnit(state, "p1-mage"));
  assert.ok(plans.some((p) => p.primary.kind === "art" && p.primary.artId === "spark" && p.primary.targetId));
  // raging magician also offers the self-centred Nuke (enemies within radius 3).
  assert.ok(plans.some((p) => p.primary.kind === "art" && p.primary.artId === "nuke"));
});

test("raging Mystic ART plans explicitly finish after the ART keeps activation open", () => {
  const state = createBattleState({
    size: 9, seed: 1,
    units: [
      { id: "p1-mystic", type: "mystic", player: 1, x: 1, y: 1, hp: 5 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 2, y: 1, hp: 10 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 8, y: 8 }
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-mystic"));
  const pray = plans.find((p) => p.primary.kind === "art" && p.primary.artId === "pray");
  assert.ok(pray, "expected a Pray plan");
  assert.equal(pray.primaryKeepsActivationOpen, true);
  assert.deepEqual(toCommands(1, pray).map((command) => command.type), [
    "BEGIN_ACTIVATION", "USE_ART", "FINISH_ACTIVATION"
  ]);
  assertPlanReplays(state, 1, pray);
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

// Age declares its own targeting.range (4), which is SHORTER than Father Time's
// attackRange (5). Planning off attackRange offered a target the resolver rejects with
// TARGET_OUT_OF_RANGE, and the rejection stalled the CPU turn loop.
test("Age plans respect the ART's own range, not Father Time's attack range", () => {
  const state = createBattleState({
    size: 13, seed: 5,
    units: [
      { id: "p1-ft", type: "father-time", player: 1, x: 5, y: 5 },
      { id: "p2-near", type: "swordsman", player: 2, x: 9, y: 5 }, // distance 4 — in Age range
      { id: "p2-far", type: "mystic", player: 2, x: 10, y: 5 }     // distance 5 — attack range only
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-ft"));
  const agePlans = plans.filter((p) => p.primary.artId === "age");
  assert.ok(agePlans.some((p) => p.primary.targetId === "p2-near"), "expected an Age plan at distance 4");
  assert.ok(!agePlans.some((p) => p.primary.targetId === "p2-far"), "Age must not be planned at distance 5");
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("Mother Nature weather plans skip her last weather and replay cleanly", () => {
  const state = createBattleState({
    size: 11, seed: 8,
    units: [
      { id: "p1-mn", type: "mother-nature", player: 1, x: 2, y: 2, lastWeather: "thunderstorm", weather: "thunderstorm" },
      { id: "p1-tree", type: "treant", player: 1, x: 2, y: 3, hp: 20 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 7, y: 7 }
    ],
    weather: { id: "thunderstorm", sourceId: "p1-mn" }
  });
  const plans = generatePlans(state, findUnit(state, "p1-mn"));
  assert.ok(!plans.some((p) => p.primary.kind === "art" && p.primary.artId === "thunderstorm"));
  assert.ok(plans.some((p) => p.primary.kind === "art" && p.primary.artId === "spring-shower"));
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

test("Juggernaut line/self plans (grab, lineStrike, recharge) replay cleanly", () => {
  const state = createBattleState({
    size: 13, seed: 4,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, mp: 5 },
      { id: "p1-ally", type: "swordsman", player: 1, x: 4, y: 4 },
      { id: "p2-a", type: "archer", player: 2, x: 5, y: 8 },  // on the +y ray (grab + rocket)
      { id: "p2-b", type: "swordsman", player: 2, x: 8, y: 8 } // on the +x+y diagonal
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-jug"));
  assert.ok(plans.some((p) => p.primary.artId === "tether-grab" && p.primary.targetId === "p2-a"), "expected a Tether Grab plan");
  assert.ok(plans.some((p) => p.primary.artId === "rocket-punch" && p.primary.targetId === "p2-a"), "expected a Rocket Punch plan");
  for (const plan of plans) assertPlanReplays(state, 1, plan);
});

test("a raging Juggernaut offers Self Destruct (free) and its plans replay", () => {
  const state = createBattleState({
    size: 13, seed: 6,
    units: [
      { id: "p1-jug", type: "juggernaut", player: 1, x: 5, y: 5, hp: 4, mp: 0 }, // raging
      { id: "p1-ally", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2-a", type: "archer", player: 2, x: 6, y: 5 },
      { id: "p2-b", type: "swordsman", player: 2, x: 5, y: 7 }
    ]
  });
  const plans = generatePlans(state, findUnit(state, "p1-jug"));
  assert.ok(plans.some((p) => p.primary.artId === "self-destruct"), "expected a Self Destruct plan while raging");
  // Free ARTS while raging: a Rocket Punch plan costs 0 MP even though the catalog says 5.
  const rocket = plans.find((p) => p.primary.artId === "rocket-punch");
  if (rocket) assert.equal(planMpCost(state, rocket), 0);
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
