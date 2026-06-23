import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { livingUnits } from "../src/state/gameState.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { generatePlans } from "../src/ai/plans.js";

// --- helpers -----------------------------------------------------------------

function unit(id, player, type, x, y, extra = {}) {
  return { id, player, type, x, y, hp: 10, maxHp: 10, spent: false, defending: false, ...extra };
}

function makeMatch(opts, units) {
  const state = createMatchState({ size: 10, seed: 1, ...opts });
  state.units = units;
  return state;
}

// Drive the CPU through one whole squad turn, applying every command through the
// authoritative reducer. Asserts that every command the CPU emits is accepted —
// that alone proves legality (range, line-of-fire, ownership, no move-only
// finish). Returns the resulting state.
function runCpuSquadTurn(state, difficulty, player, t) {
  let guard = 0;
  while (state.phase === "playing" && state.currentPlayer === player && guard < 64) {
    guard += 1;
    const commands = chooseActivation(state, { difficulty, cpuPlayer: player, rng: cpuRng(state) });
    assert.ok(commands.length > 0, "CPU always produces a plan");
    for (const command of commands) {
      const result = applyCommand(state, command);
      assert.equal(result.accepted, true, `${command.type} rejected: ${result.errorCode}`);
      state = result.nextState;
      if (state.phase === "complete") break;
    }
  }
  assert.ok(guard < 64, "CPU squad turn terminated");
  return state;
}

// Collect the command types of one chosen activation.
function commandKinds(commands) {
  return commands.map((c) => c.type);
}

// --- full-match termination + legality ---------------------------------------

for (const difficulty of ["easy", "normal", "hard"]) {
  test(`two ${difficulty} CPUs play a full match to a clean finish`, () => {
    // A handful of seeds so a single lucky/unlucky dice stream can't mask a stall
    // or an illegal command.
    for (const seed of [1, 7, 42, 1000, 31337]) {
      let state = createMatchState({ size: 10, seed });
      let guard = 0;

      while (state.phase === "playing" && guard < 6000) {
        guard += 1;
        const player = state.currentPlayer;
        const commands = chooseActivation(state, {
          difficulty,
          cpuPlayer: player,
          rng: cpuRng(state),
        });
        assert.ok(commands.length > 0, "a living squad always has a move");

        for (const command of commands) {
          const result = applyCommand(state, command);
          assert.equal(
            result.accepted,
            true,
            `seed ${seed}: ${command.type} rejected (${result.errorCode})`,
          );
          state = result.nextState;
          if (state.phase === "complete") break;
        }
      }

      assert.equal(state.phase, "complete", `seed ${seed}: match should resolve`);
      assert.ok(state.winner, `seed ${seed}: a winner is recorded`);
    }
  });
}

// --- never activates dead/spent units ----------------------------------------

test("the CPU never begins a dead or already-spent unit", () => {
  const state = makeMatch({ size: 10 }, [
    unit("p2-warrior", 2, "warrior", 5, 5, { spent: true }),
    unit("p2-ranger", 2, "ranger", 4, 5),
    unit("p2-medic", 2, "medic", 4, 4, { hp: 0 }), // dead
    unit("p1-tank", 1, "tank", 6, 5),
  ]);
  state.currentPlayer = 2;

  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  const begin = commands[0];
  assert.equal(begin.type, "BEGIN_ACTIVATION");
  assert.equal(begin.unitId, "p2-ranger"); // only the unspent, living unit
});

// --- recognizes an immediate lethal attack -----------------------------------

test("the CPU takes a guaranteed-lethal attack when one exists", () => {
  // A 1-HP enemy warrior sits adjacent to the CPU warrior. Any non-miss kills it,
  // so the lethal plan dominates the score across difficulties.
  for (const difficulty of ["easy", "normal", "hard"]) {
    const state = makeMatch({ size: 10 }, [
      unit("p2-warrior", 2, "warrior", 5, 5),
      unit("p1-medic", 1, "medic", 6, 5, { hp: 1 }), // adjacent, lethal target
      unit("p1-tank", 1, "tank", 0, 0), // keeps the match alive after the kill
    ]);
    state.currentPlayer = 2;

    const commands = chooseActivation(state, { difficulty, cpuPlayer: 2, rng: cpuRng(state) });
    const atk = commands.find((c) => c.type === "ATTACK");
    assert.ok(atk, `${difficulty}: chose to attack`);
    assert.equal(atk.targetId, "p1-medic", `${difficulty}: targeted the lethal enemy`);
  }
});

