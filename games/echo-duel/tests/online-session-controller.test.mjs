import { PHASES } from "../scripts/config.js";
import { createOnlineRuntimeState } from "../scripts/online-runtime-state.js";
import { createOnlineSessionController } from "../scripts/online-session-controller.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  PASS  ${name}`);
          passed++;
        })
        .catch((error) => {
          console.log(`  FAIL  ${name}: ${error.message}`);
          failed++;
        });
    }

    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }

  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

function createHarness() {
  const online = createOnlineRuntimeState();
  const screens = [];
  const lobbyRenders = [];
  const matchRenders = [];
  const menuNotices = [];
  const setStateCalls = [];
  const rawStateCalls = [];
  const startLoopCalls = [];
  const leaveCalls = [];
  const disconnectCalls = [];
  const createLobbyCalls = [];
  const findLobbyCalls = [];
  const joinLobbyCalls = [];
  const startLobbyCalls = [];
  const intervals = [];
  const timeouts = [];
  let state = null;

  const net = {
    cb: {},
    clientId: null,
    setIdentity(identity) {
      this.identity = identity;
    },
    connect() {
      this.connected = true;
    },
    createLobby(payload) {
      createLobbyCalls.push(payload);
    },
    findLobby(payload) {
      findLobbyCalls.push(payload);
    },
    joinLobby(code) {
      joinLobbyCalls.push(code);
    },
    leaveLobby() {
      leaveCalls.push(true);
    },
    disconnect() {
      disconnectCalls.push(true);
    },
    startLobby() {
      startLobbyCalls.push(true);
    },
    sendProfile() {},
    sendInput() {},
    sendState() {},
  };

  const windowLike = {
    setTimeout(fn, delay) {
      timeouts.push(delay);
      fn();
      return timeouts.length;
    },
    setInterval(fn, delay) {
      intervals.push({ fn, delay });
      return intervals.length;
    },
    clearInterval(id) {
      intervals[id - 1] = null;
    },
  };

  const controller = createOnlineSessionController({
    online,
    windowLike,
    createOnlineClient: () => net,
    loadArcadeIdentity: async () => ({ playerId: "player-1", displayName: "Host" }),
    renderOnlineLobby: (payload) => lobbyRenders.push(payload),
    renderMatch: (nextState) => matchRenders.push(nextState),
    showScreen: (screen) => screens.push(screen),
    createMatchState: (payload) => ({
      phase: PHASES.OWNER_CREATE_INITIAL,
      mode: "online",
      players: payload.players,
      settings: { penaltyWord: payload.penaltyWord },
      network: payload.network,
    }),
    hydrateNetworkState: (snapshot) => snapshot,
    applyAuthoritativeMatchMessage: () => null,
    isAuthoritativeMatchMessageType: () => false,
    mergeLobbySnapshot: (current, payload) => ({ ...(current || {}), ...(payload || {}) }),
    applyPlayerLeftToLobby: (current, payload) => ({
      ...(current || {}),
      ...(payload || {}),
      members: Array.isArray(current?.members)
        ? current.members.filter((memberId) => memberId !== payload.clientId)
        : current?.members,
    }),
    buildPlayersFromLobby: ({ lobby, profiles = {}, localClientId, identity }) => {
      const members = Array.isArray(lobby?.members) ? lobby.members : [];
      return members.map((clientId, index) => ({
        id: clientId,
        clientId,
        name: profiles[clientId]?.displayName
          || (clientId === localClientId ? identity?.displayName : "")
          || `Player ${index + 1}`,
      }));
    },
    resetOnlineRuntimeState: (target) => {
      target.net = null;
      target.lobby = null;
      target.profiles = {};
      target.identity = null;
      target.isHost = false;
      target.authorityMode = null;
      target.started = false;
      target.startRequested = false;
      target.outboundStateSeq = 0;
      target.inboundStateSeq = 0;
      target.lobbyCountdownTimer = null;
      target.pendingAction = null;
    },
    shouldTickLobbyCountdown: (lobby) => Number(lobby?.startAt || 0) > Date.now(),
    shouldResetStartRequest: ({ lobbyStatus, state: nextState }) => lobbyStatus === "ended" || nextState?.phase === PHASES.MATCH_OVER,
    shouldPreserveResultsScreen: () => false,
    shouldCloseMatchToMenuOnPlayerLeft: () => false,
    getState: () => state,
    setState: (nextState, options) => {
      state = nextState;
      setStateCalls.push({ nextState, options });
    },
    setRawState: (nextState) => {
      state = nextState;
      rawStateCalls.push(nextState);
    },
    startLoop: () => startLoopCalls.push(true),
    isLoopRunning: () => false,
    goMenuWithNotice: (message) => menuNotices.push(message),
    continueAfterDisconnectedPlayer: () => false,
    applyAuthoritativeInput: () => {},
    mirrorVisibleOwnerInput: () => {},
    onlineUsesServerAuthority: () => online.authorityMode === "server",
    playerIdForClientId: (clientId) => clientId,
    queryElementById: () => null,
    logWarn: () => {},
  });

  return {
    controller,
    online,
    net,
    screens,
    lobbyRenders,
    matchRenders,
    menuNotices,
    setStateCalls,
    rawStateCalls,
    startLoopCalls,
    leaveCalls,
    disconnectCalls,
    createLobbyCalls,
    findLobbyCalls,
    joinLobbyCalls,
    startLobbyCalls,
    intervals,
    timeouts,
    getState: () => state,
    setStateValue: (nextState) => {
      state = nextState;
    },
  };
}

