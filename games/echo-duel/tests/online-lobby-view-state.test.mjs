import {
  buildLobbyStartButtonState,
  getLobbyStatusText,
} from "../scripts/online-lobby-view-state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

console.log("\necho-duel online-lobby-view-state");

test("ended lobbies render a terminal status message", () => {
  assertEq(getLobbyStatusText({
    status: "ended",
    playerCount: 2,
    minPlayers: 2,
  }), "Match finished.");
});

test("ended lobbies disable the owner start button and show finished copy", () => {
  const state = buildLobbyStartButtonState({
    lobby: {
      ownerId: "c_host",
      status: "ended",
      playerCount: 2,
      minPlayers: 2,
      startAt: null,
    },
    myClientId: "c_host",
    startRequested: false,
    now: 1000,
  });

  assertEq(state.hidden, false);
  assertEq(state.disabled, true);
  assertEq(state.text, "Match Finished");
  assertEq(state.ariaBusy, "false");
});

test("open ready lobbies keep the owner start button enabled", () => {
  const state = buildLobbyStartButtonState({
    lobby: {
      ownerId: "c_host",
      status: "open",
      playerCount: 2,
      minPlayers: 2,
      startAt: null,
    },
    myClientId: "c_host",
    startRequested: false,
    now: 1000,
  });

  assertEq(state.disabled, false);
  assertEq(state.text, "Start Now");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
