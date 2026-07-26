import test from "node:test";
import assert from "node:assert/strict";

import { createRankedHeartbeat } from "../src/online/rankedHeartbeat.js";

// The heartbeat exists because a crashed opponent takes our socket down with them:
// neither client can attest, and the match voids with no rating and no history. It
// reports presence and nothing else — the server decides what a silent opponent means.

function harness({ responses = [], nowRef = { t: 0 } } = {}) {
  const sent = [];
  let tick = null;
  const clock = {
    setInterval(fn) { tick = fn; return 1; },
    clearInterval() { tick = null; },
  };
  const apiClient = {
    sendRankedHeartbeat(gameSlug, { matchId }) {
      sent.push({ gameSlug, matchId });
      return Promise.resolve(responses.shift() ?? { ok: true, finished: false });
    },
  };
  const finished = [];
  const heartbeat = createRankedHeartbeat({
    gameSlug: "tactical-arena",
    apiClient,
    clock,
    now: () => nowRef.t,
    onFinished: (settled) => finished.push(settled),
  });
  return { heartbeat, sent, finished, nowRef, beat: () => tick?.() };
}

// Awaits the microtasks the fire-and-forget beat chains through.
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("starting a match beats immediately and then on the interval", async () => {
  const h = harness();

  h.heartbeat.start("m1");
  await settle();
  h.beat();
  await settle();

  assert.deepEqual(h.sent, [
    { gameSlug: "tactical-arena", matchId: "m1" },
    { gameSlug: "tactical-arena", matchId: "m1" },
  ]);
});

test("a lost socket keeps the heartbeat running", async () => {
  const h = harness();
  h.heartbeat.start("m1");
  await settle();

  h.heartbeat.keepAliveAfterDisconnect();
  await settle();

  assert.equal(h.heartbeat.isRunning, true, "presence is the only evidence we have left");
  assert.equal(h.heartbeat.isOrphaned, true);
  assert.equal(h.sent.length, 2, "the disconnect itself beats, without waiting for the interval");
});

test("the beat that settles the match stops the loop and reports the outcome", async () => {
  const h = harness({ responses: [{ ok: true, finished: false }, { ok: true, finished: true, status: "resolved", match: { outcome: "win" } }] });
  h.heartbeat.start("m1");
  await settle();

  h.beat();
  await settle();

  assert.deepEqual(h.finished, [{ status: "resolved", outcome: "win" }]);
  assert.equal(h.heartbeat.isRunning, false);
});

test("an orphaned heartbeat gives up after the timeout instead of polling forever", async () => {
  const h = harness();
  h.heartbeat.start("m1");
  await settle();
  h.heartbeat.keepAliveAfterDisconnect();
  await settle();
  const beforeTimeout = h.sent.length;

  h.nowRef.t += 200000; // past ORPHAN_TIMEOUT_MS
  h.beat();
  await settle();

  assert.equal(h.sent.length, beforeTimeout, "no further beats");
  assert.equal(h.heartbeat.isRunning, false);
});

test("a failed beat decides nothing and the loop keeps going", async () => {
  const h = harness();
  h.heartbeat.start("m1");
  await settle();
  // A flaky link mid-match: the server's stale window is several beats wide precisely
  // so one dropped request never costs anybody a match.
  h.heartbeat.stop();
  const failing = createRankedHeartbeat({
    gameSlug: "tactical-arena",
    apiClient: { sendRankedHeartbeat: () => Promise.reject(new Error("offline")) },
    clock: { setInterval: () => 1, clearInterval: () => {} },
  });

  failing.start("m1");
  await settle();

  assert.equal(failing.isRunning, true);
});

test("stopping clears the match so a later tick sends nothing", async () => {
  const h = harness();
  h.heartbeat.start("m1");
  await settle();
  const beforeStop = h.sent.length;

  h.heartbeat.stop();
  await settle();

  assert.equal(h.sent.length, beforeStop);
  assert.equal(h.heartbeat.isRunning, false);
  assert.equal(h.heartbeat.isOrphaned, false);
});
