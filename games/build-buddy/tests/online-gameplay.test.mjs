import {
  createBuilderCommandMessage,
  createOnlineGameplayState,
  createRunnerInputMessage,
  acceptServerRunnerStateMessage,
  createStageCompleteRequestMessage,
  createStageStartMessage,
  createStateSyncMessage,
  markOnlineGameplayDisconnected,
  receiveRunCompleteMessage,
  receiveStageStartMessage,
  receiveStageResultMessage,
  receiveStateSyncMessage,
  recordAuthoritativeStageResult,
  shouldSendServerRunnerState,
} from "../js/online-gameplay.js";

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

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `expected ${actualJson} to equal ${expectedJson}`);
  }
}

const stageSequence = Array.from({ length: 10 }, (_, index) => `pack_01_stage_${String(index + 1).padStart(2, "0")}`);
const players = [
  { id: "host", displayName: "Host" },
  { id: "guest", displayName: "Guest" },
];

test("stage start messages identify the authoritative run stage and current roles", () => {
  const state = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "host",
    authorityPlayerId: "host",
    runId: "run-123",
  });
  const message = createStageStartMessage(state, { seed: 99, startAt: 123456 });

  assertEqual(message.messageType, "stage_start");
  assertEqual(message.value.runId, "run-123");
  assertEqual(message.value.stageId, "pack_01_stage_01");
  assertEqual(message.value.stageIndex, 0);
  assertEqual(message.value.authorityPlayerId, "host");
  assertDeepEqual(message.value.roles, { runnerPlayerId: "host", builderPlayerId: "guest" });
});

test("runner input serialization keeps the command small and boolean", () => {
  const message = createRunnerInputMessage({
    tick: 12.8,
    left: 1,
    right: false,
    up: "yes",
    down: 0,
    jump: true,
    reposition: false,
    ignored: true,
  });

  assertDeepEqual(message, {
    messageType: "runner_input",
    value: {
      tick: 12,
      left: true,
      right: false,
      up: true,
      down: false,
      jump: true,
      reposition: false,
    },
  });
});

test("builder command serialization normalizes placement and deletion commands", () => {
  const place = createBuilderCommandMessage({
    tick: 5,
    commandId: "place-1",
    action: "place",
    toolType: "springBlue",
    gridX: 102.9,
    gridY: 280.2,
  });
  const del = createBuilderCommandMessage({
    tick: 6,
    commandId: "",
    action: "delete",
    gridX: -10,
    gridY: 40,
  });

  assertDeepEqual(place.value, {
    tick: 5,
    commandId: "place-1",
    action: "place",
    toolType: "springBlue",
    gridX: 102,
    gridY: 280,
  });
  assertEqual(del.value.action, "delete");
  assertEqual(del.value.toolType, null);
  assertEqual(del.value.gridX, 0);
  assertEqual(del.value.commandId.length > 0, true);
});

test("stage completion requests include the current stage identity for server validation", () => {
  const state = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "host",
    authorityPlayerId: "server",
    runId: "run-123",
  });
  const message = createStageCompleteRequestMessage(state, {
    outcome: "clear",
    elapsedMs: 1234,
  });

  assertEqual(message.messageType, "stage_complete_request");
  assertEqual(message.value.stageId, "pack_01_stage_01");
  assertEqual(message.value.stageIndex, 0);
  assertEqual(message.value.outcome, "clear");
  assertEqual(message.value.elapsedMs, 1234);
});

test("host state snapshots expose only sync-safe runtime fields", () => {
  const message = createStateSyncMessage({
    tick: 20,
    runner: { x: 120.4, y: 400.8, vx: 9, vy: -3, dead: false },
    tools: [{ id: "tool_1", toolType: "platform", x: 80, y: 520, active: true, extra: "ignored" }],
    timerMs: 89999.2,
    stageStatus: "playing",
    privateLocalOnly: true,
  });

  assertDeepEqual(message.value, {
    tick: 20,
    runner: { x: 120.4, y: 400.8, vx: 9, vy: -3, dead: false },
    tools: [{ id: "tool_1", toolType: "platform", x: 80, y: 520, active: true }],
    timerMs: 89999.2,
    stageStatus: "playing",
  });
});

test("server-authoritative runners send periodic correction snapshots", () => {
  const serverState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "host",
    authorityPlayerId: "server",
  });
  const clientHostState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "host",
    authorityPlayerId: "host",
  });

  assertEqual(shouldSendServerRunnerState(serverState, "runner", 2), false);
  assertEqual(shouldSendServerRunnerState(serverState, "runner", 3), true);
  assertEqual(shouldSendServerRunnerState(serverState, "builder", 3), false);
  assertEqual(shouldSendServerRunnerState(clientHostState, "runner", 3), false);
});

