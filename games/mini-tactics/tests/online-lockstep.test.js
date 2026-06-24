import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { hashState } from "../src/core/state-hash.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { concede } from "../src/core/commands.js";

// Headless validation of the ONLINE deterministic-lockstep contract (see
// src/online/onlineSession.js). The real game never sends rendered state — each
// client applies its own accepted command and broadcasts the COMMAND; every peer
// replays it through the same seeded reducer. This harness proves that contract
// holds end-to-end (now for 2-4 players, FFA + teams) without a browser or the
// live relay:
//
//   * N INDEPENDENT match states (one per seat) built from one shared seed.
//   * Accepted commands cross a relay with jittered async latency, exercising the
//     fact that delivery timing must not change the result.
//   * After every applied command ALL N states must be byte-identical (equal
//     state hash, the same FNV check the lobby owner broadcasts for desync detection).
//   * Every client independently agrees on each move and on the final winner.
//   * A mid-match disconnect is modelled as the owner injecting `concede(seat)`
//     into the same ordered command stream — the surviving clients must stay in
//     lockstep and reach a consistent winner.
//
// A real desync bug (RNG divergence, order sensitivity, non-determinism in the
// reducer or AI) would surface here as a hash mismatch or a rejected command —
// this is the test that lets us trust online before any "it works" claim.

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random small latency per delivered command. Timing only — it must never change
// the logical outcome, which is exactly what the assertions guard.
function jitter() {
  return Math.floor(Math.random() * 3);
}

function applyAccepted(match, command) {
  const result = applyCommand(match, command);
  assert.equal(
    result.accepted,
    true,
    `command ${command.type} rejected (${result.errorCode}) — desync`,
  );
  return result.nextState;
}

// Every live client must hold a byte-identical state — the core lockstep invariant.
function assertSynced(clients, label) {
  const ref = hashState(clients[0].match);
  for (const c of clients) {
    assert.equal(hashState(c.match), ref, `state hash diverged after ${label} (seat ${c.seat})`);
  }
}

// Broadcast one accepted command to EVERY live client (the originator already
// "applied locally"; the rest replay it), then assert they are all still in sync.
async function broadcast(clients, command, latency) {
  for (const c of clients) {
    if (latency) await delay(jitter());
    c.match = applyAccepted(c.match, command);
  }
  assertSynced(clients, command.type);
}

// Drive one seat's full squad turn. The seat's own client plans from its OWN state
// (proving the states are genuinely in sync — a divergent state would plan a
// different move), then each command is broadcast to all clients.
async function takeSquadTurn(clients, actorSeat, latency) {
  const actor = clients.find((c) => c.seat === actorSeat);
  let guard = 0;
  while (
    actor.match.phase === "playing" &&
    actor.match.currentPlayer === actorSeat &&
    guard < 64
  ) {
    guard += 1;
    const commands = chooseActivation(actor.match, {
      difficulty: "normal", // greedy ⇒ deterministic decisions from equal state
      cpuPlayer: actorSeat,
      rng: cpuRng(actor.match),
    });
    assert.ok(commands.length > 0, "a living squad always has a move");

    for (const command of commands) {
      await broadcast(clients, command, latency);
      if (actor.match.phase === "complete") return;
    }
  }
  assert.ok(guard < 64, "squad turn terminated");
}

function buildClients({ seed, size, playerCount, format, teamColors, compositions }) {
  const clients = [];
  for (let seat = 1; seat <= playerCount; seat += 1) {
    clients.push({
      seat,
      match: createMatchState({
        seed,
        size,
        mode: "online",
        playerCount,
        format,
        teamColors,
        compositions,
      }),
    });
  }
  return clients;
}

async function playLockstepMatch({
  seed,
  size,
  playerCount = 2,
  format = "ffa",
  teamColors = null,
  compositions = null,
  latency = false,
}) {
  const clients = buildClients({ seed, size, playerCount, format, teamColors, compositions });

  // Same starting position on every client before a single command is exchanged.
  assertSynced(clients, "initial state");

  let guard = 0;
  while (clients[0].match.phase === "playing" && guard < 2000) {
    guard += 1;
    // Every client agrees on whose turn it is (guaranteed by hash-equality above).
    await takeSquadTurn(clients, clients[0].match.currentPlayer, latency);
  }

  assertSynced(clients, "final state");
  const winner = clients[0].match.winner;
  assert.equal(clients[0].match.phase, "complete", "match reached a clean finish");
  assert.notEqual(winner, null, "a winner was decided");
  for (const c of clients) {
    assert.equal(c.match.winner, winner, `seat ${c.seat} agrees on the winner`);
  }
  return winner;
}

