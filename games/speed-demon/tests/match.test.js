import { suite, test, assert, assertEqual, assertThrows, finish } from "./harness.js";

import {
  MATCH_LIVE,
  MATCH_DECIDED,
  EVENT_NONE,
  EVENT_ROUND_RESTART,
  EVENT_ROUND_WON,
  EVENT_MATCH_WON,
  REASON_RED_LIGHT,
  REASON_TIME,
  REASON_DISCONNECT,
  DEFAULT_BEST_OF,
  createMatch,
  recordFalseStarts,
  recordFinish,
  recordDisconnect,
  faultsFor,
  winsFor,
  isDecided,
  matchScore,
  opponentOf,
} from "../scripts/sim/match.js";

suite("match — best-of-N rounds, red lights and finishes");

const A = "player-a";
const B = "player-b";

const newMatch = (overrides = {}) => createMatch({ playerIds: [A, B], ...overrides });

/** One offender, jumping `before` seconds ahead of the green. */
const jump = (playerId, before = 0.2) => [{ playerId, jumpedBeforeGreen: before }];

/** A finished round where `winner` got there first. */
const finishedBy = (winner, margin = 0.5) => [
  { playerId: winner, finishTime: 12.0, complete: true },
  { playerId: opponentOf(newMatch(), winner), finishTime: 12.0 + margin, complete: true },
];

/** Wins `count` rounds for `player` on the clock. */
function winRounds(match, player, count) {
  for (let i = 0; i < count; i += 1) {
    match = recordFinish(match, finishedBy(player));
  }
  return match;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test("a new match is live, best of three, with a clean sheet", () => {
  const match = newMatch();
  assertEqual(match.status, MATCH_LIVE);
  assertEqual(match.bestOf, DEFAULT_BEST_OF);
  assertEqual(match.roundsToWin, 2, "best of three is won with two");
  assertEqual(match.round.number, 1);
  assertEqual(match.round.attempt, 1);
  assertEqual(faultsFor(match, A), 0);
  assertEqual(winsFor(match, A), 0);
  assertEqual(match.lastEvent.kind, EVENT_NONE);
});

test("rounds to win is derived from the match length, never passed in", () => {
  assertEqual(newMatch({ bestOf: 1 }).roundsToWin, 1);
  assertEqual(newMatch({ bestOf: 3 }).roundsToWin, 2);
  assertEqual(newMatch({ bestOf: 5 }).roundsToWin, 3);
});

test("a match needs exactly two distinct players and a legal length", () => {
  assertThrows(() => createMatch({ playerIds: [A] }));
  assertThrows(() => createMatch({ playerIds: [A, B, "c"] }));
  assertThrows(() => createMatch({ playerIds: [A, A] }));
  assertThrows(() => createMatch({ playerIds: [A, B], bestOf: 2 }), "even lengths cannot be won");
  assertThrows(() => createMatch({ playerIds: [A, B], bestOf: 4 }));
});

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

test("a clean tree changes nothing, so every start can be piped through", () => {
  const match = recordFalseStarts(newMatch(), []);
  assertEqual(match.status, MATCH_LIVE);
  assertEqual(match.round.attempt, 1, "the round has not been re-run");
  assertEqual(faultsFor(match, A), 0);
  assertEqual(match.lastEvent.kind, EVENT_NONE);
});

test("a first red light re-runs the round rather than deciding it", () => {
  const match = recordFalseStarts(newMatch(), jump(A));
  assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART);
  assertEqual(match.round.number, 1, "still the same round");
  assertEqual(match.round.attempt, 2, "on its second attempt");
  assertEqual(faultsFor(match, A), 1);
  assertEqual(winsFor(match, B), 0, "the grace fault costs nothing but the re-run");
});

test("a second red light in the same round forfeits that round", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  match = recordFalseStarts(match, jump(A));
  assertEqual(match.lastEvent.kind, EVENT_ROUND_WON);
  assertEqual(match.lastEvent.reason, REASON_RED_LIGHT);
  assertEqual(winsFor(match, B), 1, "the round goes to the other driver");
  assertEqual(winsFor(match, A), 0);
  assertEqual(match.status, MATCH_LIVE, "but the match is still alive at best of three");
});

test("the grace fault is per player, so one driver never spends the other's", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  match = recordFalseStarts(match, jump(B));
  assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART);
  assertEqual(faultsFor(match, A), 1);
  assertEqual(faultsFor(match, B), 1);
  assertEqual(match.round.attempt, 3);
});

// ---------------------------------------------------------------------------
// The per-round reset — the rule this file was reworked for
// ---------------------------------------------------------------------------

test("faults reset when a new round begins", () => {
  // A reds once in round one, then loses the round on the clock anyway.
  let match = recordFalseStarts(newMatch(), jump(A));
  assertEqual(faultsFor(match, A), 1);

  match = recordFinish(match, finishedBy(B));
  assertEqual(match.round.number, 2, "on to the next round");
  assertEqual(faultsFor(match, A), 0, "with a clean sheet — faults do not carry");
  assertEqual(faultsFor(match, B), 0);
});

