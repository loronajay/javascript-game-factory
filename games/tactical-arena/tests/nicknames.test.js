import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/match/matchBuilder.js";
import { TUTORIAL_PROGRESS_KEY } from "../src/progression/unlocks.js";
import { openNicknameGallery } from "../src/ui/nicknameGallery.js";
import {
  NICKNAME_MAX_LENGTH,
  getNicknamePref,
  loadNicknamePrefs,
  saveNicknamePref,
  sanitizeNickname
} from "../src/ui/nicknameModel.js";
import { SKIN_PREF_STORAGE_KEY } from "../src/ui/skinModel.js";

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

class FakeClassList {
  constructor(node) {
    this.node = node;
  }

  add(...names) {
    const current = new Set(this.node.className.split(/\s+/).filter(Boolean));
    for (const name of names) current.add(name);
    this.node.className = [...current].join(" ");
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  removeProperty(name) {
    this.values.delete(name);
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.disabled = false;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  replaceChildren(...nodes) {
    for (const child of this.children) child.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== handler));
  }
}

class FakeDocument {
  constructor() {
    this.body = new FakeElement("body");
    this.listeners = new Map();
  }

  createElement(tagName) {
    return new FakeElement(tagName);
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== handler));
  }
}

function walk(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) walk(child, predicate, matches);
  return matches;
}

function hasClass(node, className) {
  return node.className.split(/\s+/).includes(className);
}

function rowForUnit(overlay, unitName) {
  return walk(overlay, (node) =>
    hasClass(node, "nickname-gallery-row") &&
    walk(node, (child) => hasClass(child, "nickname-gallery-unit") && child.textContent === unitName).length > 0
  )[0];
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

test("nickname gallery does not offer a separate skin equip action for Ghoul", () => {
  globalThis.document = new FakeDocument();
  globalThis.localStorage = new FakeLocalStorage({
    [TUTORIAL_PROGRESS_KEY]: JSON.stringify({
      purchasedSkins: [{ type: "necromancer", slug: "void-dweller" }],
    }),
    [SKIN_PREF_STORAGE_KEY]: JSON.stringify({
      necromancer: "void-dweller",
      ghoul: "blood-moon",
    }),
  });

  try {
    openNicknameGallery();
    const overlay = document.body.children[0];
    const necromancerRow = rowForUnit(overlay, "Necromancer");
    const ghoulRow = rowForUnit(overlay, "Ghoul");

    assert.ok(necromancerRow, "Necromancer row should be present");
    assert.ok(ghoulRow, "Ghoul row should be present");
    assert.equal(
      walk(necromancerRow, (node) => node.tagName === "BUTTON" && node.textContent === "Equip Skin").length,
      1
    );
    assert.equal(
      walk(ghoulRow, (node) => node.tagName === "BUTTON" && node.textContent === "Equip Skin").length,
      0
    );
    assert.equal(
      walk(ghoulRow, (node) => hasClass(node, "nickname-gallery-skinname"))[0]?.textContent,
      "Void Dweller"
    );
  } finally {
    delete globalThis.document;
    delete globalThis.localStorage;
  }
});
