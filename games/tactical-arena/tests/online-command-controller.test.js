import test from "node:test";
import assert from "node:assert/strict";

import {
  createOnlineCommandController,
  isRolledArtResult,
} from "../src/online/onlineCommandController.js";
import { createBattleState } from "../src/core/state.js";

test("online ART routing recognizes rolled ART events with unit targets", () => {
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", hit: true, targetId: "foe" }]), true);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", hit: true, targetIds: ["foe"] }]), true);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED" }]), false);
  assert.equal(isRolledArtResult([{ type: "ART_RESOLVED", artId: "smoke-bomb-riot", hit: true, center: { x: 8, y: 5 }, statusTargets: ["foe"] }]), false);
  assert.equal(isRolledArtResult([{ type: "ATTACK_RESOLVED", hit: true }]), false);
});

test("remote replay always releases its echo-suppression lock", async () => {
  const runtime = { state: { units: [] }, applyingRemote: false };
  const controller = createOnlineCommandController({ runtime, interaction: {} });

  await controller.applyRemoteCommand({ type: "UNKNOWN" });

  assert.equal(runtime.applyingRemote, false);
});

test("local online concede dispatches the player's seat and renders", () => {
  const calls = [];
  const runtime = {
    state: createBattleState({ squads: { 1: ["swordsman"], 2: ["swordsman"] } }),
    net: {},
    mySeat: 2,
  };
  const controller = createOnlineCommandController({
    runtime,
    interaction: {},
    dispatch(command) {
      calls.push(command);
      return true;
    },
    render() {
      calls.push("render");
    },
    setMessage(message) {
      calls.push(message);
    },
  });

  assert.equal(controller.concedeLocalMatch(), true);
  assert.deepEqual(calls, [
    { type: "CONCEDE", player: 2 },
    "render",
    "You conceded the match.",
  ]);
});

test("local online concede is unavailable outside live online play", () => {
  const calls = [];
  const controller = createOnlineCommandController({
    runtime: { state: createBattleState(), net: null, mySeat: 1 },
    interaction: {},
    dispatch(command) {
      calls.push(command);
      return true;
    },
  });

  assert.equal(controller.concedeLocalMatch(), false);
  assert.deepEqual(calls, []);
});

test("local online concede waits while a command is resolving", () => {
  const calls = [];
  const controller = createOnlineCommandController({
    runtime: {
      state: createBattleState(),
      net: {},
      mySeat: 1,
      resolving: true,
      applyingRemote: false,
    },
    interaction: {},
    dispatch(command) {
      calls.push(command);
      return true;
    },
    setMessage(message, isError) {
      calls.push({ message, isError });
    },
  });

  assert.equal(controller.concedeLocalMatch(), true);
  assert.deepEqual(calls, [{ message: "Concede after the current command resolves.", isError: true }]);
});

// An unsolicited close is not evidence that we abandoned. If we self-report a loss
// here, a relay outage closes BOTH sockets, both clients report a loss, and the
// server's conflict rule disputes a match that actually finished. Abandonment is
// reported by leave()/pagehide instead.
//
// What we keep doing is reporting presence: the relay drops our socket too when the
// opponent's machine dies, so the heartbeat outliving this screen is the only way the
// server can tell who stayed and settle the match as a forfeit.
function disconnectHarness(calls) {
  return createOnlineCommandController({
    runtime: {
      state: { ...createBattleState(), phase: "playing" },
      matchConfig: {
        ranked: {
          reportAbandon: () => calls.push("abandon"),
          keepHeartbeatAfterDisconnect: () => calls.push("keep-heartbeat"),
        },
      },
      net: { dispose: () => calls.push("dispose") },
      mySeat: 1,
    },
    interaction: {},
    turnFlash: { announce: () => calls.push("announce") },
    setMessage: (message) => calls.push(message),
    menu: { show: (screen) => calls.push(`show:${screen}`) },
    clock: {
      clearTimeout() {},
      setTimeout(fn) {
        calls.push("timer");
        fn();
        return 1;
      },
    },
  });
}

test("a dropped connection does NOT self-report a ranked loss", () => {
  const calls = [];
  disconnectHarness(calls).sessionController.endOnDisconnect("Lost connection to the match.");

  assert.equal(calls.includes("abandon"), false, "losing the socket is not an abandon");
  assert.ok(calls.includes("dispose"), "the session is still torn down");
});

test("a desync does NOT self-report a ranked loss", () => {
  const calls = [];
  disconnectHarness(calls).sessionController.endOnDesync();

  assert.equal(calls.includes("abandon"), false, "no side knows the result after a desync");
  assert.ok(calls.includes("dispose"), "the session is still torn down");
});

test("a dropped connection keeps reporting presence so the server can settle it", () => {
  const calls = [];
  disconnectHarness(calls).sessionController.endOnDisconnect("Lost connection to the match.");

  assert.ok(calls.includes("keep-heartbeat"), "the heartbeat must outlive the socket");
  assert.ok(
    calls.indexOf("keep-heartbeat") < calls.indexOf("dispose"),
    "hand the heartbeat off before tearing down the session",
  );
});
