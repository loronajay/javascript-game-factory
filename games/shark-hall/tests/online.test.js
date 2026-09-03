// The online layer, driven without a socket and without a document.
//
// Everything below runs against a fake WebSocket and a stub client, which is
// possible for the same reason the whole cabinet is testable: the network layer
// holds no DOM and the online match holds no renderer. What is being checked is
// the one claim the mode rests on — that a client never decides anything.

import {
  assert,
  assertClose,
  assertDeepEqual,
  assertEqual,
  finish,
  suite,
  test,
} from "./harness.js";

import { DEFAULT_RACE_TO, matchConfigSettings, normalizeMatchConfig } from "../scripts/multiplayer/match-config.js";
import {
  LOBBY_LIMITS,
  createOnlineClient,
  normalizeRoomCode,
  resolveWebSocketUrl,
  sanitizeShotIntent,
} from "../scripts/multiplayer/online-client.js";
import { MODE_ONLINE, createOnlineMatch } from "../scripts/multiplayer/online-match.js";
import { PHASE_AIMING, PHASE_OVER, PHASE_PLACING, PHASE_SHOOTING } from "../scripts/match/match.js";
import { rackBalls } from "../scripts/sim/balls.js";

suite("online — matchmaking, the wire, and the authority line");

// ---------------------------------------------------------------------------
// A socket that is not a socket
// ---------------------------------------------------------------------------

class FakeSocket {
  static OPEN = 1;

  constructor() {
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  fire(type, event) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = 3;
  }

  /** Everything the client sent, of one type. */
  ofType(type) {
    return this.sent.filter((payload) => payload.type === type);
  }

  /** Every lobby message of one messageType, with its value parsed. */
  messages(messageType) {
    return this.sent
      .filter((payload) => payload.type === "lobby_message" && payload.messageType === messageType)
      .map((payload) => JSON.parse(payload.value));
  }

  receive(event) {
    this.fire("message", { data: JSON.stringify(event) });
  }
}

function makeClient(overrides = {}) {
  let socket = null;
  const WebSocketCtor = function () {
    socket = new FakeSocket();
    return socket;
  };
  WebSocketCtor.OPEN = FakeSocket.OPEN;

  const client = createOnlineClient({
    WebSocketCtor,
    wsUrl: "ws://test",
    storage: null,
    resolveIdentity: () => ({ playerId: "factory-a", displayName: "Ana" }),
    ...overrides,
  });
  return { client, socket: () => socket };
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test("the race length is one of the three offered, and rides as a lobby setting", () => {
  assertEqual(normalizeMatchConfig({ raceTo: 5 }).raceTo, 5);
  assertEqual(normalizeMatchConfig({ raceTo: 4 }).raceTo, DEFAULT_RACE_TO);
  assertEqual(normalizeMatchConfig({}).raceTo, DEFAULT_RACE_TO);
  assertEqual(matchConfigSettings({ raceTo: 1 }).protocolVersion, 1);
});

test("a room code is upper-case and alphanumeric however it is typed", () => {
  assertEqual(normalizeRoomCode(" ab-3d! "), "AB3D");
  assertEqual(normalizeRoomCode(null), "");
});

test("the local server is used from localhost and Railway from anywhere else", () => {
  assertEqual(resolveWebSocketUrl({ hostname: "localhost", protocol: "http:" }), "ws://localhost:3000");
  assert(resolveWebSocketUrl({ hostname: "factory.jayarcade.com", protocol: "https:" }).startsWith("wss://"));
});

test("a stroke is four numbers, clamped, and the placement rides with it", () => {
  const intent = sanitizeShotIntent({ seq: 3.7, angle: 0.4, power: 9, spinX: -4, spinY: 0.2, place: { x: -0.5, z: 99 } });
  assertEqual(intent.seq, 3);
  assertEqual(intent.power, 1);
  assertEqual(intent.spinX, -1);
  assertEqual(intent.place.z, 10);
  assertEqual(sanitizeShotIntent({}).place, undefined, "no placement is sent when none was made");
});

// ---------------------------------------------------------------------------
// Matchmaking
// ---------------------------------------------------------------------------

test("every search sends the game's own seat limits", () => {
  // The repo-wide trap: a find_lobby without limits is sanitized to the
  // server-wide default of 2-6, and a two-seat game silently matches nobody.
  const { client, socket } = makeClient();
  client.findQuickMatch({ raceTo: 3 });
  const [search] = socket().ofType("find_lobby");
  assertEqual(search.gameId, "shark-hall");
  assertEqual(search.minPlayers, LOBBY_LIMITS.minPlayers);
  assertEqual(search.maxPlayers, LOBBY_LIMITS.maxPlayers);
  assertEqual(search.settings.raceTo, 3);
  assertEqual(search.identity.displayName, "Ana");
});

test("a private room is private and a join carries the code and the game", () => {
  const { client, socket } = makeClient();
  client.createPrivateRoom({ raceTo: 5 });
  assertEqual(socket().ofType("create_lobby")[0].private, true);
  client.joinPrivateRoom("ab3d");
  const [join] = socket().ofType("join_lobby");
  assertEqual(join.roomCode, "AB3D");
  assertEqual(join.gameId, "shark-hall");
});

test("the protocol is announced on every lobby event, not only the first", () => {
  const { client, socket } = makeClient();
  client.findQuickMatch({});
  socket().receive({ event: "lobby_joined", roomCode: "AB3D", ownerId: "c1", members: ["c1"], players: [], settings: {} });
  socket().receive({ event: "lobby_updated", roomCode: "AB3D", ownerId: "c1", members: ["c1", "c2"], players: [], settings: {} });
  assertEqual(socket().messages("shark_profile").length, 2, "a reconnect gets a fresh lobby view and must re-announce");
  assertEqual(socket().messages("shark_profile")[0].protocolVersion, 1);
});

test("the client snapshot names the lobby it is in", () => {
  const { client, socket } = makeClient();
  client.findQuickMatch({});
  socket().receive({ event: "connected", clientId: "c1", sessionToken: "t" });
  socket().receive({
    event: "lobby_joined",
    roomCode: "AB3D",
    ownerId: "c1",
    members: ["c1", "c2"],
    players: [{ id: "c1", name: "Ana" }, { id: "c2", name: "Bo" }],
    playerCount: 2,
    settings: { raceTo: 5 },
  });
  const snapshot = client.getSnapshot();
  assertEqual(snapshot.clientId, "c1");
  assertEqual(snapshot.lobby.roomCode, "AB3D");
  assertEqual(snapshot.lobby.settings.raceTo, 5);
  assertEqual(snapshot.lobby.players[1].name, "Bo");
});

// ---------------------------------------------------------------------------
// The online match
// ---------------------------------------------------------------------------

/** A stub client, so the match can be driven without any socket at all. */
function stubClient(clientId = "c1") {
  const shots = new Set();
  const snapshots = new Set();
  const sent = [];
  let snapshot = { status: "started", clientId, lobby: null, matchState: null, error: null };
  return {
    sent,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      snapshots.add(listener);
      return () => snapshots.delete(listener);
    },
    onShot(listener) {
      shots.add(listener);
      return () => shots.delete(listener);
    },
    submitShot(intent) {
      sent.push(["shot", intent]);
    },
    requestRematch() {
      sent.push(["rematch"]);
    },
    leave() {
      sent.push(["leave"]);
    },
    /** Test-side: hand the match a state, the way the socket would. */
    pushState(matchState) {
      snapshot = { ...snapshot, matchState };
      for (const listener of snapshots) listener(snapshot);
    },
    pushShot(played) {
      for (const listener of shots) listener(played);
    },
  };
}

