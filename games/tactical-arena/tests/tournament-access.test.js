import test from "node:test";
import assert from "node:assert/strict";

import {
  TOURNAMENT_ACCESS_SESSION_KEY,
  TOURNAMENT_PLAYER_NAME_SESSION_KEY,
  activateTournamentAccess,
  activateTournamentAccessFromUrl,
  deactivateTournamentAccess,
  isTournamentAccessActive,
  readTournamentPlayerName,
  saveTournamentPlayerName,
  verifyTournamentAccessCode,
} from "../src/tournament/tournamentAccess.js";

function storageAdapter() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("tournament access verifies a trimmed, case-sensitive organizer code", async () => {
  const digest = async (value) => value === "Iron Crown" ? "expected" : "wrong";

  assert.equal(await verifyTournamentAccessCode("  Iron Crown  ", { digest, expectedHash: "expected" }), true);
  assert.equal(await verifyTournamentAccessCode("iron crown", { digest, expectedHash: "expected" }), false);
  assert.equal(await verifyTournamentAccessCode("", { digest, expectedHash: "expected" }), false);
});

test("activation is session-only and a bad code never writes access", async () => {
  const storage = storageAdapter();
  const digest = async (value) => value === "correct" ? "expected" : "wrong";

  assert.equal(isTournamentAccessActive(storage), false);
  assert.equal((await activateTournamentAccess("wrong", { storage, digest, expectedHash: "expected" })).activated, false);
  assert.equal(storage.values.has(TOURNAMENT_ACCESS_SESSION_KEY), false);

  assert.equal((await activateTournamentAccess("correct", { storage, digest, expectedHash: "expected" })).activated, true);
  assert.equal(isTournamentAccessActive(storage), true);

  deactivateTournamentAccess({ storage });
  assert.equal(isTournamentAccessActive(storage), false);
});

test("a URL fragment can activate tournament access without leaving the code in browser history", async () => {
  const storage = storageAdapter();
  const replaced = [];
  const location = {
    href: "https://factory.example/games/tactical-arena/index.html?relay=prod#tournament=event-code",
  };
  const history = { replaceState: (...args) => replaced.push(args) };
  const digest = async (value) => value === "event-code" ? "expected" : "wrong";

  const result = await activateTournamentAccessFromUrl({
    storage,
    location,
    history,
    digest,
    expectedHash: "expected",
  });

  assert.equal(result.activated, true);
  assert.equal(isTournamentAccessActive(storage), true);
  assert.deepEqual(replaced, [[null, "", "/games/tactical-arena/index.html?relay=prod"]]);
});

test("tournament player names are sanitized and kept in session storage", () => {
  const storage = storageAdapter();

  assert.equal(saveTournamentPlayerName("  Player   One with a very long suffix  ", storage), "Player One with a");
  assert.equal(readTournamentPlayerName(storage), "Player One with a");
  assert.equal(storage.values.has(TOURNAMENT_PLAYER_NAME_SESSION_KEY), true);
});
