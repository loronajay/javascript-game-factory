import test from "node:test";
import assert from "node:assert/strict";

import { openSkinPicker } from "../src/ui/skinPicker.js";

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
  globalThis.document = new FakeDocument();

  const picking = openSkinPicker({ type: "swordsman", initial: "summer-vibes", accent: "#67a4ff" });

  const overlay = document.body.children[0];
  assert.equal(overlay.hidden, false);

  const classic = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "")[0];
  const arcane = walk(overlay, (node) => node.tagName === "BUTTON" && node.dataset.skin === "arcane")[0];
  assert.ok(classic, "classic skin choice should be present");
  assert.ok(arcane, "authored skin choice should be present");
  assert.equal(arcane.disabled, true, "locked skin choices should be disabled");

  // Clicking a locked skin does nothing — selection stays classic since the
  // requested initial slug (also locked) already normalized down to null.
  arcane.click();

  const useButton = walk(overlay, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "use")[0];
  useButton.click();

  assert.deepEqual(await picking, { skin: null });
  assert.equal(overlay.hidden, true);
});

test("skin picker keeps its grid scroll position while previewing skins", () => {
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
  globalThis.document = new FakeDocument();

  const picking = openSkinPicker({ type: "archer", initial: "summer-vibes" });
  const overlay = document.body.children[0];
  const cancelButton = walk(overlay, (node) =>
    node.tagName === "BUTTON" && node.dataset.skinAction === "cancel")[0];

  cancelButton.click();

  assert.equal(await picking, null);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-picker-card")).length, 0);
});
