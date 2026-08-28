import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assert, assertEqual, finish, suite, test } from "./harness.js";
import { BALLS } from "../scripts/assets/ball-catalog.js";
import { createTrickShotView } from "../scripts/ui/trick-shot-view.js";

suite("trick-shot lab — ball picker");

function element(tagName = "div") {
  const listeners = new Map();
  const children = [];
  const classes = new Set();
  return {
    tagName: tagName.toUpperCase(),
    children,
    dataset: {},
    disabled: false,
    textContent: "",
    title: "",
    type: "",
    className: "",
    style: {},
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    setAttribute() {},
    append(...nodes) { children.push(...nodes); },
    appendChild(node) { children.push(node); },
    replaceChildren(...nodes) { children.splice(0, children.length, ...nodes); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    querySelectorAll(selector) {
      return selector === "[data-ball-id]" ? children.filter((child) => child.dataset.ballId) : [];
    },
    contains(node) { return children.includes(node); },
    click(node) { listeners.get("click")?.({ target: { closest: () => node } }); },
  };
}

function harness() {
  const originalDocument = globalThis.document;
  const choices = element();
  globalThis.document = {
    activeElement: null,
    createElement: (tagName) => element(tagName),
  };
  const selected = [];
  const view = createTrickShotView({
    querySelector: (selector) => selector === "#trickBallChoices" ? choices : null,
    querySelectorAll: () => [],
  }, { onBallSelect: (ballId) => selected.push(ballId) });
  return {
    choices,
    selected,
    view,
    restore: () => { globalThis.document = originalDocument; },
  };
}

test("the lab exposes every catalog ball and reports a new selection", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert(html.includes('id="trickBallChoices"'), "the lab has no ball-picker mount");

  const h = harness();
  try {
    assertEqual(h.choices.children.length, BALLS.length);
    h.view.render({ pieces: [], bank: [], ballId: "paper", busy: false });
    const paper = h.choices.children.find((button) => button.dataset.ballId === "paper");
    assert(paper.classList.contains("is-active"), "the current trick-shot ball is not marked");
    const bowling = h.choices.children.find((button) => button.dataset.ballId === "bowling-ball");
    h.choices.click(bowling);
    assertEqual(h.selected.at(-1), "bowling-ball");
  } finally {
    h.restore();
  }
});

test("the picker locks while aiming or while a shot is in motion", () => {
  const h = harness();
  try {
    h.view.render({ pieces: [], bank: [], ballId: "basketball", busy: false, pulling: true });
    assert(h.choices.children.every((button) => button.disabled), "an active pull left its ball picker enabled");
    h.view.render({ pieces: [], bank: [], ballId: "basketball", busy: true });
    assert(h.choices.children.every((button) => button.disabled), "a live shot left its ball picker enabled");
    h.choices.click(h.choices.children[1]);
    assertEqual(h.selected.length, 0);
  } finally {
    h.restore();
  }
});

finish();
