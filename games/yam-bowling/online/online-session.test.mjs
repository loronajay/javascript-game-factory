import { test } from "node:test";
import assert from "node:assert/strict";

import { createOnlineSession, sanitizeOnlineSetupSkin } from "./online-session.mjs";

// The flush only touches the reporter and the API client, so the rest of the
// session's collaborators can stay unbuilt here.
function makeSession({ unsent = [], replies = [] } = {}) {
  const sent = [];
  const settled = [];
  const pending = [...unsent];
  const queued = [...replies];
  const onlineSession = createOnlineSession({
    session: { scene: {} },
    platformApi: {
      async updateGameRating(gameSlug, request) {
        sent.push({ gameSlug, request });
        const reply = queued.length ? queued.shift() : { ok: true };
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
    progressionReporter: {
      listUnsentRequests: () => pending.map((entry) => ({ ...entry })),
      settleSent: (grantId) => settled.push(grantId),
    },
  });
  return { onlineSession, sent, settled };
}

test("online presentation replaces a stale selection with the currently owned skin", () => {
  const setup = { characterSlug: "reina-sato", skinId: "maid" };
  const seen = [];

  const skinId = sanitizeOnlineSetupSkin(setup, (slug) => {
    seen.push(slug);
    return "canon";
  });

  assert.deepEqual(seen, ["reina-sato"]);
  assert.equal(skinId, "canon");
  assert.equal(setup.skinId, "canon");
});

test("a reaction-only snapshot refreshes the active bowler without announcing the turn again", () => {
  const preparedWith = [];
  const session = {
    scene: {},
    onlineMatch: true,
    onlineSnapshot: { sessionId: "session-1" },
    lastAppliedOnlineRoll: 4,
    pendingAuthoritativeRoll: null,
    match: { status: "playing", activePlayer: 0, players: [] },
  };
  const onlineSession = createOnlineSession({
    session,
    onlineScreen: { renderLobby() {} },
    matchRuntime: {
      clonePins: (pins) => pins,
      prepareActivePlayer: (options) => preparedWith.push(options),
    },
    scoreboard: { updateMatchUI() {} },
  });

  onlineSession.handleSnapshot({
    status: "match",
    matchState: {
      sessionId: "session-1",
      rollNumber: 4,
      phase: "ready",
      nextPins: [],
      match: { status: "playing", activePlayer: 0, players: [] },
    },
  });

  assert.deepEqual(preparedWith, [{ announce: false }]);
});

// ------------------------------------------ re-sending a report that never landed

test("a stored request is re-sent verbatim, under the session id its grant is keyed by", async () => {
  const request = { opponentPlayerId: "player-2", outcome: "win", sessionId: "session-1", progression: { trackId: "daisy-monroe" } };
  const { onlineSession, sent, settled } = makeSession({ unsent: [{ grantId: "session-1", request }] });

  assert.equal(await onlineSession.flushPendingReports(), 1);
  assert.deepEqual(sent, [{ gameSlug: "yam-bowling", request }]);
  assert.deepEqual(settled, ["session-1"], "an accepted replay settles the grant");
});

test("a replay the server never answered stays outstanding rather than being dropped", async () => {
  const { onlineSession, settled } = makeSession({
    unsent: [{ grantId: "session-1", request: { sessionId: "session-1" } }],
    replies: [new Error("offline")],
  });

  assert.equal(await onlineSession.flushPendingReports(), 0);
  assert.deepEqual(settled, [], "a network failure is not a ruling");
});

test("one failed replay does not strand the ones behind it", async () => {
  const { onlineSession, settled } = makeSession({
    unsent: [
      { grantId: "session-1", request: { sessionId: "session-1" } },
      { grantId: "session-2", request: { sessionId: "session-2" } },
    ],
    replies: [null],
  });

  assert.equal(await onlineSession.flushPendingReports(), 1);
  assert.deepEqual(settled, ["session-2"]);
});

test("an empty queue sends nothing", async () => {
  const { onlineSession, sent } = makeSession();
  assert.equal(await onlineSession.flushPendingReports(), 0);
  assert.deepEqual(sent, []);
});
