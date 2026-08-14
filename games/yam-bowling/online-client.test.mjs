import test from "node:test";
import assert from "node:assert/strict";

import {
  YAM_BOWLING_GAME_ID,
  YAM_BOWLING_PROTOCOL_VERSION,
  createOnlineClient,
  normalizeRoomCode,
  resolveWebSocketUrl,
  sanitizeOnlineIdentity,
  sanitizeShot,
} from "./online-client.mjs";

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    this.listeners = new Map();
    MockWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.listeners.get("open")?.({});
  }

  receive(payload) {
    this.listeners.get("message")?.({ data: JSON.stringify(payload) });
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.listeners.get("close")?.({});
  }
}

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function createClient(options = {}) {
  MockWebSocket.instances = [];
  return createOnlineClient({
    WebSocketCtor: MockWebSocket,
    locationLike: { protocol: "http:", hostname: "localhost" },
    storage: createStorage(),
    reconnectDelayMs: 0,
    setTimer: () => 1,
    ...options,
  });
}

test("uses the local relay during development and production relay when deployed", () => {
  assert.equal(resolveWebSocketUrl({ protocol: "http:", hostname: "127.0.0.1" }), "ws://127.0.0.1:3000");
  assert.equal(resolveWebSocketUrl({ protocol: "https:", hostname: "arcade.example" }), "wss://factory-network-server-production.up.railway.app");
});

test("normalizes Factory identity, room codes, and declared shot inputs", () => {
  assert.deepEqual(sanitizeOnlineIdentity({ playerId: " account-7 ", displayName: "  A Very Long Factory Bowler Name  " }), {
    playerId: "account-7",
    displayName: "A Very Long Factory Bowl",
  });
  assert.equal(normalizeRoomCode(" ab-12! "), "AB12");
  assert.deepEqual(sanitizeShot({ position: 9, aim: -9, hook: 2, power: -1, release: 4, ballIndex: 90 }), {
    position: 0.46,
    aim: -0.45,
    hook: 1,
    power: 0.08,
    release: 0.035,
    ballIndex: 7,
  });
});

test("quick match and private room commands use the shared v2 lobby protocol", () => {
  const client = createClient();
  client.setIdentity({ playerId: "factory-p1", displayName: "Bowler One" });
  client.connect();
  MockWebSocket.instances[0].open();
  MockWebSocket.instances[0].receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });

  client.findQuickMatch({ modeId: "classic", characterSlug: "daisy-monroe" });
  client.createPrivateRoom({ modeId: "quick", characterSlug: "nia-brooks" });
  client.joinPrivateRoom(" y4m!2 ", { characterSlug: "nia-brooks" });

  const [find, create, join] = MockWebSocket.instances[0].sent;
  assert.deepEqual(find, {
    type: "find_lobby",
    gameId: YAM_BOWLING_GAME_ID,
    minPlayers: 2,
    maxPlayers: 2,
    private: false,
    settings: { matchType: "classic", protocolVersion: YAM_BOWLING_PROTOCOL_VERSION },
    identity: { playerId: "factory-p1", displayName: "Bowler One" },
  });
  assert.equal(create.type, "create_lobby");
  assert.equal(create.private, true);
  assert.equal(create.settings.matchType, "quick");
  assert.equal(join.type, "join_lobby");
  assert.equal(join.roomCode, "Y4M2");
});

