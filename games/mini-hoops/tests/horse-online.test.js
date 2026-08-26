import { assert, assertDeepEqual, assertEqual, test, finish, suite } from "./harness.js";

import { bootHorse } from "../scripts/horse-game.js";
import {
  HORSE_GAME_ID,
  createHorseOnlineClient,
  sanitizeHorseShotIntent,
} from "../scripts/multiplayer/horse-online-client.js";
import { restingBallPosition } from "../scripts/render/frame.js";
import { PHASE_MATCH, PHASE_SET } from "../scripts/sim/horse.js";

// Online HORSE is server-authoritative, and that only means something if the
// browser genuinely cannot rule on a shot. These are the two halves of that
// claim: what goes up the wire (a bin and a pull, never an outcome), and what
// this court does with what comes back (plays the opponent's ball out, and takes
// the letters as read rather than counting them itself).

suite("Factory Network HORSE — a bin and a pull go up, a ruling comes back");

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

class FakeSocket {
  static OPEN = 1;
  constructor() {
    this.readyState = FakeSocket.OPEN;
    this.sent = [];
    this.listeners = {};
  }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() {}
  emit(type, value) { this.listeners[type]?.(value); }
}

function wireHarness(identity = { playerId: "factory-42", displayName: "Jay" }) {
  let socket;
  const client = createHorseOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => identity,
    storage: null,
  });
  return { client, get socket() { return socket; } };
}

function receive(socket, value) {
  socket.emit("message", { data: JSON.stringify(value) });
}

test("quick search uses its own game id, so HORSE never pairs with score duels", () => {
  const harness = wireHarness();
  harness.client.findQuickMatch("pig");
  harness.socket.emit("open", {});
  assertDeepEqual(harness.socket.sent[0], {
    type: "find_lobby",
    gameId: HORSE_GAME_ID,
    minPlayers: 2,
    maxPlayers: 2,
    settings: { word: "PIG", protocolVersion: 1 },
    identity: { playerId: "factory-42", displayName: "Jay" },
  });
});

test("a shot carries a pull and a release moment — no outcome, and no aimY", () => {
  // `aimY` is the one field the classic cabinet's intent has and this one does
  // not: there the reticle rides a fixed line the server has to pin, and here
  // the vertical aim IS the placed bin's rest height, which the server already
  // holds and has already clamped.
  const intent = sanitizeHorseShotIntent({
    power: 0.62,
    aimX: 505,
    aimY: 9,
    loft: 0.4,
    motionSeconds: 2.5,
    expectedShots: 3.9,
    made: true,
    letters: 4,
  });
  assertDeepEqual(intent, { power: 0.62, aimX: 505, loft: 0.4, motionSeconds: 2.5, expectedShots: 3 });
  for (const forbidden of ["aimY", "made", "letters"]) {
    assert(!Object.hasOwn(intent, forbidden), `a shot must not carry ${forbidden}`);
  }
});

test("the server's word and match state are taken as read, never recomputed", () => {
  const harness = wireHarness();
  harness.client.connect();
  receive(harness.socket, { event: "connected", clientId: "socket-b", sessionToken: "token" });
  receive(harness.socket, {
    event: "lobby_joined",
    roomCode: "HORSE",
    ownerId: "socket-a",
    members: ["socket-a", "socket-b"],
    players: [{ id: "socket-a", name: "Ana" }, { id: "socket-b", name: "Jay" }],
    playerCount: 2,
    status: "open",
    settings: { word: "p i g", protocolVersion: 1 },
  });
  assertEqual(harness.client.getSnapshot().lobby.word, "PIG");

  receive(harness.socket, {
    event: "message",
    scope: "lobby",
    messageType: "horse_match",
    value: JSON.stringify({ phase: "live", match: { word: "PIG", turn: 1 } }),
  });
  const snapshot = harness.client.getSnapshot();
  assertEqual(snapshot.status, "started");
  assertEqual(snapshot.matchState.match.turn, 1);
});

// ---------------------------------------------------------------------------
// The court
// ---------------------------------------------------------------------------

function stubElement() {
  const classes = new Set();
  return {
    hidden: false,
    textContent: "",
    title: "",
    dataset: {},
    style: {},
    className: "",
    type: "",
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    addEventListener() {},
    setAttribute() {},
    append() {},
    appendChild() {},
    replaceChildren() {},
    querySelectorAll: () => [],
    querySelector: () => null,
  };
}

