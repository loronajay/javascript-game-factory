import test from "node:test";
import assert from "node:assert/strict";

import { createOnlineClient, normalizeRoomCode, resolveWebSocketUrl } from "../src/online/onlineClient.js";
import { ONLINE_RULESET_VERSION } from "../src/online/ruleset.js";

const PROD = "wss://factory-network-server-production.up.railway.app";

function locationLike({ protocol = "http:", hostname = "localhost", search = "" } = {}) {
  return { protocol, hostname, search };
}

function storageLike(value) {
  return {
    getItem: () => value,
  };
}

test("online client uses the production relay by default on localhost", () => {
  assert.equal(resolveWebSocketUrl(locationLike(), storageLike(null)), PROD);
  assert.equal(resolveWebSocketUrl(locationLike({ protocol: "https:", hostname: "jayarcade.example" }), storageLike(null)), PROD);
});

test("online client can explicitly target a local relay for same-machine testing", () => {
  assert.equal(resolveWebSocketUrl(locationLike({ search: "?relay=local" }), storageLike(null)), "ws://localhost:3000");
  assert.equal(
    resolveWebSocketUrl(locationLike({ protocol: "https:", hostname: "127.0.0.1", search: "?relay=local" }), storageLike(null)),
    "wss://127.0.0.1:3000",
  );
  assert.equal(resolveWebSocketUrl(locationLike(), storageLike("local")), "ws://localhost:3000");
});

test("online client accepts explicit websocket relay overrides", () => {
  assert.equal(
    resolveWebSocketUrl(locationLike({ search: "?relay=wss%3A%2F%2Frelay.example%2Fsocket" }), storageLike(null)),
    "wss://relay.example/socket",
  );
});

test("room codes normalize pasted or typed input to the server code shape", () => {
  assert.equal(normalizeRoomCode("ab cd-e"), "ABCDE");
  assert.equal(normalizeRoomCode(" 12o0!z9 "), "12O0Z");
  assert.equal(normalizeRoomCode(null), "");
});

test("online ruleset rejects pre-coin-flip client builds", () => {
  assert.ok(ONLINE_RULESET_VERSION > 1);
});

test("online setup payload relays skin selections with the squad composition", () => {
  const previous = globalThis.WebSocket;
  const sent = [];
  try {
    globalThis.WebSocket = class FakeWebSocket {
      static OPEN = 1;
      readyState = FakeWebSocket.OPEN;
      addEventListener() {}
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    };
    const client = createOnlineClient();
    client.connect();
    client.sendSetup({
      seat: 1,
      composition: ["swordsman", "archer", "mystic", "magician"],
      skins: ["summer-vibes", null, null, "summer-vibes"]
    });
    assert.deepEqual(sent, [{
      type: "lobby_message",
      messageType: "setup",
      value: JSON.stringify({
        seat: 1,
        composition: ["swordsman", "archer", "mystic", "magician"],
        skins: ["summer-vibes", null, null, "summer-vibes"]
      })
    }]);
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("online lock-in payload relays readiness without exposing the squad", () => {
  const previous = globalThis.WebSocket;
  const sent = [];
  try {
    globalThis.WebSocket = class FakeWebSocket {
      static OPEN = 1;
      readyState = FakeWebSocket.OPEN;
      addEventListener() {}
      send(payload) {
        sent.push(JSON.parse(payload));
      }
    };
    const client = createOnlineClient();
    client.connect();
    client.sendReady(true);
    client.sendReady(false);
    assert.deepEqual(sent, [
      {
        type: "lobby_message",
        messageType: "ready",
        value: JSON.stringify({ ready: true })
      },
      {
        type: "lobby_message",
        messageType: "ready",
        value: JSON.stringify({ ready: false })
      }
    ]);
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("online client parses remote squad lock-in readiness by sender", () => {
  const previous = globalThis.WebSocket;
  let messageHandler = null;
  try {
    globalThis.WebSocket = class FakeWebSocket {
      static OPEN = 1;
      readyState = FakeWebSocket.OPEN;
      addEventListener(type, handler) {
        if (type === "message") messageHandler = handler;
      }
      send() {}
    };
    const client = createOnlineClient();
    const ready = [];
    client.cb.onRemoteReady = (payload) => ready.push(payload);
    client.connect();
    messageHandler({
      data: JSON.stringify({
        event: "message",
        scope: "lobby",
        senderId: "c_guest",
        messageType: "ready",
        value: JSON.stringify({ ready: true })
      })
    });
    messageHandler({
      data: JSON.stringify({
        event: "message",
        scope: "lobby",
        senderId: "c_guest",
        messageType: "ready",
        value: JSON.stringify({ ready: false, composition: ["swordsman"] })
      })
    });
    assert.deepEqual(ready, [
      { clientId: "c_guest", ready: true },
      { clientId: "c_guest", ready: false }
    ]);
  } finally {
    globalThis.WebSocket = previous;
  }
});
