import {
  SESSION_MODES,
  advanceSession,
  buildRunSummary,
  createDebugSession,
  createLocalRunSession,
  createPracticeSession,
  getCurrentRoles,
  recordStageClear,
  recordStageFailure,
  shouldUnlockStage,
} from "../js/session.js";

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

const stageSequence = ["pack_01_stage_01", "pack_01_stage_02", "pack_01_stage_03"];
const players = [
  { id: "player_a", displayName: "Player A" },
  { id: "player_b", displayName: "Player B" },
];

test("local canon run starts at stage one with Player A as Runner", () => {
  const session = createLocalRunSession({ packId: "pack_01", stageSequence, players });

  assertEqual(session.mode, SESSION_MODES.LOCAL_RUN);
  assertEqual(session.packId, "pack_01");
  assertEqual(session.stageIndex, 0);
  assertEqual(session.currentStageId, "pack_01_stage_01");
  assertEqual(session.isCanonRun, true);
  assertEqual(session.progressionWritesEnabled, true);
  assertEqual(getCurrentRoles(session).runnerPlayerId, "player_a");
  assertEqual(getCurrentRoles(session).builderPlayerId, "player_b");
});

test("roles swap after stage clear", () => {
  const cleared = recordStageClear(
    createLocalRunSession({ packId: "pack_01", stageSequence, players }),
    { elapsedMs: 42000, deaths: 1, toolsPlaced: 4 },
  );
  const advanced = advanceSession(cleared);

  assertEqual(advanced.currentStageId, "pack_01_stage_02");
  assertEqual(getCurrentRoles(advanced).runnerPlayerId, "player_b");
  assertEqual(getCurrentRoles(advanced).builderPlayerId, "player_a");
  assertEqual(advanced.stageResults[0].outcome, "clear");
  assertEqual(advanced.stageResults[0].stageId, "pack_01_stage_01");
});

test("failed stages still advance and swap roles", () => {
  const failedSession = recordStageFailure(
    createLocalRunSession({ packId: "pack_01", stageSequence, players }),
    "time_up",
    { elapsedMs: 300000, deaths: 2, toolsPlaced: 8 },
  );
  const advanced = advanceSession(failedSession);

  assertEqual(advanced.currentStageId, "pack_01_stage_02");
  assertEqual(getCurrentRoles(advanced).runnerPlayerId, "player_b");
  assertEqual(advanced.stageResults[0].outcome, "failure");
  assertEqual(advanced.stageResults[0].reason, "time_up");
});

test("timeout is recorded as time_up instead of a runner death label", () => {
  const session = recordStageFailure(
    createLocalRunSession({ packId: "pack_01", stageSequence, players }),
    "timer",
  );

  assertEqual(session.stageResults[0].reason, "time_up");
});

test("practice and debug sessions are non-canon and do not unlock stages", () => {
  const practice = createPracticeSession({ packId: "pack_01", stageId: "pack_01_stage_02", players });
  const debug = createDebugSession({ packId: "pack_01", stageId: "pack_01_stage_03", players });

  assertEqual(practice.mode, SESSION_MODES.PRACTICE);
  assertEqual(debug.mode, SESSION_MODES.DEBUG);
  assertEqual(practice.isCanonRun, false);
  assertEqual(debug.isCanonRun, false);
  assertEqual(shouldUnlockStage(recordStageClear(practice), "pack_01_stage_02"), false);
  assertEqual(shouldUnlockStage(recordStageClear(debug), "pack_01_stage_03"), false);
});

test("run completes after final stage result", () => {
  let session = createLocalRunSession({ packId: "pack_01", stageSequence, players });
  session = advanceSession(recordStageClear(session));
  session = advanceSession(recordStageFailure(session, "time_up"));
  session = advanceSession(recordStageClear(session));

  assertEqual(session.isComplete, true);
  assertEqual(session.stageIndex, 2);
  assertEqual(session.currentStageId, "pack_01_stage_03");
  assertEqual(session.stageResults.length, 3);
});

test("run summary preserves stage identities and clear counts", () => {
  let session = createLocalRunSession({ packId: "pack_01", stageSequence, players });
  session = advanceSession(recordStageClear(session, { elapsedMs: 1000 }));
  session = advanceSession(recordStageFailure(session, "time_up", { elapsedMs: 2000 }));
  const summary = buildRunSummary(session);

  assertEqual(summary.mode, SESSION_MODES.LOCAL_RUN);
  assertEqual(summary.packId, "pack_01");
  assertEqual(summary.totalStages, 3);
  assertEqual(summary.completedStages, 2);
  assertEqual(summary.clearedStages, 1);
  assertEqual(summary.failedStages, 1);
  assertEqual(summary.results[1].stageId, "pack_01_stage_02");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
