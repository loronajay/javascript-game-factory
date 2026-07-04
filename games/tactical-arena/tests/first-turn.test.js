import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { createMatchState } from "../src/match/matchBuilder.js";

const DEFAULT_SQUADS = {
  1: ["swordsman", "archer", "mystic", "magician"],
  2: ["swordsman", "archer", "mystic", "magician"],
};

test("raw battle states keep player 1 as the deterministic test default", () => {
  assert.equal(createBattleState({ seed: 1 }).currentPlayer, 1);
});

test("match startup flips a coin for the first squad turn from the authoritative RNG", () => {
  const p1Opens = createMatchState({ size: 13, squads: DEFAULT_SQUADS, seed: 7 });
  const p2Opens = createMatchState({ size: 13, squads: DEFAULT_SQUADS, seed: 1 });

  assert.equal(p1Opens.currentPlayer, 1);
  assert.equal(p2Opens.currentPlayer, 2);
});

test("the opening coin flip consumes exactly one deterministic RNG draw", () => {
  const first = createMatchState({ size: 13, squads: DEFAULT_SQUADS, seed: 42 });
  const second = createMatchState({ size: 13, squads: DEFAULT_SQUADS, seed: 42 });

  assert.equal(first.currentPlayer, 2);
  assert.equal(first.rngState, 1831565855);
  assert.equal(second.currentPlayer, first.currentPlayer);
  assert.equal(second.rngState, first.rngState);
});
