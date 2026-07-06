import test from "node:test";
import assert from "node:assert/strict";

import { normalizeRoomCode, resolveWebSocketUrl } from "../src/online/onlineClient.js";
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
