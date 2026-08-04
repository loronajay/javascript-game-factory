import test from "node:test";
import assert from "node:assert/strict";

import {
  TOURNAMENT_PLAYER_LINK_ACCESS_CODE,
  assignmentForSeat,
  buildTournamentPlayerLink,
  createTournamentAssignment,
  createTournamentMatchmakingOptions,
  doesTournamentSettingsMatchAssignment,
  parseTournamentPlayerAssignment,
  readTournamentAssignments,
  saveTournamentAssignments,
} from "../src/tournament/tournamentAssignments.js";

function storageAdapter() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("an organizer fixture fixes two named competitors without creating a relay lobby", () => {
  const fixture = createTournamentAssignment({
    fixtureId: "round-1-table-1",
    label: "Round 1 · Table 1",
    playerOne: "Alice",
    playerTwo: "Bob",
  });

  assert.deepEqual(fixture, {
    fixtureId: "round-1-table-1",
    label: "Round 1 · Table 1",
    players: ["Alice", "Bob"],
  });
  assert.deepEqual(assignmentForSeat(fixture, 1), {
    ...fixture,
    seat: 1,
    player: "Alice",
    opponent: "Bob",
  });
  assert.deepEqual(assignmentForSeat(fixture, 2), {
    ...fixture,
    seat: 2,
    player: "Bob",
    opponent: "Alice",
  });
});

test("seat-specific player links carry the same fixture but different assigned identities", () => {
  const fixture = createTournamentAssignment({
    fixtureId: "semi-a",
    label: "Semifinal A",
    playerOne: "Alice",
    playerTwo: "Bob",
  });
  const firstLink = buildTournamentPlayerLink("https://factory.example/games/tactical-arena/index.html?relay=prod", fixture, 1);
  const secondLink = buildTournamentPlayerLink("https://factory.example/games/tactical-arena/index.html?relay=prod", fixture, 2);

  assert.match(firstLink, new RegExp(`tournament=${TOURNAMENT_PLAYER_LINK_ACCESS_CODE}`));
  assert.equal(parseTournamentPlayerAssignment(firstLink).player, "Alice");
  assert.equal(parseTournamentPlayerAssignment(firstLink).seat, 1);
  assert.equal(parseTournamentPlayerAssignment(secondLink).player, "Bob");
  assert.equal(parseTournamentPlayerAssignment(secondLink).seat, 2);
  assert.equal(parseTournamentPlayerAssignment(firstLink).fixtureId, parseTournamentPlayerAssignment(secondLink).fixtureId);
});

test("both assigned players enter one isolated fixture queue while other matches use another", () => {
  const fixtureA = createTournamentAssignment({ fixtureId: "match-a", playerOne: "Alice", playerTwo: "Bob" });
  const fixtureB = createTournamentAssignment({ fixtureId: "match-b", playerOne: "Cora", playerTwo: "Drew" });
  const a1 = createTournamentMatchmakingOptions(assignmentForSeat(fixtureA, 1));
  const a2 = createTournamentMatchmakingOptions(assignmentForSeat(fixtureA, 2));
  const b1 = createTournamentMatchmakingOptions(assignmentForSeat(fixtureB, 1));

  assert.deepEqual(a1, a2, "arrival order must not change the fixture queue");
  assert.notDeepEqual(a1.settings, b1.settings, "simultaneous fixtures must never share a queue");
  assert.equal(a1.minPlayers, 2);
  assert.equal(a1.maxPlayers, 2);
  assert.notEqual(a1.settings.matchType, "draft1v1");
  assert.equal(a1.settings.matchType.length <= 32, true);
});

test("an assigned player still recognizes their fixture after relay sanitization", () => {
  const fixture = createTournamentAssignment({ fixtureId: "match-a", playerOne: "Alice", playerTwo: "Bob" });
  const assigned = assignmentForSeat(fixture, 1);
  const localSettings = createTournamentMatchmakingOptions(assigned).settings;
  const relayedSettings = {
    penaltyWord: "ECHO",
    packId: "pack_01",
    runFormat: "canon_10_stage",
    matchType: localSettings.matchType,
    protocolVersion: 1,
  };

  assert.equal(doesTournamentSettingsMatchAssignment(assigned, relayedSettings), true);
  assert.equal(doesTournamentSettingsMatchAssignment(
    assigned,
    createTournamentMatchmakingOptions(assignmentForSeat(
      createTournamentAssignment({ fixtureId: "match-b", playerOne: "Cora", playerTwo: "Drew" }),
      1,
    )).settings,
  ), false);
});

test("the organizer desk keeps multiple fixtures in this browser session", () => {
  const storage = storageAdapter();
  const fixtures = [
    createTournamentAssignment({ fixtureId: "m1", playerOne: "A", playerTwo: "B" }),
    createTournamentAssignment({ fixtureId: "m2", playerOne: "C", playerTwo: "D" }),
  ];

  assert.deepEqual(saveTournamentAssignments(fixtures, storage), fixtures);
  assert.deepEqual(readTournamentAssignments(storage), fixtures);
});

test("invalid or duplicate competitors cannot become a fixture", () => {
  assert.equal(createTournamentAssignment({ fixtureId: "m1", playerOne: "", playerTwo: "Bob" }), null);
  assert.equal(createTournamentAssignment({ fixtureId: "m1", playerOne: "Alice", playerTwo: " alice " }), null);
});
