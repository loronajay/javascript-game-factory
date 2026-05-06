import { PHASES } from "../scripts/config.js";
import {
  buildInputModeState,
  getExpectedSlotCount,
  getProgressCountForPhase,
  getRoleLabel,
  shouldShowLoserCallout,
} from "../scripts/match-view-state.js";

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

function createState(overrides = {}) {
  const players = overrides.players || [
    { id: "p1", clientId: "c1", name: "Alpha", letters: "", eliminated: false, lastResult: null },
    { id: "p2", clientId: "c2", name: "Bravo", letters: "", eliminated: false, lastResult: null },
  ];

  return {
    mode: "online",
    phase: PHASES.OWNER_CREATE_INITIAL,
    ownerIndex: 0,
    players,
    settings: {
      startingPatternLength: 4,
      patternAppendCount: 2,
      maxPatternLength: 10,
      penaltyWord: "STATIC",
    },
    activeSequence: [],
    ownerDraft: [],
    ownerReplayIndex: 0,
    appendTargetLength: 0,
    copyProgress: {},
    playback: null,
    winnerId: null,
    network: { myClientId: "c1" },
    ...overrides,
  };
}

console.log("\necho-duel match-view-state");

test("owner create mode stays unlocked for the local owner", () => {
  const mode = buildInputModeState(createState({
    phase: PHASES.OWNER_CREATE_INITIAL,
    ownerDraft: ["W", "A"],
  }));

  assertEq(mode.label, "CREATE STARTING SIGNAL");
  assertEq(mode.detail, "2/4");
  assertEq(mode.locked, false);
  assertEq(mode.className, "mode-owner-append");
});

test("challenger copy mode unlocks input for the local copying challenger", () => {
  const mode = buildInputModeState(createState({
    phase: PHASES.CHALLENGER_COPY,
    network: { myClientId: "c2" },
    copyProgress: {
      p2: { index: 3, status: "copying" },
    },
    activeSequence: ["W", "A", "S", "D"],
  }));

  assertEq(mode.label, "COPY THE SIGNAL");
  assertEq(mode.detail, "3/4");
  assertEq(mode.locked, false);
  assertEq(mode.className, "mode-challenger-copy");
});

test("signal playback progress uses elapsed playback timing", () => {
  const state = createState({
    phase: PHASES.SIGNAL_PLAYBACK,
    activeSequence: ["W", "A", "S", "D"],
    playback: {
      sequence: ["W", "A", "S", "D"],
      startedAt: 1000,
      perInputMs: 570,
    },
  });

  assertEq(getExpectedSlotCount(state), 4);
  assertEq(getProgressCountForPhase(state, 1000 + 1200), 3);
});

test("player role text reflects copy progress and failure state", () => {
  const state = createState({
    phase: PHASES.CHALLENGER_COPY,
    activeSequence: ["W", "A", "S", "D"],
    copyProgress: {
      p2: { index: 2, status: "copying" },
    },
  });

  assertEq(getRoleLabel(state, state.players[0]), "Driver");
  assertEq(getRoleLabel(state, state.players[1]), "Copying 2/4");

  const failed = createState({
    phase: PHASES.CHALLENGER_COPY,
    copyProgress: {
      p2: { index: 1, status: "fail" },
    },
  });
  assertEq(getRoleLabel(failed, failed.players[1]), "Failed");
});

test("loser callout only appears for the losing local player online", () => {
  const winnerState = createState({
    phase: PHASES.MATCH_OVER,
    winnerId: "p1",
    network: { myClientId: "c1" },
  });
  assertEq(shouldShowLoserCallout(winnerState), false);

  const loserState = createState({
    phase: PHASES.MATCH_OVER,
    winnerId: "p1",
    network: { myClientId: "c2" },
  });
  assertEq(shouldShowLoserCallout(loserState), true);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
