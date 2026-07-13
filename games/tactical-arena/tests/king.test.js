import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { beginActivation, useArt, defend } from "../src/core/commands.js";
import {
  getEffectiveStats, getUnitType, getCommandHealBonus, getCommandRangeBonus,
  getCommandBuffStats, sustainsVictory, isCommandOnly
} from "../src/core/unitCatalog.js";
import { statusImmunities } from "../src/rules/statuses.js";
import { buildRoster } from "../src/match/matchBuilder.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { generatePlans } from "../src/ai/plans.js";

const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

function run(state, command) {
  const result = applyCommand(state, command);
  assert.ok(result.accepted, `command ${command.type} rejected (${result.errorCode})`);
  return result;
}

// A board with a King (p1) issuing a command, an ally, and an enemy. `king` overrides
// let a test hand the King an already-active command so the live buff fold can be read
// without cycling turns. turnNumber defaults to 1, so commandTurn:1 == "active now".
function scenario(overrides = {}) {
  return createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-king", type: "king", player: 1, x: 0, y: 0, ...overrides.king },
      { id: "p1-ally", type: "swordsman", player: 1, x: 2, y: 2, ...overrides.ally },
      { id: "p1-ranger", type: "archer", player: 1, x: 3, y: 3, ...overrides.ranger },
      { id: "p2-foe", type: "swordsman", player: 2, x: 10, y: 10, ...overrides.foe }
    ]
  });
}

test("King is a 30-HP non-combatant commander with an empty stat block", () => {
  const def = getUnitType("king");
  assert.equal(def.name, "King");
  assert.equal(def.classType, "support");
  assert.equal(def.actsFirst, true);
  assert.equal(def.commandOnly, true);
  assert.equal(def.sustainsVictory, false);
  assert.deepEqual(def.stats, { moveRange: 0, attackRange: 0, strength: 0, defense: 0, maxHp: 30, maxMp: 0 });
  assert.equal(sustainsVictory({ type: "king" }), false);
  assert.equal(isCommandOnly({ type: "king" }), true);
});

test("Royal Detachment makes the King immune to every affliction (never soft-locks his command)", () => {
  const immune = statusImmunities({ type: "king" });
  for (const status of ["blind", "silence", "slow", "stun", "poison"]) {
    assert.ok(immune.has(status), `King should be immune to ${status}`);
  }
});

test("the King stays immobile — a command is never a movement buff for himself", () => {
  const state = scenario({ king: { command: "pursue", commandTurn: 1 } });
  const king = findUnit(state, "p1-king");
  assert.equal(getEffectiveStats(king, state).moveRange, 0);
  // getCommandBuffStats excludes the commandOnly King outright.
  assert.deepEqual(getCommandBuffStats(king, state), {});
});

test("Strike! grants allies +2 STR this turn (folded live)", () => {
  const base = getUnitType("swordsman").stats.strength;
  const state = scenario({ king: { command: "strike", commandTurn: 1 } });
  assert.equal(getEffectiveStats(findUnit(state, "p1-ally"), state).strength, base + 2);
  // The enemy is unaffected.
  assert.equal(getEffectiveStats(findUnit(state, "p2-foe"), state).strength, getUnitType("swordsman").stats.strength);
});

test("Strike! reads +3 STR when the King's previous command was Pursue!", () => {
  const base = getUnitType("swordsman").stats.strength;
  const state = scenario({ king: { command: "strike", previousCommand: "pursue", commandTurn: 1 } });
  assert.equal(getEffectiveStats(findUnit(state, "p1-ally"), state).strength, base + 3);
});

test("command buffs scale by +1 for each allied unit currently in RAGE", () => {
  const base = getUnitType("swordsman").stats.strength;
  // The archer is at 4 HP → raging → +1 to the Strike buff for the whole squad.
  const state = scenario({ king: { command: "strike", commandTurn: 1 }, ranger: { hp: 4 } });
  assert.equal(getEffectiveStats(findUnit(state, "p1-ally"), state).strength, base + 3);
});

