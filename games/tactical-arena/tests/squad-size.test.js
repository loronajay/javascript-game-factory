import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { buildRoster } from "../src/match/matchBuilder.js";
import { DEFAULT_SQUAD, normalizeSquad } from "../src/ui/squadPicker.js";

test("standard squads contain four units per team", () => {
  assert.equal(DEFAULT_SQUAD.length, 4);
  assert.deepEqual(DEFAULT_SQUAD, ["swordsman", "archer", "mystic", "magician"]);
});

test("squad normalization preserves four slots and repairs bad entries", () => {
  assert.deepEqual(
    normalizeSquad(["mystic", "archer", "nope", "swordsman", "archer"]),
    ["mystic", "archer", "mystic", "swordsman"]
  );
  assert.deepEqual(normalizeSquad(["archer"]), ["archer", "archer", "mystic", "magician"]);
});

test("custom rosters spawn four units for each player in opposite corner blocks", () => {
  const squads = {
    1: ["swordsman", "archer", "mystic", "swordsman"],
    2: ["mystic", "swordsman", "archer", "mystic"]
  };

  assert.deepEqual(
    buildRoster(squads, 10).map((unit) => [unit.id, unit.player, unit.type, unit.x, unit.y]),
    [
      ["p1-0-swordsman", 1, "swordsman", 1, 9],
      ["p1-1-archer", 1, "archer", 0, 8],
      ["p1-2-mystic", 1, "mystic", 0, 9],
      ["p1-3-swordsman", 1, "swordsman", 1, 8],
      ["p2-0-mystic", 2, "mystic", 8, 0],
      ["p2-1-swordsman", 2, "swordsman", 9, 1],
      ["p2-2-archer", 2, "archer", 9, 0],
      ["p2-3-mystic", 2, "mystic", 8, 1]
    ]
  );
});

test("the default battle state is a four-unit mirror match", () => {
  const state = createBattleState();

  assert.deepEqual(
    state.units.map((unit) => [unit.id, unit.player, unit.type, unit.position]),
    [
      ["p1-swordsman", 1, "swordsman", { x: 1, y: 12 }],
      ["p1-archer", 1, "archer", { x: 0, y: 11 }],
      ["p1-mystic", 1, "mystic", { x: 0, y: 12 }],
      ["p1-magician", 1, "magician", { x: 1, y: 11 }],
      ["p2-swordsman", 2, "swordsman", { x: 11, y: 0 }],
      ["p2-archer", 2, "archer", { x: 12, y: 1 }],
      ["p2-mystic", 2, "mystic", { x: 12, y: 0 }],
      ["p2-magician", 2, "magician", { x: 11, y: 1 }]
    ]
  );
});
