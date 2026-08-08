import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  STATUS_IDLE,
  STATUS_SEARCHING,
  STATUS_LOBBY,
  STATUS_COUNTDOWN,
  STATUS_RACING,
  STATUS_ROUND_RESULT,
  STATUS_MATCH_RESULT,
  STATUS_ERROR,
  applyForfeit,
  applyLobby,
  applyRematch,
  applyRoundResult,
  applyRoundStart,
  createSession,
  failed,
  leftSession,
  lobbyIsFull,
  opponent,
  racing,
  readyToLaunch,
  restartNote,
  roundHeadline,
  roundRows,
  searchCancelled,
  searching,
  secondsUntilGreen,
  showsTheStrip,
  you,
  youWon,
} from "../scripts/online/session.js";

suite("online session");

const lobbyMessage = (overrides = {}) => ({
  roomCode: "K7P2M",
  private: true,
  youAreHost: true,
  yourPlayerId: "p1",
  config: { trackId: "track-a", distanceId: "quarter", bestOf: 3 },
  score: { players: [{ playerId: "p1", wins: 0, faults: 0 }, { playerId: "p2", wins: 0, faults: 0 }] },
  players: [
    { playerId: "p1", displayName: "Ana", lane: 1, modelId: "kaido-gts", ready: false },
    { playerId: "p2", displayName: "Bo", lane: 2, modelId: "toro-sv", ready: false },
  ],
  ...overrides,
});

const inLobby = () => applyLobby(createSession(), lobbyMessage());

// ---------------------------------------------------------------------------
// Getting in
// ---------------------------------------------------------------------------

test("a new session is idle and knows nothing", () => {
  const session = createSession();
  assertEqual(session.status, STATUS_IDLE);
  assertEqual(session.roomCode, null);
  assertEqual(session.players.length, 0);
  assertEqual(showsTheStrip(session), false);
});

test("searching, then cancelling, returns to idle", () => {
  let session = searching(createSession());
  assertEqual(session.status, STATUS_SEARCHING);
  session = searchCancelled(session);
  assertEqual(session.status, STATUS_IDLE);
});

test("a lobby frame moves an arriving session into the room", () => {
  const session = inLobby();
  assertEqual(session.status, STATUS_LOBBY);
  assertEqual(session.roomCode, "K7P2M");
  assertEqual(session.isHost, true);
  assertEqual(session.isPrivate, true);
  assertEqual(session.youPlayerId, "p1");
  assert(lobbyIsFull(session));
});

test("you and your opponent are told apart by the id the server gave you", () => {
  const session = inLobby();
  assertEqual(you(session).displayName, "Ana");
  assertEqual(opponent(session).displayName, "Bo");
});

test("a lobby frame arriving mid-race does not yank the driver off the strip", () => {
  // The opponent repainting their car mid-round sends one of these. Following it
  // would drop a live tree back to the lobby screen.
  let session = applyRoundStart(inLobby(), { round: 1, attempt: 1, serverNow: 0, startAt: 0 }, 0);
  session = racing(session);
  session = applyLobby(session, lobbyMessage());
  assertEqual(session.status, STATUS_RACING, "the race is still the screen you are on");
});

test("a lobby frame arriving over a result panel does not clear the result", () => {
  // The server emits a lobby frame whenever anything about the room changes —
  // including the *opponent* staging for the next round, which happens while
  // this driver is still reading the last one. Following it would wipe the panel
  // out from under them.
  let session = applyRoundResult(racing(inLobby()), {
    round: 1, attempt: 1, decided: false,
    outcome: { kind: "round-won", winnerId: "p1", loserId: "p2" },
    runs: [{ playerId: "p1", finishTime: 12.0, complete: true },
           { playerId: "p2", finishTime: 12.4, complete: true }],
    score: { players: [{ playerId: "p1", wins: 1 }, { playerId: "p2", wins: 0 }] },
  });
  assertEqual(session.status, STATUS_ROUND_RESULT);

  session = applyLobby(session, lobbyMessage());
  assertEqual(session.status, STATUS_ROUND_RESULT, "the result stays up");
  assert(session.roundResult, "and the times stay on it");
});

test("a solo lobby is not full, so nothing can be started from it", () => {
  const session = applyLobby(createSession(), lobbyMessage({ players: [{ playerId: "p1", lane: 1 }] }));
  assertEqual(lobbyIsFull(session), false);
});

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

test("the green is measured through the server's clock, never the local one", () => {
  // A machine whose clock is a full minute ahead of the server's.
  const skew = 60_000;
  const serverNow = 1_000_000;
  const localNow = serverNow + skew;
  const session = applyRoundStart(
    inLobby(),
    { round: 1, attempt: 1, serverNow, startAt: serverNow + 1200 },
    localNow,
  );

  assertEqual(session.clockOffset, skew, "the offset is what the two clocks differ by");
  assertClose(
    secondsUntilGreen(session, localNow),
    1.2,
    1e-9,
    "and the tree is 1.2s away on both machines, however wrong the local clock is",
  );
});

