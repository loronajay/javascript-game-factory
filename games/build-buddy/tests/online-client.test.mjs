import {
  BUILD_BUDDY_GAME_ID,
  BUILD_BUDDY_PROTOCOL_VERSION,
  createOnlineClient,
  resolveWebSocketUrl,
  sanitizeOnlineIdentity,
} from "../js/online-client.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `expected ${actualJson} to equal ${expectedJson}`);
  }
}

class MockWebSocket {
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.OPEN;
    this.sent = [];
    MockWebSocket.instances.push(this);
  }

  send(value) {
    this.sent.push(JSON.parse(value));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  receive(value) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}

MockWebSocket.OPEN = 1;
MockWebSocket.CLOSED = 3;

class ConnectingMockWebSocket extends MockWebSocket {
  constructor(url) {
    super(url);
    this.readyState = ConnectingMockWebSocket.CONNECTING;
  }

  open() {
    this.readyState = ConnectingMockWebSocket.OPEN;
    this.onopen?.();
  }
}

ConnectingMockWebSocket.CONNECTING = 0;
ConnectingMockWebSocket.OPEN = 1;
ConnectingMockWebSocket.CLOSED = 3;

function createClient() {
  MockWebSocket.instances = [];
  return createOnlineClient({
    WebSocketCtor: MockWebSocket,
    locationLike: { protocol: "http:", hostname: "localhost" },
  });
}

test("web socket URL resolves to local dev for localhost and production otherwise", () => {
  assertEqual(resolveWebSocketUrl({ protocol: "http:", hostname: "127.0.0.1" }), "ws://127.0.0.1:3000");
  assertEqual(resolveWebSocketUrl({ protocol: "https:", hostname: "arcade.example" }), "wss://factory-network-server-production.up.railway.app");
});

test("identity is bounded and owned by the Factory profile shape", () => {
  const identity = sanitizeOnlineIdentity({
    playerId: "factory-user-123",
    displayName: "A Very Long Factory Display Name That Needs Trimming",
  });

  assertEqual(identity.playerId, "factory-user-123");
  assertEqual(identity.displayName.length, 24);
});

test("createLobby sends the newer Factory lobby protocol with Build Buddy settings", () => {
  const client = createClient();
  client.connect();
  client.setIdentity({ playerId: "p1", displayName: "Player One" });
  client.createLobby({ packId: "pack_01" });

  assertDeepEqual(MockWebSocket.instances[0].sent[0], {
    type: "create_lobby",
    gameId: BUILD_BUDDY_GAME_ID,
    minPlayers: 2,
    maxPlayers: 2,
    private: true,
    settings: {
      packId: "pack_01",
      runFormat: "canon_10_stage",
      protocolVersion: BUILD_BUDDY_PROTOCOL_VERSION,
    },
    identity: { playerId: "p1", displayName: "Player One" },
  });
});

test("findLobby and joinLobby use public search and private room-code protocol messages", () => {
  const client = createClient();
  client.connect();
  client.findLobby({ packId: "pack_01" });
  client.joinLobby("ab12");

  assertEqual(MockWebSocket.instances[0].sent[0].type, "find_lobby");
  assertEqual(MockWebSocket.instances[0].sent[0].private, false);
  assertEqual(MockWebSocket.instances[0].sent[1].type, "join_lobby");
  assertEqual(MockWebSocket.instances[0].sent[1].roomCode, "AB12");
});

test("lobby requests made during WebSocket connect flush after open", () => {
  MockWebSocket.instances = [];
  const client = createOnlineClient({
    WebSocketCtor: ConnectingMockWebSocket,
    locationLike: { protocol: "http:", hostname: "localhost" },
  });

  client.connect();
  client.findLobby({ packId: "pack_01" });

  assertEqual(MockWebSocket.instances[0].sent.length, 0);
  MockWebSocket.instances[0].open();
  assertEqual(MockWebSocket.instances[0].sent[0].type, "find_lobby");
});

test("lobby messages exchange profile and ready state without a custom auth layer", () => {
  const client = createClient();
  const updates = [];
  client.subscribe((snapshot) => updates.push(snapshot));
  client.connect();
  client.setIdentity({ playerId: "p1", displayName: "Player One" });
  MockWebSocket.instances[0].receive({
    event: "connected",
    clientId: "p1",
  });
  MockWebSocket.instances[0].receive({
    event: "lobby_joined",
    roomCode: "AB12",
    ownerId: "p1",
    members: ["p1"],
    playerCount: 1,
    minPlayers: 2,
    maxPlayers: 2,
    status: "open",
  });
  client.sendProfile();
  client.sendReady(true);
  MockWebSocket.instances[0].receive({
    event: "message",
    scope: "lobby",
    senderId: "p2",
    messageType: "profile",
    value: JSON.stringify({ playerId: "p2", displayName: "Player Two" }),
  });
  MockWebSocket.instances[0].receive({
    event: "message",
    scope: "lobby",
    senderId: "p2",
    messageType: "ready",
    value: JSON.stringify({ ready: true, protocolVersion: BUILD_BUDDY_PROTOCOL_VERSION }),
  });

  const sent = MockWebSocket.instances[0].sent;
  assertEqual(sent[0].messageType, "profile");
  assertEqual(sent[1].messageType, "ready");
  assertEqual(typeof sent[0].value, "string");
  assertEqual(updates.at(-1).profiles.p2.displayName, "Player Two");
  assertEqual(updates.at(-1).readyByPlayerId.p2, true);
});

test("online gameplay relay messages are normalized before send and retained on receive", () => {
  const client = createClient();
  const updates = [];
  client.subscribe((snapshot) => updates.push(snapshot));
  client.connect();
  client.sendInput({ left: 1, jump: true, ignored: true }, { tick: 7.9 });
  client.sendBuilderCommand({ tick: 8.2, action: "place", toolType: "springBlue", gridX: 100.8, gridY: 240.1 });
  MockWebSocket.instances[0].receive({
    event: "message",
    scope: "lobby",
    senderId: "host",
    messageType: "state_sync",
    value: JSON.stringify({
      tick: 9,
      runner: { x: 20, y: 30, vx: 1, vy: 2, dead: false },
      tools: [],
      timerMs: 1000,
      stageStatus: "playing",
    }),
  });
  MockWebSocket.instances[0].receive({
    event: "message",
    scope: "lobby",
    senderId: "guest",
    messageType: "runner_input",
    value: JSON.stringify({ tick: 10, right: true }),
  });
  MockWebSocket.instances[0].receive({
    event: "message",
    scope: "lobby",
    senderId: "guest",
    messageType: "builder_command",
    value: JSON.stringify({ tick: 11, action: "delete", gridX: 80, gridY: 120 }),
  });

  const sent = MockWebSocket.instances[0].sent;
  assertEqual(sent[0].messageType, "runner_input");
  assertEqual(JSON.parse(sent[0].value).tick, 7);
  assertEqual(JSON.parse(sent[0].value).left, true);
  assertEqual(sent[1].messageType, "builder_command");
  assertEqual(JSON.parse(sent[1].value).toolType, "springBlue");
  assertEqual(JSON.parse(sent[1].value).gridX, 100);
  assertEqual(updates.at(-1).onlineGameplay.lastStateSync.tick, 9);
  assertEqual(updates.at(-1).onlineGameplay.lastRunnerInput.value.right, true);
  assertEqual(updates.at(-1).onlineGameplay.lastBuilderCommand.value.action, "delete");
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
