import { assert, assertEqual, finish, suite, test } from "./harness.js";

import { BALLS, ballPortraitPath } from "../scripts/assets/ball-catalog.js";
import { createTurnBallPicker } from "../scripts/ui/turn-ball-picker.js";

suite("turn ball picker — every human turn may choose its own ball");

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
  globalThis.document = { createElement: (tagName) => element(tagName) };
  const container = element();
  const selected = [];
  const picker = createTurnBallPicker(container, { onSelect: (ballId) => selected.push(ballId) });
  return {
    container,
    picker,
    selected,
    restore: () => { globalThis.document = originalDocument; },
  };
}

test("the picker is catalog-driven and reports a chosen ball", () => {
  const view = harness();
  try {
    assertEqual(view.container.children.length, BALLS.length);
    assertEqual(view.container.children.map((button) => button.dataset.ballId).join(","), BALLS.map(({ id }) => id).join(","));
    view.picker.render({ ballId: "paper", enabled: true });
    const paper = view.container.children.find((button) => button.dataset.ballId === "paper");
    assert(paper.classList.contains("is-active"), "the current ball is not marked");
    view.container.click(paper);
    assertEqual(view.selected.at(-1), "paper");
  } finally {
    view.restore();
  }
});

test("every choice shows the ball as well as naming it", () => {
  // Eight balls that fly differently, told apart by their names alone, asks a
  // player to recognise "Rubber Band Ball" as a colour they have never seen.
  const view = harness();
  try {
    for (const ball of BALLS) {
      const button = view.container.children.find((child) => child.dataset.ballId === ball.id);
      const art = button.children.find((child) => child.tagName === "IMG");
      assert(art, `${ball.id} has no picture on its button`);
      assertEqual(art.src, ballPortraitPath(ball.id));
      // The name is right beside it, so a second announcement is noise.
      assertEqual(art.alt, "");
      // The picture comes FIRST: the eye should land on the ball, not the word.
      assertEqual(button.children.indexOf(art), 0, `${ball.id} draws its name before its picture`);
    }
  } finally {
    view.restore();
  }
});

test("an opponent's turn or a ball in flight locks every choice", () => {
  const view = harness();
  try {
    view.picker.render({ ballId: "basketball", enabled: false });
    assert(view.container.children.every((button) => button.disabled), "a locked picker left a live ball button");
    view.container.click(view.container.children[1]);
    assertEqual(view.selected.length, 0, "the disabled picker changed the shot's ball");
  } finally {
    view.restore();
  }
});

finish();