test("lobby join publishes the selected bowler and owner can start a full lobby", () => {
  const client = createClient();
  client.setIdentity({ playerId: "factory-p1", displayName: "Bowler One" });
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });
  client.createPrivateRoom({ modeId: "quick", characterSlug: "daisy-monroe" });
  socket.receive({
    event: "lobby_joined",
    clientId: "socket-1",
    roomCode: "YAM42",
    ownerId: "socket-1",
    members: ["socket-1"],
    players: [{ id: "socket-1", name: "Bowler One" }],
    playerCount: 1,
    minPlayers: 2,
    maxPlayers: 2,
    status: "open",
    settings: { matchType: "quick", protocolVersion: 1 },
  });

  assert.equal(socket.sent[1].type, "lobby_message");
  assert.equal(socket.sent[1].messageType, "yam_profile");
  assert.deepEqual(JSON.parse(socket.sent[1].value), {
    playerId: "factory-p1",
    displayName: "Bowler One",
    characterSlug: "daisy-monroe",
    protocolVersion: 1,
  });

  socket.receive({
    event: "lobby_updated",
    roomCode: "YAM42",
    ownerId: "socket-1",
    members: ["socket-1", "socket-2"],
    players: [{ id: "socket-1", name: "Bowler One" }, { id: "socket-2", name: "Bowler Two" }],
    playerCount: 2,
    minPlayers: 2,
    maxPlayers: 2,
    status: "open",
    settings: { matchType: "quick", protocolVersion: 1 },
  });
  client.startLobby();
  assert.equal(socket.sent.at(-1).type, "start_lobby");
});

test("server match snapshots, errors, and disconnect state reach subscribers", () => {
  const client = createClient();
  const updates = [];
  client.subscribe((snapshot) => updates.push(snapshot));
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });
  socket.receive({ event: "lobby_started", roomCode: "YAM42", authorityMode: "server", matchState: { sessionId: "yam:YAM42:1", rollNumber: 0 } });
  socket.receive({ event: "message", scope: "lobby", senderId: "server", messageType: "yam_match", value: JSON.stringify({ rollNumber: 1, lastRoll: { knocked: 8 } }) });
  socket.receive({ event: "lobby_player_disconnected", clientId: "socket-2", reconnectExpiresAt: 9999 });
  socket.receive({ event: "error", code: "NOT_YOUR_TURN", message: "Wait for the other bowler." });

  assert.equal(updates.at(-1).matchState.rollNumber, 1);
  assert.equal(updates.at(-1).disconnectedClientId, "socket-2");
  assert.equal(updates.at(-1).error.code, "NOT_YOUR_TURN");
});

test("shot and rematch requests carry no client-authored result", () => {
  const client = createClient();
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });

  client.submitShot({ position: 0.1, aim: 0.2, hook: -0.3, power: 0.9, release: 0.01, ballIndex: 2 });
  client.requestRematch();

  const shot = socket.sent[0];
  assert.equal(shot.messageType, "yam_shot");
  assert.equal(Object.hasOwn(JSON.parse(shot.value), "knocked"), false);
  assert.equal(socket.sent[1].messageType, "yam_rematch");
});

test("a dropped active match attempts session resume with the relay token", () => {
  const scheduled = [];
  const storage = createStorage();
  const client = createClient({ storage, setTimer: (fn) => { scheduled.push(fn); return 1; } });
  client.connect();
  let socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });
  socket.receive({ event: "lobby_started", roomCode: "YAM42", matchState: { sessionId: "yam:YAM42:1" } });
  socket.close();
  assert.equal(scheduled.length, 1);

  scheduled[0]();
  socket = MockWebSocket.instances[1];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-new", sessionToken: "resume-new" });
  assert.deepEqual(socket.sent[0], { type: "resume_lobby", clientId: "socket-1", sessionToken: "resume-1" });
});

test("a reloaded page resumes the saved relay session on startup", () => {
  const storage = createStorage();
  storage.setItem("yam-bowling.online-session.v1", JSON.stringify({ clientId: "socket-1", sessionToken: "resume-1" }));
  const client = createClient({ storage });

  assert.equal(client.resumeSavedSession(), true);
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-new", sessionToken: "resume-new" });

  assert.deepEqual(socket.sent[0], { type: "resume_lobby", clientId: "socket-1", sessionToken: "resume-1" });
  socket.receive({ event: "session_resumed", clientId: "socket-1", sessionToken: "resume-1" });
  assert.equal(client.getSnapshot().status, "started");
});
