import test from "node:test";
import assert from "node:assert/strict";

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
