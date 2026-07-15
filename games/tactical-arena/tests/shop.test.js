import test from "node:test";
import assert from "node:assert/strict";

import { openShop } from "../src/ui/shop.js";
import { openSkinGallery } from "../src/ui/skinGallery.js";

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
    this.disabled = false;
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

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

function walk(node, predicate, matches = []) {
  if (node && predicate(node)) matches.push(node);
  for (const child of node?.children ?? []) walk(child, predicate, matches);
  return matches;
}

function hasClass(node, className) {
  return node.className.split(/\s+/).includes(className);
}

function visibleText(node) {
  return [node.textContent, ...(node.children ?? []).map(visibleText)].join("");
}

test("shop skins render under unit shelves and Valor uses an icon badge", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter());

  const overlay = document.body.children[0];
  const balance = walk(overlay, (node) => hasClass(node, "shop-balance"))[0];
  assert.ok(balance, "shop should show the Valor balance badge");
  assert.ok(walk(balance, (node) => hasClass(node, "valor-icon")).length > 0);
  assert.match(balance.getAttribute("aria-label"), /Valor$/);
  assert.doesNotMatch(visibleText(balance), /Valor/);

  const skinsTab = walk(overlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const shelves = walk(overlay, (node) => hasClass(node, "shop-unit-skin-section"));
  assert.ok(shelves.length > 0, "shop skins should be organized into per-unit shelves");
  assert.ok(shelves.some((node) => node.dataset.type === "swordsman"));
});

test("shop unit cards open a detail card and return to unit browsing", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter());

  const overlay = document.body.children[0];
  const unitCard = walk(overlay, (node) => hasClass(node, "shop-unit"))[0];
  assert.ok(unitCard, "shop should render unit cards");

  const buttons = walk(unitCard, (node) => node.tagName === "BUTTON");
  assert.equal(buttons[0].textContent, "Details", "details should sit above the purchase button");
  assert.ok(hasClass(buttons[1], "shop-buy-btn"), "purchase button should stay below details");

  buttons[0].click();

  const detail = walk(overlay, (node) => hasClass(node, "shop-unit-detail"))[0];
  assert.ok(detail, "details button should open a unit detail card inside the shop");
  assert.doesNotMatch(visibleText(detail), /Tips/i, "shop unit details should not be crowded by a tips panel");
  assert.equal(walk(detail, (node) => hasClass(node, "shop-unit-tips")).length, 0);
  const rules = walk(detail, (node) => hasClass(node, "shop-unit-detail-rules"))[0];
  assert.match(rules.innerHTML, /stat-grid/);
  assert.match(rules.innerHTML, /ref-group/);

  const back = walk(overlay, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-detail-back"))[0];
  assert.ok(back, "unit detail card should include a return control");
  back.click();

  assert.equal(walk(overlay, (node) => hasClass(node, "shop-unit-detail")).length, 0);
  assert.ok(walk(overlay, (node) => hasClass(node, "shop-unit")).length > 0, "back should restore unit browsing");
});

test("clicking a shop skin portrait opens a viewer that closes back to the shop", () => {
  globalThis.document = new FakeDocument();

  openSkinGallery();
  const existingGallery = document.body.children[0];
  walk(existingGallery, (node) => node.tagName === "BUTTON" && hasClass(node, "ref-close"))[0].click();

  openShop(storageAdapter());

  const shopOverlay = document.body.children.find((node) => hasClass(node, "shop-modal"));
  const skinsTab = walk(shopOverlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const preview = walk(shopOverlay, (node) => node.tagName === "BUTTON" && hasClass(node, "shop-skin-preview"))[0];
  assert.ok(preview, "shop skin portrait should be a clickable preview button");
  assert.match(preview.getAttribute("aria-label"), /^View .+ skin for .+$/);
  preview.click();

  const galleryOverlay = document.body.children.find((node) => hasClass(node, "skin-gallery-modal"));
  assert.ok(galleryOverlay, "clicking the portrait should open the skin gallery modal");
  assert.equal(galleryOverlay.hidden, false);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "is-skin-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail-close")).length, 0);
  assert.ok(walk(galleryOverlay, (node) => node.tagName === "H2").some((node) => node.textContent === "Skin Viewer"));
  assert.equal(document.body.children.at(-1), galleryOverlay, "skin viewer should move above the shop modal");

  walk(galleryOverlay, (node) => node.tagName === "BUTTON" && hasClass(node, "ref-close"))[0].click();

  assert.equal(galleryOverlay.hidden, true);
  assert.equal(shopOverlay.hidden, false, "closing the shop-origin skin viewer should reveal the shop");
  assert.ok(walk(shopOverlay, (node) => hasClass(node, "shop-unit-skin-section")).length > 0);
});

test("clicking a shop skin card surface opens the direct viewer instead of the full skin grid", () => {
  globalThis.document = new FakeDocument();

  openShop(storageAdapter());

  const shopOverlay = document.body.children.find((node) => hasClass(node, "shop-modal"));
  const skinsTab = walk(shopOverlay, (node) => node.tagName === "BUTTON" && node.textContent === "Skins")[0];
  skinsTab.click();

  const card = walk(shopOverlay, (node) => hasClass(node, "shop-skin"))[0];
  assert.ok(card, "shop should render skin cards");
  assert.match(card.getAttribute("aria-label"), /^View .+ skin for .+$/);
  card.click();

  const galleryOverlay = document.body.children.find((node) => hasClass(node, "skin-gallery-modal"));
  assert.equal(galleryOverlay.hidden, false);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "is-skin-detail")).length, 1);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-grid")).length, 0);
  assert.equal(walk(galleryOverlay, (node) => hasClass(node, "skin-gallery-detail-close")).length, 0);
  assert.ok(walk(galleryOverlay, (node) => node.tagName === "H2").some((node) => node.textContent === "Skin Viewer"));
});
