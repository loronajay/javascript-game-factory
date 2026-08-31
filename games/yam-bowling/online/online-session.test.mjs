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

test("a reaction-only snapshot refreshes the scoreboard but never touches the live scene", () => {
  const preparedWith = [];
  let scoreboardRefreshed = 0;
  const session = {
    scene: { phase: "approach", liveShot: { aim: 0.3 } },
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
    scoreboard: { updateMatchUI() { scoreboardRefreshed += 1; } },
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

  // An opponent's emote must not reset the active bowler's aim/spin/approach.
  assert.deepEqual(preparedWith, []);
  assert.equal(session.scene.phase, "approach");
  assert.equal(session.scene.liveShot.aim, 0.3);
  assert.equal(scoreboardRefreshed, 1);
});

test("an authoritative shot replay does not announce the shooter again at release", () => {
  const preparedWith = [];
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: () => ({ hidden: false }) };
  try {
    const session = {
      scene: { liveShot: {} },
      onlineMatch: true,
      onlineSnapshot: { sessionId: "session-1" },
      lastAppliedOnlineRoll: 4,
      pendingAuthoritativeRoll: null,
      match: { status: "playing", activePlayer: 0, players: [{ id: "player-1" }] },
    };
    const onlineSession = createOnlineSession({
      session,
      onlineScreen: { renderLobby() {} },
      matchRuntime: {
        clonePins: (pins) => pins,
        applyBallProfile() {},
        prepareActivePlayer: (options) => preparedWith.push(options),
        beginThrow() {},
      },
      shotHud: { syncControlsFromShot() {} },
    });

    onlineSession.handleSnapshot({
      status: "match",
      matchState: {
        sessionId: "session-1",
        rollNumber: 5,
        nextPins: [],
        match: { status: "playing", activePlayer: 0, players: [{ id: "player-1" }] },
        lastRoll: {
          rollNumber: 5,
          shooterClientId: "player-1",
          pinsBefore: [],
          shot: { ballIndex: 0, power: .7, release: .4 },
        },
      },
    });

    assert.deepEqual(preparedWith, [{ announce: false }]);
  } finally {
    globalThis.document = previousDocument;
  }
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

function replayHarness(prepareBowlingMode) {
  const nodes = new Map();
  globalThis.document = { getElementById: id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, classList: { add() {}, remove() {} } });
    return nodes.get(id);
  }, querySelectorAll: () => [] };
  globalThis.window = { scrollTo() {} };
  const session = { scene: { phase: "ready", liveShot: {} }, matchFacts: { rolls: [] }, onlineSetup: {},
    onlineMatch: true, onlineSnapshot: { sessionId: "session-1" }, lastAppliedOnlineRoll: 0,
    match: { status: "playing", activePlayer: 0, players: [{ id: "player-1" }] },
    resetScene(pins) { Object.assign(this.scene, { pins, phase: "ready", simulation: null }); },
  };
  const played = [], requests = [];
  const online = createOnlineSession({ session, prepareBowlingMode,
    onlineClient: { leaveLobby() {}, connect() {}, getSnapshot: () => ({}), findQuickMatch: options => requests.push(options) },
    accountAccess: { requireFactoryAccount: () => true },
    onlineScreen: { renderLobby() {}, renderSetup() {} }, laneCore: { laneFromRoll: () => ({ slug: "lane" }) }, applyMatchLane() {},
    matchRuntime: { clonePins: pins => structuredClone(pins || []), prepareActivePlayer() {}, applyBallProfile() {}, syncPauseChrome() {},
      beginThrow() { played.push(session.pendingAuthoritativeRoll.roll.rollNumber); session.scene.phase = "deck"; } },
    scoreboard: { updateMatchUI() {} }, audio: { resumeMusic() {} },
    shotHud: { syncControlsFromShot() {}, resetChargeFeedback() {}, resetSpinFeedback() {} }, resultsScreen: { showResults() { session.scene.phase = "finished"; } },
  });
  const snapshot = (number, extras = {}) => ({ status: "started", matchState: {
    sessionId: "session-1", rollNumber: number, phase: "playing", nextPins: [{ id: 7, standing: true }],
    match: { status: "playing", activePlayer: 0, players: [{ id: "player-1" }] },
    ...(number ? { lastRoll: { rollNumber: number, shooterClientId: "player-1", pinsBefore: [{ id: 1, standing: true }], shot: { power: .7 } } } : {}), ...extras,
  } });
  return { session, online, snapshot, played, nodes, requests };
}

