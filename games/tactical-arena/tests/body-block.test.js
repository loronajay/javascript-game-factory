import test from "node:test";
import assert from "node:assert/strict";

import { isShotBlocked } from "../src/rules/combat.js";
import { traceGridLine } from "../src/rules/movement.js";
import { createBattleState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation, useArt } from "../src/core/commands.js";

// Pin a clean normal hit so the unblocked resolves are deterministic.
const NORMAL_HIT = { attackRoll: 0.5, critRoll: 0.99 };

// A straight horizontal lane: shooter at (0,0), the tile (1,0) is the choke, the
// mark sits at (2,0). The intervening tile is what a body stands on to block.
function laneState(blocker) {
  const units = [
    { id: "shooter", player: 1, type: "archer", x: 0, y: 0 },
    { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 }
  ];
  if (blocker) units.push(blocker);
  return createBattleState({ units });
}

test("traceGridLine walks an inclusive straight lane", () => {
  assert.deepEqual(traceGridLine(0, 0, 2, 0), [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
});

test("isShotBlocked ignores the endpoints and reports an occupied middle tile", () => {
  const clear = laneState(null);
  assert.equal(isShotBlocked(clear, { x: 0, y: 0 }, { x: 2, y: 0 }), false);

  const blocked = laneState({ id: "wall", player: 2, type: "swordsman", x: 1, y: 0 });
  assert.equal(isShotBlocked(blocked, { x: 0, y: 0 }, { x: 2, y: 0 }), true);
});

test("a body — even a friendly one — blocks a ranged basic attack", () => {
  for (const wall of [
    { id: "wall", player: 2, type: "swordsman", x: 1, y: 0 }, // enemy body
    { id: "wall", player: 1, type: "swordsman", x: 1, y: 0 }  // your own body
  ]) {
    const begun = applyCommand(laneState(wall), beginActivation(1, "shooter"));
    const result = applyCommand(begun.nextState, attack(1, "shooter", "mark", NORMAL_HIT));
    assert.equal(result.accepted, false);
    assert.equal(result.errorCode, "TARGET_OBSTRUCTED");
  }
});

test("a clear lane lets the same ranged attack land", () => {
  const begun = applyCommand(laneState(null), beginActivation(1, "shooter"));
  const result = applyCommand(begun.nextState, attack(1, "shooter", "mark", NORMAL_HIT));
  assert.equal(result.accepted, true);
  assert.ok(result.nextState.units.find((u) => u.id === "mark").hp < 25);
});

test("an adjacent (melee) strike is never blocked — no tile lies between", () => {
  const state = createBattleState({
    units: [
      { id: "sword", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "foe", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "sword"));
  const result = applyCommand(begun.nextState, attack(1, "sword", "foe", NORMAL_HIT));
  assert.equal(result.accepted, true);
});

test("a physical ART (Poison Arrow) is body-blocked like a basic attack", () => {
  const wall = { id: "wall", player: 2, type: "swordsman", x: 1, y: 0 };
  const begun = applyCommand(laneState(wall), beginActivation(1, "shooter"));
  const result = applyCommand(begun.nextState, useArt(1, "shooter", "poison-arrow", {
    targetId: "mark", ...NORMAL_HIT, effectRoll: 0.5
  }));
  assert.equal(result.accepted, false);
  assert.equal(result.errorCode, "TARGET_OBSTRUCTED");
});

test("a magic ART (Spark) reaches through the same body", () => {
  const state = createBattleState({
    units: [
      { id: "mage", player: 1, type: "magician", x: 0, y: 0 },
      { id: "wall", player: 2, type: "swordsman", x: 1, y: 0 },
      { id: "mark", player: 2, type: "swordsman", x: 2, y: 0 }
    ]
  });
  const begun = applyCommand(state, beginActivation(1, "mage"));
  const result = applyCommand(begun.nextState, useArt(1, "mage", "spark", { targetId: "mark", ...NORMAL_HIT }));
  assert.equal(result.accepted, true);
  assert.ok(result.nextState.units.find((u) => u.id === "mark").hp < 25);
});