function matchState(overrides = {}) {
  return {
    protocolVersion: 1,
    phase: "aiming",
    raceTo: 3,
    rackNumber: 1,
    breaker: 0,
    shooter: 0,
    shooterId: "c1",
    groups: [null, null],
    isBreak: true,
    ballInHand: "none",
    balls: rackBalls(),
    shotSeq: 0,
    kicker: "Rack ready",
    message: "Rack ready · break it.",
    rackWinner: null,
    matchWinner: null,
    matchWinnerName: null,
    seats: [
      { clientId: "c1", playerId: "factory-a", name: "Ana", wins: 0, connected: true, rematch: false, group: null, remaining: 0 },
      { clientId: "c2", playerId: "factory-b", name: "Bo", wins: 0, connected: true, rematch: false, group: null, remaining: 0 },
    ],
    ...overrides,
  };
}

/** Run the match's frame loop until the table settles, or give up. */
function runToRest(match) {
  for (let frame = 0; frame < 4000 && match.world.moving; frame++) match.tick(1 / 60);
  return match.snapshot();
}

test("the match wears the local one's shape", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState());
  match.start();

  const snapshot = match.snapshot();
  assertEqual(snapshot.mode, MODE_ONLINE);
  assertEqual(snapshot.phase, PHASE_AIMING);
  assertEqual(snapshot.started, true);
  assertEqual(snapshot.paused, false, "there is no pausing a table somebody else is at");
  assertEqual(snapshot.seats[0].name, "Ana");
  assertEqual(snapshot.seats[1].name, "Bo");
  assertEqual(snapshot.seats[0].you, true);
  assertEqual(snapshot.raceTo, 3);
  assertEqual(match.world.balls.length, 16);
});

test("only the seat whose turn it is may act", () => {
  const client = stubClient("c2");
  const match = createOnlineMatch({ client });
  client.pushState(matchState({ shooter: 0 }));
  match.start();
  assertEqual(match.humanCanAct(), false, "it is the other seat's shot");

  client.pushState(matchState({ shooter: 1, shooterId: "c2" }));
  assertEqual(match.humanCanAct(), true);
});

