import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, defend, finishActivation, useArt } from "../src/core/commands.js";
import { getAbilityUsesRemaining, getAuraSources, getEffectiveStats, getUnitType, hasAbilityUsesRemaining } from "../src/core/unitCatalog.js";
import { canUseArt } from "../src/rules/arts.js";
import { resolvePhysicalStrike } from "../src/rules/combat.js";
import { isStunned } from "../src/rules/statuses.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";
import { generatePlans, toCommands } from "../src/ai/plans.js";

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// Combat is stochastic, so any test asserting an outcome pins the rolls.
const HIT = { attackRoll: 0.5, critRoll: 0.99 };          // lands, no crit
const HIT_STATUS = { ...HIT, effectRoll: 0.0 };            // lands + status applies
const HIT_NO_STATUS = { ...HIT, effectRoll: 0.99 };        // lands + status whiffs

function scenario(units, extra = {}) {
  return createBattleState({ size: 13, seed: 7, units, ...extra });
}

// Cycle a unit through a bare defend turn to hand the turn back.
function passDefend(state, player, id) {
  let s = run(state, beginActivation(player, id)).nextState;
  s = run(s, defend(player, id)).nextState;
  return s;
}

test("Riot Cop is registered with its tank stat block", () => {
  const def = getUnitType("riot-cop");
  assert.equal(def.name, "Riot Cop");
  assert.equal(def.classType, "tank");
  assert.deepEqual(def.stats, { moveRange: 3, attackRange: 1, strength: 8, defense: 7, maxHp: 30, maxMp: 0 });
});

// --- Utility Belt (aura) -----------------------------------------------------

test("Utility Belt: an adjacent ally gains +1 DEF; a distant ally does not", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "near", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "far", type: "swordsman", player: 1, x: 5, y: 9 }
  ]);
  const base = getUnitType("swordsman").stats.defense;
  assert.equal(getEffectiveStats(findUnit(state, "near"), state).defense, base + 1);
  assert.equal(getEffectiveStats(findUnit(state, "far"), state).defense, base);
});

test("Utility Belt: the aura shows on the board overlay, faction-tinted", () => {
  const state = scenario([{ id: "riot", type: "riot-cop", player: 2, x: 6, y: 6 }]);
  const source = getAuraSources(state).find((s) => s.position.x === 6 && s.position.y === 6);
  assert.ok(source);
  assert.equal(source.radius, 1);
  assert.equal(source.player, 2);
});

// --- Riot Shield / Heavy Boots ----------------------------------------------

test("Riot Shield: a ranged basic attack deals 1 less to Riot Cop", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 0, y: 0 },
    { id: "archer", type: "archer", player: 2, x: 3, y: 0 }
  ]);
  const archer = findUnit(state, "archer");
  const riot = findUnit(state, "riot");
  const withShield = resolvePhysicalStrike(archer, riot, { state, basicAttack: true }).damage;
  const withoutShield = resolvePhysicalStrike(archer, riot, { state, basicAttack: false }).damage;
  assert.equal(withShield, 1, "ranged basic mitigation keeps a landed hit at minimum 1");
  assert.equal(withShield, Math.max(1, withoutShield - 1), "ranged basic takes 1 less without dropping below 1");
});

test("Riot Shield: an ADJACENT basic attack is NOT reduced (only ranged)", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 0, y: 0 },
    { id: "sword", type: "swordsman", player: 2, x: 1, y: 0 }
  ]);
  const sword = findUnit(state, "sword");
  const riot = findUnit(state, "riot");
  const adjacent = resolvePhysicalStrike(sword, riot, { state, basicAttack: true }).damage;
  const plain = resolvePhysicalStrike(sword, riot, { state, basicAttack: false }).damage;
  assert.equal(adjacent, plain, "an adjacent (melee) basic is untouched by the shield");
});

