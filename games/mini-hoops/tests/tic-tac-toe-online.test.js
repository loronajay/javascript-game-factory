import { assert, assertDeepEqual, assertEqual, test, finish, suite } from "./harness.js";
import {
  TIC_TAC_TOE_GAME_ID,
  createTicTacToeOnlineClient,
  sanitizeOnlineAttempt,
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

test("attempt messages contain only a bounded cell, result, and sequence", () => {
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

finish();
