import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATARS,
  decoratePlayer,
  deriveDisplayScreen,
  deriveControllerScreen,
  getAvatar,
  makeServerUrl
} from "./jaybox-client-model.mjs";
import { getCabinet, getCatalog } from "./cabinets/registry.mjs";

test("the display moves from catalog to lobby to match using server state alone", () => {
  assert.equal(deriveDisplayScreen({}), "catalog");
  assert.equal(deriveDisplayScreen({ lobby: { status: "open" } }), "lobby");
  assert.equal(deriveDisplayScreen({ match: { phase: "anything" } }), "match");
});

test("the controller screen is game-agnostic: reconnect, then join, lobby, match", () => {
  assert.equal(deriveControllerScreen({ reconnecting: true }), "reconnect");
  assert.equal(deriveControllerScreen({}), "join");
  assert.equal(deriveControllerScreen({ lobby: { status: "open" } }), "lobby");
  assert.equal(deriveControllerScreen({ match: { phase: "anything" }, lobby: {} }), "match");
});

test("the server url uses explicit overrides before environment defaults", () => {
  assert.equal(
    makeServerUrl({ protocol: "https:", hostname: "jaybox.example", search: "?server=ws%3A%2F%2Flocalhost%3A3000" }),
    "ws://localhost:3000"
  );
  assert.equal(
    makeServerUrl({ protocol: "https:", hostname: "jaybox.example" }, { serverUrl: "wss://staging.example/ws" }),
    "wss://staging.example/ws"
  );
});

test("the default server url targets local dev only on local pages", () => {
  assert.equal(makeServerUrl({ protocol: "http:", hostname: "localhost" }), "ws://localhost:3000");
  assert.equal(makeServerUrl({ protocol: "http:", hostname: "127.0.0.1" }), "ws://127.0.0.1:3000");
  assert.equal(makeServerUrl({ protocol: "file:", hostname: "" }), "ws://localhost:3000");
  assert.equal(makeServerUrl({ protocol: "https:", hostname: "jaybox.example" }), "wss://factory-network-server-production.up.railway.app");
});

test("avatar catalog provides enough unique controller choices", () => {
  assert.equal(AVATARS.length >= 12, true);
  assert.equal(new Set(AVATARS.map((avatar) => avatar.id)).size, AVATARS.length);
});

test("player decoration uses chosen avatars and stable fallbacks", () => {
  const chosen = decoratePlayer({ id: "player-1", name: "Mira", avatarId: "ember" });
  assert.equal(chosen.name, "Mira");
  assert.equal(chosen.avatar.id, "ember");

  const fallbackA = decoratePlayer({ id: "player-2", name: "Rook" });
  const fallbackB = decoratePlayer({ id: "player-2", name: "Rook" });
  assert.equal(fallbackA.avatar.id, fallbackB.avatar.id);
  assert.equal(getAvatar("not-real").id, AVATARS[0].id);
});

test("the cabinet registry hosts multiple games and resolves them by gameId", () => {
  const ids = getCatalog().map((cabinet) => cabinet.gameId);
  assert.ok(ids.includes("pot-of-greed"));
  assert.ok(ids.includes("questionable-decisions"));
  assert.equal(getCabinet("pot-of-greed").title, "Pot of Greed");
  assert.equal(getCabinet("questionable-decisions").title, "Questionable Decisions");
  assert.equal(getCabinet("not-a-game"), null);

  // Every cabinet honors the uniform interface the shell dispatches to.
  for (const cabinet of getCatalog()) {
    for (const method of ["renderDisplayMatch", "deriveMatchScreen", "renderControllerMatch", "applyMessage", "wire"]) {
      assert.equal(typeof cabinet[method], "function", `${cabinet.gameId} must implement ${method}`);
    }
  }
});
