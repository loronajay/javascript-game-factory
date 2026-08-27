import { assert, assertDeepEqual, assertEqual, test, finish, suite } from "./harness.js";
import {
  TIC_TAC_TOE_GAME_ID,
  createTicTacToeOnlineClient,
  sanitizeOnlineAttempt,
  sanitizeShotIntent,
} from "../scripts/multiplayer/tic-tac-toe-online-client.js";

suite("Factory Network floor Tic-Tac-Toe client");

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

function createHarness(identity = { playerId: "factory-42", displayName: "Jay" }) {
  let socket;
  const client = createTicTacToeOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => identity,
    storage: null,
  });
  return { client, get socket() { return socket; } };
}

function receive(socket, value) {
  socket.emit("message", { data: JSON.stringify(value) });
}

test("quick search uses a dedicated game id so it never pairs with score duels", () => {
  const harness = createHarness();
  harness.client.findQuickMatch();
  harness.socket.emit("open", {});
  assertDeepEqual(harness.socket.sent[0], {
    type: "find_lobby",
    gameId: TIC_TAC_TOE_GAME_ID,
    minPlayers: 2,
    maxPlayers: 2,
    settings: { protocolVersion: 1 },
    identity: { playerId: "factory-42", displayName: "Jay" },
  });
});

test("ordered lobby members assign X and O consistently on both clients", () => {
  const harness = createHarness();
  harness.client.connect();
  receive(harness.socket, { event: "connected", clientId: "socket-b", sessionToken: "token" });
  receive(harness.socket, {
    event: "lobby_joined",
    roomCode: "TICTAC",
    ownerId: "socket-a",
    members: ["socket-a", "socket-b"],
    players: [{ id: "socket-a", name: "Ana" }, { id: "socket-b", name: "Jay" }],
    playerCount: 2,
    status: "open",
  });
  receive(harness.socket, {
    event: "lobby_started",
    roomCode: "TICTAC",
    ownerId: "socket-a",
    members: ["socket-a", "socket-b"],
    startAt: 1234,
  });
  const snapshot = harness.client.getSnapshot();
  assertEqual(snapshot.status, "started");
  assertEqual(snapshot.lobby.status, "started");
  assertEqual(snapshot.matchState.humanMark, "o");
  assertEqual(snapshot.matchState.turn, "x");
  assertEqual(snapshot.matchState.players.x.name, "Ana");
  assertEqual(snapshot.matchState.players.o.name, "Jay");
});

test("only the current seat can advance the shared match and duplicate moves are ignored", () => {
  const harness = createHarness();
  harness.client.connect();
  receive(harness.socket, { event: "connected", clientId: "socket-a", sessionToken: "token" });
  receive(harness.socket, {
    event: "lobby_joined",
    roomCode: "TICTAC",
    ownerId: "socket-a",
    members: ["socket-a", "socket-b"],
    players: [{ id: "socket-a", name: "Ana" }, { id: "socket-b", name: "Bo" }],
    playerCount: 2,
  });
  receive(harness.socket, { event: "lobby_started", roomCode: "TICTAC", members: ["socket-a", "socket-b"], startAt: 1 });

  const wrongSeat = { event: "message", scope: "lobby", messageType: "tic_tac_toe_attempt", senderId: "socket-b", value: JSON.stringify({ cell: 4, made: true, expectedAttempt: 0 }) };
  receive(harness.socket, wrongSeat);
  assertEqual(harness.client.getSnapshot().matchState.attempts, 0);

  const firstMove = { ...wrongSeat, senderId: "socket-a" };
  receive(harness.socket, firstMove);
  receive(harness.socket, firstMove);
  const match = harness.client.getSnapshot().matchState;
  assertEqual(match.board[4], "x");
  assertEqual(match.turn, "o");
  assertEqual(match.attempts, 1);
});

test("attempt messages contain only a bounded cell, result, sequence and pull", () => {
  assertEqual(sanitizeOnlineAttempt({ cell: -1, made: true, expectedAttempt: 0 }), null);
  assertDeepEqual(sanitizeOnlineAttempt({
    cell: 8,
    made: 1,
    expectedAttempt: 3.9,
    mark: "x",
    board: Array(9).fill("x"),
  }), { cell: 8, made: true, expectedAttempt: 3 });
  assert(!Object.hasOwn(sanitizeOnlineAttempt({ cell: 0, made: false, expectedAttempt: 0 }), "mark"));
});

test("the pull travels, bounded, and a broken one costs the animation and nothing else", () => {
  // THE OPPONENT'S BALL IS WATCHED, NOT REPORTED. Three numbers is the whole of
  // what the other court needs to throw it: both machines run the same sim.
  assertDeepEqual(
    sanitizeShotIntent({ power: 2, aimX: 480, loft: -3, ballId: "paper", spin: 9 }),
    { power: 1, aimX: 480, loft: 0, ballId: "paper" },
  );
  assertEqual(sanitizeShotIntent({ power: "x", aimX: 1, loft: 1 }), null);
  assertEqual(sanitizeShotIntent(null), null);
  // The ruling is `cell`/`made`; the intent is presentation. A missing one must
  // not take the attempt down with it.
  const attempt = sanitizeOnlineAttempt({ cell: 3, made: true, expectedAttempt: 1, intent: { power: "nope" } });
  assertEqual(attempt.cell, 3);
  assert(!Object.hasOwn(attempt, "intent"), "a malformed pull must be dropped, not carried");

  assertDeepEqual(
    sanitizeOnlineAttempt({ cell: 3, made: true, expectedAttempt: 1, intent: { power: 0.62, aimX: 511, loft: 0.8, ballId: "bowling-ball" } }).intent,
    { power: 0.62, aimX: 511, loft: 0.8, ballId: "bowling-ball" },
  );
  assertEqual(sanitizeShotIntent({ power: 0.5, aimX: 480, loft: 1, ballId: "../../bad" }).ballId, "basketball");
});

test("a ruled attempt is published with the pull that produced it", () => {
  // `lastAttempt` is what lets a court replay a shot it did not take: a
  // monotonic sequence so it can tell an unseen shot from a re-sent snapshot,
  // and a shooter id so it never replays its own ball.
  const harness = createHarness();
  harness.client.connect();
  receive(harness.socket, { event: "connected", clientId: "socket-b", sessionToken: "token" });
  receive(harness.socket, {
    event: "lobby_joined",
    roomCode: "TICTAC",
    ownerId: "socket-a",
    members: ["socket-a", "socket-b"],
    players: [{ id: "socket-a", name: "Ana" }, { id: "socket-b", name: "Bo" }],
    playerCount: 2,
  });
  receive(harness.socket, { event: "lobby_started", roomCode: "TICTAC", members: ["socket-a", "socket-b"], startAt: 1 });
  assertEqual(harness.client.getSnapshot().lastAttempt, null);

  receive(harness.socket, {
    event: "message",
    scope: "lobby",
    messageType: "tic_tac_toe_attempt",
    senderId: "socket-a",
    value: JSON.stringify({ cell: 4, made: true, expectedAttempt: 0, intent: { power: 0.7, aimX: 480, loft: 1, ballId: "snowball" } }),
  });
  const { lastAttempt } = harness.client.getSnapshot();
  assertEqual(lastAttempt.sequence, 1);
  assertEqual(lastAttempt.cell, 4);
  assertEqual(lastAttempt.mark, "x");
  assertEqual(lastAttempt.shooterId, "socket-a");
  assertDeepEqual(lastAttempt.intent, { power: 0.7, aimX: 480, loft: 1, ballId: "snowball" });
});

finish();
