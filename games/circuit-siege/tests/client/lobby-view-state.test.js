import {
  buildLobbyStartActionState,
  getLobbyStatusText,
  getQueueStatusText
} from "../../scripts/client/lobby-view-state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\nlobby-view-state");

test("getQueueStatusText highlights the opposite queue for public matchmaking", () => {
  assertEqual(
    getQueueStatusText({ matchmakingMode: "public", selectedSide: "blue", queueCounts: { blue: 1, red: 3 } }),
    "3 red players waiting."
  );
});

test("getQueueStatusText falls back cleanly when queue counts are missing", () => {
  assertEqual(
    getQueueStatusText({ matchmakingMode: "public", selectedSide: "red", queueCounts: null }),
    "Checking queue..."
  );
});

test("getLobbyStatusText reports waiting and live room states", () => {
  assertEqual(
    getLobbyStatusText({ lobby: { playerCount: 1 }, matchReady: null }),
    "Waiting for opponent..."
  );
  assertEqual(
    getLobbyStatusText({ lobby: { playerCount: 2 }, matchReady: { startAt: 2500, serverNow: 1000 }, now: () => 1500 }),
    "Match starts in 1s..."
  );
});

test("buildLobbyStartActionState only enables start for the host with a full room", () => {
  const enabled = buildLobbyStartActionState({
    isHost: true,
    lobby: { playerCount: 2 },
    startRequested: false
  });
  const disabled = buildLobbyStartActionState({
    isHost: false,
    lobby: { playerCount: 2 },
    startRequested: false
  });

  assertEqual(enabled.hidden, false);
  assertEqual(enabled.disabled, false);
  assertEqual(disabled.hidden, true);
  assertEqual(disabled.disabled, true);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
