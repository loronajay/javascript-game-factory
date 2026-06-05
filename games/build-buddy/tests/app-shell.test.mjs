import {
  APP_SCREENS,
  applyOnlineClientSnapshot,
  applyOnlineGameplayDisconnect,
  applyOnlineRunComplete,
  applyOnlineStageResult,
  createAppShellState,
  getPracticeStageOptions,
  goToOnlineMenu,
  joinOnlineLobby,
  markOnlineReady,
  startOnlineRunFromLobby,
  startOnlineSearch,
  startPrivateLobby,
  startDebugLab,
  startLocalRun,
  startPractice,
  submitStageClear,
  submitStageFailure,
  continueFromStageResult,
} from "../js/app-shell.js";
import { DEFAULT_PACK_ID, getStageSequence, listStages } from "../js/stages/stage-registry.js";
import { createMemoryStorage, isStageUnlocked, loadProgression } from "../js/progression.js";
import { SESSION_MODES } from "../js/session.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

const stageList = [
  { id: "pack_01_stage_01", packId: "pack_01", name: "Stage 1" },
  { id: "pack_01_stage_02", packId: "pack_01", name: "Stage 2" },
];

test("shell starts on the main menu with persisted progression loaded", () => {
  const state = createAppShellState({ storage: createMemoryStorage(), stageList });

  assertEqual(state.screen, APP_SCREENS.MAIN_MENU);
  assertEqual(isStageUnlocked(state.progression, "pack_01", "pack_01_stage_01"), true);
});

test("local run starts a canon session at the first stage", () => {
  const state = startLocalRun(createAppShellState({ storage: createMemoryStorage(), stageList }));

  assertEqual(state.screen, APP_SCREENS.GAMEPLAY);
  assertEqual(state.session.mode, SESSION_MODES.LOCAL_RUN);
  assertEqual(state.session.currentStageId, "pack_01_stage_01");
  assertEqual(state.viewMode, "runner");
  assertEqual(state.session.progressionWritesEnabled, true);
});

test("online menu starts public search with Factory profile identity", () => {
  const state = startOnlineSearch(
    goToOnlineMenu(createAppShellState({ storage: createMemoryStorage(), stageList })),
    { playerId: "factory-p1", displayName: "Factory Player" },
  );

  assertEqual(state.screen, APP_SCREENS.ONLINE_LOBBY);
  assertEqual(state.online.intent, "public");
  assertEqual(state.online.identity.playerId, "factory-p1");
  assertEqual(state.online.lobbyStatus, "searching");
});

test("private online lobby flow tracks code, owner, players, and ready state", () => {
  let state = startPrivateLobby(
    goToOnlineMenu(createAppShellState({ storage: createMemoryStorage(), stageList })),
    { playerId: "host", displayName: "Host" },
  );
  state = applyOnlineClientSnapshot(state, {
    status: "lobby",
    clientId: "host",
    lobby: { roomCode: "AB12", ownerId: "host", members: ["host"] },
    profiles: { host: { playerId: "host", displayName: "Host" } },
    readyByPlayerId: {},
  });
  state = markOnlineReady(state, true);

  assertEqual(state.screen, APP_SCREENS.ONLINE_LOBBY);
  assertEqual(state.online.intent, "private_create");
  assertEqual(state.online.roomCode, "AB12");
  assertEqual(state.online.isOwner, true);
  assertEqual(state.online.players[0].displayName, "Host");
  assertEqual(state.online.readyByPlayerId.host, true);
});

test("joining a private lobby normalizes the requested room code", () => {
  const state = joinOnlineLobby(
    goToOnlineMenu(createAppShellState({ storage: createMemoryStorage(), stageList })),
    "ab12",
    { playerId: "guest", displayName: "Guest" },
  );

  assertEqual(state.screen, APP_SCREENS.ONLINE_LOBBY);
  assertEqual(state.online.intent, "private_join");
  assertEqual(state.online.requestedRoomCode, "AB12");
  assertEqual(state.online.identity.displayName, "Guest");
});