test("a driver may red-light once in every round without ever being forfeited", () => {
  let match = newMatch({ bestOf: 5 });
  for (let round = 1; round <= 3; round += 1) {
    match = recordFalseStarts(match, jump(A));
    assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART, `round ${round} should re-run`);
    assertEqual(faultsFor(match, A), 1, `round ${round} fault count`);
    match = recordFinish(match, finishedBy(A));
  }
  assertEqual(winsFor(match, A), 3);
  assertEqual(match.winnerId, A, "and still wins the match");
});

test("a re-run keeps the faults, because they belong to the round not the attempt", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  assertEqual(match.round.attempt, 2);
  assertEqual(faultsFor(match, A), 1, "the re-run does not forgive the fault");
  match = recordFalseStarts(match, jump(A));
  assertEqual(winsFor(match, B), 1, "so the next one still forfeits the round");
});

// ---------------------------------------------------------------------------
// Both cars jumping the same tree
// ---------------------------------------------------------------------------

test("a double red light on the first tree burns both graces and re-runs", () => {
  const match = recordFalseStarts(newMatch(), [
    { playerId: A, jumpedBeforeGreen: 0.3 },
    { playerId: B, jumpedBeforeGreen: 0.1 },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART);
  assertEqual(faultsFor(match, A), 1);
  assertEqual(faultsFor(match, B), 1);
});

test("in a double red light only the driver out of grace loses the round", () => {
  let match = recordFalseStarts(newMatch(), jump(A)); // A has spent its grace
  match = recordFalseStarts(match, [
    { playerId: A, jumpedBeforeGreen: 0.1 },
    { playerId: B, jumpedBeforeGreen: 0.4 },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_WON);
  assertEqual(winsFor(match, B), 1, "B jumped earlier but still had a grace in hand");
  assertEqual(winsFor(match, A), 0);
});

test("when both run out of grace on the same tree, the earlier jumper loses", () => {
  let match = recordFalseStarts(newMatch(), [
    { playerId: A, jumpedBeforeGreen: 0.2 },
    { playerId: B, jumpedBeforeGreen: 0.2 },
  ]);
  match = recordFalseStarts(match, [
    { playerId: A, jumpedBeforeGreen: 0.5 }, // A left first
    { playerId: B, jumpedBeforeGreen: 0.1 },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_WON);
  assertEqual(winsFor(match, B), 1, "first to leave takes the red light");
});

test("two drivers fouling out at the identical instant re-runs the round", () => {
  let match = recordFalseStarts(newMatch(), [
    { playerId: A, jumpedBeforeGreen: 0.2 },
    { playerId: B, jumpedBeforeGreen: 0.2 },
  ]);
  match = recordFalseStarts(match, [
    { playerId: A, jumpedBeforeGreen: 0.25 },
    { playerId: B, jumpedBeforeGreen: 0.25 },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART, "nobody can be said to have gone first");
  assertEqual(winsFor(match, A), 0);
  assertEqual(winsFor(match, B), 0);
  // ...and the faults stand, so the very next offence settles it.
  const next = recordFalseStarts(match, jump(A));
  assertEqual(winsFor(next, B), 1);
});

// ---------------------------------------------------------------------------
// Finishing on the clock
// ---------------------------------------------------------------------------

test("the lower finishing time takes the round", () => {
  const match = recordFinish(newMatch(), [
    { playerId: A, finishTime: 12.04, complete: true },
    { playerId: B, finishTime: 12.38, complete: true },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_WON);
  assertEqual(match.lastEvent.reason, REASON_TIME);
  assertEqual(winsFor(match, A), 1);
});

test("a driver who crossed beats one who did not", () => {
  const match = recordFinish(newMatch(), [
    { playerId: A, finishTime: null, complete: false },
    { playerId: B, finishTime: 14.9, complete: true },
  ]);
  assertEqual(winsFor(match, B), 1);
});

test("neither crossing re-runs the round rather than inventing a winner", () => {
  const match = recordFinish(newMatch(), [
    { playerId: A, finishTime: null, complete: false },
    { playerId: B, finishTime: null, complete: false },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART);
  assertEqual(winsFor(match, A), 0);
  assertEqual(winsFor(match, B), 0);
});

test("an exact dead heat re-runs the round", () => {
  const match = recordFinish(newMatch(), [
    { playerId: A, finishTime: 12.5, complete: true },
    { playerId: B, finishTime: 12.5, complete: true },
  ]);
  assertEqual(match.lastEvent.kind, EVENT_ROUND_RESTART);
});

// ---------------------------------------------------------------------------
// Winning the match
// ---------------------------------------------------------------------------

test("two rounds wins a best of three", () => {
  const match = winRounds(newMatch(), A, 2);
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.winnerId, A);
  assertEqual(match.loserId, B);
  assertEqual(match.lastEvent.kind, EVENT_MATCH_WON);
  assert(isDecided(match));
});

test("one round wins a best of one", () => {
  const match = winRounds(newMatch({ bestOf: 1 }), B, 1);
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.winnerId, B);
});

test("three rounds wins a best of five, and two does not", () => {
  let match = winRounds(newMatch({ bestOf: 5 }), A, 2);
  assertEqual(match.status, MATCH_LIVE, "two of five is not a majority");
  match = winRounds(match, A, 1);
  assertEqual(match.winnerId, A);
});

test("a match can be won on red lights alone", () => {
  let match = newMatch();
  for (let round = 0; round < 2; round += 1) {
    match = recordFalseStarts(match, jump(A));
    match = recordFalseStarts(match, jump(A));
  }
  assertEqual(match.winnerId, B);
  assertEqual(match.lastEvent.reason, REASON_RED_LIGHT);
});

test("the history records every decided round with how many attempts it took", () => {
  let match = recordFalseStarts(newMatch(), jump(A)); // round 1 re-runs once
  match = recordFinish(match, finishedBy(A));
  match = recordFinish(match, finishedBy(B));

  assertEqual(match.history.length, 2);
  assertEqual(match.history[0].number, 1);
  assertEqual(match.history[0].attempts, 2, "round one took two attempts");
  assertEqual(match.history[0].winnerId, A);
  assertEqual(match.history[1].attempts, 1);
  assertEqual(match.history[1].winnerId, B);
});

test("a decided match ignores everything that follows", () => {
  const decided = winRounds(newMatch(), A, 2);
  assertEqual(recordFalseStarts(decided, jump(A)).winnerId, A, "the result must not be overwritten");
  assertEqual(recordFinish(decided, finishedBy(B)).winnerId, A);
  assertEqual(recordDisconnect(decided, A).winnerId, A);
  assertEqual(winsFor(recordFinish(decided, finishedBy(B)), B), 0);
});

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------

test("a disconnect hands the whole match over, not just the round", () => {
  let match = winRounds(newMatch({ bestOf: 5 }), A, 1);
  match = recordDisconnect(match, A);
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.winnerId, B, "there is nobody left to race the rest");
  assertEqual(match.lastEvent.reason, REASON_DISCONNECT);
});

// ---------------------------------------------------------------------------
// Guards and purity
// ---------------------------------------------------------------------------

test("a stranger in any reducer is rejected", () => {
  assertThrows(() => recordFalseStarts(newMatch(), jump("stranger")));
  assertThrows(() => recordFinish(newMatch(), [{ playerId: "stranger", finishTime: 1, complete: true }]));
  assertThrows(() => recordDisconnect(newMatch(), "stranger"));
});

test("no reducer mutates the match it is given", () => {
  const match = newMatch();
  const after = recordFalseStarts(match, jump(A));
  assertEqual(faultsFor(match, A), 0, "the input match must be untouched");
  assertEqual(match.round.attempt, 1);
  assert(after !== match);

  const won = recordFinish(match, finishedBy(A));
  assertEqual(winsFor(match, A), 0, "still untouched");
  assertEqual(won.history.length, 1);
  assertEqual(match.history.length, 0);
});

test("the grace allowance is configurable, so ranked could run without one", () => {
  const strict = recordFalseStarts(newMatch({ graceFaults: 0 }), jump(A));
  assertEqual(strict.lastEvent.kind, EVENT_ROUND_WON, "with no grace the first red light costs the round");
  assertEqual(winsFor(strict, B), 1);
});

// ---------------------------------------------------------------------------
// The scoreboard
// ---------------------------------------------------------------------------

test("matchScore shapes the board for a screen without re-deriving it", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  match = recordFinish(match, finishedBy(A));

  const score = matchScore(match);
  assertEqual(score.bestOf, 3);
  assertEqual(score.roundsToWin, 2);
  assertEqual(score.roundNumber, 2);
  assertEqual(score.attempt, 1);
  assertEqual(score.decided, false);
  assertEqual(score.players.length, 2);
  assertEqual(score.players[0].playerId, A);
  assertEqual(score.players[0].wins, 1);
  assertEqual(score.players[0].faults, 0, "new round, clean sheet");
  assertEqual(score.players[0].onTheEdge, false);
});

test("matchScore flags a driver one red light from losing the round", () => {
  const match = recordFalseStarts(newMatch(), jump(A));
  const score = matchScore(match);
  assertEqual(score.players[0].onTheEdge, true, "A has spent its grace");
  assertEqual(score.players[1].onTheEdge, false);
});

test("the module has no imports, so the server port is a copy", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../scripts/sim/match.js", import.meta.url), "utf8");
  assert(
    !/^\s*import\s/m.test(source),
    "match.js must stay import-free — it is mirrored into factory-network-server verbatim",
  );
});

finish();
