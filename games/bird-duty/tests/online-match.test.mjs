import {
  ONLINE_MATCH_PHASE,
  addOnlineMatchScore,
  createOnlineMatchSession,
  finishOnlineMatchTurn,
  getOnlineActivePlayer,
  startOnlineMatchTurn,
} from "../scripts/online-match.js";

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
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

const PLAYERS = [
  { clientId: "c1", name: "One" },
  { clientId: "c2", name: "Two" },
  { clientId: "c3", name: "Three" },
];

test("online match starts ready for the first player", () => {
  const match = createOnlineMatchSession(PLAYERS);

  assertEqual(match.phase, ONLINE_MATCH_PHASE.READY);
  assertEqual(match.round, 1);
  assertEqual(getOnlineActivePlayer(match).clientId, "c1");
  assertEqual(match.scores.c1, 0);
});

test("online match scores the active player only", () => {
  const match = addOnlineMatchScore(startOnlineMatchTurn(createOnlineMatchSession(PLAYERS)), 3);

  assertEqual(match.scores.c1, 3);
  assertEqual(match.scores.c2, 0);
});

test("online match rotates through all players before advancing round", () => {
  let match = startOnlineMatchTurn(createOnlineMatchSession(PLAYERS));
  match = finishOnlineMatchTurn(match);
  assertEqual(getOnlineActivePlayer(match).clientId, "c2");
  assertEqual(match.round, 1);

  match = startOnlineMatchTurn(match);
  match = finishOnlineMatchTurn(match);
  assertEqual(getOnlineActivePlayer(match).clientId, "c3");
  assertEqual(match.round, 1);

  match = startOnlineMatchTurn(match);
  match = finishOnlineMatchTurn(match);
  assertEqual(getOnlineActivePlayer(match).clientId, "c1");
  assertEqual(match.round, 2);
});

test("online match ends after every player finishes round three", () => {
  let match = createOnlineMatchSession(PLAYERS);
  for (let i = 0; i < PLAYERS.length * 3; i++) {
    match = finishOnlineMatchTurn(startOnlineMatchTurn(match));
  }

  assertEqual(match.phase, ONLINE_MATCH_PHASE.MATCH_OVER);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