console.log("\necho-duel online-session-controller");

await test("queues lobby creation until connection is established", async () => {
  const harness = createHarness();

  await harness.controller.startCreatePublic({
    minPlayers: 2,
    maxPlayers: 6,
    penaltyWord: "STATIC",
  });

  assertEq(harness.createLobbyCalls.length, 0);
  assertEq(harness.screens.at(-1), "onlineLobby");
  assertEq(harness.online.net, harness.net);
  assertEq(harness.net.identity.displayName, "Host");

  harness.net.clientId = "host-1";
  harness.net.cb.onConnected?.();

  assertEq(harness.createLobbyCalls.length, 1);
  assertEq(harness.createLobbyCalls[0].isPrivate, false);
  assertEq(harness.online.pendingAction, null);
  assertEq(harness.online.profiles["host-1"].displayName, "Host");
});

await test("requestStartNow only starts when the local client owns a ready lobby", async () => {
  const harness = createHarness();
  await harness.controller.ensureOnlineClient();
  harness.net.clientId = "host-1";
  harness.online.lobby = {
    ownerId: "host-1",
    playerCount: 2,
    minPlayers: 2,
    members: ["host-1", "guest-2"],
  };

  assertEq(harness.controller.requestStartNow(), true);
  assertEq(harness.startLobbyCalls.length, 1);
  assertEq(harness.online.startRequested, true);
  assertEq(harness.lobbyRenders.at(-1).status, "Requesting match start...");

  harness.online.startRequested = false;
  harness.online.lobby.ownerId = "someone-else";
  assertEq(harness.controller.requestStartNow(), false);
  assertEq(harness.startLobbyCalls.length, 1);
});

await test("host-client lobby starts build a local match state for the host", async () => {
  const harness = createHarness();
  await harness.controller.ensureOnlineClient();
  harness.net.clientId = "host-1";
  harness.online.identity = { playerId: "player-1", displayName: "Host" };
  harness.online.profiles = {
    "guest-2": { displayName: "Guest" },
  };
  harness.online.lobby = {
    members: ["host-1", "guest-2"],
    settings: { penaltyWord: "STATIC" },
  };

  harness.net.cb.onLobbyStarted?.({
    ownerId: "host-1",
    roomCode: "ABCD",
    startAt: Date.now(),
    seed: 3,
    settings: { penaltyWord: "STATIC" },
    members: ["host-1", "guest-2"],
  });

  assertEq(harness.online.authorityMode, "host-client");
  assertEq(harness.setStateCalls.length, 1);
  assertEq(harness.startLoopCalls.length, 1);
  assertEq(harness.getState().players.length, 2);
  assertEq(harness.getState().players[0].name, "Host");
  assertEq(harness.getState().players[1].name, "Guest");
  assertEq(harness.getState().network.myClientId, "host-1");
});

await test("disconnectOnline tears down the connection and clears runtime state", async () => {
  const harness = createHarness();
  await harness.controller.ensureOnlineClient();
  harness.online.lobbyCountdownTimer = 1;
  harness.online.lobby = { roomCode: "ABCD" };
  harness.online.startRequested = true;

  harness.controller.disconnectOnline();

  assertEq(harness.leaveCalls.length, 1);
  assertEq(harness.disconnectCalls.length, 1);
  assertEq(harness.online.net, null);
  assertEq(harness.online.lobby, null);
  assertEq(harness.online.startRequested, false);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