test("readyToLaunch flips exactly when the shared start time arrives", () => {
  const session = applyRoundStart(inLobby(), { round: 1, attempt: 1, serverNow: 0, startAt: 1200 }, 0);
  assertEqual(readyToLaunch(session, 0), false);
  assertEqual(readyToLaunch(session, 1199), false);
  assertEqual(readyToLaunch(session, 1200), true, "on the instant");
  assertEqual(readyToLaunch(session, 5000), true, "and after it, for a late frame");
});

test("a session with no round pending is never ready to launch", () => {
  assertEqual(secondsUntilGreen(inLobby(), 0), Infinity);
  assertEqual(readyToLaunch(inLobby(), 999999), false);
});

test("the offset is re-measured every round, so a drifting clock is corrected", () => {
  let session = applyRoundStart(inLobby(), { round: 1, attempt: 1, serverNow: 0, startAt: 0 }, 1000);
  assertEqual(session.clockOffset, 1000);
  session = applyRoundStart(session, { round: 2, attempt: 1, serverNow: 0, startAt: 0 }, 1400);
  assertEqual(session.clockOffset, 1400, "a long match gives a clock time to drift");
});

test("a round start puts the driver on the strip and names the live round", () => {
  const session = applyRoundStart(
    inLobby(),
    { round: 2, attempt: 3, serverNow: 0, startAt: 500, config: { distanceId: "half" } },
    0,
  );
  assertEqual(session.status, STATUS_COUNTDOWN);
  assertEqual(session.round, 2);
  assertEqual(session.attempt, 3);
  assertEqual(session.liveRound.round, 2);
  assertEqual(session.liveRound.attempt, 3);
  assertEqual(session.config.distanceId, "half", "the server's config wins");
  assert(showsTheStrip(session));
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

const roundResultMessage = (overrides = {}) => ({
  round: 1,
  attempt: 1,
  outcome: { kind: "round-won", winnerId: "p1", loserId: "p2", reason: "time" },
  redLight: false,
  offenders: [],
  decided: false,
  runs: [
    { playerId: "p1", displayName: "Ana", finishTime: 12.04, complete: true, launchGrade: "holeshot" },
    { playerId: "p2", displayName: "Bo", finishTime: 12.38, complete: true, launchGrade: "good" },
  ],
  score: { players: [{ playerId: "p1", wins: 1, faults: 0 }, { playerId: "p2", wins: 0, faults: 0 }] },
  ...overrides,
});

test("a round result stops the round and shows the panel", () => {
  const session = applyRoundResult(racing(inLobby()), roundResultMessage());
  assertEqual(session.status, STATUS_ROUND_RESULT);
  assertEqual(session.liveRound, null, "nothing more should be streamed for it");
  assertEqual(session.roundResult.runs.length, 2);
  assertEqual(session.score.players[0].wins, 1);
});

test("a decided match goes to the match panel instead", () => {
  const session = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({ decided: true, winnerId: "p1", loserId: "p2" }),
  );
  assertEqual(session.status, STATUS_MATCH_RESULT);
  assertEqual(youWon(session), true);
});

test("youWon reads from the id the server gave this side, not from a lane", () => {
  const session = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({ decided: true, winnerId: "p2", loserId: "p1" }),
  );
  assertEqual(youWon(session), false);
});

test("roundRows puts this driver first so no renderer has to work it out", () => {
  const session = applyRoundResult(racing(inLobby()), roundResultMessage());
  const rows = roundRows(session);
  assertEqual(rows.length, 2);
  assertEqual(rows[0].you, true);
  assertEqual(rows[0].playerId, "p1");
  assertEqual(rows[0].label, "YOU");
  assertEqual(rows[1].you, false);
  assertEqual(rows[1].label, "Bo");
});

test("a headline names a red light rather than reporting it as a slow time", () => {
  const mine = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({
      redLight: true,
      offenders: [{ playerId: "p1", jumpedBeforeGreen: 0.4 }],
      outcome: { kind: "round-restart" },
    }),
  );
  assertEqual(roundHeadline(mine), "RED LIGHT — YOU JUMPED");

  const theirs = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({
      redLight: true,
      offenders: [{ playerId: "p2", jumpedBeforeGreen: 0.4 }],
      outcome: { kind: "round-restart" },
    }),
  );
  assertEqual(roundHeadline(theirs), "RED LIGHT — OPPONENT JUMPED");

  const both = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({
      redLight: true,
      offenders: [{ playerId: "p1" }, { playerId: "p2" }],
      outcome: { kind: "round-restart" },
    }),
  );
  assertEqual(roundHeadline(both), "BOTH RED-LIGHTED");
});

test("a headline says whether the round was won or lost", () => {
  assertEqual(roundHeadline(applyRoundResult(racing(inLobby()), roundResultMessage())), "ROUND WON");
  const lost = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({ outcome: { kind: "round-won", winnerId: "p2", loserId: "p1" } }),
  );
  assertEqual(roundHeadline(lost), "ROUND LOST");
});

