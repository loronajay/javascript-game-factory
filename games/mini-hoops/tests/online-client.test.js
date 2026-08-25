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

finish();
