import test from "node:test";
import assert from "node:assert/strict";

import {
  ROLL_MODES,
  applyRollMode,
  createEmptyScenario,
  normalizeScenario,
  nextUnitId,
  scenarioToState,
  stateToScenario
} from "../src/dev/scenarioModel.js";
import { applyCommand } from "../src/core/reducer.js";
import { attack, beginActivation } from "../src/core/commands.js";
import { getUnitType } from "../src/core/unitCatalog.js";

// A melee duel scenario: P1 swordsman adjacent to a P2 swordsman, P1 to act.
function duel(overrides = {}) {
  return scenarioToState({
    size: 13,
    currentPlayer: 1,
    seed: 7,
    units: [
      { id: "atk", type: "swordsman", player: 1, x: 0, y: 0 },
      { id: "def", type: "swordsman", player: 2, x: 1, y: 0, ...overrides }
    ]
  });
}

// Resolve a single attack under a roll mode; return the resolved combat event.
function resolveAttack(state, mode) {
  const begun = applyCommand(state, beginActivation(1, "atk"));
  assert.equal(begun.accepted, true);
  const result = applyCommand(begun.nextState, applyRollMode(attack(1, "atk", "def"), mode));
  assert.equal(result.accepted, true);
  return { result, rolled: (result.events ?? []).find((e) => "hit" in e || e.type === "ATTACK_RESOLVED") };
}

test("applyRollMode injects the right pins (and auto injects none)", () => {
  assert.deepEqual(applyRollMode(attack(1, "atk", "def"), "auto").attackRoll, undefined);
  const crit = applyRollMode(attack(1, "atk", "def"), "crit");
  assert.equal(crit.attackRoll, 0.5);
  assert.equal(crit.critRoll, 0);
  assert.equal(applyRollMode(attack(1, "atk", "def"), "miss").attackRoll, 0);
  // Unknown mode falls back to auto rather than throwing.
  assert.deepEqual(applyRollMode({ type: "ATTACK" }, "nope"), { type: "ATTACK" });
});

test("Force Hit lands a non-crit hit", () => {
  const { rolled } = resolveAttack(duel(), "hit");
  assert.ok(rolled, "an attack resolution event was emitted");
  assert.equal(rolled.missed, false);
  assert.equal(rolled.critical, false);
});

test("Force Crit lands a crit", () => {
  const { rolled } = resolveAttack(duel(), "crit");
  assert.equal(rolled.missed, false);
  assert.equal(rolled.critical, true);
});

test("Force Miss whiffs", () => {
  const { rolled } = resolveAttack(duel(), "miss");
  assert.equal(rolled.missed, true);
});

test("scenarioToState honors hp/mp/currentPlayer/tileObjects", () => {
  const state = scenarioToState({
    size: 15,
    currentPlayer: 2,
    seed: 99,
    units: [{ id: "u1", type: "archer", player: 2, x: 3, y: 4, hp: 7, mp: 2 }],
    tileObjects: [{ kind: "wall", x: 5, y: 5, hp: 1 }, { kind: "fire", x: 6, y: 6, turnsLeft: 2 }]
  });
  assert.equal(state.size, 15);
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.rngState, 99);
  const u = state.units.find((x) => x.id === "u1");
  assert.deepEqual(u.position, { x: 3, y: 4 });
  assert.equal(u.hp, 7);
  assert.equal(u.mp, 2);
  assert.equal(state.tileObjects["5,5"].kind, "wall");
  assert.equal(state.tileObjects["6,6"].turnsLeft, 2);
});

test("normalizeScenario drops bad data and resolves collisions", () => {
  const norm = normalizeScenario({
    size: 13,
    units: [
      { id: "ok", type: "mystic", player: 1, x: 2, y: 2 },
      { id: "dupe-tile", type: "archer", player: 2, x: 2, y: 2 }, // same tile → dropped
      { id: "bad-type", type: "dragon", player: 1, x: 4, y: 4 },  // unknown → dropped
      { id: "offboard", type: "archer", player: 1, x: 99, y: 0 }  // clamped on-board, kept
    ]
  });
  assert.equal(norm.units.length, 2);
  assert.ok(norm.units.some((u) => u.id === "ok"));
  assert.ok(!norm.units.some((u) => u.type === "dragon"));
});

test("hp clamps to the unit's own maxHp", () => {
  const norm = normalizeScenario({
    units: [{ type: "swordsman", player: 1, x: 0, y: 0, hp: 9999 }]
  });
  assert.equal(norm.units[0].hp, getUnitType("swordsman").stats.maxHp);
});

test("stateToScenario round-trips a built state and drops the dead", () => {
  const state = scenarioToState({
    units: [
      { id: "live", type: "paladin", player: 1, x: 1, y: 1, hp: 10 },
      { id: "dead", type: "archer", player: 2, x: 2, y: 2, hp: 0 }
    ],
    tileObjects: [{ kind: "fire", x: 3, y: 3, turnsLeft: 1 }]
  });
  const scenario = stateToScenario(state);
  assert.ok(scenario.units.some((u) => u.id === "live"));
  assert.ok(!scenario.units.some((u) => u.id === "dead"), "dead units are not serialized");
  assert.equal(scenario.tileObjects.length, 1);
  // Re-importing yields the same living roster.
  const rebuilt = scenarioToState(scenario);
  assert.equal(rebuilt.units.length, 1);
});

test("nextUnitId avoids existing ids", () => {
  const scenario = createEmptyScenario();
  scenario.units.push({ id: "archer-1", type: "archer", player: 1, x: 0, y: 0 });
  assert.equal(nextUnitId(scenario, "archer"), "archer-2");
  assert.equal(nextUnitId(scenario, "mystic"), "mystic-1");
});

test("ROLL_MODES all carry a label", () => {
  for (const [key, def] of Object.entries(ROLL_MODES)) {
    assert.equal(typeof def.label, "string", `${key} has a label`);
  }
});
