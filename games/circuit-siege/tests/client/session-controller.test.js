import { createCircuitSiegeSessionController } from "../../scripts/client/session-controller.js";
import { createSessionRuntimeState } from "../../scripts/client/session-runtime-state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  PASS ${name}`);
          passed++;
        })
        .catch((error) => {
          console.log(`  FAIL ${name}: ${error.message}`);
          failed++;
        });
    }

    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }

  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createHarness() {
  const runtime = createSessionRuntimeState();
  const screens = [];
  const notices = [];
  const lobbyUpdates = [];
  const matchUpdates = [];

  const adapter = {
    cb: {},
    setIdentityCalls: [],
    connectCalls: 0,
    queueStatusCalls: 0,
    findMatchCalls: [],
    createRoomCalls: [],
    joinRoomCalls: [],
    sendProfileCalls: [],
    sendPlayerReadyCalls: [],
    requestStartCalls: 0,
    leaveRoomCalls: 0,
    disconnectCalls: 0,
    setIdentity(identity) {
      this.setIdentityCalls.push(identity);
    },
    connect() {
      this.connectCalls += 1;
    },
    requestQueueStatus() {
      this.queueStatusCalls += 1;
    },
    findMatch(side) {
      this.findMatchCalls.push(side);
    },
    createRoom(side) {
      this.createRoomCalls.push(side);
    },
    joinRoom(side, code) {
      this.joinRoomCalls.push({ side, code });
    },
    sendProfile(side) {
      this.sendProfileCalls.push(side);
    },
    sendPlayerReady(ready) {
      this.sendPlayerReadyCalls.push(ready);
    },
    requestStart() {
      this.requestStartCalls += 1;
    },
    leaveRoom() {
      this.leaveRoomCalls += 1;
    },
    disconnect() {
      this.disconnectCalls += 1;
    }
  };

  const controller = createCircuitSiegeSessionController({
    runtime,
    createRemoteMatchAdapter: () => adapter,
    loadIdentity: async () => ({ playerId: "player-1", displayName: "Pilot" }),
    showScreen: (screen) => screens.push(screen),
    onLobbyStateChanged: (nextRuntime) => lobbyUpdates.push({
      roomCode: nextRuntime.lobby?.roomCode || null,
      queueCounts: nextRuntime.queueCounts ? { ...nextRuntime.queueCounts } : null,
      searching: nextRuntime.searching,
      isHost: nextRuntime.isHost,
      lastNotice: nextRuntime.lastNotice
    }),
    onMatchStateChanged: (nextRuntime) => matchUpdates.push({
      phase: nextRuntime.snapshot?.phase || null,
      result: nextRuntime.snapshot?.result || null
    }),
    onNotice: (message) => notices.push(message)
  });

  return {
    runtime,
    adapter,
    controller,
    screens,
    notices,
    lobbyUpdates,
    matchUpdates
  };
}

console.log("\nsession-controller");

await test("startPublicMatch queues the action until the adapter connects", async () => {
  const harness = createHarness();

  await harness.controller.startPublicMatch({ side: "blue" });

  assertEqual(harness.adapter.connectCalls, 1);
  assertEqual(harness.adapter.findMatchCalls.length, 0);
  assertEqual(harness.screens.at(-1), "matchmaking");
  assertEqual(harness.runtime.selectedSide, "blue");

  harness.adapter.cb.onConnected?.({ clientId: "c1" });

  assertEqual(harness.adapter.queueStatusCalls, 1);
  assertEqual(harness.adapter.findMatchCalls[0], "blue");
  assertEqual(harness.runtime.connected, true);
});

await test("room and queue callbacks update runtime state without mutating rendering logic", async () => {
  const harness = createHarness();

  await harness.controller.ensureClient();
  harness.adapter.cb.onConnected?.({ clientId: "c1" });
  harness.adapter.cb.onQueueCounts?.({ blue: 2, red: 1 });
  harness.adapter.cb.onRoomJoined?.({ roomCode: "CS01", created: true });

  assertEqual(harness.runtime.queueCounts.blue, 2);
  assertEqual(harness.runtime.queueCounts.red, 1);
  assertEqual(harness.runtime.lobby.roomCode, "CS01");
  assertEqual(harness.runtime.isHost, true);
  assertEqual(harness.adapter.sendProfileCalls.at(-1), harness.runtime.selectedSide);
});

await test("match_ready and match_snapshot transition the session into match state", async () => {
  const harness = createHarness();

  await harness.controller.startPrivateCreate({ side: "blue" });
  harness.adapter.cb.onConnected?.({ clientId: "c1" });
  harness.adapter.cb.onRoomJoined?.({ roomCode: "CS01", created: true });
  harness.adapter.cb.onMatchReady?.({ seed: 7, remoteSide: "red", serverNow: 1000, startAt: 1500, roomCode: "CS01" });
  harness.adapter.cb.onSnapshot?.({
    matchId: "room_1",
    phase: "live",
    timerMsRemaining: 200000,
    players: {},
    slots: {}
  });

  assertEqual(harness.runtime.matchReady.seed, 7);
  assertEqual(harness.runtime.snapshot.phase, "live");
  assertEqual(harness.screens.at(-1), "match");
  assertEqual(harness.matchUpdates.at(-1).phase, "live");
});

await test("requestReady and requestStartNow use explicit adapter methods instead of raw room-message strings", async () => {
  const harness = createHarness();

  await harness.controller.startPrivateCreate({ side: "blue" });
  harness.adapter.cb.onConnected?.({ clientId: "c1" });
  harness.adapter.cb.onRoomJoined?.({ roomCode: "CS01", created: true });
  harness.runtime.lobby.playerCount = 2;

  assertEqual(harness.controller.requestReady(true), true);
  assertEqual(harness.adapter.sendPlayerReadyCalls.at(-1), true);

  assertEqual(harness.controller.requestStartNow(), true);
  assertEqual(harness.adapter.requestStartCalls, 1);
});

await test("partner disconnects become notices and clear the active lobby session", async () => {
  const harness = createHarness();

  await harness.controller.startPrivateJoin({ side: "red", roomCode: "CS01" });
  harness.adapter.cb.onConnected?.({ clientId: "c2" });
  harness.adapter.cb.onRoomJoined?.({ roomCode: "CS01", created: false });
  harness.adapter.cb.onPartnerLeft?.();

  assertEqual(harness.runtime.lobby, null);
  assertEqual(harness.runtime.searching, false);
  assertEqual(harness.notices.at(-1), "Opponent disconnected.");
  assertEqual(harness.screens.at(-1), "menu");
});

await test("submitIntent delegates route edit intents to the adapter", async () => {
  const harness = createHarness();
  harness.adapter.sendIntentCalls = [];
  harness.adapter.sendIntent = (intent) => {
    harness.adapter.sendIntentCalls.push(intent);
  };

  await harness.controller.startPrivateCreate({ side: "blue" });
  harness.adapter.cb.onConnected?.({ clientId: "c1" });
  harness.adapter.cb.onRoomJoined?.({ roomCode: "CS01", created: true });

  assertEqual(harness.controller.submitIntent({
    intentType: "ROTATE_TILE",
    slotId: "blue_route_02_rp_2"
  }), true);

  assertEqual(harness.adapter.sendIntentCalls.length, 1);
  assertEqual(harness.adapter.sendIntentCalls[0].slotId, "blue_route_02_rp_2");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
