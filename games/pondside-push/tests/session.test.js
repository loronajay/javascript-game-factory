import test from "node:test";
import assert from "node:assert/strict";

import { ARENA_RADIUS, SHRINK_AFTER_SECONDS } from "../scripts/sim/match.js";
import { MATCH_LINGER_SECONDS, ROUND_LINGER_SECONDS, createSession, matchStandings, retireSeat, sessionBanner, stepSession } from "../scripts/sim/session.js";

const pet = (id) => ({ instanceId: id, name: id, speciesId: "pet.corgi", paletteId: "standard", stats: { speed: 50, strength: 50, size: 1 } });
const seats = (count) => Array.from({ length: count }, (_, index) => ({ id: `seat-${index + 1}`, pet: pet(`p${index + 1}`) }));

function stepUntil(session, done, limit = 60 * 120) {
  for (let tick = 0; tick < limit && !done(session); tick += 1) stepSession(session, {}, 1 / 60);
}

test("a session counts a round in, holds the pets still, then lets them go", () => {
  const session = createSession({ entrants: seats(2) });
  assert.equal(session.phase, "countdown");
  assert.equal(sessionBanner(session), "ROUND 1 · 3");
  stepSession(session, { "seat-1": { x: 1, y: 0 } });
  assert.equal(session.match.players[0].vx, 0, "input is ignored during the countdown");
  stepUntil(session, (current) => current.phase === "playing");
  stepSession(session, { "seat-1": { x: 1, y: 0 } });
  assert.ok(session.match.players[0].vx > 0);
});

test("a splash pauses the island, then the next round starts by itself with the score kept", () => {
  const session = createSession({ entrants: seats(2) });
  stepUntil(session, (current) => current.phase === "playing");
  session.match.players[1].x = ARENA_RADIUS + 80;
  stepSession(session);
  assert.equal(session.phase, "round-over");
  assert.equal(session.match.roundWinnerId, "seat-1");
  for (let tick = 0; tick < Math.ceil(ROUND_LINGER_SECONDS * 60) + 1; tick += 1) stepSession(session);
  assert.equal(session.phase, "countdown");
  assert.equal(session.match.round, 2);
  assert.equal(session.match.players[0].wins, 1);
});

test("a match ends, lingers, and completes; standings lead with the winner", () => {
  const session = createSession({ entrants: seats(3), winsToMatch: 1 });
  stepUntil(session, (current) => current.phase === "playing");
  session.match.players[1].x = ARENA_RADIUS + 80;
  session.match.players[2].x = -ARENA_RADIUS - 80;
  stepSession(session);
  assert.equal(session.phase, "match-over");
  assert.equal(matchStandings(session)[0].id, "seat-1");
  for (let tick = 0; tick < Math.ceil(MATCH_LINGER_SECONDS * 60) + 1; tick += 1) stepSession(session);
  assert.equal(session.phase, "complete");
});

test("the island shrinks in a long round, so a stand-off always ends", () => {
  const session = createSession({ entrants: seats(2) });
  stepUntil(session, (current) => current.phase !== "countdown");
  stepUntil(session, (current) => current.match.roundTicks / 60 > SHRINK_AFTER_SECONDS + 2);
  assert.ok(session.match.islandRadius < ARENA_RADIUS);
  stepUntil(session, (current) => current.phase !== "playing");
  assert.notEqual(session.phase, "playing", "two pets standing still cannot outlast the island");
});

test("a seat that leaves goes in the water and stays out; one seat left wins the match", () => {
  const session = createSession({ entrants: seats(3) });
  stepUntil(session, (current) => current.phase === "playing");
  assert.equal(retireSeat(session, "seat-2"), true);
  assert.equal(session.match.players[1].eliminated, true);
  assert.equal(session.phase, "playing");
  retireSeat(session, "seat-3");
  assert.equal(session.phase, "match-over");
  assert.equal(session.match.matchWinnerId, "seat-1");
});

test("the same seed and inputs replay the same match (the server and a client agree)", () => {
  const entrants = [{ id: "a", pet: pet("a"), cpu: "pro" }, { id: "b", pet: pet("b"), cpu: "champion" }, { id: "c", pet: pet("c") }];
  const run = () => {
    const session = createSession({ entrants, seed: 99 });
    for (let tick = 0; tick < 60 * 30; tick += 1) stepSession(session, { c: { x: Math.sin(tick / 40), y: Math.cos(tick / 55), bump: tick % 90 === 0 } });
    return JSON.stringify(session.match.players.map((player) => [player.x, player.y, player.wins, player.eliminated]));
  };
  assert.equal(run(), run());
});