test("Riot Shield: a defending Riot Cop nullifies magic damage; a non-defender takes it", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "mage", type: "magician", player: 2, x: 5, y: 7 }
  ]);
  // Riot Cop braces, then the Magician sparks him.
  let s = run(state, beginActivation(1, "riot")).nextState;
  s = run(s, defend(1, "riot")).nextState;
  s = run(s, beginActivation(2, "mage")).nextState;
  const defended = run(s, useArt(2, "mage", "spark", { targetId: "riot", ...HIT }));
  assert.equal(findUnit(defended.nextState, "riot").hp, 30, "magic is fully nullified while defending");

  // Same spark, Riot Cop NOT defending.
  const open = { ...scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "mage", type: "magician", player: 2, x: 5, y: 7 }
  ]), currentPlayer: 2 };
  let t = run(open, beginActivation(2, "mage")).nextState;
  const hit = run(t, useArt(2, "mage", "spark", { targetId: "riot", ...HIT }));
  assert.ok(findUnit(hit.nextState, "riot").hp < 30, "an un-braced Riot Cop still eats the magic");
});

test("Riot Shield: Riot Cop takes +1 damage from critical magic hits", () => {
  const units = [
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "angel", type: "angel", player: 2, x: 5, y: 8 }
  ];

  let normal = { ...scenario(units), currentPlayer: 2 };
  normal = run(normal, beginActivation(2, "angel")).nextState;
  const normalHit = run(normal, attack(2, "angel", "riot", { attackRoll: 0.5, critRoll: 0.99 }));
  assert.equal(findUnit(normalHit.nextState, "riot").hp, 27, "normal magic basic deals Angel's 3 STR");

  let crit = { ...scenario(units), currentPlayer: 2 };
  crit = run(crit, beginActivation(2, "angel")).nextState;
  const critHit = run(crit, attack(2, "angel", "riot", { attackRoll: 0.5, critRoll: 0.0 }));
  assert.equal(findUnit(critHit.nextState, "riot").hp, 24, "crit magic is 5 plus Riot Cop's +1 crit-magic vulnerability");
});

test("Heavy Boots: Riot Cop is immune to slow", () => {
  const state = { ...scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "archer", type: "archer", player: 2, x: 5, y: 8 }
  ]), currentPlayer: 2 };
  // Leg Shot is Archer's slow art.
  let s = run(state, beginActivation(2, "archer")).nextState;
  const res = run(s, useArt(2, "archer", "leg-shot", { targetId: "riot", ...HIT_STATUS }));
  const riot = findUnit(res.nextState, "riot");
  assert.ok(!(riot.statuses ?? []).some((st) => st.type === "slow"), "slow is resisted");
});

// --- Stun Gun ----------------------------------------------------------------

test("Stun Gun: 3 true damage + STUN at range 1, and one use is spent", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "stun-gun", { targetId: "foe", ...HIT_STATUS }));
  const foe = findUnit(res.nextState, "foe");
  const foeMax = getUnitType("swordsman").stats.maxHp;
  assert.equal(foe.hp, foeMax - 3, "3 true damage (ignores DEF)");
  // A 1-turn stun on an adjacent enemy is consumed the instant its turn auto-spends, so
  // assert the reducer recorded it (the enemy loses its next activation).
  assert.ok(res.events.some((e) => e.type === "ART_RESOLVED" && e.appliedStatus === "stun"), "an adjacent target is stunned");
  assert.ok(res.events.some((e) => e.type === "ART_RESOLVED" && e.effect?.attempted && e.effect?.applied && e.effect?.status === "stun"), "stun status uses its own roll");
  const stunGun = getUnitType("riot-cop").arts.find((art) => art.id === "stun-gun");
  assert.equal(getAbilityUsesRemaining(findUnit(res.nextState, "riot"), stunGun), 4, "one use spent");
});

test("Stun Gun: adjacent pre-rage stun still rolls for status separately from damage", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "stun-gun", { targetId: "foe", ...HIT_NO_STATUS }));
  const foe = findUnit(res.nextState, "foe");
  assert.equal(foe.hp, getUnitType("swordsman").stats.maxHp - 3, "damage still lands");
  assert.ok(!isStunned(foe), "failed status roll does not stun");
  const event = res.events.find((e) => e.type === "ART_RESOLVED" && e.artId === "stun-gun");
  assert.equal(event.effect?.attempted, true);
  assert.equal(event.effect?.applied, false);
  assert.equal(event.effect?.status, "stun");
  assert.equal(event.effect?.reason, "ROLL_FAILED");
});

