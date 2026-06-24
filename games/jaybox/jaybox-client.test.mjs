import assert from "node:assert/strict";
import test from "node:test";
import { deriveDisplayScreen, deriveControllerScreen, makeServerUrl } from "./jaybox-client-model.mjs";

test("the display moves from catalog to lobby to game using server events", () => {
  assert.equal(deriveDisplayScreen({}), "catalog");
  assert.equal(deriveDisplayScreen({ lobby: { status: "open" } }), "lobby");
  assert.equal(deriveDisplayScreen({ match: { phase: "hidden_vault_action" } }), "match");
});

test("controller state prioritizes reconnect and then the server-authoritative game phase", () => {
  assert.equal(deriveControllerScreen({ reconnecting: true }), "reconnect");
  assert.equal(deriveControllerScreen({ lobby: { status: "open" } }), "lobby");
  assert.equal(deriveControllerScreen({ match: { phase: "hidden_vault_action" }, me: { status: "active" } }), "vault_action");
  assert.equal(deriveControllerScreen({ match: { phase: "hidden_vote" }, me: { status: "jury" } }), "vote");
});

test("the default local server url follows the page protocol and host", () => {
  assert.equal(makeServerUrl({ protocol: "http:", hostname: "localhost" }), "ws://localhost:3000");
  assert.equal(makeServerUrl({ protocol: "https:", hostname: "jaybox.example" }), "wss://jaybox.example:3000");
});
