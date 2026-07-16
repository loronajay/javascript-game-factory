import test from "node:test";
import assert from "node:assert/strict";

import { beginActivation } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState } from "../src/core/state.js";
import { readableError } from "../src/match/matchBuilder.js";

test("first-actor gate message names Mother Nature instead of King", () => {
  const state = createBattleState({
    units: [
      { id: "mn", type: "mother-nature", player: 1, x: 1, y: 1 },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  const blocked = applyCommand(state, beginActivation(1, "ally"));

  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "KING_MUST_ACT_FIRST");
  assert.equal(
    readableError(blocked.errorCode, state, 1),
    "Mother Nature must act before the rest of the squad may act."
  );
});

test("first-actor gate message keeps the King command wording for King", () => {
  const state = createBattleState({
    units: [
      { id: "king", type: "king", player: 1, x: 1, y: 1 },
      { id: "ally", type: "swordsman", player: 1, x: 2, y: 1 },
      { id: "foe", type: "swordsman", player: 2, x: 7, y: 7 }
    ]
  });

  const blocked = applyCommand(state, beginActivation(1, "ally"));

  assert.equal(blocked.accepted, false);
  assert.equal(blocked.errorCode, "KING_MUST_ACT_FIRST");
  assert.equal(
    readableError(blocked.errorCode, state, 1),
    "Your King must issue his command before the rest of the squad may act."
  );
});
