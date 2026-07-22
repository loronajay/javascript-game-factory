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
      skins: ["summer-vibes", null, null, "summer-vibes"],
      nicknames: ["Leo", null, null, null]
    });
    assert.deepEqual(sent, [{
      type: "lobby_message",
      messageType: "setup",
      value: JSON.stringify({
        seat: 1,
        composition: ["swordsman", "archer", "mystic", "magician"],
        skins: ["summer-vibes", null, null, "summer-vibes"],
        nicknames: ["Leo", null, null, null]
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

test("online draft pick payload relays the pick index and unit type", () => {
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
    client.sendDraftPick({ pickIndex: 3, seat: 1, type: "magician", skin: "summer-vibes", nickname: "Leo" });
    assert.deepEqual(sent, [{
      type: "lobby_message",
      messageType: "draft_pick",
      value: JSON.stringify({ pickIndex: 3, seat: 1, type: "magician", skin: "summer-vibes", nickname: "Leo" })
    }]);
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("online lobby search includes match type settings for separate queues", () => {
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
    client.findLobby({ minPlayers: 2, maxPlayers: 2, settings: { matchType: "draft1v1" } });
    assert.equal(sent[0].type, "find_lobby");
    assert.equal(sent[0].gameId, "tactical-arena");
    assert.equal(sent[0].settings.matchType, "draft1v1");
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("online lobby search carries sanitized ranked profile metadata", () => {
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
    client.setIdentity({
      playerId: "player-1",
      displayName: "Factory Pilot",
      rankedProfile: {
        title: "  Corner camper   but legal  ",
        avatarUnit: "necromancer",
        avatarSkin: "blood-moon",
        tier: { id: "gold", label: "Gold" },
        rating: 1337.4,
        wins: 12,
        losses: 3,
        draws: 1,
      },
    });
    client.findLobby({ minPlayers: 2, maxPlayers: 2, settings: { ranked: true } });

    assert.equal(sent[0].identity.displayName, "Factory Pilot");
    assert.deepEqual(sent[0].identity.rankedProfile, {
      title: "Corner camper but legal",
      tagline: "Corner camper but legal",
      avatarUnit: "necromancer",
      avatarSkin: "blood-moon",
      tier: { id: "gold", label: "Gold" },
      rating: 1337,
      wins: 12,
      losses: 3,
      draws: 1,
    });
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

test("online client parses remote draft picks", () => {
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
    const picks = [];
    client.cb.onRemoteDraftPick = (payload) => picks.push(payload);
    client.connect();
    messageHandler({
      data: JSON.stringify({
        event: "message",
        scope: "lobby",
        senderId: "c_guest",
        messageType: "draft_pick",
        value: JSON.stringify({ pickIndex: 1, seat: 2, type: "archer", skin: "summer-vibes", nickname: "Ryan" })
      })
    });
    assert.deepEqual(picks, [{ pickIndex: 1, seat: 2, type: "archer", skin: "summer-vibes", nickname: "Ryan" }]);
  } finally {
    globalThis.WebSocket = previous;
  }
});

test("online client parses remote ranked profile messages", () => {
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
    const profiles = [];
    client.cb.onRemoteProfile = (payload) => profiles.push(payload);
    client.connect();
    messageHandler({
      data: JSON.stringify({
        event: "message",
        scope: "lobby",
        senderId: "c_guest",
        messageType: "profile",
        value: JSON.stringify({
          playerId: "opponent-1",
          displayName: "Rival Pilot",
          seat: 2,
          rankedProfile: {
            tagline: "Never skips ban phase",
            avatarUnit: "archer",
            tier: { id: "silver", label: "Silver" },
            rating: 1249,
          },
        })
      })
    });

    assert.deepEqual(profiles, [{
      playerId: "opponent-1",
      displayName: "Rival Pilot",
      seat: 2,
      rankedProfile: {
        title: "Never skips ban phase",
        tagline: "Never skips ban phase",
        avatarUnit: "archer",
        avatarSkin: null,
        tier: { id: "silver", label: "Silver" },
        rating: 1249,
        wins: 0,
        losses: 0,
        draws: 0,
      },
    }]);
  } finally {
    globalThis.WebSocket = previous;
  }
});