test("server-authoritative builders accept only fresh snapshots from the current Runner", () => {
  const state = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "guest",
    authorityPlayerId: "server",
  });
  const accepted = acceptServerRunnerStateMessage(state, "builder", -1, {
    senderId: "host",
    value: { tick: 12, x: 100, y: 200, vx: 5, vy: -2, dead: false },
  });
  const stale = acceptServerRunnerStateMessage(state, "builder", 12, {
    senderId: "host",
    value: { tick: 11, x: 90, y: 200 },
  });
  const wrongSender = acceptServerRunnerStateMessage(state, "builder", -1, {
    senderId: "guest",
    value: { tick: 13, x: 999, y: 999 },
  });

  assertEqual(accepted.tick, 12);
  assertEqual(accepted.x, 100);
  assertEqual(stale, null);
  assertEqual(wrongSender, null);
});

test("only the host can record an authoritative stage result locally", () => {
  const guestState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "guest",
    authorityPlayerId: "host",
  });
  const next = recordAuthoritativeStageResult(guestState, {
    outcome: "clear",
    details: { elapsedMs: 1200 },
  });

  assertEqual(next.session.stageResults.length, 0);
  assertEqual(next.rejectedMessages.length, 1);
  assertEqual(next.rejectedMessages[0].reason, "local_client_is_not_authority");
});

test("host stage results advance online sessions and swap roles", () => {
  const hostState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "host",
    authorityPlayerId: "host",
  });
  const next = recordAuthoritativeStageResult(hostState, {
    outcome: "fail",
    reason: "timer",
    details: { elapsedMs: 60000 },
  });

  assertEqual(next.session.stageResults.length, 1);
  assertEqual(next.session.stageResults[0].failReason, "timer");
  assertEqual(next.session.currentStageId, "pack_01_stage_02");
  assertEqual(next.outboundMessages[0].messageType, "stage_result");
  assertEqual(next.outboundMessages[0].value.stageId, "pack_01_stage_01");
  assertDeepEqual(next.outboundMessages[1].value.roles, { runnerPlayerId: "guest", builderPlayerId: "host" });
});

test("guest accepts stage results from host authority and rejects other senders", () => {
  const guestState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "guest",
    authorityPlayerId: "host",
  });
  const fake = receiveStageResultMessage(guestState, {
    senderId: "spectator",
    value: { stageId: "pack_01_stage_01", stageIndex: 0, outcome: "clear", elapsedMs: 1200 },
  });
  const accepted = receiveStageResultMessage(guestState, {
    senderId: "host",
    value: { stageId: "pack_01_stage_01", stageIndex: 0, outcome: "clear", elapsedMs: 1200 },
  });

  assertEqual(fake.session.stageResults.length, 0);
  assertEqual(fake.rejectedMessages[0].reason, "sender_is_not_authority");
  assertEqual(accepted.session.stageResults.length, 1);
  assertEqual(accepted.session.stageResults[0].outcome, "clear");
  assertEqual(accepted.session.currentStageId, "pack_01_stage_02");
});

test("guests accept stage starts and state snapshots only from authority", () => {
  const guestState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "guest",
    authorityPlayerId: "host",
  });
  const fakeStart = receiveStageStartMessage(guestState, {
    senderId: "spectator",
    value: { runId: "run-1", stageId: "pack_01_stage_01", stageIndex: 0 },
  });
  const started = receiveStageStartMessage(guestState, {
    senderId: "host",
    value: { runId: "run-1", stageId: "pack_01_stage_01", stageIndex: 0, startAt: 1000 },
  });
  const synced = receiveStateSyncMessage(started, {
    senderId: "host",
    value: { tick: 3, runner: { x: 40, y: 50 }, timerMs: 89000, stageStatus: "playing" },
  });

  assertEqual(fakeStart.stageStarted, false);
  assertEqual(fakeStart.rejectedMessages[0].reason, "sender_is_not_authority");
  assertEqual(started.stageStarted, true);
  assertEqual(started.runId, "run-1");
  assertEqual(synced.lastStateSync.tick, 3);
});

test("run complete and disconnect messages end online gameplay safely", () => {
  const guestState = createOnlineGameplayState({
    packId: "pack_01",
    stageSequence,
    players,
    localPlayerId: "guest",
    authorityPlayerId: "host",
  });
  const complete = receiveRunCompleteMessage(guestState, {
    senderId: "host",
    value: { summary: { totalStages: 10, completedStages: 10 } },
  });
  const disconnected = markOnlineGameplayDisconnected(complete, "host");

  assertEqual(complete.session.isComplete, true);
  assertEqual(complete.runSummary.totalStages, 10);
  assertEqual(disconnected.connectionStatus, "disconnected");
  assertEqual(disconnected.disconnectedPlayerId, "host");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
