import test from "node:test";
import assert from "node:assert/strict";

import { openShop } from "../src/ui/shop.js";

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