test("practice stage options respect progression unlocks", () => {
  const state = createAppShellState({ storage: createMemoryStorage(), stageList });
  const options = getPracticeStageOptions(state);

  assertEqual(options[0].unlocked, true);
  assertEqual(options[1].unlocked, false);
});

test("locked practice stages cannot be started", () => {
  const state = startPractice(
    createAppShellState({ storage: createMemoryStorage(), stageList }),
    "pack_01_stage_02",
  );

  assertEqual(state.screen, APP_SCREENS.PRACTICE_SELECT);
  assertEqual(state.session, null);
});

test("debug lab starts a non-canon hybrid session even for locked stages", () => {
  const state = startDebugLab(
    createAppShellState({ storage: createMemoryStorage(), stageList }),
    "pack_01_stage_02",
  );

  assertEqual(state.screen, APP_SCREENS.GAMEPLAY);
  assertEqual(state.session.mode, SESSION_MODES.DEBUG);
  assertEqual(state.session.isCanonRun, false);
  assertEqual(state.viewMode, "hybrid");
});

test("canon clear records a stage result and unlocks that stage for practice", () => {
  const storage = createMemoryStorage();
  const state = submitStageClear(
    startLocalRun(createAppShellState({ storage, stageList })),
    { elapsedMs: 1200, deaths: 0, toolsPlaced: 1 },
  );

  assertEqual(state.screen, APP_SCREENS.STAGE_RESULT);
  assertEqual(state.stageResult.outcome, "clear");
  assertEqual(isStageUnlocked(loadProgression(storage), "pack_01", "pack_01_stage_01"), true);
});

test("continuing a non-final stage result advances to the next stage and swaps roles", () => {
  const state = continueFromStageResult(
    submitStageClear(startLocalRun(createAppShellState({ storage: createMemoryStorage(), stageList }))),
  );

  assertEqual(state.screen, APP_SCREENS.GAMEPLAY);
  assertEqual(state.session.currentStageId, "pack_01_stage_02");
  assertEqual(state.session.stageIndex, 1);
});

test("timeout failures are recorded as timer and can finish the run", () => {
  let state = startLocalRun(createAppShellState({ storage: createMemoryStorage(), stageList }));
  state = continueFromStageResult(submitStageClear(state));
  state = submitStageFailure(state, "timer", { elapsedMs: 300000 });
  state = continueFromStageResult(state);

  assertEqual(state.screen, APP_SCREENS.RUN_RESULT);
  assertEqual(state.runSummary.failedStages, 1);
  assertEqual(state.runSummary.results[1].outcome, "fail");
  assertEqual(state.runSummary.results[1].failReason, "timer");
});

test("real Pack 01 can complete a 10-stage mixed-result run with alternating roles", () => {
  let state = startLocalRun(createAppShellState({
    storage: createMemoryStorage(),
    stageList: listStages(DEFAULT_PACK_ID),
  }));
  const sequence = getStageSequence(DEFAULT_PACK_ID);

  sequence.forEach((stageId, index) => {
    assertEqual(state.screen, APP_SCREENS.GAMEPLAY);
    assertEqual(state.session.currentStageId, stageId);

    if (index % 3 === 1) {
      state = submitStageFailure(state, "timer", { elapsedMs: 60000 + index * 1000 });
    } else {
      state = submitStageClear(state, { timeClearedMs: 45000 + index * 1000 });
    }

    const result = state.stageResult;
    assertEqual(result.stageId, stageId);
    assertEqual(result.runnerPlayerId, index % 2 === 0 ? "player_a" : "player_b");
    assertEqual(result.builderPlayerId, index % 2 === 0 ? "player_b" : "player_a");
    state = continueFromStageResult(state);
  });

  assertEqual(state.screen, APP_SCREENS.RUN_RESULT);
  assertEqual(state.runSummary.totalStages, 10);
  assertEqual(state.runSummary.completedStages, 10);
  assertEqual(state.runSummary.results.length, 10);
  assertEqual(state.runSummary.failedStages, 3);
  assertEqual(state.runSummary.results[9].stageId, "pack_01_stage_10");
});

