import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, cloneState } from "../src/core/state.js";
import { canonicalString, hashState } from "../src/core/state-hash.js";

// The state hash is the online lockstep desync detector. These guard its two core
// promises: (1) structurally-equal states hash equal regardless of object key order
// and irrelevant transport fields, and (2) any gameplay field that changes future
// legal actions changes the hash.

function baseState() {
  return createBattleState({ size: 13, seed: 42 });
}

test("a state hashes equal to its own clone", () => {
  const s = baseState();
  assert.equal(hashState(s), hashState(cloneState(s)));
});

test("revision is NOT part of the hash (it is the transport sequence key)", () => {
  const s = baseState();
  const before = hashState(s);
  const bumped = cloneState(s);
  bumped.revision = (bumped.revision ?? 0) + 5;
  assert.equal(hashState(bumped), before, "revision must not affect the hash");
});

test("pendingRolloverEvents is not hashed (transient)", () => {
  const s = baseState();
  const before = hashState(s);
  const withRollover = cloneState(s);
  withRollover.pendingRolloverEvents = [{ type: "FIRE_DAMAGE", unitId: "x", damage: 1 }];
  assert.equal(hashState(withRollover), before);
});

test("statModifiers hash is key-order independent", () => {
  const a = baseState();
  const b = cloneState(a);
  a.units[0].statModifiers = { str: 1, move: 2, range: 0 };
  b.units[0].statModifiers = { range: 0, move: 2, str: 1 };
  assert.equal(hashState(a), hashState(b));
});

test("tileObjects hash is insertion-order independent", () => {
  const a = baseState();
  const b = cloneState(a);
  a.tileObjects = { "1,2": { kind: "wall", hp: 1 }, "3,4": { kind: "fire", turnsLeft: 3 } };
  b.tileObjects = { "3,4": { kind: "fire", turnsLeft: 3 }, "1,2": { kind: "wall", hp: 1 } };
  assert.equal(hashState(a), hashState(b));
});

// Every gameplay field that affects future legal actions must move the hash.
for (const [label, mutate] of [
  ["unit hp", (s) => (s.units[0].hp -= 1)],
  ["unit mp", (s) => (s.units[0].mp -= 1)],
  ["unit position", (s) => (s.units[0].position.x += 1)],
  ["unit spent", (s) => (s.units[0].spent = !s.units[0].spent)],
  ["unit defending", (s) => (s.units[0].defending = !s.units[0].defending)],
  ["unit mageChargeCount", (s) => (s.units[0].mageChargeCount = 2)],
  ["unit statuses", (s) => s.units[0].statuses.push({ type: "poison", duration: "permanent" })],
  ["unit statModifiers", (s) => (s.units[0].statModifiers = { str: 3 })],
  ["currentPlayer", (s) => (s.currentPlayer = 2)],
  ["turnNumber", (s) => (s.turnNumber += 1)],
  ["phase", (s) => (s.phase = "complete")],
  ["winner", (s) => (s.winner = 1)],
  ["rngState", (s) => (s.rngState = (s.rngState + 1) >>> 0)],
  ["tileObjects", (s) => (s.tileObjects = { "5,5": { kind: "fire", turnsLeft: 2 } })],
  ["tileAffinities", (s) => (s.tileAffinities = { "0,0": "dark" })],
  ["activation", (s) => (s.activation = { unitId: s.units[0].id, origin: { x: 0, y: 0 }, moved: true, primaryUsed: false, spellUsed: false, bonusActionGroups: [] })],
]) {
  test(`changing ${label} changes the hash`, () => {
    const s = baseState();
    const before = hashState(s);
    const mutated = cloneState(s);
    mutate(mutated);
    assert.notEqual(hashState(mutated), before, `${label} must change the hash`);
  });
}

test("canonicalString is deterministic across repeated calls", () => {
  const s = baseState();
  assert.equal(canonicalString(s), canonicalString(s));
});
