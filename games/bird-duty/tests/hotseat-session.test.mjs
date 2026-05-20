import {
  HOTSEAT_PHASE,
  HOTSEAT_ROUNDS,
  HOTSEAT_SHOTS_PER_TURN,
  addHotseatScore,
  advanceHotseatReady,
  createHotseatSession,
  createHotseatTurnSession,
  finishHotseatTurn,
  resolveHotseatWinner,
  startHotseatTurn,
} from "../scripts/hotseat-session.js";

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

test("hotseat starts ready for player one round one", () => {
  const session = createHotseatSession();

  assertEqual(session.phase, HOTSEAT_PHASE.READY);
  assertEqual(session.round, 1);
  assertEqual(session.currentPlayer, "p1");
  assertEqual(session.scores.p1, 0);
  assertEqual(session.scores.p2, 0);
});

test("hotseat turn sessions get five shots", () => {
  const turn = createHotseatTurnSession();

  assertEqual(turn.shotsRemaining, HOTSEAT_SHOTS_PER_TURN);
});

test("ready state can start a playing turn", () => {
  const session = startHotseatTurn(createHotseatSession());

  assertEqual(session.phase, HOTSEAT_PHASE.PLAYING);
});

test("score is added to the current player only", () => {
  const session = addHotseatScore(startHotseatTurn(createHotseatSession()), 2);

  assertEqual(session.scores.p1, 2);
  assertEqual(session.scores.p2, 0);
});

test("turn order alternates p1 then p2 and advances rounds after p2", () => {
  let session = startHotseatTurn(createHotseatSession());
  session = finishHotseatTurn(session);

  assertEqual(session.phase, HOTSEAT_PHASE.TURN_OVER);
  assertEqual(session.currentPlayer, "p2");
  assertEqual(session.round, 1);

  session = startHotseatTurn(advanceHotseatReady(session));
  session = finishHotseatTurn(session);

  assertEqual(session.phase, HOTSEAT_PHASE.TURN_OVER);
  assertEqual(session.currentPlayer, "p1");
  assertEqual(session.round, 2);
});

test("match ends after player two finishes round three", () => {
  let session = createHotseatSession();
  for (let i = 0; i < HOTSEAT_ROUNDS * 2; i++) {
    session = startHotseatTurn(advanceHotseatReady(session));
    session = finishHotseatTurn(session);
  }

  assertEqual(session.phase, HOTSEAT_PHASE.MATCH_OVER);
});

test("winner resolves p1 p2 or tie", () => {
  assertEqual(resolveHotseatWinner({ p1: 3, p2: 2 }), "p1");
  assertEqual(resolveHotseatWinner({ p1: 1, p2: 4 }), "p2");
  assertEqual(resolveHotseatWinner({ p1: 4, p2: 4 }), "tie");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
