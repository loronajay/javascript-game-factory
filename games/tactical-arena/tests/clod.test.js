import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { getAuraSources, getEffectiveStats, getUnitType } from "../src/core/unitCatalog.js";
import { getTargetedBlastAimTiles } from "../src/rules/arts.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { generatePlans, toCommands } from "../src/ai/plans.js";

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// Combat is stochastic, so any test asserting an outcome pins the rolls.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

test("Clod is registered with its tank stat block", () => {
  const def = getUnitType("clod");
  assert.equal(def.name, "Clod");
  assert.equal(def.classType, "tank");
  assert.deepEqual(def.stats, { moveRange: 2, attackRange: 1, strength: 9, defense: 8, maxHp: 30, maxMp: 20 });
});

// --- Brick House ------------------------------------------------------------

test("Brick House: allies within 1 tile gain +1 DEF; a distant ally does not", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5 },
    { id: "near", type: "swordsman", player: 1, x: 5, y: 6 }, // adjacent
    { id: "far", type: "swordsman", player: 1, x: 5, y: 8 }   // 3 tiles away
  ]);
  const base = getUnitType("swordsman").stats.defense;
  assert.equal(getEffectiveStats(findUnit(state, "near"), state).defense, base + 1, "adjacent ally is buffed");
  assert.equal(getEffectiveStats(findUnit(state, "far"), state).defense, base, "distant ally is unbuffed");
});

test("Brick House: Clod gains +1 STR per sheltered ally, and it evaporates when they leave", () => {
  const withAllies = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5 },
    { id: "a1", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "a2", type: "archer", player: 1, x: 6, y: 5 }
  ]);
  assert.equal(getEffectiveStats(findUnit(withAllies, "clod"), withAllies).strength, 11, "+1 STR per adjacent ally (2 → 11)");

  const alone = scenario([{ id: "clod", type: "clod", player: 1, x: 5, y: 5 }]);
  assert.equal(getEffectiveStats(findUnit(alone, "clod"), alone).strength, 9, "no allies → base STR");
});

test("Brick House: the buff aura shows up on the board overlay, faction-tinted", () => {
  const state = scenario([{ id: "clod", type: "clod", player: 1, x: 6, y: 6 }]);
  const source = getAuraSources(state).find((s) => s.position.x === 6 && s.position.y === 6);
  assert.ok(source, "Clod projects a visible aura zone");
  assert.equal(source.radius, 1);
  assert.equal(source.player, 1, "tinted by Clod's team");
});

// --- Rock Hard --------------------------------------------------------------

test("Rock Hard: a defending Clod negates a physical attack and restores 3 MP", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, mp: 10 },
    { id: "sw", type: "swordsman", player: 2, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  s = run(s, defend(1, "clod")).nextState;
  s = run(s, beginActivation(2, "sw")).nextState;
  const res = run(s, attack(2, "sw", "clod", NORMAL_HIT));

  assert.equal(findUnit(res.nextState, "clod").hp, 30, "physical damage is fully negated while defending");
  assert.equal(findUnit(res.nextState, "clod").mp, 13, "Clod restores 3 MP off the blow");
  assert.ok(res.events.some((e) => e.type === "ROCK_HARD_MP" && e.unitId === "clod"));
});

test("Rock Hard: a NON-defending Clod takes physical damage normally", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 2, x: 5, y: 5, mp: 10 },
    { id: "sw", type: "swordsman", player: 1, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "sw")).nextState;
  const res = run(s, attack(1, "sw", "clod", NORMAL_HIT));
  assert.ok(findUnit(res.nextState, "clod").hp < 30, "an unbraced Clod still takes physical damage");
  assert.equal(findUnit(res.nextState, "clod").mp, 10, "no MP is restored when not defending");
});

test("Rock Hard: magic damage still lands on a defending Clod (only physical is negated)", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, mp: 20 },
    { id: "mage", type: "magician", player: 2, x: 5, y: 8 }
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  s = run(s, defend(1, "clod")).nextState;
  s = run(s, beginActivation(2, "mage")).nextState;
  const res = run(s, useArt(2, "mage", "spark", { targetId: "clod", ...NORMAL_HIT }));
  assert.ok(findUnit(res.nextState, "clod").hp < 30, "Spark (magic) still bites a braced Clod");
});

// --- Quake ------------------------------------------------------------------