test("a finished match says so, rather than leaving the biggest line blank", () => {
  const won = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({ decided: true, winnerId: "p1", loserId: "p2" }),
  );
  assertEqual(roundHeadline(won), "MATCH WON");

  const lost = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({
      decided: true,
      winnerId: "p2",
      loserId: "p1",
      outcome: { kind: "match-won", winnerId: "p2", loserId: "p1", reason: "time" },
    }),
  );
  assertEqual(roundHeadline(lost), "MATCH LOST");
});

test("a match that ends without naming a round winner still reads properly", () => {
  // The frame that ends a match does not always carry a round-level winnerId,
  // and the panel used to render an empty headline at the most important moment.
  const session = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({ decided: true, winnerId: "p1", loserId: "p2", outcome: null }),
  );
  assertEqual(roundHeadline(session), "MATCH WON");
});

test("an opponent walking out is named as such, not reported as a win on merit", () => {
  const session = applyForfeit(racing(inLobby()), { winnerId: "p1", loserId: "p2" });
  assertEqual(roundHeadline(session), "MATCH WON — OPPONENT LEFT");
});

test("a red-light re-run says it was a red light", () => {
  const session = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({
      redLight: true,
      offenders: [{ playerId: "p2" }],
      outcome: { kind: "round-restart" },
    }),
  );
  assertEqual(roundHeadline(session), "RED LIGHT — OPPONENT JUMPED");
});

test("a re-run explains itself, and only when there is one", () => {
  const foul = applyRoundResult(
    racing(inLobby()),
    roundResultMessage({ redLight: true, offenders: [{ playerId: "p1" }], outcome: { kind: "round-restart" } }),
  );
  assert(restartNote(foul).includes("forfeit"), "the driver should be told what a second one costs");

  const heat = applyRoundResult(racing(inLobby()), roundResultMessage({ outcome: { kind: "round-restart" } }));
  assert(restartNote(heat).includes("again"));

  assertEqual(restartNote(applyRoundResult(racing(inLobby()), roundResultMessage())), null);
});

// ---------------------------------------------------------------------------
// Leaving and rematching
// ---------------------------------------------------------------------------

test("an opponent walking out ends the match as a forfeit", () => {
  const session = applyForfeit(racing(inLobby()), { winnerId: "p1", loserId: "p2" });
  assertEqual(session.status, STATUS_MATCH_RESULT);
  assertEqual(session.matchResult.forfeit, true);
  assertEqual(youWon(session), true);
  assertEqual(session.liveRound, null, "and nothing more is streamed");
});

test("a rematch frame records who has asked, including whether you have", () => {
  let session = applyRoundResult(racing(inLobby()), roundResultMessage({ decided: true, winnerId: "p1" }));
  session = applyRematch(session, {
    requested: [{ playerId: "p1", requested: true }, { playerId: "p2", requested: false }],
  });
  assertEqual(session.rematch.asked, true, "this side has asked");

  session = applyRematch(session, {
    requested: [{ playerId: "p1", requested: false }, { playerId: "p2", requested: true }],
  });
  assertEqual(session.rematch.asked, false, "and this side has not");
});

test("a rematch starting clears the board rather than half-resetting it", () => {
  let session = applyRoundResult(racing(inLobby()), roundResultMessage({ decided: true, winnerId: "p1" }));
  session = applyRematch(session, { requested: [{ playerId: "p1", requested: true }] });
  // The server sends a lobby with a null score when the new match begins.
  session = applyLobby(session, lobbyMessage({ score: null }));

  assertEqual(session.status, STATUS_LOBBY);
  assertEqual(session.score, null);
  assertEqual(session.roundResult, null, "a finished round must not linger behind the new one");
  assertEqual(session.matchResult, null);
  assertEqual(session.rematch.asked, false);
});

test("leaving keeps nothing but the measured clock offset", () => {
  let session = applyRoundStart(inLobby(), { round: 1, attempt: 1, serverNow: 0, startAt: 0 }, 500);
  session = leftSession(session);
  assertEqual(session.status, STATUS_IDLE);
  assertEqual(session.roomCode, null);
  assertEqual(session.players.length, 0);
  assertEqual(session.clockOffset, 500, "the clocks have not changed just because the match ended");
});

test("an error is a state, not a thrown exception", () => {
  const session = failed(createSession(), "Connection lost");
  assertEqual(session.status, STATUS_ERROR);
  assertEqual(session.error, "Connection lost");
});

test("no reducer mutates the session it is given", () => {
  const session = inLobby();
  const next = applyRoundStart(session, { round: 1, attempt: 1, serverNow: 0, startAt: 0 }, 0);
  assertEqual(session.status, STATUS_LOBBY, "the input session must be untouched");
  assertEqual(session.startAtLocal, null);
  assert(next !== session);
});

finish();
