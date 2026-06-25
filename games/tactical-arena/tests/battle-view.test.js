import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";

test("the default duel uses Mini Tactics' ten-tile map and opposite-corner staging", () => {
  const state = createBattleState();
  assert.equal(state.size, 10);
  assert.deepEqual(
    state.units.map((unit) => [unit.id, unit.position]),
    [
      ["p1-swordsman", { x: 1, y: 9 }],
      ["p1-archer", { x: 0, y: 8 }],
      ["p2-swordsman", { x: 8, y: 0 }],
      ["p2-archer", { x: 9, y: 1 }]
    ]
  );
});