test("Stun Gun: a ranged target is SLOWED, not stunned", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 5, y: 8 } // 3 tiles away
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "stun-gun", { targetId: "foe", ...HIT_STATUS }));
  const foe = findUnit(res.nextState, "foe");
  assert.ok(!isStunned(foe), "a distant target is not stunned");
  assert.ok((foe.statuses ?? []).some((st) => st.type === "slow"), "a distant target is slowed");
});

test("Stun Gun: while raging it stuns at ANY range", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5, hp: 5 }, // raging
    { id: "foe", type: "swordsman", player: 2, x: 5, y: 8 }
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "stun-gun", { targetId: "foe", ...HIT_STATUS }));
  assert.ok(res.events.some((e) => e.type === "ART_RESOLVED" && e.appliedStatus === "stun"), "RAGE Lockdown stuns at range");
});

// --- Smoke Bomb --------------------------------------------------------------

test("Smoke Bomb: blinds enemies in the blast radius, deals no damage, spends a use", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "a", type: "swordsman", player: 2, x: 7, y: 5 }, // within radius 1 of empty (8,5)
    { id: "b", type: "archer", player: 2, x: 9, y: 5 },    // within radius 1 of empty (8,5)
    { id: "c", type: "mystic", player: 2, x: 9, y: 10 }    // far away
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "smoke-bomb-riot", { targetPosition: { x: 8, y: 5 }, attackRoll: 0.5 }));
  const event = res.events.find((e) => e.type === "ART_RESOLVED" && e.artId === "smoke-bomb-riot");
  assert.equal(event.hit, true, "the throw records a landed roll");
  assert.equal(event.roll, 0.5);
  const blinded = (id) => (findUnit(res.nextState, id).statuses ?? []).some((st) => st.type === "blind");
  assert.ok(blinded("a") && blinded("b"), "enemies in the cloud are blinded");
  assert.ok(!blinded("c"), "a distant enemy is untouched");
  assert.equal(findUnit(res.nextState, "a").hp, getUnitType("swordsman").stats.maxHp, "no damage dealt");
  const smoke = getUnitType("riot-cop").arts.find((art) => art.id === "smoke-bomb-riot");
  assert.equal(getAbilityUsesRemaining(findUnit(res.nextState, "riot"), smoke), 2, "one use spent");
});

test("Smoke Bomb: a failed throw roll blinds nobody but still spends a use", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "a", type: "swordsman", player: 2, x: 7, y: 5 },
    { id: "b", type: "archer", player: 2, x: 9, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "smoke-bomb-riot", { targetPosition: { x: 8, y: 5 }, attackRoll: 0.0 }));
  const event = res.events.find((e) => e.type === "ART_RESOLVED" && e.artId === "smoke-bomb-riot");
  assert.equal(event.hit, false);
  assert.equal(event.missed, true);
  assert.equal(event.roll, 0.0);
  assert.deepEqual(event.statusTargets, []);
  assert.ok(!(findUnit(res.nextState, "a").statuses ?? []).some((st) => st.type === "blind"));
  assert.ok(!(findUnit(res.nextState, "b").statuses ?? []).some((st) => st.type === "blind"));
  const smoke = getUnitType("riot-cop").arts.find((art) => art.id === "smoke-bomb-riot");
  assert.equal(getAbilityUsesRemaining(findUnit(res.nextState, "riot"), smoke), 2, "missed throws still spend a smoke bomb");
});

// --- Shield Bash -------------------------------------------------------------

test("Shield Bash: 8 physical then a knockback one tile", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 5, y: 6 }
  ]);
  const targetDef = getEffectiveStats(findUnit(state, "foe"), state).defense;
  const expected = Math.max(1, 8 - targetDef);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "shield-bash", { targetId: "foe", ...HIT }));
  const foe = findUnit(res.nextState, "foe");
  assert.equal(foe.hp, getUnitType("swordsman").stats.maxHp - expected, "8 physical vs DEF");
  assert.deepEqual(foe.position, { x: 5, y: 7 }, "pushed straight back one tile");
});