// ── 1v1 (a 2-player lobby) ───────────────────────────────────────────────────
// Breadth: a spread of seeds (different dice streams) over both board sizes. A
// single seed could mask an order-sensitive bug; the spread makes a real desync
// near-certain to trip at least one case.
for (const size of [10, 13]) {
  for (const seed of [1, 7, 42, 1000, 31337]) {
    test(`online lockstep stays in sync over a full 2P match (size ${size}, seed ${seed})`, async () => {
      await playLockstepMatch({ seed, size, playerCount: 2 });
    });
  }
}

// ── 3-4 player FFA + 2v2 teams (always 13×13 per the locked board rule) ───────
for (const seed of [1, 7, 42, 1000, 31337]) {
  test(`online lockstep stays in sync over a full 3P FFA match (seed ${seed})`, async () => {
    await playLockstepMatch({ seed, size: 13, playerCount: 3, format: "ffa" });
  });
  test(`online lockstep stays in sync over a full 4P FFA match (seed ${seed})`, async () => {
    await playLockstepMatch({ seed, size: 13, playerCount: 4, format: "ffa" });
  });
  test(`online lockstep stays in sync over a full 4P teams match (seed ${seed})`, async () => {
    await playLockstepMatch({
      seed,
      size: 13,
      playerCount: 4,
      format: "teams",
      teamColors: { 1: "#3fa9f5", 2: "#f5a623" },
    });
  });
}

// Latency proof: replay a few N-player matches across a relay with real jittered
// async delivery, demonstrating that delivery timing cannot change the outcome.
for (const cfg of [
  { size: 10, playerCount: 2, format: "ffa", seed: 31337 },
  { size: 13, playerCount: 3, format: "ffa", seed: 42 },
  { size: 13, playerCount: 4, format: "teams", teamColors: { 1: "#3fa9f5", 2: "#f5a623" }, seed: 7 },
]) {
  test(`online lockstep survives jittered latency (${cfg.playerCount}P ${cfg.format}, seed ${cfg.seed})`, async () => {
    await playLockstepMatch({ ...cfg, latency: true });
  });
}

// ── Mid-match disconnect: owner injects concede(droppedSeat) ───────────────────
// Models the production rule (onlineSession.onPlayerLeft): when a player drops, the
// remaining lobby owner injects a `concede` command for that seat into the SAME
// ordered command stream. The departed client is gone; the survivors must stay in
// perfect lockstep and resolve to a consistent winner. We drop a NON-current,
// still-alive seat (so the match continues) at a turn boundary.
async function playWithMidMatchDrop({ seed, size, playerCount, format, teamColors }) {
  let clients = buildClients({ seed, size, playerCount, format, teamColors });
  assertSynced(clients, "initial state");

  let dropped = false;
  let guard = 0;
  while (clients[0].match.phase === "playing" && guard < 2000) {
    guard += 1;
    const ref = clients[0].match;

    // After a couple of turns, drop one non-current seat that still has units.
    if (!dropped && ref.turnNumber >= playerCount) {
      const current = ref.currentPlayer;
      const aliveSeats = ref.players
        .map((p) => p.id)
        .filter((id) => id !== current && ref.units.some((u) => u.player === id && u.hp > 0));
      if (aliveSeats.length > 0) {
        dropped = true;
        const dropSeat = aliveSeats[0];
        // Surviving "owner" is the first remaining client (never the dropped seat).
        clients = clients.filter((c) => c.seat !== dropSeat);
        await broadcast(clients, concede(dropSeat), false);
        if (clients[0].match.phase === "complete") break;
        continue;
      }
    }

    await takeSquadTurn(clients, clients[0].match.currentPlayer, false);
  }

  assert.ok(dropped, "the disconnect was actually injected");
  assertSynced(clients, "final state after drop");
  const winner = clients[0].match.winner;
  assert.equal(clients[0].match.phase, "complete", "match resolved after a mid-match drop");
  assert.notEqual(winner, null, "a winner was decided after the drop");
  for (const c of clients) {
    assert.equal(c.match.winner, winner, `surviving seat ${c.seat} agrees on the winner`);
  }
}

