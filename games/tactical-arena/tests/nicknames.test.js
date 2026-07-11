import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import {
  NICKNAME_MAX_LENGTH,
  getNicknamePref,
  loadNicknamePrefs,
  saveNicknamePref,
  sanitizeNickname
} from "../src/ui/nicknameModel.js";

class FakeLocalStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

test("sanitizeNickname trims, collapses whitespace, and caps length", () => {
  assert.equal(sanitizeNickname("  Leo  "), "Leo");
  assert.equal(sanitizeNickname("Big   Leo"), "Big Leo");
  assert.equal(sanitizeNickname(""), null);
  assert.equal(sanitizeNickname("   "), null);
  assert.equal(sanitizeNickname(null), null);
  assert.equal(sanitizeNickname(42), null);
  assert.equal(sanitizeNickname("a".repeat(40)).length, NICKNAME_MAX_LENGTH);
  assert.equal(sanitizeNickname("Le\x00o"), "Leo");
});

test("saveNicknamePref/getNicknamePref round-trip through a fake storage", () => {
  const storage = new FakeLocalStorage();
  saveNicknamePref("swordsman", "Leo", storage);
  assert.equal(getNicknamePref("swordsman", storage), "Leo");
  assert.deepEqual(loadNicknamePrefs(storage), { swordsman: "Leo" });
});

test("saving an empty nickname clears the preference", () => {
  const storage = new FakeLocalStorage();
  saveNicknamePref("swordsman", "Leo", storage);
  saveNicknamePref("swordsman", "", storage);
  assert.equal(getNicknamePref("swordsman", storage), null);
  assert.deepEqual(loadNicknamePrefs(storage), {});
});

test("getNicknamePref is null for a type with no saved preference", () => {
  const storage = new FakeLocalStorage();
  assert.equal(getNicknamePref("archer", storage), null);
});

test("createMatchState defaults local nicknames onto player 1 only, never the opponent", () => {
  const storage = new FakeLocalStorage({
    "tactical-arena.nicknames": JSON.stringify({ swordsman: "Leo" })
  });
  globalThis.localStorage = storage;
  try {
    const state = createMatchState({
      seed: 1,
      squads: { 1: ["swordsman", "archer", "mystic", "magician"], 2: ["swordsman", "archer", "mystic", "magician"] }
    });
    assert.deepEqual(
      state.units.filter((unit) => unit.player === 1).map((unit) => [unit.type, unit.nickname]),
      [["swordsman", "Leo"], ["archer", null], ["mystic", null], ["magician", null]]
    );
    // The device owner's personal rename must NOT leak onto the opponent's same-typed
    // units — a rival Swordsman keeps its base name (null nickname).
    assert.deepEqual(
      state.units.filter((unit) => unit.player === 2).map((unit) => [unit.type, unit.nickname]),
      [["swordsman", null], ["archer", null], ["mystic", null], ["magician", null]]
    );
  } finally {
    delete globalThis.localStorage;
  }
});

test("createMatchState honors an explicit per-seat nicknames override (the online path)", () => {
  const state = createMatchState({
    seed: 1,
    squads: { 1: ["swordsman", "archer", "mystic", "magician"], 2: ["swordsman", "archer", "mystic", "magician"] },
    nicknames: { 1: ["Leo", null, null, null], 2: ["Ryan", null, null, null] }
  });
  assert.equal(state.units.find((u) => u.player === 1 && u.type === "swordsman").nickname, "Leo");
  assert.equal(state.units.find((u) => u.player === 2 && u.type === "swordsman").nickname, "Ryan");
});