test("Shield Bash: a blocked shove deals +1 true damage and no move", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 1, y: 0 },
    { id: "foe", type: "swordsman", player: 2, x: 0, y: 0 } // back is off-board
  ]);
  const targetDef = getEffectiveStats(findUnit(state, "foe"), state).defense;
  const expected = Math.max(1, 8 - targetDef) + 1;
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "shield-bash", { targetId: "foe", ...HIT }));
  const foe = findUnit(res.nextState, "foe");
  assert.equal(foe.hp, getUnitType("swordsman").stats.maxHp - expected, "8 physical + 1 true");
  assert.deepEqual(foe.position, { x: 0, y: 0 }, "nowhere to move, stays put");
});

// --- Cover -------------------------------------------------------------------

test("Cover: swaps places with an ally and braces; no STR buff for a healthy ally", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "cover", { targetId: "ally" }));
  assert.deepEqual(findUnit(res.nextState, "riot").position, { x: 5, y: 6 }, "Riot Cop takes the ally's tile");
  assert.deepEqual(findUnit(res.nextState, "ally").position, { x: 5, y: 5 }, "ally takes Riot Cop's tile");
  assert.ok(findUnit(res.nextState, "riot").defending, "Riot Cop braces");
  assert.ok(!(findUnit(res.nextState, "riot").statuses ?? []).some((st) => st.type === "empowered"), "healthy ally → no STR buff");
});

test("Cover: rescuing a badly-wounded ally grants +1 STR next turn", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6, hp: 3 } // below half
  ]);
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "cover", { targetId: "ally" }));
  const riot = findUnit(res.nextState, "riot");
  assert.ok((riot.statuses ?? []).some((st) => st.type === "empowered"), "empowered buff applied");
  // The buff survives this turn's end tick so it is live on the NEXT turn.
  assert.equal(getEffectiveStats(riot, res.nextState).strength, getUnitType("riot-cop").stats.strength + 1);
});

// --- Lockdown (RAGE) ---------------------------------------------------------

test("Lockdown: must be raging and the turn's FIRST command", () => {
  const raging = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5, hp: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 8, y: 8 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 6 }
  ]);
  // Non-raging Riot Cop can't use it at all.
  const healthy = scenario([{ id: "riot", type: "riot-cop", player: 1, x: 5, y: 5 }]);
  let h = run(healthy, beginActivation(1, "riot")).nextState;
  assert.ok(!canUseArt(h, findUnit(h, "riot"), "lockdown"), "not available while healthy");

  // Raging + first command → available.
  let s = run(raging, beginActivation(1, "riot")).nextState;
  assert.ok(canUseArt(s, findUnit(s, "riot"), "lockdown"), "raging first command → available");

  // But if a squadmate has already acted this turn, it is locked out.
  let acted = run(raging, beginActivation(1, "ally")).nextState;
  acted = run(acted, defend(1, "ally")).nextState;
  acted = run(acted, beginActivation(1, "riot")).nextState;
  assert.ok(!canUseArt(acted, findUnit(acted, "riot"), "lockdown"), "locked once an ally has acted");
});

test("Lockdown: slows everyone in range (allies included) to 1 MOVE and -2 DEF, sparing Riot Cop", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5, hp: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 7 }, // within 3, outside the +1 DEF aura
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 6 }   // within 3
  ]);
  const allyBaseDef = getUnitType("swordsman").stats.defense;
  let s = run(state, beginActivation(1, "riot")).nextState;
  const res = run(s, useArt(1, "riot", "lockdown"));
  const ally = findUnit(res.nextState, "ally");
  const foe = findUnit(res.nextState, "foe");
  assert.equal(getEffectiveStats(ally, res.nextState).moveRange, 1, "ally clamped to 1 MOVE");
  assert.equal(getEffectiveStats(ally, res.nextState).defense, allyBaseDef - 2, "ally loses 2 DEF");
  assert.equal(getEffectiveStats(foe, res.nextState).moveRange, 1, "enemy clamped to 1 MOVE");
  assert.equal(getEffectiveStats(findUnit(res.nextState, "riot"), res.nextState).moveRange >= 3, true, "Riot Cop is spared");
});

