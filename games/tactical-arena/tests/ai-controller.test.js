import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, findUnit } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";

// chooseActivation must return a legal, terminating, deterministic activation for the
// CPU, picking sensible plans. It drives through the SAME reducer a human does.

function skirmish(currentPlayer = 2) {
  const state = createBattleState({
    size: 13,
    seed: 1,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 5, y: 5 },
      { id: "p1-archer", type: "archer", player: 1, x: 4, y: 6 },
      { id: "p1-mystic", type: "mystic", player: 1, x: 3, y: 6, hp: 10 },
      { id: "p1-mage", type: "magician", player: 1, x: 4, y: 7 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 6, y: 5 },
      { id: "p2-archer", type: "archer", player: 2, x: 9, y: 5 },
      { id: "p2-mystic", type: "mystic", player: 2, x: 7, y: 7 },
      { id: "p2-necro", type: "necromancer", player: 2, x: 8, y: 6 }
    ]
  });
  state.currentPlayer = currentPlayer;
  return state;
}

function replay(state, commands) {
  let s = state;
  for (const command of commands) {
    const result = applyCommand(s, command);
    assert.ok(result.accepted, `${command.type} rejected (${result.errorCode})`);
    s = result.nextState;
  }
  return s;
}

test("chooseActivation returns a legal command sequence", () => {
  const state = skirmish();
  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  // An ART primary (e.g. Footwork) spends the activation itself, so the minimum legal
  // sequence is begin → primary (2 commands, no trailing finish); a basic attack/defend
  // adds the finish. Either way it must begin an activation and then act.
  assert.ok(commands.length >= 2, "expected at least begin → primary");
  assert.equal(commands[0].type, "BEGIN_ACTIVATION");
  replay(state, commands);
});

test("chooseActivation is deterministic for a given state", () => {
  const state = skirmish();
  const a = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  const b = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  assert.deepEqual(a, b);
});

test("the CPU takes a lethal shot when one is available", () => {
  // A 2-HP archer sits adjacent to the CPU swordsman: the kill should dominate scoring.
  const state = createBattleState({
    size: 13, seed: 7,
    units: [
      { id: "p1-archer", type: "archer", player: 1, x: 5, y: 5, hp: 2 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 5, y: 6 }
    ]
  });
  state.currentPlayer = 2;
  const commands = chooseActivation(state, { difficulty: "hard", cpuPlayer: 2, rng: cpuRng(state) });
  // The chosen activation must attack the killable archer.
  assert.ok(commands.some((c) => c.type === "ATTACK" && c.targetId === "p1-archer"));
});

test("the CPU advances toward the enemy when nothing is in range", () => {
  const state = createBattleState({
    size: 13, seed: 1,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "p2-sword", type: "swordsman", player: 2, x: 10, y: 10 }
    ]
  });
  state.currentPlayer = 2;
  const before = findUnit(state, "p2-sword").position;
  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  const after = replay(state, commands);
  const moved = findUnit(after, "p2-sword").position;
  const closedDistance =
    Math.max(Math.abs(moved.x - 1), Math.abs(moved.y - 1)) <
    Math.max(Math.abs(before.x - 1), Math.abs(before.y - 1));
  assert.ok(closedDistance, "the lone CPU unit should close on the enemy");
});

test("a full CPU squad turn is legal and terminates, handing the turn back", () => {
  let s = skirmish(2);
  let guard = 0;
  while (s.phase === "playing" && s.currentPlayer === 2 && guard < 64) {
    guard += 1;
    const commands = chooseActivation(s, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(s) });
    assert.ok(commands.length > 0, "CPU produced no commands for an unspent squad");
    s = replay(s, commands);
  }
  assert.ok(guard < 64, "CPU turn did not terminate");
  assert.ok(s.currentPlayer === 1 || s.phase === "complete", "turn should pass back to the human (or end)");
});

test("Easy and Hard both yield legal activations", () => {
  for (const difficulty of ["easy", "hard"]) {
    const state = skirmish();
    const commands = chooseActivation(state, { difficulty, cpuPlayer: 2, rng: cpuRng(state) });
    replay(state, commands);
  }
});

test("excludeArtIds removes a plan from consideration (Rain Dance heal-cap seam)", () => {
  // A damaged, alone Witch Doctor with nothing in range would normally re-cast Rain
  // Dance (its only productive action). With rain-dance excluded, chooseActivation
  // must fall back to something else (e.g. defend) instead of ever emitting a
  // USE_ART for it — the seam campaign.js's WITCH_DOCTOR_HEAL_CAST_CAP relies on.
  const state = createBattleState({
    size: 13, seed: 3,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 1, y: 1 },
      { id: "p2-wd", type: "witch-doctor", player: 2, x: 10, y: 10, hp: 10, mp: 30, stance: "rain" }
    ]
  });
  state.currentPlayer = 2;

  const allowed = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  assert.ok(allowed.some((c) => c.type === "USE_ART" && c.artId === "rain-dance"),
    "sanity check: without exclusion the CPU heals itself");

  const excluded = chooseActivation(state, {
    difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state), excludeArtIds: ["rain-dance"]
  });
  assert.ok(!excluded.some((c) => c.type === "USE_ART" && c.artId === "rain-dance"),
    "rain-dance must not appear once excluded");
  replay(state, excluded);
});

test("the CPU can score Fat Knight's non-status aura without crashing", () => {
  const state = createBattleState({
    size: 13, seed: 11,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 5, y: 4 },
      { id: "p2-fat-knight", type: "fat-knight", player: 2, x: 5, y: 5 }
    ]
  });
  state.currentPlayer = 2;

  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  assert.ok(commands.length > 0);
  replay(state, commands);
});
