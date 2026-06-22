import test from "node:test";
import assert from "node:assert/strict";

import {
  createMatchState,
  serializeState,
  deserializeState,
} from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { hashState } from "../src/core/state-hash.js";
import { getLegalMoves } from "../src/rules/movement.js";
import { tileKey } from "../src/geometry/isometric.js";
import * as cmd from "../src/core/commands.js";

function unit(id, player, type, x, y, extra = {}) {
  return {
    id,
    player,
    type,
    x,
    y,
    hp: 10,
    maxHp: 10,
    spent: false,
    defending: false,
    ...extra,
  };
}

// A roster where p1 can immediately attack, so the RNG stream is exercised.
function freshMatch(seed) {
  const state = createMatchState({ size: 10, seed });
  state.units = [
    unit("p1-warrior", 1, "warrior", 4, 1),
    unit("p1-medic", 1, "medic", 1, 1, { hp: 4 }),
    unit("p2-tank", 2, "tank", 5, 1),
    unit("p2-ranger", 2, "ranger", 7, 7),
  ];
  return state;
}

// Move + cancel + attack + heal exercises positions, RNG, and turn flow.
const SCRIPT = [
  cmd.beginActivation(1, "p1-warrior"),
  cmd.moveUnit(1, "p1-warrior", 4, 3),
  cmd.cancelMove(1, "p1-warrior"),
  cmd.attack(1, "p1-warrior", "p2-tank"),
  cmd.finishActivation(1, "p1-warrior"),
  cmd.beginActivation(1, "p1-medic"),
  cmd.heal(1, "p1-medic", "p1-medic"),
  cmd.finishActivation(1, "p1-medic"),
];

function runScript(state, script) {
  const hashes = [];
  for (const command of script) {
    const result = applyCommand(state, command);
    assert.equal(result.accepted, true, `script step ${command.type} rejected`);
    state = result.nextState;
    hashes.push(hashState(state));
  }
  return { state, hashes };
}

test("same seed and command log reproduce the same hash at every step", () => {
  const a = runScript(freshMatch(12345), SCRIPT);
  const b = runScript(freshMatch(12345), SCRIPT);
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(hashState(a.state), hashState(b.state));
});

test("a different seed diverges once the dice are rolled", () => {
  const a = runScript(freshMatch(1), SCRIPT);
  const b = runScript(freshMatch(2), SCRIPT);
  // The move/cancel prefix matches; the attack (step index 3) must differ.
  assert.notEqual(a.hashes[3], b.hashes[3]);
});

test("serialize then deserialize preserves legal actions", () => {
  let state = freshMatch(777);
  state = applyCommand(state, cmd.beginActivation(1, "p1-warrior")).nextState;

  const restored = deserializeState(serializeState(state));
  const warrior = restored.units.find((u) => u.id === "p1-warrior");

  const before = getLegalMoves(state, state.units.find((u) => u.id === "p1-warrior"));
  const after = getLegalMoves(restored, warrior);
  assert.deepEqual([...before].sort(), [...after].sort());
  assert.equal(hashState(state), hashState(restored));
});

test("replaying the command log from a serialized start reproduces the final hash", () => {
  const direct = runScript(freshMatch(999), SCRIPT);

  // Restore from a JSON snapshot of the initial state, then replay.
  const snapshot = serializeState(freshMatch(999));
  const replayed = runScript(deserializeState(snapshot), SCRIPT);

  assert.equal(hashState(direct.state), hashState(replayed.state));
});

test("a rejected command never mutates the input state", () => {
  const state = freshMatch(42);
  const before = hashState(state);
  // p1-warrior cannot heal; an illegal command must leave state untouched.
  const result = applyCommand(state, cmd.heal(1, "p1-warrior", "p1-medic"));
  assert.equal(result.accepted, false);
  assert.equal(hashState(state), before);
});