for (const seed of [1, 42, 31337]) {
  test(`online lockstep survives a mid-match disconnect in 3P FFA (seed ${seed})`, async () => {
    await playWithMidMatchDrop({ seed, size: 13, playerCount: 3, format: "ffa" });
  });
  test(`online lockstep survives a mid-match disconnect in 4P teams (seed ${seed})`, async () => {
    await playWithMidMatchDrop({
      seed,
      size: 13,
      playerCount: 4,
      format: "teams",
      teamColors: { 1: "#3fa9f5", 2: "#f5a623" },
    });
  });
}

// ── Blind-pick custom squads (asymmetric compositions exchanged over the relay) ─
// Each pairing is keyed by seat and handed to BOTH clients, modelling the post-
// exchange state. Aggressive comps so matches resolve decisively within the guard.
const CUSTOM_PAIRINGS = [
  { 1: ["ranger", "ranger", "warrior", "tank"], 2: ["tank", "warrior", "warrior", "ranger"] },
  { 1: ["warrior", "warrior", "warrior", "warrior"], 2: ["ranger", "ranger", "tank", "tank"] },
  { 1: ["ranger", "tank", "warrior", "medic"], 2: ["medic", "warrior", "tank", "ranger"] },
];

for (const size of [10, 13]) {
  CUSTOM_PAIRINGS.forEach((compositions, index) => {
    test(`online lockstep stays in sync with custom squads (size ${size}, pairing ${index})`, async () => {
      await playLockstepMatch({ seed: 42, size, playerCount: 2, compositions });
    });
  });
}

test("a custom squad actually spawns its chosen units in the synced state", () => {
  const compositions = { 1: ["ranger", "ranger", "ranger", "warrior"] };
  const host = createMatchState({ size: 10, seed: 1, mode: "online", compositions });
  const guest = createMatchState({ size: 10, seed: 1, mode: "online", compositions });
  // The custom squad is present (not silently dropped) and identical on both sides.
  const p1Rangers = host.units.filter((u) => u.player === 1 && u.type === "ranger");
  assert.equal(p1Rangers.length, 3, "host built the 3-ranger squad");
  assert.equal(hashState(host), hashState(guest), "both clients agree on the custom squad");
});

test("custom squads survive jittered network latency in lockstep", async () => {
  await playLockstepMatch({
    seed: 31337,
    size: 13,
    playerCount: 2,
    latency: true,
    compositions: CUSTOM_PAIRINGS[0],
  });
});

// Determinism guarantee the lockstep relies on: the very same seed + the very
// same command stream reproduces the exact same final state hash, independent of
// the (random) delivery latency above. Exercised here for a 4-player FFA game.
test("a replayed command stream reproduces an identical final hash (4P FFA)", async () => {
  const seed = 24680;
  const cfg = { size: 13, seed, mode: "online", playerCount: 4, format: "ffa" };
  // Capture the canonical command log from one deterministic playthrough.
  const log = [];
  {
    let match = createMatchState(cfg);
    let guard = 0;
    while (match.phase === "playing" && guard < 8000) {
      guard += 1;
      const player = match.currentPlayer;
      const commands = chooseActivation(match, {
        difficulty: "normal",
        cpuPlayer: player,
        rng: cpuRng(match),
      });
      for (const command of commands) {
        log.push(command);
        match = applyAccepted(match, command);
        if (match.phase === "complete") break;
      }
    }
    assert.equal(match.phase, "complete");
  }

  // Replay that exact log onto two fresh same-seed states — must land bit-identical.
  let a = createMatchState(cfg);
  let b = createMatchState(cfg);
  for (const command of log) {
    a = applyAccepted(a, command);
    b = applyAccepted(b, command);
    assert.equal(hashState(a), hashState(b), "replay diverged mid-stream");
  }
  assert.equal(a.phase, "complete");
  assert.equal(hashState(a), hashState(b), "replay final hash matches");
});