test("3D snapshots wait for the engine; leaving while it loads cancels entry", async () => {
  let finish;
  const h = replayHarness(() => new Promise(resolve => { finish = resolve; }));
  h.session.onlineMatch = false;
  const snapshot = h.snapshot(0, { match: { ...h.session.match, bowlingStyle: "3d" } });
  const loading = h.online.handleSnapshot(snapshot);
  assert.equal(h.session.onlineMatch, false);
  h.online.leave();
  finish();
  await loading;
  assert.equal(h.session.onlineMatch, false);
});

test("3D matchmaking preloads before sending a request and carries its style", async () => {
  let finish;
  const h = replayHarness(() => new Promise(resolve => { finish = resolve; }));
  h.session.onlineSetup.bowlingStyle = "3d";
  const loading = h.online.begin("quick");
  assert.equal(h.requests.length, 0);
  finish(); await loading;
  assert.equal(h.requests[0].bowlingStyle, "3d");
});

test("newer shots wait for the current replay and transition rather than replacing them", () => {
  const h = replayHarness();
  h.online.handleSnapshot(h.snapshot(1));
  const first = h.session.pendingAuthoritativeRoll;
  h.online.handleSnapshot(h.snapshot(2));
  assert.equal(h.session.pendingAuthoritativeRoll, first);
  assert.deepEqual(h.played, [1]);
  h.session.lastAppliedOnlineRoll = 1;
  h.session.pendingAuthoritativeRoll = null;
  h.session.scene.phase = "transition";
  h.online.tick();
  assert.deepEqual(h.played, [1]);
  h.session.scene.phase = "ready";
  h.online.tick();
  assert.deepEqual(h.played, [1, 2]);
});

test("duplicate presence snapshots do not overwrite a spare result or an in-progress shot", () => {
  const h = replayHarness();
  h.session.lastAppliedOnlineRoll = 1;
  h.session.scene.phase = "transition";
  h.session.scene.pins = [{ id: 1, standing: false }];
  h.online.handleSnapshot(h.snapshot(1));
  assert.equal(h.session.scene.phase, "transition");
  assert.deepEqual(h.session.scene.pins, [{ id: 1, standing: false }]);
  h.session.scene.phase = "charging";
  h.session.scene.liveShot = { power: .61, aim: .3 };
  h.online.handleSnapshot(h.snapshot(1));
  assert.equal(h.session.scene.phase, "charging");
  assert.deepEqual(h.session.scene.liveShot, { power: .61, aim: .3 });
  h.session.scene.phase = "transition";
  h.online.handleSnapshot(h.snapshot(1, { phase: "complete", match: { ...h.session.match, status: "complete" } }));
  assert.equal(h.session.scene.phase, "transition", "the last roll also gets its result hold");
});

test("a rejected shot releases the submitting controls for retry", () => {
  const h = replayHarness();
  h.session.scene.phase = "submitting";
  h.online.handleSnapshot({ ...h.snapshot(0), error: { code: "SHOT_FAILED", message: "Retry" } });
  assert.equal(h.session.scene.phase, "ready");
});

test("a resumed paused match cannot expose a ready rack", () => {
  const h = replayHarness();
  h.session.onlineMatch = false;
  h.online.handleSnapshot(h.snapshot(0, { phase: "paused" }));
  assert.equal(h.session.scene.phase, "network-paused");
});
