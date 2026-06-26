import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState } from "../src/core/state.js";
import { canMoveInActivation } from "../src/ui/hud.js";
import { isTargetedMode } from "../src/ui/boardRenderer.js";
import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { buildCodex, buildCodexForTypes } from "../src/ui/codex.js";

test("the default duel uses the standard thirteen-tile map and four-unit corner staging", () => {
  const state = createBattleState();
  assert.equal(state.size, 13);
  assert.deepEqual(
    state.units.map((unit) => [unit.id, unit.position]),
    [
      ["p1-swordsman", { x: 1, y: 12 }],
      ["p1-archer", { x: 0, y: 11 }],
      ["p1-mystic", { x: 0, y: 12 }],
      ["p1-magician", { x: 1, y: 11 }],
      ["p2-swordsman", { x: 11, y: 0 }],
      ["p2-archer", { x: 12, y: 1 }],
      ["p2-mystic", { x: 12, y: 0 }],
      ["p2-magician", { x: 11, y: 1 }]
    ]
  );
});

test("the action bar keeps Move available after attacking if movement is unused", () => {
  assert.equal(canMoveInActivation({ moved: false, primaryUsed: true }), true);
  assert.equal(canMoveInActivation({ moved: true, primaryUsed: false }), false);
  assert.equal(canMoveInActivation({ moved: true, primaryUsed: true }), false);
});

test("the board only treats attack and enemy-target ARTS as targeted modes", () => {
  const actor = { type: "mystic" };

  assert.equal(isTargetedMode("attack", actor), true);
  assert.equal(isTargetedMode("art:silence", actor), true);
  assert.equal(isTargetedMode("art:pray", actor), false);
  assert.equal(isTargetedMode("art:wish", actor), false);
  assert.equal(isTargetedMode("art:volley-shot", { type: "archer" }), false);
});

test("the codex describes either-order movement and primary actions", () => {
  const html = buildCodex();

  assert.match(html, /Move and act in either order/);
  assert.doesNotMatch(html, /Move, then attack or defend/);
});

test("the Paladin codex entry lists Hand of Life and the full passive stack", () => {
  const html = buildCodexForTypes([UNIT_TYPES.paladin]);

  assert.match(html, /Hand of Life/);
  assert.match(html, /Chosen/);
  assert.match(html, /Heaven's Realm/);
  assert.match(html, /Darkseeker/);
});
