import test from "node:test";
import assert from "node:assert/strict";

import { createRankedFlow } from "../src/online/rankedFlow.js";

// A manual scheduler: the controller's next poll is stashed here so the test can
// pump it deterministically instead of waiting on real timers.
function manualScheduler() {
  let pending = null;
  return {
    setTimeoutFn(fn) { pending = fn; return 1; },
    clearTimeoutFn() { pending = null; },
    async pump() {
      const fn = pending;
      pending = null;
      if (fn) await fn();
    },
    get hasPending() { return pending !== null; },
  };
}

function fakeApi({ enqueue, polls = [] } = {}) {
  let i = 0;
  const calls = { setLobby: [], report: [], cancel: 0, enqueue: 0, poll: 0 };
  return {
    calls,
    enqueueRankedMatch: async () => { calls.enqueue += 1; return enqueue; },
    pollRankedMatch: async () => { calls.poll += 1; return polls[Math.min(i++, polls.length - 1)]; },
    setRankedLobby: async (_slug, args) => { calls.setLobby.push(args); return { ok: true, match: { lobbyCode: args.lobbyCode } }; },
    cancelRankedMatch: async () => { calls.cancel += 1; return { ok: true }; },
    reportRankedResult: async (_slug, args) => { calls.report.push(args); return { ok: true, status: "resolved" }; },
  };
}

function recorder() {
  const events = { matched: [], lobbyReady: [], status: [], error: [] };
  return {
    events,
    callbacks: {
      onMatched: (m) => events.matched.push(m),
      onLobbyReady: (r) => events.lobbyReady.push(r),
      onStatus: (s) => events.status.push(s),
      onError: (e) => events.error.push(e),
    },
  };
}

test("seat 1 gets an immediate match and is told to CREATE the relay lobby", async () => {
  const api = fakeApi({ enqueue: { status: "matched", match: { matchId: "m1", seat: 1, bansFirst: true, lobbyCode: null } } });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, gameSlug: "tactical-arena", ...sched, callbacks: rec.callbacks });

  await flow.queue();

  assert.equal(rec.events.matched.length, 1);
  assert.deepEqual(rec.events.lobbyReady, [{ role: "create", match: rec.events.matched[0] }]);
  assert.equal(flow.state, "ready");
  assert.equal(sched.hasPending, false, "seat 1 stops polling once told to create");
});

test("seat 2 with a lobby code already present is told to JOIN immediately", async () => {
  const api = fakeApi({ enqueue: { status: "matched", match: { matchId: "m1", seat: 2, lobbyCode: "ABCDE" } } });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, ...sched, callbacks: rec.callbacks });

  await flow.queue();

  assert.deepEqual(rec.events.lobbyReady, [{ role: "join", code: "ABCDE", match: rec.events.matched[0] }]);
  assert.equal(flow.state, "ready");
});

test("seat 2 without a code waits, then JOINs once the code is published", async () => {
  const api = fakeApi({
    enqueue: { status: "matched", match: { matchId: "m1", seat: 2, lobbyCode: null } },
    polls: [
      { status: "matched", match: { matchId: "m1", seat: 2, lobbyCode: null } },
      { status: "matched", match: { matchId: "m1", seat: 2, lobbyCode: "XYZ99" } },
    ],
  });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, ...sched, callbacks: rec.callbacks });

  await flow.queue();
  assert.equal(flow.state, "awaiting_lobby");
  assert.equal(rec.events.lobbyReady.length, 0);

  await sched.pump(); // still no code
  assert.equal(flow.state, "awaiting_lobby");

  await sched.pump(); // code now present
  assert.deepEqual(rec.events.lobbyReady, [{ role: "join", code: "XYZ99", match: flow.getMatch() }]);
  assert.equal(flow.state, "ready");
});

test("waiting in queue polls until a match is found", async () => {
  const api = fakeApi({
    enqueue: { status: "waiting" },
    polls: [
      { status: "waiting", waitSeconds: 5 },
      { status: "matched", match: { matchId: "m1", seat: 1, lobbyCode: null } },
    ],
  });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, ...sched, callbacks: rec.callbacks });

  await flow.queue();
  assert.equal(flow.state, "queuing");
  await sched.pump(); // still waiting
  assert.equal(flow.state, "queuing");
  await sched.pump(); // matched
  assert.equal(rec.events.matched.length, 1);
  assert.equal(rec.events.lobbyReady[0].role, "create");
});

test("cancel leaves the queue and stops polling", async () => {
  const api = fakeApi({ enqueue: { status: "waiting" } });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, ...sched, callbacks: rec.callbacks });

  await flow.queue();
  assert.equal(sched.hasPending, true);
  await flow.cancel();
  assert.equal(api.calls.cancel, 1);
  assert.equal(flow.state, "idle");
});

test("publishLobbyCode and reportResult call the platform with the match id", async () => {
  const api = fakeApi({ enqueue: { status: "matched", match: { matchId: "m1", seat: 1, lobbyCode: null } } });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, ...sched, callbacks: rec.callbacks });

  await flow.queue();
  await flow.publishLobbyCode("ABCDE");
  await flow.reportResult("win");

  assert.deepEqual(api.calls.setLobby, [{ matchId: "m1", lobbyCode: "ABCDE" }]);
  assert.deepEqual(api.calls.report, [{ matchId: "m1", outcome: "win", squad: undefined, unitResults: undefined }]);
});

test("reportResult forwards the squad + unit report when supplied", async () => {
  const api = fakeApi({ enqueue: { status: "matched", match: { matchId: "m1", seat: 1, lobbyCode: null } } });
  const sched = manualScheduler();
  const rec = recorder();
  const flow = createRankedFlow({ apiClient: api, ...sched, callbacks: rec.callbacks });

  await flow.queue();
  const unitResults = { units: [{ id: "p1-0-swordsman", seat: 1, type: "swordsman", alive: true }] };
  await flow.reportResult("loss", { squad: ["swordsman"], unitResults });

  assert.deepEqual(api.calls.report, [{ matchId: "m1", outcome: "loss", squad: ["swordsman"], unitResults }]);
});
