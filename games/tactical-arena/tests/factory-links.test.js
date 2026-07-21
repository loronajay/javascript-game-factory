import test from "node:test";
import assert from "node:assert/strict";

import { factoryMessagesUrl, factoryPlayerUrl } from "../src/platform/factoryLinks.js";

const HREF = "https://factory.example/games/tactical-arena/index.html";

test("factoryPlayerUrl deep-links to the /player profile two levels up", () => {
  const url = factoryPlayerUrl("player-42", { currentHref: HREF });
  assert.equal(url, "https://factory.example/player/index.html?id=player-42");
});

test("factoryPlayerUrl returns null for a blank id", () => {
  assert.equal(factoryPlayerUrl("", { currentHref: HREF }), null);
  assert.equal(factoryPlayerUrl("   ", { currentHref: HREF }), null);
  assert.equal(factoryPlayerUrl(null, { currentHref: HREF }), null);
});

test("factoryMessagesUrl deep-links to the messages thread with player + optional name", () => {
  assert.equal(
    factoryMessagesUrl("player-42", { currentHref: HREF }),
    "https://factory.example/messages/index.html?player=player-42",
  );
  assert.equal(
    factoryMessagesUrl("player-42", { name: "War Chief", currentHref: HREF }),
    "https://factory.example/messages/index.html?player=player-42&name=War+Chief",
  );
});

test("factoryMessagesUrl returns null for a blank id", () => {
  assert.equal(factoryMessagesUrl("", { currentHref: HREF }), null);
});

test("ids and names are URL-encoded", () => {
  const url = factoryMessagesUrl("a b/c", { name: "x&y", currentHref: HREF });
  assert.ok(url.includes("player=a+b%2Fc"));
  assert.ok(url.includes("name=x%26y"));
});
