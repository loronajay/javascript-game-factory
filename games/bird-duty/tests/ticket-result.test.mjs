// The result Bird Duty files for ticket settlement.
import assert from "node:assert/strict";
import { buildOnlineTicketResult, buildSoloTicketResult } from "../scripts/ticket-result.js";
import { createPlaySession } from "../scripts/sim/play-session.js";

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

const ID = "bd-lx2k9c-1a2b3c4d";

test("a finished solo run reports its final score and nothing else", () => {
  const session = { ...createPlaySession(), phase: "game-over", score: 14, finalScore: 14, shotsRemaining: 0 };
  assert.deepEqual(buildSoloTicketResult({ playSession: session, resultId: ID, durationMs: 48_250.6 }), {
    resultId: ID, mode: "solo", score: 14, durationMs: 48_250,
  });
});

test("a solo run still in progress is never reported", () => {
  assert.equal(buildSoloTicketResult({ playSession: createPlaySession(), resultId: ID, durationMs: 10_000 }), null);
});

test("an online match reports this seat's reading of the final table", () => {
  const match = { scores: { me: 18, a: 12, b: 21 } };
  assert.deepEqual(buildOnlineTicketResult({ match, clientId: "me", resultId: ID, durationMs: 200_000 }), {
    resultId: ID, mode: "online", playerCount: 3, outcome: "loss", myScore: 18, bestOpponentScore: 21, durationMs: 200_000,
  });
  assert.equal(buildOnlineTicketResult({ match: { scores: { me: 9, a: 9 } }, clientId: "me", resultId: ID, durationMs: 90_000 }).outcome, "tie");
  assert.equal(buildOnlineTicketResult({ match: { scores: { me: 10, a: 9 } }, clientId: "me", resultId: ID, durationMs: 90_000 }).outcome, "win");
});

test("nothing is reported without an id, a seat at the table, or an opponent", () => {
  const match = { scores: { me: 5, a: 3 } };
  assert.equal(buildOnlineTicketResult({ match, clientId: "me", resultId: null, durationMs: 1 }), null);
  assert.equal(buildOnlineTicketResult({ match, clientId: "stranger", resultId: ID, durationMs: 1 }), null);
  assert.equal(buildOnlineTicketResult({ match: { scores: { me: 5 } }, clientId: "me", resultId: ID, durationMs: 1 }), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
