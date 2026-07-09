import test from "node:test";
import assert from "node:assert/strict";

import { createResetProgressConfirmation } from "../src/ui/menuFlow.js";

function fakeButton() {
  const classes = new Set();
  return {
    textContent: "",
    attributes: new Map(),
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  };
}

test("reset progress requires a second confirming press", () => {
  const button = fakeButton();
  const status = { textContent: "" };
  const timers = [];
  let resetCount = 0;

  const confirmation = createResetProgressConfirmation({
    button,
    status,
    onConfirm: () => { resetCount += 1; },
    timeoutMs: 6000,
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms, cleared: false });
      return timers.length - 1;
    },
    clearTimeoutFn: (id) => { timers[id].cleared = true; },
  });

  assert.equal(button.textContent, "Reset Progress");
  assert.equal(button.attributes.get("aria-pressed"), "false");

  assert.equal(confirmation.requestReset(), false);
  assert.equal(resetCount, 0);
  assert.equal(button.textContent, "Confirm Reset");
  assert.equal(button.classList.contains("is-confirming"), true);
  assert.equal(button.attributes.get("aria-pressed"), "true");
  assert.match(status.textContent, /erase tutorials, campaign stars, units, and skins/);
  assert.equal(timers[0].ms, 6000);

  assert.equal(confirmation.requestReset(), true);
  assert.equal(resetCount, 1);
  assert.equal(button.textContent, "Reset Progress");
  assert.equal(button.classList.contains("is-confirming"), false);
  assert.equal(button.attributes.get("aria-pressed"), "false");
  assert.equal(timers[0].cleared, true);
});

test("reset progress confirmation can expire without resetting", () => {
  const button = fakeButton();
  const status = { textContent: "" };
  let resetCount = 0;
  let timeoutFn = null;

  createResetProgressConfirmation({
    button,
    status,
    onConfirm: () => { resetCount += 1; },
    setTimeoutFn: (fn) => {
      timeoutFn = fn;
      return 7;
    },
    clearTimeoutFn: () => {},
  }).requestReset();

  timeoutFn();

  assert.equal(resetCount, 0);
  assert.equal(button.textContent, "Reset Progress");
  assert.equal(button.classList.contains("is-confirming"), false);
  assert.equal(button.attributes.get("aria-pressed"), "false");
});