test("Quake: every enemy within 3 takes (3 + number hit) magic, but 2 hits do not refund MP", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 6, y: 6, mp: 20 },
    { id: "e1", type: "swordsman", player: 2, x: 6, y: 8 }, // dist 2
    { id: "e2", type: "swordsman", player: 2, x: 8, y: 6 }  // dist 2
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "quake", {}));
  const swMax = getUnitType("swordsman").stats.maxHp;
  // 2 enemies caught → 3 + 2 = 5 magic each (magic ignores DEF).
  assert.equal(findUnit(res.nextState, "e1").hp, swMax - 5);
  assert.equal(findUnit(res.nextState, "e2").hp, swMax - 5);
  assert.equal(findUnit(res.nextState, "clod").mp, 15, "2 targets hit still spends 5 MP");
  assert.equal(res.events.find((e) => e.type === "ART_RESOLVED").refunded, false);
});

test("Quake: MP is refunded when it hits 3 or more targets", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 6, y: 6, mp: 20 },
    { id: "e1", type: "swordsman", player: 2, x: 6, y: 8 }, // dist 2
    { id: "e2", type: "swordsman", player: 2, x: 8, y: 6 }, // dist 2
    { id: "e3", type: "swordsman", player: 2, x: 4, y: 6 }  // dist 2
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "quake", {}));
  const ev = res.events.find((e) => e.type === "ART_RESOLVED");

  assert.equal(findUnit(res.nextState, "clod").mp, 20, "3 targets hit refunds the MP");
  assert.equal(ev.refunded, true);
  assert.deepEqual(ev.targetIds.sort(), ["e1", "e2", "e3"]);
});

test("Quake: MP is NOT refunded when fewer than 3 enemies are inside the radius", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 6, y: 6, mp: 20 },
    { id: "e1", type: "swordsman", player: 2, x: 6, y: 8 },   // dist 2 (caught)
    { id: "away", type: "swordsman", player: 2, x: 12, y: 12 } // far outside radius 3
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "quake", {}));
  assert.equal(findUnit(res.nextState, "clod").mp, 15, "5 MP spent (no refund)");
  assert.equal(findUnit(res.nextState, "away").hp, getUnitType("swordsman").stats.maxHp, "the distant enemy is untouched");
});

test("Quake: an enemy on the farthest edge (3 tiles) takes 1 less", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 6, y: 6, mp: 20 },
    { id: "near", type: "swordsman", player: 2, x: 6, y: 8 }, // dist 2 (inner)
    { id: "edge", type: "swordsman", player: 2, x: 6, y: 9 }  // dist 3 (outer rim)
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "quake", {}));
  const swMax = getUnitType("swordsman").stats.maxHp;
  // 2 enemies caught → base 3 + 2 = 5 magic; the edge target is softened by 1 → 4.
  assert.equal(findUnit(res.nextState, "near").hp, swMax - 5, "inner target takes full quake");
  assert.equal(findUnit(res.nextState, "edge").hp, swMax - 4, "the rim target takes 1 less");
});

// --- Stone Throw ------------------------------------------------------------

test("Stone Throw: 8 physical (STR-scaled) and a guaranteed slow on a landed hit", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, mp: 20 },
    { id: "e", type: "swordsman", player: 2, x: 8, y: 5 } // range 3 (≤4)
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "stone-throw", { targetId: "e", ...NORMAL_HIT }));
  const swDef = getUnitType("swordsman").stats.defense; // 8 - DEF
  assert.equal(res.events.find((e) => e.type === "ART_RESOLVED").damageByTarget.e, 8 - swDef);
  assert.deepEqual(findUnit(res.nextState, "e").statuses.map((x) => x.type), ["slow"], "the target is slowed (no roll)");
  assert.equal(getEffectiveStats(findUnit(res.nextState, "e")).moveRange, getUnitType("swordsman").stats.moveRange - 1, "slow actually reduces MOVE by 1");
});

test("Stone Throw: a critical hit stuns instead of slowing", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, mp: 20 },
    { id: "ally", type: "swordsman", player: 1, x: 0, y: 0 },
    { id: "e", type: "swordsman", player: 2, x: 8, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "stone-throw", { targetId: "e", ...CRIT }));
  assert.deepEqual(findUnit(res.nextState, "e").statuses.map((x) => x.type), ["stun"], "a crit stuns, not slows");
});

test("Stone Throw: a body between blocks the throw (physical line of sight)", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, mp: 20 },
    { id: "block", type: "swordsman", player: 1, x: 6, y: 5 },
    { id: "e", type: "swordsman", player: 2, x: 8, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const rejected = applyCommand(s, useArt(1, "clod", "stone-throw", { targetId: "e", ...NORMAL_HIT }));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.errorCode, "TARGET_OBSTRUCTED");
});

// --- Thunderous Charge (RAGE) ----------------------------------------------

