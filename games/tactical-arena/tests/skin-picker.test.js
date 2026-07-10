import test from "node:test";
import assert from "node:assert/strict";

import { openSkinPicker } from "../src/ui/skinPicker.js";
import { TUTORIAL_PROGRESS_KEY } from "../src/progression/unlocks.js";

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

// Archer's "desert-warrior" is one of the tutorial reward-skin choices, so granting it
// through the same progress ledger the game reads unlocks it for real (no need to
// special-case skinModel for the test).
function grantArcherDesertWarriorUnlock() {
  globalThis.localStorage = new FakeLocalStorage({
    [TUTORIAL_PROGRESS_KEY]: JSON.stringify({
      allTutorialsComplete: true,
      rewardGranted: true,
      selectedRewardSkin: { type: "archer", slug: "desert-warrior" },
    }),
  });
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

  click() {
    if (this.disabled) return;
    for (const handler of this.listeners.get("click") ?? []) {
      handler({ target: this });
    }
  }

  dblclick() {
    if (this.disabled) return;
    for (const handler of this.listeners.get("dblclick") ?? []) {
      handler({ target: this });
    }
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

test("skin picker imports without DOM access", () => {
  assert.equal(typeof openSkinPicker, "function");
});

test("skin picker offers every authored skin locked (no unlock UI yet); classic stays selectable", async () => {
  delete globalThis.localStorage;
  globalThis.document = new FakeDocument();

  const picking = openSkinPicker({ type: "swordsman", initial: "summer-vibes", accent: "#67a4ff" });

  const overlay = document.body.children[0];
  assert.equal(overlay.hidden, false);

  const classic = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "")[0];
  const arcane = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "arcane")[0];
  assert.ok(classic, "classic skin choice should be present");
  assert.ok(arcane, "authored skin choice should be present");
  assert.equal(arcane.disabled, false, "locked skin choices stay clickable so players can preview them");

  // Clicking a locked skin only previews it — it does not lock in the choice.
  arcane.click();

  const repainted = document.body.children[0];
  const selectBtn = walk(repainted, (node) => hasClass(node, "skin-picker-select-btn"))[0];
  assert.ok(selectBtn, "a Select This Skin button should be present while previewing");
  assert.equal(selectBtn.disabled, true, "select button should be disabled while previewing a locked skin");

  const useButton = walk(repainted, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "use")[0];
  useButton.click();

  // Selection never moved off classic since the locked skin was only previewed.
  assert.deepEqual(await picking, { skin: null });
  assert.equal(overlay.hidden, true);
});

test("skin picker requires an explicit Select action before Use Skin locks in a previewed unlocked skin", async () => {
  grantArcherDesertWarriorUnlock();
  globalThis.document = new FakeDocument();

  const picking = openSkinPicker({ type: "archer", initial: null });
  const overlay = document.body.children[0];

  const desertWarrior = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "desert-warrior")[0];
  desertWarrior.click();

  // Previewing does not change what Use Skin would apply.
  let repainted = document.body.children[0];
  let useButton = walk(repainted, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "use")[0];
  assert.equal(useButton.textContent, "Use Classic", "Use Skin should still reflect the locked-in selection, not the preview");

  const selectBtn = walk(repainted, (node) => hasClass(node, "skin-picker-select-btn"))[0];
  selectBtn.click();

  repainted = document.body.children[0];
  useButton = walk(repainted, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "use")[0];
  assert.equal(useButton.textContent, "Use Skin", "Use Skin should update once the previewed skin is explicitly selected");

  useButton.click();
  assert.deepEqual(await picking, { skin: "desert-warrior" });
});

test("skin picker double-click previews and selects an unlocked skin in one step", async () => {
  grantArcherDesertWarriorUnlock();
  globalThis.document = new FakeDocument();

  const picking = openSkinPicker({ type: "archer", initial: null });
  const overlay = document.body.children[0];

  const desertWarrior = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "desert-warrior")[0];
  desertWarrior.dblclick();

  const repainted = document.body.children[0];
  const useButton = walk(repainted, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "use")[0];
  useButton.click();

  assert.deepEqual(await picking, { skin: "desert-warrior" });
});

test("skin picker keeps its grid scroll position while previewing skins", () => {
  delete globalThis.localStorage;
  globalThis.document = new FakeDocument();

  openSkinPicker({ type: "archer", initial: null });

  const overlay = document.body.children[0];
  const grid = walk(overlay, (node) => hasClass(node, "skin-picker-grid"))[0];
  const masquerade = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "masquerade")[0];
  assert.ok(grid, "skin choice grid should be present");
  assert.ok(masquerade, "test skin should be present");

  grid.scrollTop = 216;
  masquerade.click();

  const repaintedGrid = walk(overlay, (node) => hasClass(node, "skin-picker-grid"))[0];
  assert.equal(repaintedGrid.scrollTop, 216);
});

test("skin picker cancel resolves without changing the active skin", async () => {
  delete globalThis.localStorage;
  globalThis.document = new FakeDocument();

  const picking = openSkinPicker({ type: "archer", initial: "summer-vibes" });
  const overlay = document.body.children[0];
  const cancelButton = walk(overlay, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "cancel")[0];

  cancelButton.click();

  assert.equal(await picking, null);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-picker-card")).length, 0);
});
