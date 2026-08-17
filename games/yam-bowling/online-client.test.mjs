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

test("quick match and private room commands use the shared lobby protocol", () => {
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
  client.createPrivateRoom({
    modeId: "quick",
    characterSlug: "daisy-monroe",
    skinId: "swimsuit",
    presentation: {
      ballTrailId: "ball-trail:red-neon",
      strikeBurstId: "strike-burst:ember",
      victoryPoseId: "victory-pose:daisy-monroe:maid",
      emoteIds: ["emote:wave", "emote:cheer"],
      catchLineIds: ["catch-line:find-the-pocket"],
      playerCardId: "",
      profileIconId: "",
      entranceId: "",
    },
  });
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
    settings: { matchType: "quick", protocolVersion: YAM_BOWLING_PROTOCOL_VERSION },
  });

  assert.equal(socket.sent[1].type, "lobby_message");
  assert.equal(socket.sent[1].messageType, "yam_profile");
  assert.deepEqual(JSON.parse(socket.sent[1].value), {
    playerId: "factory-p1",
    displayName: "Bowler One",
    characterSlug: "daisy-monroe",
    skinId: "swimsuit",
    presentation: {
      ballTrailId: "ball-trail:red-neon",
      strikeBurstId: "strike-burst:ember",
      victoryPoseId: "victory-pose:daisy-monroe:maid",
      playerCardId: "",
      profileIconId: "",
      entranceId: "",
      // Both wheels ride the profile at full length. A short wheel is padded
      // with empty slots rather than sent short, because the slot index a
      // reaction carries is only meaningful against a fixed-length wheel.
      emoteIds: ["emote:wave", "emote:cheer", "", ""],
      catchLineIds: ["catch-line:find-the-pocket", "", "", ""],
    },
    protocolVersion: YAM_BOWLING_PROTOCOL_VERSION,
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

test("the opponent's bowler and equipped skin survive lobby normalization", () => {
  const client = createClient();
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });
  socket.receive({
    event: "lobby_updated",
    roomCode: "YAM42",
    ownerId: "socket-1",
    members: ["socket-1", "socket-2"],
    players: [
      { id: "socket-1", name: "Bowler One", characterSlug: "daisy-monroe", skinId: "swimsuit" },
      { id: "socket-2", playerId: "factory-p2", name: "Bowler Two", characterSlug: "roxy-chen", skinId: "maid" },
    ],
    playerCount: 2,
    minPlayers: 2,
    maxPlayers: 2,
    status: "open",
    settings: { matchType: "quick", protocolVersion: 1 },
  });

  const opponent = client.getSnapshot().lobby.players[1];
  assert.equal(opponent.characterSlug, "roxy-chen");
  assert.equal(opponent.skinId, "maid");
  assert.equal(opponent.playerId, "factory-p2");
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

test("reaction requests carry a wheel slot, never a slug, and reach subscribers by kind", () => {
  const client = createClient();
  const updates = [];
  client.subscribe((snapshot) => updates.push(snapshot));
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({ event: "connected", clientId: "socket-1", sessionToken: "resume-1" });

  assert.equal(client.sendReaction("emote", 2), true);
  assert.equal(socket.sent[0].messageType, "yam_reaction");
  assert.deepEqual(JSON.parse(socket.sent[0].value), { kind: "emote", slot: 2 });

  assert.equal(client.sendReaction("catch-line", 3), true);
  assert.deepEqual(JSON.parse(socket.sent[1].value), { kind: "catch-line", slot: 3 });

  // An unknown kind or an out-of-range slot never reaches the wire: the wheel's
  // length is the whole validation, so a slot the server could not resolve is
  // refused here rather than spending the sender's cooldown on a fallback.
  assert.equal(client.sendReaction("chat", 0), false);
  assert.equal(client.sendReaction("emote", 4), false);
  assert.equal(client.sendReaction("emote", -1), false);
  assert.equal(client.sendReaction("emote", "two"), false);
  assert.equal(socket.sent.length, 2);

  socket.receive({
    event: "message",
    scope: "lobby",
    senderId: "server",
    messageType: "yam_reaction",
    value: JSON.stringify({ senderClientId: "socket-2", reactionId: "emote:cheer", sequence: 4 }),
  });
  assert.deepEqual(updates.at(-1).lastReaction, {
    senderClientId: "socket-2",
    kind: "emote",
    reactionId: "emote:cheer",
    sequence: 4,
  });

  // The kind is read off the resolved id's prefix, so a catch line arrives on
  // the same channel without the server naming the kind twice.
  socket.receive({
    event: "message",
    scope: "lobby",
    senderId: "server",
    messageType: "yam_reaction",
    value: JSON.stringify({ senderClientId: "socket-2", reactionId: "catch-line:good-game", sequence: 5 }),
  });
  assert.equal(updates.at(-1).lastReaction.kind, "catch-line");

  // An id of no known kind is dropped rather than emitted for the HUD to paint.
  socket.receive({
    event: "message",
    scope: "lobby",
    senderId: "server",
    messageType: "yam_reaction",
    value: JSON.stringify({ senderClientId: "socket-2", reactionId: "title:rookie", sequence: 6 }),
  });
  assert.equal(updates.at(-1).lastReaction.sequence, 5);
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
