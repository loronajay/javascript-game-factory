import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { hashState } from "../src/core/state-hash.js";
import {
  DEFAULT_COMPOSITION,
  SQUAD_SIZE,
  normalizeComposition,
  normalizeCompositions,
} from "../src/core/composition.js";
import { unitLabel } from "../src/render/labels.js";

// --- normalizeComposition ----------------------------------------------------

test("normalizeComposition fills missing/invalid slots from the default", () => {
  assert.deepEqual(normalizeComposition(null), [...DEFAULT_COMPOSITION]);
  assert.deepEqual(normalizeComposition([]), [...DEFAULT_COMPOSITION]);
  // Unknown type at slot 0, missing tail -> default at every coerced slot.
  assert.deepEqual(normalizeComposition(["dragon"]), [
    DEFAULT_COMPOSITION[0],
    DEFAULT_COMPOSITION[1],
    DEFAULT_COMPOSITION[2],
    DEFAULT_COMPOSITION[3],
  ]);
  // Always exactly SQUAD_SIZE, extra entries dropped.
  const long = normalizeComposition([
    "ranger",
    "ranger",
    "ranger",
    "ranger",
    "ranger",
  ]);
  assert.equal(long.length, SQUAD_SIZE);
  assert.deepEqual(long, ["ranger", "ranger", "ranger", "ranger"]);
});

test("normalizeComposition is idempotent and preserves valid custom squads", () => {
  const custom = ["ranger", "ranger", "warrior", "tank"];
  assert.deepEqual(normalizeComposition(custom), custom);
  assert.deepEqual(
    normalizeComposition(normalizeComposition(custom)),
    custom
  );
});

test("normalizeCompositions returns null when nothing usable is supplied", () => {
  assert.equal(normalizeCompositions(null), null);
  assert.equal(normalizeCompositions(undefined), null);
  assert.equal(normalizeCompositions({}), null);
  const cleaned = normalizeCompositions({ 1: ["ranger", "ranger"] });
  assert.deepEqual(cleaned[1], [
    "ranger",
    "ranger",
    DEFAULT_COMPOSITION[2],
    DEFAULT_COMPOSITION[3],
  ]);
});

// --- default squad is byte-identical -----------------------------------------

test("absent compositions reproduce the classic one-of-each squad ids", () => {
  const state = createMatchState({ size: 10, seed: 1 });
  const ids = state.units
    .filter((u) => u.player === 1)
    .map((u) => u.id)
    .sort();
  assert.deepEqual(ids, ["p1-medic", "p1-ranger", "p1-tank", "p1-warrior"]);
});

test("an explicit default-shaped composition equals the absent-composition hash", () => {
  const plain = createMatchState({ size: 10, seed: 7 });
  const explicit = createMatchState({
    size: 10,
    seed: 7,
    compositions: { 1: [...DEFAULT_COMPOSITION], 2: [...DEFAULT_COMPOSITION] },
  });
  assert.equal(hashState(explicit), hashState(plain));
});

// --- custom squads -----------------------------------------------------------

test("custom composition spawns the chosen types with unique suffixed ids", () => {
  const state = createMatchState({
    size: 10,
    seed: 1,
    compositions: { 1: ["ranger", "ranger", "warrior", "tank"] },
  });
  const p1 = state.units.filter((u) => u.player === 1);

  // Exactly four units, two of them rangers.
  assert.equal(p1.length, SQUAD_SIZE);
  assert.equal(p1.filter((u) => u.type === "ranger").length, 2);

  const ids = p1.map((u) => u.id).sort();
  // Duplicated type -> suffixed; unique types stay bare.
  assert.deepEqual(ids, [
    "p1-ranger-1",
    "p1-ranger-2",
    "p1-tank",
    "p1-warrior",
  ]);

  // No id collisions across the whole board.
  const allIds = state.units.map((u) => u.id);
  assert.equal(new Set(allIds).size, allIds.length);
});

test("custom composition lands on the four classic spawn tiles", () => {
  const plain = createMatchState({ size: 10, seed: 1 });
  const custom = createMatchState({
    size: 10,
    seed: 1,
    compositions: { 1: ["tank", "tank", "tank", "tank"] },
  });
  const tilesOf = (state) =>
    state.units
      .filter((u) => u.player === 1)
      .map((u) => `${u.x},${u.y}`)
      .sort();
  // Same occupied tiles regardless of which types fill them.
  assert.deepEqual(tilesOf(custom), tilesOf(plain));
});

test("createMatchState is deterministic for a given composition", () => {
  const make = () =>
    createMatchState({
      size: 13,
      seed: 42,
      playerCount: 2,
      compositions: { 1: ["medic", "ranger", "ranger", "tank"] },
    });
  assert.equal(hashState(make()), hashState(make()));
});

// --- unitLabel ---------------------------------------------------------------

test("unitLabel numbers duplicates and leaves unique types bare", () => {
  const state = createMatchState({
    size: 10,
    seed: 1,
    compositions: { 1: ["ranger", "ranger", "warrior", "tank"] },
  });
  const p1 = state.units.filter((u) => u.player === 1);
  const labelFor = (id) => unitLabel(p1.find((u) => u.id === id));

  assert.equal(labelFor("p1-ranger-1"), "Ranger 1");
  assert.equal(labelFor("p1-ranger-2"), "Ranger 2");
  assert.equal(labelFor("p1-tank"), "Tank");
  assert.equal(labelFor("p1-warrior"), "Warrior");
});