test("shooting sends a stroke and nothing moves until the server answers", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState());
  match.start();

  match.setAngle(0.25);
  match.setContact(0.2, 0.4);
  match.shoot(0.8);

  const [kind, intent] = client.sent[0];
  assertEqual(kind, "shot");
  assertEqual(intent.seq, 0, "the stroke names the table it was aimed at");
  assertClose(intent.angle, 0.25, 1e-9);
  assertClose(intent.power, 0.8, 1e-9);
  assertEqual(match.world.moving, false, "a client does not move a ball on its own");
  assertEqual(match.humanCanAct(), false, "and cannot shoot twice while it waits");
});

test("a played shot is replayed from the server's own table, and the answer is the server's", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState());
  match.start();

  const settled = [];
  match.on("settled", (outcome) => settled.push(outcome));

  const before = rackBalls();
  const after = matchState({
    shooter: 1,
    shotSeq: 1,
    isBreak: false,
    message: "No legal ball made",
    seats: matchState().seats,
  });
  client.pushShot({
    seq: 0,
    seat: 0,
    stroke: { angle: 0, power: 1, spinX: 0, spinY: 0 },
    ballsBefore: before,
    outcome: { turnChanged: true, kicker: "Turn over", reason: "No legal ball made", foul: false },
    match: after,
  });

  assertEqual(match.world.moving, true, "the replay animates the stroke");
  assertEqual(match.snapshot().phase, PHASE_SHOOTING);

  const rested = runToRest(match);
  assertEqual(settled.length, 1, "the outcome is the one that arrived, not one computed here");
  assertEqual(settled[0].reason, "No legal ball made");
  assertEqual(rested.shooter, 1, "the server decided whose turn it is");
  assertDeepEqual(match.world.balls.map((ball) => ball.n), after.balls.map((ball) => ball.n));
});

test("a state arriving mid-roll is held until the balls stop", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState());
  match.start();

  client.pushShot({
    seq: 0,
    seat: 0,
    stroke: { angle: 0, power: 1, spinX: 0, spinY: 0 },
    ballsBefore: rackBalls(),
    outcome: { turnChanged: false, kicker: "Still shooting", reason: "Shooter continues" },
    match: matchState({ shotSeq: 1, isBreak: false }),
  });
  assert(match.world.moving, "precondition: the table is rolling");

  // A late lobby update must not teleport a rolling table.
  const positions = match.world.balls.map((ball) => `${ball.x},${ball.z}`).join("|");
  client.pushState(matchState({ shotSeq: 1, message: "something else" }));
  assertEqual(match.world.balls.map((ball) => `${ball.x},${ball.z}`).join("|"), positions);
});

test("ball in hand is offered to the holder only, and the placement rides with the stroke", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState({ ballInHand: "anywhere", shooter: 0, isBreak: false }));
  match.start();

  assertEqual(match.snapshot().phase, PHASE_PLACING);
  assertEqual(match.tryPlaceCue(-0.4, 0.1), true);
  assertEqual(match.confirmPlacement(), true);
  match.shoot(0.5);
  const [, intent] = client.sent[0];
  assertClose(intent.place.x, -0.4, 1e-9);
  assertClose(intent.place.z, 0.1, 1e-9);

  // The opponent sees a table, not a banner about a ball they cannot touch.
  const theirs = createOnlineMatch({ client: stubClient("c2") });
  theirs.start();
  assertEqual(theirs.snapshot().ballInHand, "none");
});

test("a decided match reports a winner and offers a rematch rather than a restart", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState());
  match.start();

  const wins = [];
  match.on("win", (event) => wins.push(event));
  client.pushState(matchState({
    phase: "complete",
    matchWinner: 1,
    matchWinnerName: "Bo",
    message: "Bo wins the match 3-1.",
  }));

  assertEqual(wins.length, 1);
  assertEqual(wins[0].name, "Bo");
  assertEqual(match.snapshot().phase, PHASE_OVER);
  assertEqual(match.snapshot().winnerName, "Bo");

  match.rack();
  assertDeepEqual(client.sent.at(-1), ["rematch"], "restarting a rack is not a thing online");
});

test("a dropped opponent is reported on their own plaque", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  const dropped = matchState({ phase: "paused", message: "Bo dropped · holding the table." });
  dropped.seats[1].connected = false;
  client.pushState(dropped);
  match.start();

  assertEqual(match.snapshot().seats[1].connected, false);
  assertEqual(match.humanCanAct(), false, "nobody shoots at a paused table");
});

test("quitting leaves the lobby and stops listening", () => {
  const client = stubClient();
  const match = createOnlineMatch({ client });
  client.pushState(matchState());
  match.start();
  match.quit();

  assertDeepEqual(client.sent.at(-1), ["leave"]);
  assertEqual(match.started, false);
  // A stale listener on a dead match is how a cabinet ends up playing two games
  // at once. The subscription is dropped, not merely ignored.
  client.pushShot({
    seq: 0,
    seat: 0,
    stroke: { angle: 0, power: 1, spinX: 0, spinY: 0 },
    ballsBefore: rackBalls(),
    outcome: { turnChanged: false, kicker: "", reason: "" },
    match: matchState(),
  });
  assertEqual(match.world.moving, false);
});

finish();