// --- Finite-use recharge / rage refresh --------------------------------------

test("Ability uses restore after a full turn empty (not the turn they run dry)", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5, abilityUses: { "stun-gun": 1, "smoke-bomb-riot": 3 } },
    { id: "foe", type: "swordsman", player: 2, x: 5, y: 8 }
  ]);
  const stunGun = getUnitType("riot-cop").arts.find((art) => art.id === "stun-gun");

  // Turn A: fire the last dart → 0 left.
  let s = run(state, beginActivation(1, "riot")).nextState;
  s = run(s, useArt(1, "riot", "stun-gun", { targetId: "foe", ...HIT_NO_STATUS })).nextState;
  assert.equal(getAbilityUsesRemaining(findUnit(s, "riot"), stunGun), 0);
  s = passDefend(s, 2, "foe");

  // Turn B: still empty (this is the "one full turn empty").
  s = run(s, beginActivation(1, "riot")).nextState;
  assert.equal(getAbilityUsesRemaining(findUnit(s, "riot"), stunGun), 0, "still empty the turn after");
  assert.ok(!hasAbilityUsesRemaining(findUnit(s, "riot"), stunGun), "canUseArt gate blocks it");
  s = run(s, defend(1, "riot")).nextState;
  s = passDefend(s, 2, "foe");

  // Turn C: restored to full.
  s = run(s, beginActivation(1, "riot")).nextState;
  assert.equal(getAbilityUsesRemaining(findUnit(s, "riot"), stunGun), 5, "restored to full after a turn empty");
});

test("Reaching RAGE instantly refreshes every ability use", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 1, x: 5, y: 5, hp: 5, abilityUses: { "stun-gun": 0, "smoke-bomb-riot": 0 } }
  ]);
  const stunGun = getUnitType("riot-cop").arts.find((art) => art.id === "stun-gun");
  const smoke = getUnitType("riot-cop").arts.find((art) => art.id === "smoke-bomb-riot");
  const s = run(state, beginActivation(1, "riot")).nextState;
  const riot = findUnit(s, "riot");
  assert.equal(getAbilityUsesRemaining(riot, stunGun), 5, "Stun Gun refilled on rage entry");
  assert.equal(getAbilityUsesRemaining(riot, smoke), 3, "Smoke Bomb refilled on rage entry");
});

// --- CPU + VFX ---------------------------------------------------------------

test("every CPU plan for Riot Cop replays cleanly through the reducer", () => {
  const state = scenario([
    { id: "riot", type: "riot-cop", player: 2, x: 6, y: 6 },
    { id: "ally", type: "swordsman", player: 2, x: 6, y: 7 },
    { id: "foe1", type: "archer", player: 1, x: 6, y: 8 },
    { id: "foe2", type: "swordsman", player: 1, x: 7, y: 6 }
  ], { seed: 11 });
  const riot = findUnit(state, "riot");
  const plans = generatePlans({ ...state, currentPlayer: 2 }, riot);
  assert.ok(plans.length > 0, "the CPU has at least one plan");
  for (const plan of plans) {
    let s = { ...state, currentPlayer: 2 };
    for (const command of toCommands(2, plan)) {
      const result = applyCommand(s, command);
      assert.ok(result.accepted, `plan command ${command.type}/${command.artId ?? ""} rejected (${result.errorCode})`);
      s = result.nextState;
    }
  }
});

test("Riot Cop's active arts declare VFX recipes", () => {
  for (const id of ["stun-gun", "smoke-bomb-riot", "cover", "lockdown"]) {
    assert.ok(getAbilityVfx(id), `${id} should have a VFX recipe`);
  }
  assert.equal(getAbilityVfx("stun-gun").projectile.shape, "tracer");
});
