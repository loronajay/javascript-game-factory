import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, defend, finishActivation, attack, useArt } from "../src/core/commands.js";
import { getEffectiveStats, getUnitType, isDefending, isRaging } from "../src/core/unitCatalog.js";
import {
  getChallengeDamageBonus,
  getDuelistDamageBonus,
  resolvePhysicalStrike
} from "../src/rules/combat.js";
import { hashState } from "../src/core/state-hash.js";
import { getAbilityVfx } from "../src/ui/vfxCatalog.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };
const CRIT = { attackRoll: 0.5, critRoll: 0.01 };
const MISS = { attackRoll: 0.02 };
const EFFECT_HIT = { attackRoll: 0.5, critRoll: 0.99, effectRoll: 0.01 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// A wide board so allies can be placed comfortably in/out of the 3-tile isolation radius.
function scenario(units, { seed = 17, currentPlayer = 1 } = {}) {
  const state = createBattleState({ size: 15, seed, units });
  state.currentPlayer = currentPlayer;
  return state;
}

test("Ronin is registered with its authored stat block", () => {
  const def = getUnitType("ronin");
  assert.equal(def.name, "Ronin");
  assert.equal(def.glyph, "\u{1F977}");
  assert.notEqual(def.glyph, getUnitType("blacksword").glyph, "Ronin and Blacksword need distinct UI glyphs");
  assert.equal(def.classType, "melee");
  assert.deepEqual(def.stats, { moveRange: 3, attackRange: 1, strength: 10, defense: 5, maxHp: 28, maxMp: 20 });
});

// --- Wanderer passive ---------------------------------------------------------

test("Wanderer: +2 damage while Ronin has no ally within 3", () => {
  // Ronin alone (ally far away); target has an ally beside it, so only the attacker bonus.
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 1, y: 1 },
    { id: "ally", type: "swordsman", player: 1, x: 12, y: 12 },
    { id: "foe", type: "swordsman", player: 2, x: 2, y: 1, defense: 5 },
    { id: "foeAlly", type: "swordsman", player: 2, x: 2, y: 2 }
  ]);
  const ronin = findUnit(state, "ronin");
  const foe = findUnit(state, "foe");
  assert.equal(getDuelistDamageBonus(ronin, foe, state), 2, "isolated attacker gets +2");
  // base = 10 STR - 5 DEF = 5, +2 isolation = 7.
  assert.equal(resolvePhysicalStrike(ronin, foe, { state }).damage, 7);
});

test("Wanderer: +1 versus a target with no ally within 3", () => {
  // Ronin next to an ally (not isolated); the target stands alone.
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, defense: 5 }
  ]);
  const ronin = findUnit(state, "ronin");
  const foe = findUnit(state, "foe");
  assert.equal(getDuelistDamageBonus(ronin, foe, state), 1, "isolated target gives +1");
});

test("Wanderer: attacker-alone and target-alone stack to +3", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 1, y: 1 },
    { id: "ally", type: "swordsman", player: 1, x: 12, y: 12 },
    { id: "foe", type: "swordsman", player: 2, x: 2, y: 1, defense: 5 }
  ]);
  const ronin = findUnit(state, "ronin");
  const foe = findUnit(state, "foe");
  assert.equal(getDuelistDamageBonus(ronin, foe, state), 3);
});

test("Wanderer: a foe that misses Ronin is marked for +1 next turn", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5 },
    { id: "foeAlly", type: "swordsman", player: 2, x: 6, y: 6 }
  ], { currentPlayer: 2 });

  let s = run(state, beginActivation(2, "foe")).nextState;
  s = run(s, attack(2, "foe", "ronin", MISS)).nextState;
  const ronin = findUnit(s, "ronin");
  assert.deepEqual(ronin.duelMarks, ["foe"], "the whiffing foe is marked");
  // Ronin is not isolated (ally at range 1) and the foe is not isolated, so only the mark applies.
  assert.equal(getDuelistDamageBonus(ronin, findUnit(s, "foe"), s), 1, "marked foe takes +1");
});

test("Wanderer: duel marks clear once Ronin has had his turn", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 9, y: 9 }
  ]);
  findUnit(state, "ronin").duelMarks = ["foe"];
  let s = run(state, beginActivation(1, "ronin")).nextState;
  s = run(s, defend(1, "ronin")).nextState;
  assert.deepEqual(findUnit(s, "ronin").duelMarks, [], "marks reset after his activation ends");
});

