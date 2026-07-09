import test from "node:test";
import assert from "node:assert/strict";

import { openChoiceModal } from "../src/ui/choiceModal.js";

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

function textContent(node) {
  return [node.textContent, ...(node.children ?? []).map(textContent)].join("");
}

test("choice modal can render choices grouped into class sections", () => {
  globalThis.document = new FakeDocument();

  openChoiceModal({
    title: "Choose Slot 1",
    groups: [
      {
        id: "melee",
        label: "Melees",
        choices: [{ value: "swordsman", label: "Swordsman", sub: "melee", type: "swordsman" }],
      },
      {
        id: "ranger",
        label: "Rangers",
        choices: [{ value: "archer", label: "Archer", sub: "ranger", type: "archer" }],
      },
    ],
  });

  const overlay = document.body.children[0];
  const sections = walk(overlay, (node) => hasClass(node, "choice-group"));
  const headings = walk(overlay, (node) => hasClass(node, "choice-group-title")).map(textContent);

  assert.deepEqual(headings, ["Melees", "Rangers"]);
  assert.equal(sections[0].dataset.group, "melee");
  assert.match(textContent(sections[0]), /Swordsman/);
  assert.doesNotMatch(textContent(sections[0]), /Archer/);
  assert.equal(sections[1].dataset.group, "ranger");
  assert.match(textContent(sections[1]), /Archer/);
});