test("Pursue! grants +1 MOVE, Hold! grants +1 DEF and a heal bonus, Higher Ground! grants +1 range", () => {
  const moveBase = getUnitType("swordsman").stats.moveRange;
  const pursue = scenario({ king: { command: "pursue", commandTurn: 1 } });
  assert.equal(getEffectiveStats(findUnit(pursue, "p1-ally"), pursue).moveRange, moveBase + 1);

  const defBase = getUnitType("swordsman").stats.defense;
  const hold = scenario({ king: { command: "hold", commandTurn: 1 } });
  assert.equal(getEffectiveStats(findUnit(hold, "p1-ally"), hold).defense, defBase + 1);
  assert.equal(getCommandHealBonus(hold, findUnit(hold, "p1-ally")), 1);
  assert.equal(getCommandRangeBonus(hold, findUnit(hold, "p1-ally")), 0);

  const rngBase = getUnitType("archer").stats.attackRange;
  const high = scenario({ king: { command: "higher-ground", commandTurn: 1 } });
  assert.equal(getEffectiveStats(findUnit(high, "p1-ranger"), high).attackRange, rngBase + 1);
  assert.equal(getCommandRangeBonus(high, findUnit(high, "p1-ranger")), 1);
});

test("Hold!'s heal bonus also scales per raging ally", () => {
  const hold = scenario({ king: { command: "hold", commandTurn: 1 }, ranger: { hp: 4 } });
  assert.equal(getCommandHealBonus(hold, findUnit(hold, "p1-ally")), 2); // 1 base + 1 raging ally
});

test("a command only buffs during the turn it was issued", () => {
  const base = getUnitType("swordsman").stats.strength;
  // commandTurn 0 (a stale command from a previous turn) is not active on turn 1.
  const stale = scenario({ king: { command: "strike", commandTurn: 0 } });
  assert.equal(getEffectiveStats(findUnit(stale, "p1-ally"), stale).strength, base);
});

test("a King-less squad is never touched by the command fold", () => {
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-a", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "p2-b", type: "archer", player: 2, x: 9, y: 9 }
    ]
  });
  assert.deepEqual(getCommandBuffStats(findUnit(state, "p1-a"), state), {});
});

test("the King must command before any squadmate may act", () => {
  const state = scenario();
  const blocked = applyCommand(state, beginActivation(1, "p1-ally"));
  assert.ok(!blocked.accepted);
  assert.equal(blocked.errorCode, "KING_MUST_ACT_FIRST");

  // The King himself may open, and issue a global 0-MP command…
  let r = run(state, beginActivation(1, "p1-king"));
  r = run(r.nextState, useArt(1, "p1-king", "strike"));
  const s = r.nextState;
  const king = findUnit(s, "p1-king");
  assert.equal(king.command, "strike");
  assert.equal(king.commandTurn, s.turnNumber);
  assert.equal(king.spent, true);
  assert.equal(king.mp, 0);

  // …and now the ally is free to act.
  const now = applyCommand(s, beginActivation(1, "p1-ally"));
  assert.ok(now.accepted);
});

test("the King cannot move, attack, or defend", () => {
  const state = scenario();
  const r = run(state, beginActivation(1, "p1-king"));
  const denied = applyCommand(r.nextState, defend(1, "p1-king"));
  assert.ok(!denied.accepted);
  assert.equal(denied.errorCode, "COMMANDER_CANNOT_ACT");
});

test("a command remembers the one it replaced (for Strike's Pursue bonus)", () => {
  const state = scenario({ king: { command: "pursue", commandTurn: 1 } });
  let r = run(state, beginActivation(1, "p1-king"));
  r = run(r.nextState, useArt(1, "p1-king", "strike"));
  const king = findUnit(r.nextState, "p1-king");
  assert.equal(king.command, "strike");
  assert.equal(king.previousCommand, "pursue");
});

test("when an allied unit falls, the King takes 10 and the rest of the squad rallies 5", () => {
  // P2's turn: an enemy stands next to a 1-HP ally and finishes it. Two other p1 allies
  // survive to be rallied; the King is excluded from the rally.
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-king", type: "king", player: 1, x: 0, y: 0, hp: 30 },
      { id: "p1-doomed", type: "swordsman", player: 1, x: 6, y: 5, hp: 1 },
      { id: "p1-a", type: "archer", player: 1, x: 2, y: 2, hp: 18 },
      { id: "p1-b", type: "mystic", player: 1, x: 3, y: 2, hp: 18 },
      { id: "p2-foe", type: "swordsman", player: 2, x: 5, y: 5 }
    ]
  });
  state.currentPlayer = 2;

  let r = run(state, beginActivation(2, "p2-foe"));
  r = run(r.nextState, { type: "ATTACK", player: 2, actorId: "p2-foe", targetId: "p1-doomed", ...NORMAL_HIT });
  const s = r.nextState;

  assert.equal(findUnit(s, "p1-doomed").hp, 0);
  assert.equal(findUnit(s, "p1-king").hp, 20);   // 30 − 10 for the fallen ally
  assert.equal(findUnit(s, "p1-a").hp, 23);       // 18 + 5 rally
  assert.equal(findUnit(s, "p1-b").hp, 23);       // 18 + 5 rally
  assert.ok(r.events.some((e) => e.type === "KING_MOURNS" && e.damage === 10));
  assert.ok(r.events.some((e) => e.type === "SQUAD_RALLY" && e.healing === 5));
});

