import { suite, test, assert, assertEqual, assertThrows, finish } from "./harness.js";

import {
  MATCH_LIVE,
  MATCH_RESTART,
  MATCH_DECIDED,
  createMatch,
  recordFalseStarts,
  faultsFor,
  isDecided,
} from "../scripts/sim/match.js";

suite("match — head-to-head false-start rule");

const A = "player-a";
const B = "player-b";

const newMatch = (overrides = {}) => createMatch({ playerIds: [A, B], ...overrides });

/** One offender, jumping `before` seconds ahead of the green. */
const jump = (playerId, before = 0.2) => [{ playerId, jumpedBeforeGreen: before }];

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

test("a new match is live with a clean sheet for both players", () => {
  const match = newMatch();
  assertEqual(match.status, MATCH_LIVE);
  assertEqual(faultsFor(match, A), 0);
  assertEqual(faultsFor(match, B), 0);
  assertEqual(match.loserId, null);
  assertEqual(match.winnerId, null);
  assertEqual(match.restarts, 0);
});

test("a match needs exactly two players", () => {
  assertThrows(() => createMatch({ playerIds: [A] }));
  assertThrows(() => createMatch({ playerIds: [A, B, "c"] }));
});

test("a match rejects duplicate player ids", () => {
  assertThrows(() => createMatch({ playerIds: [A, A] }));
});

// ---------------------------------------------------------------------------
// Clean starts
// ---------------------------------------------------------------------------

test("a clean start leaves the match untouched", () => {
  const match = recordFalseStarts(newMatch(), []);
  assertEqual(match.status, MATCH_LIVE);
  assertEqual(match.restarts, 0);
  assertEqual(faultsFor(match, A), 0);
});

// ---------------------------------------------------------------------------
// The grace fault
// ---------------------------------------------------------------------------

test("a first red light restarts the match instead of deciding it", () => {
  const match = recordFalseStarts(newMatch(), jump(A));
  assertEqual(match.status, MATCH_RESTART);
  assertEqual(faultsFor(match, A), 1);
  assertEqual(match.loserId, null, "the grace fault costs nothing but the restart");
  assertEqual(match.restarts, 1);
});

test("a second red light from the same player loses the match", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  match = recordFalseStarts(match, jump(A));
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.loserId, A);
  assertEqual(match.winnerId, B);
  assertEqual(faultsFor(match, A), 2);
});

test("the grace fault is per player, not per match", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  match = recordFalseStarts(match, jump(B));
  assertEqual(match.status, MATCH_RESTART, "each player gets their own grace");
  assertEqual(match.loserId, null);
  assertEqual(match.restarts, 2);
  assertEqual(faultsFor(match, A), 1);
  assertEqual(faultsFor(match, B), 1);
});

test("after both have used their grace, the next offender loses", () => {
  let match = recordFalseStarts(newMatch(), jump(A));
  match = recordFalseStarts(match, jump(B));
  match = recordFalseStarts(match, jump(B));
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.loserId, B);
  assertEqual(match.winnerId, A);
});

// ---------------------------------------------------------------------------
// Both cars jumping on the same start
// ---------------------------------------------------------------------------

test("a double red light on the first start burns both graces and restarts", () => {
  const match = recordFalseStarts(newMatch(), [
    { playerId: A, jumpedBeforeGreen: 0.3 },
    { playerId: B, jumpedBeforeGreen: 0.1 },
  ]);
  assertEqual(match.status, MATCH_RESTART);
  assertEqual(faultsFor(match, A), 1);
  assertEqual(faultsFor(match, B), 1);
});

test("in a double red light only the player out of grace loses", () => {
  let match = recordFalseStarts(newMatch(), jump(A)); // A has used its grace
  match = recordFalseStarts(match, [
    { playerId: A, jumpedBeforeGreen: 0.1 },
    { playerId: B, jumpedBeforeGreen: 0.4 },
  ]);
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.loserId, A, "B jumped earlier but still had a grace fault in hand");
  assertEqual(match.winnerId, B);
});

test("when both run out of grace together, the earlier jumper loses", () => {
  let match = recordFalseStarts(newMatch(), [
    { playerId: A, jumpedBeforeGreen: 0.2 },
    { playerId: B, jumpedBeforeGreen: 0.2 },
  ]);
  match = recordFalseStarts(match, [
    { playerId: A, jumpedBeforeGreen: 0.5 }, // A left first
    { playerId: B, jumpedBeforeGreen: 0.1 },
  ]);
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.loserId, A, "first to leave takes the red light");
  assertEqual(match.winnerId, B);
});

test("two players fouling out at the identical instant is a draw", () => {
  let match = recordFalseStarts(newMatch(), [
    { playerId: A, jumpedBeforeGreen: 0.2 },
    { playerId: B, jumpedBeforeGreen: 0.2 },
  ]);
  match = recordFalseStarts(match, [
    { playerId: A, jumpedBeforeGreen: 0.25 },
    { playerId: B, jumpedBeforeGreen: 0.25 },
  ]);
  assertEqual(match.status, MATCH_DECIDED);
  assertEqual(match.draw, true);
  assertEqual(match.loserId, null);
  assertEqual(match.winnerId, null);
});

// ---------------------------------------------------------------------------
// Configurability and guards
// ---------------------------------------------------------------------------

test("the grace allowance is configurable", () => {
  const strict = recordFalseStarts(newMatch({ graceFaults: 0 }), jump(A));
  assertEqual(strict.status, MATCH_DECIDED, "with no grace the first red light decides it");
  assertEqual(strict.loserId, A);
});

test("a decided match ignores further starts", () => {
  let match = recordFalseStarts(newMatch({ graceFaults: 0 }), jump(A));
  const settled = recordFalseStarts(match, jump(B));
  assertEqual(settled.loserId, A, "the result must not be overwritten");
  assertEqual(settled.winnerId, B);
  assertEqual(faultsFor(settled, B), 0);
});

test("isDecided reports the terminal state", () => {
  assert(!isDecided(newMatch()));
  assert(!isDecided(recordFalseStarts(newMatch(), jump(A))));
  assert(isDecided(recordFalseStarts(newMatch({ graceFaults: 0 }), jump(A))));
});

test("an offender who is not in the match is rejected", () => {
  assertThrows(() => recordFalseStarts(newMatch(), jump("stranger")));
});

test("recordFalseStarts never mutates the match it is given", () => {
  const match = newMatch();
  const next = recordFalseStarts(match, jump(A));
  assertEqual(faultsFor(match, A), 0, "input match must be untouched");
  assertEqual(match.status, MATCH_LIVE);
  assert(next !== match);
});

finish();