test("online lobby can start a host-authoritative online run", () => {
  let state = startPrivateLobby(
    goToOnlineMenu(createAppShellState({ storage: createMemoryStorage(), stageList })),
    { playerId: "host", displayName: "Host" },
  );
  state = applyOnlineClientSnapshot(state, {
    status: "lobby",
    clientId: "host",
    lobby: { roomCode: "AB12", ownerId: "host", members: ["host", "guest"] },
    profiles: {
      host: { playerId: "host", displayName: "Host" },
      guest: { playerId: "guest", displayName: "Guest" },
    },
    readyByPlayerId: { host: true, guest: true },
  });
  state = startOnlineRunFromLobby(state);

  assertEqual(state.screen, APP_SCREENS.GAMEPLAY);
  assertEqual(state.session.mode, SESSION_MODES.ONLINE_RUN);
  assertEqual(state.onlineGameplay.isHost, true);
  assertEqual(state.onlineGameplay.authorityPlayerId, "host");
  assertEqual(state.session.currentStageId, "pack_01_stage_01");
});

test("guest online run accepts host stage results but cannot submit local results", () => {
  let state = startPrivateLobby(
    goToOnlineMenu(createAppShellState({ storage: createMemoryStorage(), stageList })),
    { playerId: "guest", displayName: "Guest" },
  );
  state = applyOnlineClientSnapshot(state, {
    status: "lobby",
    clientId: "guest",
    lobby: { roomCode: "AB12", ownerId: "host", members: ["host", "guest"] },
    profiles: {
      host: { playerId: "host", displayName: "Host" },
      guest: { playerId: "guest", displayName: "Guest" },
    },
    readyByPlayerId: { host: true, guest: true },
  });
  state = startOnlineRunFromLobby(state);
  const rejected = submitStageClear(state, { elapsedMs: 1000 });
  state = applyOnlineStageResult(state, {
    senderId: "host",
    value: { stageId: "pack_01_stage_01", stageIndex: 0, outcome: "clear", elapsedMs: 1000 },
  });

  assertEqual(rejected.screen, APP_SCREENS.GAMEPLAY);
  assertEqual(rejected.session.stageResults.length, 0);
  assertEqual(state.screen, APP_SCREENS.STAGE_RESULT);
  assertEqual(state.stageResult.outcome, "clear");
  assertEqual(state.session.currentStageId, "pack_01_stage_02");
});

test("online run complete and disconnect states return player-facing screens", () => {
  let state = startPrivateLobby(
    goToOnlineMenu(createAppShellState({ storage: createMemoryStorage(), stageList })),
    { playerId: "guest", displayName: "Guest" },
  );
  state = applyOnlineClientSnapshot(state, {
    status: "lobby",
    clientId: "guest",
    lobby: { roomCode: "AB12", ownerId: "host", members: ["host", "guest"] },
    profiles: { host: { playerId: "host" }, guest: { playerId: "guest" } },
  });
  state = startOnlineRunFromLobby(state);
  const complete = applyOnlineRunComplete(state, {
    senderId: "host",
    value: { summary: { totalStages: 2, completedStages: 2, clearedStages: 1, failedStages: 1 } },
  });
  const disconnected = applyOnlineGameplayDisconnect(state, "host");

  assertEqual(complete.screen, APP_SCREENS.RUN_RESULT);
  assertEqual(complete.runSummary.completedStages, 2);
  assertEqual(disconnected.screen, APP_SCREENS.ONLINE_LOBBY);
  assertEqual(disconnected.online.lobbyStatus, "disconnected");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