test("a lone King is a loss — he cannot sustain the match on his own", () => {
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-king", type: "king", player: 1, x: 0, y: 0 },
      { id: "p1-last", type: "swordsman", player: 1, x: 6, y: 5, hp: 1 },
      { id: "p2-foe", type: "swordsman", player: 2, x: 5, y: 5 }
    ]
  });
  state.currentPlayer = 2;
  let r = run(state, beginActivation(2, "p2-foe"));
  r = run(r.nextState, { type: "ATTACK", player: 2, actorId: "p2-foe", targetId: "p1-last", ...NORMAL_HIT });
  const s = r.nextState;
  assert.equal(s.phase, "complete");
  assert.equal(s.winner, 2); // p1 has only its King left → defeated
});

test("reviving a fallen ally restores 10 HP to the King", () => {
  // King commands first (Hold), then a raging Father Time rewinds the dead ally back.
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-king", type: "king", player: 1, x: 0, y: 0, hp: 10 },
      { id: "p1-ft", type: "father-time", player: 1, x: 5, y: 5, hp: 4, mp: 20 },
      { id: "p1-dead", type: "swordsman", player: 1, x: 5, y: 6, hp: 0 },
      { id: "p2-foe", type: "swordsman", player: 2, x: 11, y: 11 }
    ]
  });
  let r = run(state, beginActivation(1, "p1-king"));
  r = run(r.nextState, useArt(1, "p1-king", "hold"));
  r = run(r.nextState, beginActivation(1, "p1-ft"));
  r = run(r.nextState, useArt(1, "p1-ft", "rewind", { targetId: "p1-dead", targetPosition: { x: 4, y: 5 } }));
  const s = r.nextState;
  assert.ok(findUnit(s, "p1-dead").hp > 0);            // revived
  assert.equal(findUnit(s, "p1-king").hp, 20);         // 10 + 10 for the revival
  assert.ok(r.events.some((e) => e.type === "KING_RESTORED" && e.healing === 10));
});

test("the CPU only ever offers the King his commands (never a stalling move/attack)", () => {
  const state = scenario();
  const plans = generatePlans(state, findUnit(state, "p1-king"));
  assert.ok(plans.length >= 4, "King should have a plan per command");
  assert.ok(plans.every((p) => p.primary.kind === "art"), "no move/attack/defend plans for the King");
  const commandIds = new Set(plans.map((p) => p.primary.artId));
  for (const id of ["strike", "hold", "pursue", "higher-ground"]) assert.ok(commandIds.has(id), `missing ${id}`);
});

test("the CPU commands its King first, then plays the rest of the squad — no stall", () => {
  const state = createBattleState({
    size: 13, seed: 5,
    units: [
      { id: "p2-king", type: "king", player: 2, x: 12, y: 0 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 10, y: 2 },
      { id: "p1-foe", type: "swordsman", player: 1, x: 3, y: 9 }
    ]
  });
  state.currentPlayer = 2;

  const first = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  assert.equal(first[0].type, "BEGIN_ACTIVATION");
  assert.equal(first[0].unitId, "p2-king");
  assert.ok(first.some((c) => c.type === "USE_ART"), "the King's activation must issue a command");

  let s = state;
  for (const c of first) { const r = applyCommand(s, c); assert.ok(r.accepted, `${c.type} rejected (${r.errorCode})`); s = r.nextState; }

  // King is spent → the next chosen activation is a real squad unit and still replays.
  const second = chooseActivation(s, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(s) });
  assert.notEqual(findUnit(s, second[0].unitId).type, "king");
  for (const c of second) { const r = applyCommand(s, c); assert.ok(r.accepted, `${c.type} rejected (${r.errorCode})`); s = r.nextState; }
});

test("the King always spawns on the far corner cell", () => {
  // King is drafted in slot 0, but must end up on the corner cell, not slot 0's cell.
  const squads = { 1: ["king", "swordsman", "archer", "mystic"] };
  const units = buildRoster(squads, 13);
  const king = units.find((u) => u.type === "king");
  // Corner block for player 1 is anchored at (0, size-1); the very corner cell is (0,12).
  assert.deepEqual({ x: king.x, y: king.y }, { x: 0, y: 12 });
  // No two units share a tile.
  const keys = new Set(units.map((u) => `${u.x},${u.y}`));
  assert.equal(keys.size, units.length);
});