function noopContext() {
  const context = new Proxy({}, {
    get: (target, key) => {
      if (!(key in target)) target[key] = () => context;
      return target[key];
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  return context;
}

function stubCanvas() {
  const listeners = new Map();
  return Object.assign(stubElement(), {
    width: 0,
    height: 0,
    getContext: () => noopContext(),
    addEventListener: (type, handler) => listeners.set(type, handler),
    setPointerCapture: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 760 }),
    fire(type, point) {
      listeners.get(type)?.({
        pointerId: 1,
        clientX: point.x,
        clientY: point.y,
        preventDefault: () => {},
        target: { closest: () => null },
      });
    },
  });
}

/** A client that records what the court sends and replays what the court gets. */
function fakeOnlineClient(clientId = "socket-a") {
  const subscribers = new Set();
  let snapshot = { status: "idle", clientId, lobby: null, matchState: null, error: null };
  return {
    placements: [],
    shots: [],
    left: 0,
    connect() {},
    findQuickMatch() {},
    createPrivateRoom() {},
    joinPrivateRoom() {},
    startMatch() {},
    submitPlacement(setup) { this.placements.push(setup); },
    submitShot(intent) { this.shots.push(intent); },
    leave() { this.left += 1; },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    getSnapshot: () => snapshot,
    push(patch) {
      snapshot = { ...snapshot, ...patch };
      for (const listener of subscribers) listener(snapshot);
    },
  };
}

/** The shape `factory-network-server` broadcasts, hand-built so it is documented here. */
function serverState({
  turn = 0,
  phase = PHASE_SET,
  standingShot = null,
  pendingSetup = null,
  lastShot = null,
  sequence = 0,
  letters = [0, 0],
  status = "playing",
  winner = null,
} = {}) {
  return {
    authorityMode: "server",
    gameId: HORSE_GAME_ID,
    roomCode: "HORSE",
    phase: status === "playing" ? "live" : "complete",
    seats: [{ id: "socket-a", name: "Ana" }, { id: "socket-b", name: "Bo" }],
    match: {
      mode: "online",
      word: "PIG",
      players: [
        { id: "socket-a", name: "Ana", letters: letters[0] },
        { id: "socket-b", name: "Bo", letters: letters[1] },
      ],
      turn,
      phase,
      setter: 0,
      standingShot,
      status,
      winner,
      lastOutcome: null,
      shots: sequence,
    },
    pendingSetup,
    sequence,
    lastShot,
    result: null,
  };
}

const FLOOR_BIN = { x: 0, y: 0.36, z: 0.6, motionId: "still" };

function courtHarness(clientId = "socket-a") {
  const canvas = stubCanvas();
  globalThis.document = { createElement: () => stubElement() };
  const onlineClient = fakeOnlineClient(clientId);
  const root = {
    querySelector: (selector) => (selector === "#horseCourt" ? canvas : stubElement()),
    querySelectorAll: () => [],
  };
  const horse = bootHorse(root, {
    random: () => 0.5,
    assets: { backdrop: () => null, image: () => null, ballFrames: () => [], ballSplats: () => null },
    onlineClient,
    accountAccess: {
      isEligible: () => true,
      requireAccount: () => true,
      identity: () => ({ playerId: "factory-42", displayName: "Ana" }),
      syncButton() {},
    },
  });
  horse.enter({ mode: "online", word: "PIG" });
  return { canvas, horse, onlineClient };
}

function shoot({ canvas }, distance) {
  const rest = restingBallPosition();
  canvas.fire("pointerdown", rest);
  canvas.fire("pointermove", { x: rest.x, y: rest.y + distance });
  canvas.fire("pointerup", { x: rest.x, y: rest.y + distance });
}

function settle(horse, maxTicks = 900) {
  for (let i = 0; i < maxTicks; i++) {
    horse.tick();
    if (!horse.isBusy()) return i;
  }
  return -1;
}

test("nothing on the court is live until the server says a match has started", () => {
  const { horse, canvas, onlineClient } = courtHarness();
  assertEqual(horse.match.status, "waiting");
  horse.setShot();
  shoot({ canvas }, 84);
  assertEqual(onlineClient.shots.length, 0, "a shot left the court before there was a match");
  assertEqual(horse.match.shots, 0);
});

test("the seat comes from the snapshot, so the guest is not handed the host's turn", () => {
  const { horse, canvas, onlineClient } = courtHarness("socket-b");
  onlineClient.push({ status: "started", matchState: serverState({ turn: 0 }) });
  // Seat 1 with the turn on seat 0: this court watches.
  horse.setShot();
  shoot({ canvas }, 84);
  assertEqual(onlineClient.shots.length, 0, "the guest shot on the host's turn");

  onlineClient.push({ status: "started", matchState: serverState({ turn: 1, sequence: 1 }) });
  horse.placeBin(FLOOR_BIN);
  horse.setShot();
  shoot({ canvas }, 84);
  assertEqual(onlineClient.shots.length, 1, "the guest could not shoot on their own turn");
});

test("a placement goes up the wire the moment the shot is set", () => {
  const { horse, onlineClient } = courtHarness();
  onlineClient.push({ status: "started", matchState: serverState({ turn: 0 }) });
  horse.placeBin({ ...FLOOR_BIN, motionId: "sideways" });
  horse.setShot();
  assertEqual(onlineClient.placements.length, 1);
  assertEqual(onlineClient.placements[0].motionId, "sideways");
});

test("this court sends a pull and rules on nothing", () => {
  const { horse, canvas, onlineClient } = courtHarness();
  onlineClient.push({ status: "started", matchState: serverState({ turn: 0 }) });
  horse.placeBin(FLOOR_BIN);
  horse.setShot();
  for (let i = 0; i < 20; i++) horse.tick();
  shoot({ canvas }, 84);

  assertEqual(onlineClient.shots.length, 1);
  const intent = onlineClient.shots[0];
  assertEqual(intent.expectedShots, 0, "the shot must name the shot number it expects to be");
  assert(intent.motionSeconds > 0, "the release moment on the bin's own clock must travel with it");
  assert(!Object.hasOwn(intent, "made"), "the browser must not describe an outcome");

  assert(settle(horse) >= 0, "the shot never resolved");
  assertEqual(horse.match.shots, 0, "the court counted a shot the server had not ruled on");
  assertEqual(horse.match.turn, 0, "the court moved the turn on by itself");

  // And it stays locked until the ruling lands — a second pull is refused.
  shoot({ canvas }, 84);
  assertEqual(onlineClient.shots.length, 1, "a second shot went out while the first was unruled");
});

test("the ruling is what moves the letters and the turn", () => {
  const { horse, canvas, onlineClient } = courtHarness();
  onlineClient.push({ status: "started", matchState: serverState({ turn: 0 }) });
  horse.placeBin(FLOOR_BIN);
  horse.setShot();
  shoot({ canvas }, 84);
  settle(horse);

  onlineClient.push({
    status: "started",
    matchState: serverState({
      turn: 1,
      phase: PHASE_MATCH,
      standingShot: FLOOR_BIN,
      sequence: 1,
      lastShot: { sequence: 1, shooterId: "socket-a", seat: 0, made: true, kind: "set", intent: {}, setup: FLOOR_BIN },
    }),
  });
  assertEqual(horse.match.phase, PHASE_MATCH);
  assertEqual(horse.match.turn, 1, "the server's turn did not take");
  // The matcher owes this exact bin, and this court is now watching for it.
  assertEqual(horse.binNow().z, FLOOR_BIN.z);
});

test("the opponent's shot is replayed on this court, not merely reported", () => {
  // Both players watch the same ball do the same thing: the server's record of
  // the pull, the bin, and the phase of the motion clock it was released on,
  // played back through the same sim that ruled on it.
  const { horse, onlineClient } = courtHarness();
  onlineClient.push({
    status: "started",
    matchState: serverState({
      turn: 1,
      phase: PHASE_MATCH,
      standingShot: FLOOR_BIN,
      sequence: 1,
      lastShot: { sequence: 1, shooterId: "socket-a", seat: 0, made: true, kind: "set", intent: {}, setup: FLOOR_BIN },
    }),
  });
  onlineClient.push({
    status: "started",
    matchState: serverState({
      turn: 0,
      phase: PHASE_SET,
      sequence: 2,
      letters: [0, 1],
      lastShot: {
        sequence: 2,
        shooterId: "socket-b",
        seat: 1,
        made: false,
        kind: "missed",
        letter: true,
        setup: FLOOR_BIN,
        intent: { power: 0.5, aimX: 480, loft: 1, motionSeconds: 0 },
      },
    }),
  });
  assert(horse.isBusy(), "the opponent's shot was not played out — the letter just appeared");
  assert(settle(horse) >= 0, "the replayed shot never resolved");
  assertEqual(horse.match.players[1].letters, 1, "the ruling did not land after the replay");
  assertEqual(horse.match.turn, 0);
});

test("a completed match is over on this court too, whatever it is told to draw", () => {
  const { horse, canvas, onlineClient } = courtHarness();
  onlineClient.push({
    status: "complete",
    matchState: serverState({ turn: 0, sequence: 4, letters: [0, 3], status: "won", winner: 0 }),
  });
  assertEqual(horse.match.status, "won");
  horse.setShot();
  shoot({ canvas }, 84);
  assertEqual(onlineClient.shots.length, 0, "a shot left a finished match");
});

finish();