test("Wanderer: a critical basic strike heals Ronin for half the damage dealt", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 20 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, defense: 5, hp: 40 },
    { id: "foeAlly", type: "swordsman", player: 2, x: 6, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, attack(1, "ronin", "foe", CRIT));
  const healEvent = res.events.find((e) => e.type === "DUELIST_HEAL");
  assert.ok(healEvent, "a crit basic strike emits a heal");
  assert.ok(healEvent.hpRestored > 0);
  assert.ok(findUnit(res.nextState, "ronin").hp > 20, "Ronin recovers HP on the crit");
});

test("Wanderer: a NON-crit basic strike does not heal Ronin", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 20 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 6 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, defense: 5, hp: 40 },
    { id: "foeAlly", type: "swordsman", player: 2, x: 6, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, attack(1, "ronin", "foe", NORMAL_HIT));
  assert.equal(res.events.some((e) => e.type === "DUELIST_HEAL"), false);
  assert.equal(findUnit(res.nextState, "ronin").hp, 20);
});

// --- ARTS ---------------------------------------------------------------------

test("Patient Blade: braces and banks a +1 MOVE for next turn", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 9, y: 9 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  s = run(s, useArt(1, "ronin", "patient-blade")).nextState;
  const ronin = findUnit(s, "ronin");
  assert.equal(isDefending(ronin), true, "Ronin is defending");
  assert.ok(ronin.statuses.some((st) => st.type === "empowered" && st.statModifiers?.moveRange === 1));
  assert.equal(getEffectiveStats(ronin, s).moveRange, 4, "the banked +1 MOVE is live next turn");
});

test("Flashing Steel: attacks and blinds on a landed effect roll", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, defense: 5, hp: 40 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, useArt(1, "ronin", "flashing-steel", { targetId: "foe", ...EFFECT_HIT }));
  const foe = findUnit(res.nextState, "foe");
  assert.ok(foe.hp < 40, "Flashing Steel deals damage");
  assert.ok(foe.statuses.some((st) => st.type === "blind"), "and blinds the target");
});

test("Broken Oath: -2 DEF, +1 STR, +1 MOVE on a self buff", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 9, y: 9 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  s = run(s, useArt(1, "ronin", "broken-oath")).nextState;
  const stats = getEffectiveStats(findUnit(s, "ronin"), s);
  assert.equal(stats.defense, 3, "-2 DEF");
  assert.equal(stats.strength, 11, "+1 STR");
  assert.equal(stats.moveRange, 4, "+1 MOVE");
});

test("Challenge: marks both duellists for +2 against each other", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 8, y: 5 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  s = run(s, useArt(1, "ronin", "challenge", { targetId: "foe" })).nextState;
  const ronin = findUnit(s, "ronin");
  const foe = findUnit(s, "foe");
  assert.ok(foe.statuses.some((st) => st.type === "challenged" && st.from === "ronin" && st.bonus === 2));
  assert.ok(ronin.statuses.some((st) => st.type === "challenged" && st.from === "foe" && st.bonus === 2));
  assert.equal(getChallengeDamageBonus(ronin, foe), 2, "Ronin deals +2 to the challenged foe");
  assert.equal(getChallengeDamageBonus(foe, ronin), 2, "the challenged foe deals +2 to Ronin");
});

test("Shuriken: rolls to hit for a fixed 3 TRUE damage, ignoring DEF", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 7, y: 5, defense: 9, hp: 40 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, useArt(1, "ronin", "shuriken", { targetId: "foe", ...NORMAL_HIT }));
  assert.equal(findUnit(res.nextState, "foe").hp, 37, "3 true damage lands regardless of high DEF");
});

test("Shuriken: a miss deals nothing and marks the whiff on a Ronin target", () => {
  // A player-2 Ronin throws at the player-1 Ronin and misses — the target Ronin records it.
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 40 },
    { id: "thrower", type: "ronin", player: 2, x: 7, y: 5 }
  ], { currentPlayer: 2 });
  let s = run(state, beginActivation(2, "thrower")).nextState;
  const res = run(s, useArt(2, "thrower", "shuriken", { targetId: "ronin", ...MISS }));
  assert.equal(findUnit(res.nextState, "ronin").hp, 40, "a miss deals nothing");
  assert.deepEqual(findUnit(res.nextState, "ronin").duelMarks, ["thrower"], "the whiff is marked");
});

// --- RAGE: Final Draw ---------------------------------------------------------

test("Final Draw: at 5 HP Ronin gains +12 STR and +1 MOVE", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 9, y: 9 }
  ]);
  const ronin = findUnit(state, "ronin");
  assert.equal(isRaging(ronin), true);
  const stats = getEffectiveStats(ronin, state);
  assert.equal(stats.strength, 22);
  assert.equal(stats.moveRange, 4);
});

