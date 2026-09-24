import test from "node:test";
import assert from "node:assert/strict";

import { buildTicketResult } from "../src/game/ticketResult.js";

const ID = "mt-lx2k9c-1a2b3c4d";

function summary(overrides = {}) {
  return {
    winner: 1,
    mode: "single",
    format: "ffa",
    size: 10,
    playerCount: 2,
    compositions: null,
    turns: 22,
    victoryReason: "squad-eliminated",
    durationMs: 540_000.7,
    difficulty: "hard",
    ...overrides,
  };
}

test("a CPU match reports the difficulty and the outcome from the player's team", () => {
  assert.deepEqual(buildTicketResult({ summary: summary(), myTeam: 1, resultId: ID }), {
    resultId: ID,
    mode: "cpu",
    difficulty: "hard",
    outcome: "win",
    playerCount: 2,
    format: "ffa",
    boardSize: 10,
    turns: 22,
    durationMs: 540_000,
  });
  assert.equal(buildTicketResult({ summary: summary({ winner: 2 }), myTeam: 1, resultId: ID }).outcome, "loss");
});

test("an online match reports the table and no difficulty", () => {
  const payload = buildTicketResult({
    summary: summary({ mode: "online", format: "teams", playerCount: 4, size: 13, winner: 2 }),
    myTeam: 2,
    resultId: ID,
  });
  assert.equal(payload.mode, "online");
  assert.equal(payload.outcome, "win");
  assert.equal(payload.format, "teams");
  assert.equal(payload.playerCount, 4);
  assert.equal("difficulty" in payload, false);
});

test("modes the economy does not pay are never reported", () => {
  for (const mode of ["hotseat", "tutorial"]) {
    assert.equal(buildTicketResult({ summary: summary({ mode }), myTeam: 1, resultId: ID }), null);
  }
});

test("a match that did not complete by elimination is never reported", () => {
  const cases = [
    summary({ victoryReason: "concede" }),
    summary({ mode: "online", terminated: "disconnect" }),
    summary({ mode: "online", terminated: "desync", winner: null }),
  ];
  for (const entry of cases) assert.equal(buildTicketResult({ summary: entry, myTeam: 1, resultId: ID }), null);
});

test("a seat that conceded is not paid for watching the rest play out", () => {
  const entry = summary({ mode: "online", playerCount: 4, winner: 3 });
  assert.equal(buildTicketResult({ summary: entry, myTeam: 1, iConceded: true, resultId: ID }), null);
});

test("custom squads against the CPU are never reported", () => {
  const entry = summary({ compositions: { 1: ["warrior"], 2: ["medic"] } });
  assert.equal(buildTicketResult({ summary: entry, myTeam: 1, resultId: ID }), null);
});

test("nothing is reported without an id or a seat", () => {
  assert.equal(buildTicketResult({ summary: summary(), myTeam: 1, resultId: null }), null);
  assert.equal(buildTicketResult({ summary: summary(), myTeam: null, resultId: ID }), null);
});
