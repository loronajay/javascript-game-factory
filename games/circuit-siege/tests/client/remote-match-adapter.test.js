import {
  createRemoteMatchAdapter,
  normalizeQueueCounts,
  resolveWebSocketUrl
} from "../../scripts/adapters/remote-match-adapter.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createFakeSocket(url) {
  return {
    url,
    readyState: 0,
    sent: [],
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    send(value) {
      this.sent.push(JSON.parse(value));
    },
    close() {
      this.closed = true;
    },
    emit(type, payload) {
      const handler = this.listeners[type];
      if (!handler) return;
      if (type === "message") {
        handler({ data: JSON.stringify(payload) });
        return;
      }
      handler(payload);
    }
  };
}

console.log("\nremote-match-adapter");

test("resolveWebSocketUrl uses the local websocket port on localhost", () => {
  assertEqual(resolveWebSocketUrl({ protocol: "http:", hostname: "localhost" }), "ws://localhost:3000");
});

test("resolveWebSocketUrl falls back to production for deployed pages", () => {
  assertEqual(
    resolveWebSocketUrl({ protocol: "https:", hostname: "arcade.example" }),
    "wss://factory-network-server-production.up.railway.app"
  );
});

test("normalizeQueueCounts reads blue/red queue payloads", () => {
  const counts = normalizeQueueCounts({ blueWaiting: 2, redWaiting: 5 });
  assertEqual(counts.blue, 2);
  assertEqual(counts.red, 5);
});

test("adapter sends find_match/create_room/join_room payloads through the socket", () => {
  let socket = null;
  const adapter = createRemoteMatchAdapter({
    socketFactory(url) {
      socket = createFakeSocket(url);
      return socket;
    },
    locationLike: { protocol: "http:", hostname: "localhost" }
  });

  adapter.setIdentity({ playerId: "p1", displayName: "Devon" });
  adapter.connect();
  socket.readyState = 1;

  adapter.findMatch("blue");
  adapter.createRoom("blue");
  adapter.joinRoom("red", "ab12");

  assertEqual(socket.sent[0].type, "find_match");
  assertEqual(socket.sent[0].side, "blue");
  assertEqual(socket.sent[1].type, "create_room");
  assertEqual(socket.sent[1].gameId, "circuit-siege");
  assertEqual(socket.sent[2].type, "join_room");
  assertEqual(socket.sent[2].gameId, "circuit-siege");
  assertEqual(socket.sent[2].roomCode, "AB12");
});

test("adapter dispatches connected, queue counts, room creation, match ready, and remote snapshot events", () => {
  let socket = null;
  const seen = [];
  const adapter = createRemoteMatchAdapter({
    socketFactory(url) {
      socket = createFakeSocket(url);
      return socket;
    },
    locationLike: { protocol: "http:", hostname: "localhost" }
  });

  adapter.cb.onConnected = ({ clientId }) => seen.push(["connected", clientId]);
  adapter.cb.onQueueCounts = ({ blue, red }) => seen.push(["queue", blue, red]);
  adapter.cb.onRoomCreated = (roomCode) => seen.push(["created", roomCode]);
  adapter.cb.onRoomPresenceChanged = ({ playerCount }) => seen.push(["presence", playerCount]);
  adapter.cb.onMatchReady = ({ seed, remoteSide }) => seen.push(["ready", seed, remoteSide]);
  adapter.cb.onSnapshot = (snapshot) => seen.push(["snapshot", snapshot.phase]);
  adapter.cb.onRemoteProfile = (profile) => seen.push(["profile", profile.displayName, profile.side]);

  adapter.connect();
  socket.readyState = 1;

  socket.emit("message", { event: "connected", clientId: "c1", blueWaiting: 1, redWaiting: 3 });
  socket.emit("message", { event: "room_joined", roomCode: "ROOM1", created: true });
  socket.emit("message", { event: "player_joined", roomCode: "ROOM1", playerCount: 2 });
  socket.emit("message", { event: "match_ready", seed: 77, remoteSide: "red", serverNow: 1000, startAt: 1500 });
  socket.emit("message", { event: "message", senderId: "other", messageType: "profile", value: JSON.stringify({ displayName: "Rin", side: "red", playerId: "p2" }) });
  socket.emit("message", { event: "message", senderId: "other", messageType: "match_snapshot", value: JSON.stringify({ matchId: "m1", phase: "live", timerMsRemaining: 1000, players: {}, slots: {} }) });

  assertEqual(seen[0][0], "queue");
  assertEqual(seen[1][0], "connected");
  assertEqual(seen[2][0], "created");
  assertEqual(seen[3][0], "presence");
  assertEqual(seen[3][1], 2);
  assertEqual(seen[4][0], "ready");
  assertEqual(seen[5][0], "profile");
  assertEqual(seen[6][0], "snapshot");
});

test("adapter sends room_message payloads for profile, intent, snapshot, and match events", () => {
  let socket = null;
  const adapter = createRemoteMatchAdapter({
    socketFactory(url) {
      socket = createFakeSocket(url);
      return socket;
    },
    locationLike: { protocol: "http:", hostname: "localhost" }
  });

  adapter.setIdentity({ playerId: "p1", displayName: "Devon" });
  adapter.connect();
  socket.readyState = 1;

  adapter.sendProfile("blue");
  adapter.sendIntent({ intentType: "ROTATE_TILE", slotId: "blue_route_02_rp_2" });
  adapter.sendSnapshot({ matchId: "m1", phase: "live", timerMsRemaining: 999, players: {}, slots: {} });
  adapter.sendMatchEvent({ eventType: "route_resolved", routeId: "blue_route_02" });

  assertEqual(socket.sent[0].type, "room_message");
  assertEqual(socket.sent[0].messageType, "profile");
  assertEqual(socket.sent[1].messageType, "circuit_intent");
  assertEqual(socket.sent[2].messageType, "match_snapshot");
  assertEqual(socket.sent[3].messageType, "match_event");
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