test("Final Draw: an attack recoils its full damage back onto Ronin", () => {
  // Heavily armored foe (statModifiers DEF) so the strike (and recoil) is small enough for
  // Ronin to survive — a bare spec `defense` is not applied by createUnit, statModifiers is.
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 8 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, statModifiers: { defense: 15 }, hp: 40 },
    { id: "foeAlly", type: "swordsman", player: 2, x: 6, y: 6 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, attack(1, "ronin", "foe", NORMAL_HIT));
  const dealt = 40 - findUnit(res.nextState, "foe").hp;
  assert.ok(dealt > 0);
  const recoil = res.events.find((e) => e.type === "ATTACK_RECOIL");
  assert.ok(recoil, "a raging attack recoils");
  assert.equal(recoil.damage, dealt, "recoil equals the damage dealt");
  assert.equal(findUnit(res.nextState, "ronin").hp, 5 - dealt);
});

test("Final Draw: a lethal recoil still kills Ronin while another enemy remains", () => {
  // Low-DEF foe → a big strike → recoil exceeds Ronin's 5 HP. The activation must close so
  // the player can keep playing with their other unit.
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 5 },
    { id: "ally", type: "swordsman", player: 1, x: 5, y: 8 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, defense: 0, hp: 40 },
    { id: "foeAlly", type: "swordsman", player: 2, x: 6, y: 6 },
    { id: "reserve", type: "swordsman", player: 2, x: 12, y: 12 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  s = run(s, attack(1, "ronin", "foe", NORMAL_HIT)).nextState;
  assert.equal(findUnit(s, "ronin").hp, 0, "the recoil fells Ronin");
  assert.equal(s.phase, "playing");
  assert.equal(s.activation, null, "the dangling activation is closed");
  assert.equal(s.currentPlayer, 1, "player 1 still has an unspent ally");
  assert.equal(run(s, beginActivation(1, "ally")).accepted, true, "the turn is not soft-locked");
});

test("Final Draw: Ronin survives recoil when his attack defeats the last enemy unit", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, hp: 10 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, attack(1, "ronin", "foe", NORMAL_HIT));
  assert.equal(findUnit(res.nextState, "foe").hp, 0, "the last enemy falls");
  assert.equal(findUnit(res.nextState, "ronin").hp, 5, "match-ending recoil is skipped");
  assert.equal(res.events.some((e) => e.type === "ATTACK_RECOIL"), false);
  assert.equal(res.nextState.phase, "complete");
  assert.equal(res.nextState.winner, 1);
});

test("Final Draw: attack arts skip recoil when they defeat the last enemy unit", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5, hp: 10 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, useArt(1, "ronin", "flashing-steel", { targetId: "foe", ...EFFECT_HIT }));
  assert.equal(findUnit(res.nextState, "foe").hp, 0, "the last enemy falls");
  assert.equal(findUnit(res.nextState, "ronin").hp, 5, "match-ending art recoil is skipped");
  assert.equal(res.events.some((e) => e.type === "ATTACK_RECOIL"), false);
  assert.equal(res.nextState.winner, 1);
});

test("Final Draw: Shuriken skips recoil when it defeats the last enemy unit", () => {
  const state = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5, hp: 3 },
    { id: "foe", type: "swordsman", player: 2, x: 7, y: 5, hp: 3 }
  ]);
  let s = run(state, beginActivation(1, "ronin")).nextState;
  const res = run(s, useArt(1, "ronin", "shuriken", { targetId: "foe", ...NORMAL_HIT }));
  assert.equal(findUnit(res.nextState, "foe").hp, 0, "the last enemy falls");
  assert.equal(findUnit(res.nextState, "ronin").hp, 3, "match-ending shuriken recoil is skipped");
  assert.equal(res.events.some((e) => e.type === "ATTACK_RECOIL"), false);
  assert.equal(res.nextState.winner, 1);
});

// --- lockstep / presentation guards ------------------------------------------

test("duel marks are part of the authoritative state hash", () => {
  const base = scenario([
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5 }
  ]);
  const marked = createBattleState({ size: 15, seed: 17, units: [
    { id: "ronin", type: "ronin", player: 1, x: 5, y: 5 },
    { id: "foe", type: "swordsman", player: 2, x: 6, y: 5 }
  ] });
  findUnit(marked, "ronin").duelMarks = ["foe"];
  assert.notEqual(hashState(base), hashState(marked), "a duel mark changes the hash");
});

test("Ronin's on-board arts declare VFX recipes", () => {
  assert.equal(getAbilityVfx("flashing-steel").type, "statusStrike");
  assert.equal(getAbilityVfx("flashing-steel").status, "blind");
  assert.equal(getAbilityVfx("shuriken").projectile.shape, "tracer");
  assert.equal(getAbilityVfx("challenge").type, "statusStrike");
});
