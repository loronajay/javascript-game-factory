import test from "node:test";
import assert from "node:assert/strict";

import { writeUnlockProgress } from "../src/progression/unlocks.js";
import { openSkinGallery, openSkinViewer } from "../src/ui/skinGallery.js";

class FakeClassList {
  constructor(node) {
    this.node = node;
  }

  add(...names) {
    const current = new Set(this.node.className.split(/\s+/).filter(Boolean));
    for (const name of names) current.add(name);
    this.node.className = [...current].join(" ");
  }

  contains(name) {
    return this.node.className.split(/\s+/).includes(name);
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
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classList = new FakeClassList(this);
    this.hidden = false;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  appendChild(node) {
    if (node.parentElement) {
      node.parentElement.children = node.parentElement.children.filter((child) => child !== node);
    }
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

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function trigger(node, type) {
  for (const handler of node.listeners.get(type) ?? []) {
    handler({ target: node });
  }
}

test("skin gallery entries are buttons that open and close an enlarged skin view", () => {
  globalThis.document = new FakeDocument();

  openSkinGallery();

  const overlay = document.body.children[0];
  assert.equal(overlay.hidden, false);

  const skinButtons = walk(overlay, (node) => node.tagName === "BUTTON" && hasClass(node, "skin-gallery-item"));
  assert.ok(skinButtons.length > 0, "gallery should render clickable skin entries");
  assert.match(skinButtons[0].getAttribute("aria-label"), /^View .+ skin for .+$/);

  skinButtons[0].click();

  const detailViews = walk(overlay, (node) => hasClass(node, "skin-gallery-detail"));
  assert.equal(detailViews.length, 1, "clicking a skin should show the enlarged detail view");
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);

  const detailPortraits = walk(overlay, (node) => hasClass(node, "is-skin-detail"));
  assert.equal(detailPortraits.length, 1, "detail view should render a larger portrait variant");

  const returnButton = walk(overlay, (node) => node.tagName === "BUTTON" && hasClass(node, "skin-gallery-detail-close"))[0];
  assert.equal(returnButton.getAttribute("aria-label"), "Return to skins list");
  returnButton.click();

  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-grid")).length > 0);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-detail")).length, 0);
});

test("skin gallery can open directly to a requested skin detail", () => {
  globalThis.document = new FakeDocument();

  openSkinGallery({ initial: { type: "swordsman", slug: "medieval" } });

  const overlay = document.body.children[0];
  const detailViews = walk(overlay, (node) => hasClass(node, "skin-gallery-detail"));
  assert.equal(detailViews.length, 1, "initial skin should render the enlarged detail view");
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);

  const titles = walk(overlay, (node) => hasClass(node, "skin-gallery-detail-title"));
  assert.ok(titles.some((node) => node.textContent === "Medieval"));
  const portraits = walk(overlay, (node) => hasClass(node, "is-skin-detail"));
  assert.equal(portraits.length, 1);
  assert.equal(portraits[0].dataset.type, "swordsman");
  assert.equal(portraits[0].dataset.skin, "medieval");
});

test("skin viewer opens only the requested skin detail without gallery navigation", () => {
  globalThis.document = new FakeDocument();

  openSkinViewer({ type: "swordsman", slug: "medieval" });

  const overlay = document.body.children[0];
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-detail")).length, 1);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-detail-close")).length, 0);
  assert.ok(walk(overlay, (node) => node.tagName === "H2").some((node) => node.textContent === "Skin Viewer"));
  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-detail-title")).some((node) => node.textContent === "Medieval"));
});

test("skin viewer shows the cancer research proceeds note for Fuck Cancer skins", () => {
  globalThis.document = new FakeDocument();

  openSkinViewer({ type: "juggernaut", slug: "fuck-cancer" });

  const overlay = document.body.children[0];
  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-detail-title")).some((node) => node.textContent === "Fuck Cancer"));
  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-detail-note")).some((node) =>
    node.textContent === "All proceeds for this skin will be donated for cancer research."
  ));
});

test("skin viewer never falls back to the full skin grid", () => {
  globalThis.document = new FakeDocument();

  openSkinViewer({ type: "swordsman", slug: "not-real" });

  const overlay = document.body.children[0];
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-unit-section")).length, 0);
  assert.equal(walk(overlay, (node) => hasClass(node, "skin-gallery-detail")).length, 1);
  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-detail-title")).some((node) => node.textContent === "Skin unavailable"));
});

test("skin gallery nests skin cards under unit shelves inside each class", () => {
  globalThis.document = new FakeDocument();

  openSkinGallery();

  const overlay = document.body.children[0];
  const unitShelves = walk(overlay, (node) => hasClass(node, "skin-gallery-unit-section"));
  assert.ok(unitShelves.length > 0, "gallery should render per-unit skin shelves");

  const swordsmanShelf = unitShelves.find((node) => node.dataset.type === "swordsman");
  assert.ok(swordsmanShelf, "swordsman should have its own skin shelf");
  assert.ok(walk(swordsmanShelf, (node) => hasClass(node, "skin-gallery-unit-title")).some((node) => node.textContent === "Swordsman"));

  const buttons = walk(swordsmanShelf, (node) => node.tagName === "BUTTON" && hasClass(node, "skin-gallery-item"));
  assert.ok(buttons.length > 0);
  assert.ok(buttons.every((button) => button.dataset.type === "swordsman"));
});

test("skin gallery can hide unowned skins with the Show Unowned toggle", () => {
  globalThis.document = new FakeDocument();
  const storage = storageAdapter();
  writeUnlockProgress(storage, {
    purchasedSkins: [{ type: "swordsman", slug: "medieval" }],
  });

  openSkinGallery({ storage });

  const overlay = document.body.children[0];
  const toggle = walk(overlay, (node) => node.tagName === "INPUT" && hasClass(node, "skin-gallery-toggle-input"))[0];
  assert.ok(toggle, "gallery should render a Show Unowned checkbox");
  assert.equal(toggle.checked, true);
  assert.ok(walk(overlay, (node) => node.textContent === "Show Unowned").length > 0);
  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-item") && hasClass(node, "is-locked")).length > 0);

  toggle.checked = false;
  trigger(toggle, "change");

  const filteredItems = walk(overlay, (node) => hasClass(node, "skin-gallery-item"));
  assert.ok(filteredItems.length > 0, "owned skins should remain visible");
  assert.equal(filteredItems.some((node) => hasClass(node, "is-locked")), false);
  assert.ok(filteredItems.some((node) => node.dataset.type === "swordsman" && node.dataset.skin === "medieval"));

  toggle.checked = true;
  trigger(toggle, "change");

  assert.ok(walk(overlay, (node) => hasClass(node, "skin-gallery-item") && hasClass(node, "is-locked")).length > 0);
});
