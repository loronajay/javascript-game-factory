import { assert, assertEqual, finish, suite, test } from "./harness.js";

import { BALLS } from "../scripts/assets/ball-catalog.js";
import { createPracticeView } from "../scripts/ui/practice-view.js";

suite("practice view — players can choose the ball they are learning");

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
    click(node) {
      listeners.get("click")?.({ target: { closest: () => node } });
    },
  };
}

function harness() {
  const originalDocument = globalThis.document;
  const nodes = new Map([
    ["#practiceBallChoices", element()],
    ["#practiceMeterFill", element()],
    ["#practiceReadout", element()],
    ["#practiceShout", element()],
    ["#practiceHint", element()],
    ["#practiceTally", element()],
  ]);
  globalThis.document = { createElement: (tagName) => element(tagName) };
  const selected = [];
  const view = createPracticeView(
    { querySelector: (selector) => nodes.get(selector) || null },
    { onBallSelect: (ballId) => selected.push(ballId) },
  );
  return {
    choices: nodes.get("#practiceBallChoices"),
    selected,
    view,
    restore: () => { globalThis.document = originalDocument; },
  };
}

test("the practice picker is catalog-driven and reports the chosen ball", () => {
  const h = harness();
  try {
    assertEqual(h.choices.children.length, BALLS.length);
    h.view.setBallChoice({ ballId: "paper", enabled: true });
    const paper = h.choices.children.find((button) => button.dataset.ballId === "paper");
    assert(paper.classList.contains("is-active"), "the practice ball is not marked");
    h.choices.click(paper);
    assertEqual(h.selected.at(-1), "paper");
  } finally {
    h.restore();
  }
});

test("the practice picker cannot change a ball in flight", () => {
  const h = harness();
  try {
    h.view.setBallChoice({ ballId: "basketball", enabled: false });
    assert(h.choices.children.every((button) => button.disabled), "a live choice remained during flight");
    h.choices.click(h.choices.children[1]);
    assertEqual(h.selected.length, 0);
  } finally {
    h.restore();
  }
});

finish();
