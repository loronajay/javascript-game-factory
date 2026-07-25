import test from "node:test";
import assert from "node:assert/strict";

import { createProgressionAnnouncementRunner } from "../src/ui/progressionAnnouncementRunner.js";

// A queue plus a modal opener we can hold open, so popup ordering is deterministic.
function harness(ids = []) {
  const queue = [...ids];
  const shown = [];
  const delays = [];
  let release = null;
  const runner = createProgressionAnnouncementRunner({
    shift: () => queue.shift() ?? null,
    present: (announcement) => {
      shown.push(announcement);
      return new Promise((resolve) => { release = resolve; });
    },
    // Immediate scheduling keeps the tests free of real timers; the requested delay is
    // recorded so the results-screen confetti beat can be asserted.
    setTimeout: (fn, delay) => { delays.push(delay); fn(); return 0; },
    clearTimeout: () => {},
  });
  const settle = () => new Promise((done) => setImmediate(done));
  return {
    runner,
    queue,
    shown,
    delays,
    settle,
    enqueue: (id) => queue.push(id),
    async request(options) { runner.request(options); await settle(); },
    async allow(value, options) { runner.setAllowed(value, options); await settle(); },
    // Close the popup that is currently open and let the runner fully advance.
    async close() {
      const resolve = release;
      release = null;
      resolve?.();
      await settle();
    },
  };
}

test("a request made where popups don't belong is held, not dropped", async () => {
  const h = harness(["a"]);

  await h.allow(false);
  await h.request();

  assert.deepEqual(h.shown, [], "nothing may show while presentation is off");
  assert.deepEqual(h.queue, ["a"], "the announcement stays queued");

  // Arriving on a screen where popups belong flushes the backlog immediately —
  // this is what used to wait until the player next wandered to the main menu.
  await h.allow(true);
  assert.deepEqual(h.shown, ["a"]);
});

test("a request during an open popup coalesces instead of being dropped", async () => {
  const h = harness(["a"]);
  await h.request();
  assert.deepEqual(h.shown, ["a"]);

  // An unlock earned while the first popup is still on screen.
  h.enqueue("b");
  await h.request();
  assert.deepEqual(h.shown, ["a"], "still waiting on the open popup");

  await h.close();
  assert.deepEqual(h.shown, ["a", "b"], "the second unlock shows in the same session");
});

test("run() returns the in-flight run so callers can await the queue emptying", async () => {
  const h = harness(["a"]);
  const first = h.runner.run();
  const second = h.runner.run();

  assert.equal(second, first, "a concurrent caller must await, not no-op");
  await h.settle();
  assert.equal(h.runner.isRunning, true);

  await h.close();
  assert.deepEqual(await first, ["a"]);
  assert.equal(h.runner.isRunning, false);
});

test("leaving a presentation screen mid-batch keeps the remainder queued", async () => {
  const h = harness(["a", "b", "c"]);
  await h.request();
  assert.deepEqual(h.shown, ["a"]);

  // The player starts a match while the first popup is still open.
  await h.allow(false);
  await h.close();

  assert.deepEqual(h.shown, ["a"], "no popup lands on the board");
  assert.deepEqual(h.queue, ["b", "c"], "the rest survive for the next allowed screen");

  await h.allow(true);
  assert.deepEqual(h.shown, ["a", "b"]);
  await h.close();
  assert.deepEqual(h.shown, ["a", "b", "c"]);
});

test("the arriving screen's delay is honoured when the gate reopens", async () => {
  const h = harness(["a"]);
  await h.allow(false);
  await h.request();

  // The results screen waits out its confetti; the sweep must not jump the gun with the
  // gate's own zero-delay pass.
  await h.allow(true, { delay: 550 });

  assert.deepEqual(h.delays, [550]);
  assert.deepEqual(h.shown, ["a"]);
});

test("an empty queue is a no-op that leaves the runner reusable", async () => {
  const h = harness([]);

  assert.deepEqual(await h.runner.run(), []);
  assert.equal(h.runner.isRunning, false);

  h.enqueue("a");
  await h.request();
  assert.deepEqual(h.shown, ["a"], "the runner did not wedge itself on the empty pass");
});