test("Thunderous Charge: only available while raging (≤5 HP)", () => {
  const healthy = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, mp: 20 },
    { id: "e", type: "swordsman", player: 2, x: 7, y: 7 }
  ]);
  let s = run(healthy, beginActivation(1, "clod")).nextState;
  const rejected = applyCommand(s, useArt(1, "clod", "thunderous-charge", { targetPosition: { x: 6, y: 6 } }));
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.errorCode, "ART_NOT_AVAILABLE");
});

test("Thunderous Charge: Clod charges to a clear tile — occupied tiles are not aimable", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, hp: 5, mp: 20 },
    { id: "e", type: "swordsman", player: 2, x: 7, y: 7 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 }
  ]);
  const art = getUnitType("clod").arts.find((a) => a.id === "thunderous-charge");
  const aim = getTargetedBlastAimTiles(state, findUnit(state, "clod"), art);
  assert.ok(aim.has("6,6"), "an empty tile within 4 is a valid landing/aim point");
  assert.ok(aim.has("5,5"), "his own tile (charge in place) is allowed");
  assert.ok(!aim.has("7,7"), "an enemy-occupied tile is never aimable");
  assert.ok(!aim.has("5,6"), "an ally-occupied tile is never aimable (he'd land on it)");
  assert.ok(!aim.has("11,11"), "a tile beyond range 4 is not aimable");
});

test("Thunderous Charge: a 2-tile blast deals 10 physical and stuns every enemy caught", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, hp: 5, mp: 20 },
    { id: "e1", type: "swordsman", player: 2, x: 7, y: 7 }, // dist 2 from (6,6)
    { id: "e2", type: "swordsman", player: 2, x: 6, y: 7 }, // dist 1 from (6,6)
    { id: "safe", type: "swordsman", player: 2, x: 10, y: 10 } // outside the blast
  ]);
  let s = run(state, beginActivation(1, "clod")).nextState;
  const res = run(s, useArt(1, "clod", "thunderous-charge", { targetPosition: { x: 6, y: 6 } }));
  const swMax = getUnitType("swordsman").stats.maxHp;
  const swDef = getUnitType("swordsman").stats.defense; // 10 - DEF
  assert.equal(findUnit(res.nextState, "e1").hp, swMax - (10 - swDef));
  assert.equal(findUnit(res.nextState, "e2").hp, swMax - (10 - swDef));
  assert.equal(findUnit(res.nextState, "safe").hp, swMax, "an enemy outside the radius is untouched");
  const ev = res.events.find((e) => e.type === "ART_RESOLVED");
  assert.deepEqual(ev.stunnedIds.sort(), ["e1", "e2"]);
  assert.equal(findUnit(res.nextState, "clod").mp, 13, "7 MP spent");
  // Clod charges to and ends up standing on the target tile.
  assert.deepEqual(findUnit(res.nextState, "clod").position, { x: 6, y: 6 }, "Clod ends on the charged tile");
  assert.deepEqual(ev.from, { x: 5, y: 5 }, "the event records where he charged from");
});

// --- assets / VFX / AI ------------------------------------------------------

test("Clod's active ARTS all register a VFX recipe", () => {
  assert.equal(getAbilityVfx("quake").type, "magicBurst");
  assert.equal(getAbilityVfx("stone-throw").projectile.shape, "rock");
  assert.equal(getAbilityVfx("thunderous-charge").type, "magicBurst");
});

test("CPU: a raging Clod's plans (incl. Thunderous Charge) all replay cleanly", () => {
  const state = scenario([
    { id: "clod", type: "clod", player: 1, x: 5, y: 5, hp: 5, mp: 20 },
    { id: "e1", type: "swordsman", player: 2, x: 6, y: 6 },
    { id: "e2", type: "archer", player: 2, x: 7, y: 5 }
  ]);
  const plans = generatePlans(state, findUnit(state, "clod"));
  assert.ok(plans.some((p) => p.primary.artId === "thunderous-charge" && p.primary.targetPosition), "expected a Thunderous Charge plan");
  assert.ok(plans.some((p) => p.primary.artId === "quake"), "expected a Quake plan");
  assert.ok(plans.some((p) => p.primary.artId === "stone-throw"), "expected a Stone Throw plan");
  for (const plan of plans) {
    let s = state;
    for (const command of toCommands(1, plan)) {
      const result = applyCommand(s, command);
      assert.ok(result.accepted, `${plan.primary.artId ?? plan.primary.kind} → ${command.type} rejected (${result.errorCode})`);
      s = result.nextState;
    }
  }
});
