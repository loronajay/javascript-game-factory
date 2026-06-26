import test from "node:test";
import assert from "node:assert/strict";

import {
  chebyshevDistance,
  createBoardMetrics,
  gridToScreen,
  screenToGrid,
  tileKey,
  traceGridLine
} from "../src/geometry/isometric.js";
import { createGameState } from "../src/state/gameState.js";
import { getLegalMoves } from "../src/rules/movement.js";
import {
  getBaseDamage,
  isRangerShotBlocked,
  resolveAttackRoll,
  resolveHealRoll
} from "../src/rules/combat.js";

test("diagonal attack distance has no penalty", () => {
  assert.equal(
    chebyshevDistance({ x: 0, y: 0 }, { x: 4, y: 4 }),
    4
  );
});

test("warrior movement is orthogonal and capped at three", () => {
  const state = createGameState(10);
  const warrior = state.units.find((unit) => unit.id === "p1-warrior");
  warrior.x = 5;
  warrior.y = 5;

  const legal = getLegalMoves(state, warrior);

  assert.equal(legal.has(tileKey(8, 5)), true);
  assert.equal(legal.has(tileKey(7, 6)), true);
  assert.equal(legal.has(tileKey(8, 6)), false);
});

test("warrior damage is reduced against tanks", () => {
  const attacker = { type: "warrior" };

  assert.equal(getBaseDamage(attacker, { type: "tank" }), 2);
  assert.equal(getBaseDamage(attacker, { type: "medic" }), 3);
});

test("rangers deal three base damage to rangers", () => {
  assert.equal(
    getBaseDamage({ type: "ranger" }, { type: "ranger" }),
    3
  );
});

test("defense can reduce damage to zero", () => {
  const result = resolveAttackRoll(
    { type: "medic" },
    { type: "tank", defending: true },
    2
  );

  assert.equal(result.hit, true);
  assert.equal(result.damage, 0);
});

test("a six adds one attack damage", () => {
  const result = resolveAttackRoll(
    { type: "tank" },
    { type: "warrior", defending: false },
    6
  );

  assert.equal(result.critical, true);
  assert.equal(result.damage, 3);
});

test("healing can miss and critical healing restores four", () => {
  const target = { hp: 4, maxHp: 10 };

  assert.equal(resolveHealRoll(target, 1).healing, 0);
  assert.equal(resolveHealRoll(target, 6).healing, 4);
});

test("healing is capped at maximum HP", () => {
  assert.equal(
    resolveHealRoll({ hp: 9, maxHp: 10 }, 6).healing,
    1
  );
});

test("pieces block ranger shots", () => {
  const state = createGameState(10);
  const ranger = state.units.find((unit) => unit.id === "p1-ranger");
  const target = state.units.find((unit) => unit.id === "p2-ranger");
  const blocker = state.units.find((unit) => unit.id === "p1-tank");

  ranger.x = 1;
  ranger.y = 1;
  target.x = 4;
  target.y = 4;
  blocker.x = 2;
  blocker.y = 2;

  assert.equal(isRangerShotBlocked(state, ranger, target), true);
});

test("grid trace includes both endpoints", () => {
  assert.deepEqual(
    traceGridLine(0, 0, 2, 2),
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 }
    ]
  );
});

test("screenToGrid maps isometric tile centers back to grid cells", () => {
  const metrics = createBoardMetrics(10);

  for (const cell of [{ x: 0, y: 0 }, { x: 4, y: 6 }, { x: 9, y: 9 }]) {
    const point = gridToScreen(metrics, cell.x, cell.y);
    assert.deepEqual(
      screenToGrid(metrics, point.x, point.y + metrics.tileHeight / 2, 10),
      cell
    );
  }
});
