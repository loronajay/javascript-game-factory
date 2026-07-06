import test from "node:test";
import assert from "node:assert/strict";

import { beginActivation } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { consumeOneShotRage } from "../src/core/reactions.js";
import { createBattleState, findUnit } from "../src/core/state.js";
import { resolveVictory, spendAndAdvance } from "../src/core/turnEngine.js";

test("turn engine resolves victory for remaining combat-capable teams", () => {
  const state = createBattleState({
    units: [
      { id: "p1", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2", type: "swordsman", player: 2, x: 5, y: 5, hp: 0 }
    ]
  });

  resolveVictory(state);

  assert.equal(state.phase, "complete");
  assert.equal(state.winner, 1);
});

test("turn engine advances rollover effects through the shared spend path", () => {
  const state = createBattleState({
    units: [
      { id: "p1", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "p2", type: "swordsman", player: 2, x: 5, y: 5 }
    ],
    tileObjects: [{ x: 5, y: 5, kind: "fire", turnsLeft: 2 }]
  });
  state.activation = { unitId: "p1", origin: { x: 0, y: 0 }, moved: false, primaryUsed: true };

  spendAndAdvance(state, findUnit(state, "p1"));

  assert.equal(state.currentPlayer, 2);
  assert.equal(findUnit(state, "p2").hp, 24);
  assert.ok(state.pendingRolloverEvents.some((event) => event.type === "FIRE_DAMAGE"));
});

test("reaction helpers consume a one-shot rage attack consistently", () => {
  const state = createBattleState({
    units: [{ id: "fb", type: "fat-bowman", player: 1, x: 0, y: 0, hp: 5 }]
  });
  const unit = findUnit(state, "fb");

  assert.deepEqual(consumeOneShotRage(unit), [{ type: "DESPERATION_SHOT", unitId: "fb" }]);
  assert.equal(unit.desperationShotSpent, true);
  assert.equal(unit.skipNextActivation, true);
  assert.deepEqual(consumeOneShotRage(unit), []);
});

test("reducer still runs post-command reactions after the split", () => {
  const state = createBattleState({
    seed: 4,
    units: [
      { id: "king", type: "king", player: 1, x: 0, y: 0 },
      { id: "ally", type: "swordsman", player: 1, x: 1, y: 0, hp: 1 },
      { id: "attacker", type: "swordsman", player: 2, x: 2, y: 0 }
    ]
  });
  state.currentPlayer = 2;

  const begun = applyCommand(state, beginActivation(2, "attacker"));
  const result = applyCommand(begun.nextState, {
    type: "ATTACK",
    player: 2,
    actorId: "attacker",
    targetId: "ally",
    attackRoll: 0.5,
    critRoll: 0.99
  });

  assert.equal(result.accepted, true);
  assert.ok(result.events.some((event) => event.type === "KING_MOURNS"));
  assert.equal(findUnit(result.nextState, "king").hp, 20);
});
