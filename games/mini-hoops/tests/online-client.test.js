import { assert, assertDeepEqual, assertEqual, test, finish, suite } from "./harness.js";
import {
  MINI_HOOPS_GAME_ID,
  createMiniHoopsOnlineClient,
  normalizeRoomCode,
  sanitizeShotIntent,
} from "../scripts/multiplayer/online-client.js";

suite("Factory Network client");

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

test("quick search sends real Factory identity and normalized host config", () => {
  let socket;
  const client = createMiniHoopsOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => ({ playerId: "factory-42", displayName: "Jay" }),
    storage: null,
  });
  client.findQuickMatch({ modeId: "still", duration: 30, locationId: "bedroom", ballId: "basketball" });
  socket.emit("open", {});
  assertDeepEqual(socket.sent[0], {
    type: "find_lobby",
    gameId: MINI_HOOPS_GAME_ID,
    minPlayers: 2,
    maxPlayers: 2,
    settings: {
      modeId: "still",
      duration: 30,
      locationId: "bedroom",
      ballId: "basketball",
      protocolVersion: 1,
    },
    identity: { playerId: "factory-42", displayName: "Jay" },
  });
});

test("private rooms use the shared lobby protocol and clean room codes", () => {
  assertEqual(normalizeRoomCode(" ab-c 12! "), "ABC12");
  let socket;
  const client = createMiniHoopsOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => ({ playerId: "factory-9", displayName: "Ana" }),
    storage: null,
  });
  client.joinPrivateRoom(" ab-c 12! ");
  socket.emit("open", {});
  assertDeepEqual(socket.sent[0], {
    type: "join_lobby",
    gameId: MINI_HOOPS_GAME_ID,
    roomCode: "ABC12",
    identity: { playerId: "factory-9", displayName: "Ana" },
  });
});

test("shot messages contain intent but no client-authored score or result", () => {
  const shot = sanitizeShotIntent({
    power: 12,
    aimX: -99,
    aimY: 99,
    loft: -4,
    expectedShotNumber: 3.9,
    score: 9000,
    winnerIds: ["me"],
  });
  assertDeepEqual(shot, {
    power: 1,
    aimX: 320,
    aimY: 224,
    loft: 0,
    expectedShotNumber: 3,
  });
  assert(!Object.hasOwn(shot, "score"));
  assert(!Object.hasOwn(shot, "winnerIds"));
});

test("a saved Factory Network session resumes inside the server grace window", () => {
  let socket;
  const storage = {
    value: JSON.stringify({ clientId: "socket-old", sessionToken: "resume-token" }),
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
    removeItem() { this.value = ""; },
  };
  const client = createMiniHoopsOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => ({ playerId: "factory-9", displayName: "Ana" }),
    storage,
  });
  assertEqual(client.resumeSavedSession(), true);
  socket.emit("open", {});
  socket.emit("message", { data: JSON.stringify({ event: "connected", clientId: "socket-new", sessionToken: "new-token" }) });
  assertDeepEqual(socket.sent[0], { type: "resume_lobby", clientId: "socket-old", sessionToken: "resume-token" });
});

test("leaving an online match immediately clears stale lobby and match state", () => {
  let socket;
  const client = createMiniHoopsOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => ({ playerId: "factory-9", displayName: "Ana" }),
    storage: null,
  });
  client.connect();
  socket.emit("open", {});
  socket.emit("message", { data: JSON.stringify({ event: "connected", clientId: "socket-a", sessionToken: "token" }) });
  socket.emit("message", { data: JSON.stringify({
    event: "lobby_started",
    matchState: {
      roomCode: "HOOPS",
      startAt: 2_000,
      endsAt: 32_000,
      config: { modeId: "circle", duration: 30, locationId: "bedroom", ballId: "basketball" },
      players: [],
    },
  }) });

  client.leave();

  assertDeepEqual(client.getSnapshot(), {
    status: "idle",
    clientId: "socket-a",
    lobby: null,
    matchState: null,
    error: null,
  });
  assertDeepEqual(socket.sent.at(-1), { type: "leave_lobby" });
});

test("an opponent leaving is surfaced, and survives the lobby refresh that follows it", () => {
  let socket;
  const client = createMiniHoopsOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => ({ playerId: "factory-9", displayName: "Ana" }),
    storage: null,
  });
  const seen = [];
  client.subscribe((snapshot) => seen.push(snapshot));
  client.connect();
  socket.emit("open", {});
  socket.emit("message", { data: JSON.stringify({ event: "connected", clientId: "socket-a", sessionToken: "token" }) });
  socket.emit("message", { data: JSON.stringify({ event: "lobby_joined", roomCode: "HOOPS", ownerId: "socket-a", members: ["socket-a", "socket-b"], playerCount: 2, status: "open" }) });
  socket.emit("message", { data: JSON.stringify({ event: "lobby_player_left", clientId: "socket-b", roomCode: "HOOPS", playerCount: 1 }) });
  assertEqual(seen.at(-1).error?.code, "OPPONENT_LEFT");

  // The server's generic post-leave refresh arrives next; the notice stays.
  socket.emit("message", { data: JSON.stringify({ event: "lobby_updated", roomCode: "HOOPS", ownerId: "socket-a", members: ["socket-a"], playerCount: 1, status: "open" }) });
  assertEqual(seen.at(-1).error?.code, "OPPONENT_LEFT");
  assertEqual(seen.at(-1).lobby.playerCount, 1);

  // Searching again is a fresh start and clears it.
  client.findQuickMatch({});
  assertEqual(seen.at(-1).error, null);
});

test("a mid-duel departure ends in the server's forfeit result, not a paused court", () => {
  let socket;
  const client = createMiniHoopsOnlineClient({
    WebSocketCtor: class extends FakeSocket { constructor() { super(); socket = this; } },
    resolveIdentity: () => ({ playerId: "factory-9", displayName: "Ana" }),
    storage: null,
  });
  const seen = [];
  client.subscribe((snapshot) => seen.push(snapshot));
  client.connect();
  socket.emit("open", {});
  socket.emit("message", { data: JSON.stringify({ event: "connected", clientId: "socket-a", sessionToken: "token" }) });
  socket.emit("message", { data: JSON.stringify({ event: "lobby_started", matchState: { roomCode: "HOOPS", startAt: 1, endsAt: 30_001, phase: "live", players: [] } }) });
  socket.emit("message", { data: JSON.stringify({ event: "lobby_player_left", clientId: "socket-b", roomCode: "HOOPS", playerCount: 1 }) });
  socket.emit("message", { data: JSON.stringify({
    event: "message", scope: "lobby", messageType: "mini_hoops_match_ended",
    value: JSON.stringify({ roomCode: "HOOPS", startAt: 1, endsAt: 30_001, phase: "complete", players: [], result: { winnerIds: ["socket-a"], reason: "forfeit" } }),
  }) });
  assertEqual(seen.at(-1).status, "complete");
  assertEqual(seen.at(-1).matchState.result.reason, "forfeit");
  assertEqual(seen.at(-1).error, null);
});

finish();