// --- heal legality -----------------------------------------------------------

test("the CPU only generates heals for wounded allies, never enemies or full allies", () => {
  const state = makeMatch({ size: 10, format: "ffa", playerCount: 2 }, [
    unit("p2-medic", 2, "medic", 5, 5),
    unit("p2-warrior", 2, "warrior", 5, 4), // ally at full HP — not a heal target
    unit("p1-tank", 1, "tank", 6, 5, { hp: 3 }), // wounded ENEMY in range — never heal
  ]);
  state.currentPlayer = 2;

  const medic = state.units.find((u) => u.id === "p2-medic");
  const heals = generatePlans(state, medic).filter((p) => p.primary.kind === "heal");

  // The full-HP ally and the wounded enemy must never appear as heal targets, so
  // there should be no heal plans at all here.
  assert.equal(heals.length, 0);
});

test("the CPU heals a wounded ally that is in range", () => {
  const state = makeMatch({ size: 10, format: "ffa", playerCount: 2 }, [
    unit("p2-medic", 2, "medic", 5, 5),
    unit("p2-warrior", 2, "warrior", 5, 4, { hp: 2 }), // wounded ally in range
    unit("p1-tank", 1, "tank", 0, 0), // far away — no better attack
  ]);
  state.currentPlayer = 2;

  const medic = state.units.find((u) => u.id === "p2-medic");
  const heals = generatePlans(state, medic).filter((p) => p.primary.kind === "heal");
  assert.ok(heals.length > 0);
  assert.ok(heals.every((p) => p.primary.targetId === "p2-warrior"));
});

// --- defend fallback ---------------------------------------------------------

test("the CPU defends when no attack, heal, or reachable enemy is available", () => {
  // One lone CPU unit and an enemy parked far out of any move+attack reach.
  const state = makeMatch({ size: 13 }, [
    unit("p2-tank", 2, "tank", 11, 11),
    unit("p1-tank", 1, "tank", 0, 0), // unreachable this turn
  ]);
  state.currentPlayer = 2;

  const commands = chooseActivation(state, { difficulty: "normal", cpuPlayer: 2, rng: cpuRng(state) });
  const kinds = commandKinds(commands);
  assert.ok(kinds.includes("DEFEND"), "fell back to defend");
  assert.ok(!kinds.includes("ATTACK"), "did not invent an attack");
});

// --- single surviving unit ---------------------------------------------------

test("the CPU finishes its turn with a single surviving unit", () => {
  const state = makeMatch({ size: 10 }, [
    unit("p2-ranger", 2, "ranger", 5, 5),
    unit("p1-tank", 1, "tank", 7, 5),
    unit("p1-warrior", 1, "warrior", 0, 0),
  ]);
  state.currentPlayer = 2;

  const after = runCpuSquadTurn(state, "normal", 2);
  // Either the match ended or the turn passed back to player 1.
  assert.ok(after.phase === "complete" || after.currentPlayer === 1);
});

// --- determinism -------------------------------------------------------------

test("the same state yields the same activation (state-seeded RNG)", () => {
  const build = () => {
    const s = makeMatch({ size: 10 }, [
      unit("p2-warrior", 2, "warrior", 5, 5),
      unit("p2-ranger", 2, "ranger", 4, 5),
      unit("p1-tank", 1, "tank", 6, 6),
      unit("p1-medic", 1, "medic", 2, 2),
    ]);
    s.currentPlayer = 2;
    return s;
  };

  for (const difficulty of ["easy", "normal", "hard"]) {
    const a = chooseActivation(build(), { difficulty, cpuPlayer: 2, rng: cpuRng(build()) });
    const b = chooseActivation(build(), { difficulty, cpuPlayer: 2, rng: cpuRng(build()) });
    assert.deepEqual(a, b, `${difficulty} is deterministic for a fixed state`);
  }
});
