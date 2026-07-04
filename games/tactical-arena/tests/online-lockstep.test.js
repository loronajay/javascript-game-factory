import test from "node:test";
import assert from "node:assert/strict";

import { applyCommand } from "../src/core/reducer.js";
import { concede } from "../src/core/commands.js";
import { hashState } from "../src/core/state-hash.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { createMatchState } from "../src/match/matchBuilder.js";

// Headless validation of the ONLINE deterministic-lockstep contract (see
// src/online/onlineSession.js). The real game never sends rendered state — each
// client applies its own accepted command and broadcasts the COMMAND; every peer
// replays it through the same seeded reducer. This harness proves that contract
// holds end-to-end for the 1v1 (a 2-player lobby) format without a browser or the
// live relay:
//
//   * Two INDEPENDENT match states (one per seat) built from one shared seed.
//   * Accepted commands cross a relay with jittered async latency, exercising the
//     fact that delivery timing must not change the result.
//   * After every applied command BOTH states must be byte-identical (equal state
//     hash, the same FNV check the lobby owner broadcasts for desync detection).
//   * Both clients independently agree on each move and on the final winner.
//   * A mid-match concede (the disconnect model: the owner injects concede(seat))
//     replays identically on every client.
//
// A real desync bug (RNG divergence, order sensitivity, non-determinism in the
// reducer or AI) surfaces here as a hash mismatch or a rejected command — this is
// the test that lets us trust online before any "it works" claim.

const DEFAULT_SQUAD = ["swordsman", "archer", "mystic", "magician"];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random small latency per delivered command. Timing only — it must never change
// the logical outcome, which is exactly what the assertions guard.
function jitter() {
  return Math.floor(Math.random() * 3);
}

function buildClients({ seed, size, squads }) {
  const clients = [];
  for (let seat = 1; seat <= 2; seat += 1) {
    clients.push({ seat, match: createMatchState({ size, seed, squads }) });
  }
  return clients;
}

function applyAccepted(match, command) {
  const result = applyCommand(match, command);
  assert.equal(result.accepted, true, `command ${command.type} rejected (${result.errorCode}) — desync`);
  return result.nextState;
}

// Both live clients must hold a byte-identical state — the core lockstep invariant.
function assertSynced(clients, label) {
  const ref = hashState(clients[0].match);
  for (const c of clients) {
    assert.equal(hashState(c.match), ref, `state hash diverged after ${label} (seat ${c.seat})`);
  }
}

// Broadcast a known-valid command to BOTH clients (used for concede, which is
// accepted regardless of whose turn it is), then assert they are still in sync.
async function broadcast(clients, command, latency) {
  for (const c of clients) {
    if (latency) await delay(jitter());
    c.match = applyAccepted(c.match, command);
  }
  assertSynced(clients, command.type);
}

// The faithful lockstep contract: the ORIGINATOR applies a command locally first
// and broadcasts it ONLY if accepted. A planned follow-up can turn invalid on the
// originator's own board (e.g. a prior command ends the match before the
// queued ATTACK can open an activation), so in real play that command is simply never
// sent. Returns whether it was accepted/broadcast. A PEER rejecting an accepted
// command, by contrast, is a true desync and fails hard.
async function relay(clients, originatorSeat, command, latency) {
  const originator = clients.find((c) => c.seat === originatorSeat);
  const result = applyCommand(originator.match, command);
  if (!result.accepted) return false; // never broadcast a locally-rejected command
  originator.match = result.nextState;
  for (const c of clients) {
    if (c === originator) continue;
    if (latency) await delay(jitter());
    c.match = applyAccepted(c.match, command);
  }
  assertSynced(clients, command.type);
  return true;
}

// Drive one seat's full squad turn. The seat's own client plans from its OWN state
// (proving the states are genuinely in sync — a divergent state would plan a
// different move), then relays each command. A rejected follow-up abandons the rest
// of that (now-invalid) activation, exactly as the real driver breaks to the next unit.
async function takeSquadTurn(clients, actorSeat, latency) {
  const actor = clients.find((c) => c.seat === actorSeat);
  let guard = 0;
  while (actor.match.phase === "playing" && actor.match.currentPlayer === actorSeat && guard < 64) {
    guard += 1;
    const commands = chooseActivation(actor.match, {
      difficulty: "normal", // greedy ⇒ deterministic decisions from equal state
      cpuPlayer: actorSeat,
      rng: cpuRng(actor.match),
    });
    assert.ok(commands.length > 0, "a living squad always has a move");
    for (const command of commands) {
      const accepted = await relay(clients, actorSeat, command, latency);
      if (!accepted) break; // abandon the rest of this invalidated activation
      if (actor.match.phase === "complete") return;
    }
  }
  assert.ok(guard < 64, "squad turn terminated");
}

async function playLockstepMatch({ seed, size, squads = { 1: DEFAULT_SQUAD, 2: DEFAULT_SQUAD }, latency = false }) {
  const clients = buildClients({ seed, size, squads });
  assertSynced(clients, "initial state");

  let guard = 0;
  while (clients[0].match.phase === "playing" && guard < 4000) {
    guard += 1;
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

// ── Full 1v1 matches over a spread of seeds × both board sizes ────────────────
// A single seed could mask an order-sensitive bug; the spread makes a real desync
// near-certain to trip at least one case.
for (const size of [13, 15]) {
  for (const seed of [1, 7, 42, 1000, 31337]) {
    test(`online lockstep stays in sync over a full 1v1 match (size ${size}, seed ${seed})`, async () => {
      await playLockstepMatch({ seed, size });
    });
  }
}

// ── Asymmetric custom squads (blind pick exchanged over the relay) ─────────────
const CUSTOM_PAIRINGS = [
  { 1: ["swordsman", "swordsman", "paladin", "necromancer"], 2: ["sniper", "archer", "magician", "mystic"] },
  { 1: ["archer", "archer", "sniper", "magician"], 2: ["swordsman", "paladin", "swordsman", "mystic"] },
  { 1: ["necromancer", "mystic", "paladin", "magician"], 2: ["sniper", "archer", "swordsman", "swordsman"] },
];

for (const size of [13, 15]) {
  CUSTOM_PAIRINGS.forEach((squads, index) => {
    test(`online lockstep stays in sync with custom squads (size ${size}, pairing ${index})`, async () => {
      await playLockstepMatch({ seed: 42, size, squads });
    });
  });
}

// ── Latency proof: delivery timing cannot change the outcome ───────────────────
for (const cfg of [
  { size: 13, seed: 31337 },
  { size: 15, seed: 7, squads: CUSTOM_PAIRINGS[0] },
]) {
  test(`online lockstep survives jittered latency (size ${cfg.size}, seed ${cfg.seed})`, async () => {
    await playLockstepMatch({ ...cfg, latency: true });
  });
}

// ── Mid-match concede replays identically on every client ──────────────────────
// Models the production disconnect rule (onlineSession.onPlayerLeft): the surviving
// owner injects a `concede` command for the departed seat into the SAME ordered
// command stream. We exchange it to both clients and assert they resolve to one
// identical complete state (the surviving seat wins). In a duel a concede always
// ends the match, so this is the determinism guard for the forfeit path.
for (const seed of [1, 42, 31337]) {
  test(`online lockstep resolves a mid-match concede consistently (seed ${seed})`, async () => {
    const clients = buildClients({ seed, size: 13, squads: { 1: DEFAULT_SQUAD, 2: DEFAULT_SQUAD } });
    assertSynced(clients, "initial state");

    // Play a couple of full turns so the concede lands mid-match, not turn 1.
    let turns = 0;
    while (clients[0].match.phase === "playing" && turns < 3) {
      await takeSquadTurn(clients, clients[0].match.currentPlayer, false);
      turns += 1;
    }
    if (clients[0].match.phase !== "playing") return; // a short match already ended — nothing to concede

    const loser = clients[0].match.currentPlayer === 1 ? 2 : 1;
    await broadcast(clients, concede(loser), false);

    assertSynced(clients, "after concede");
    assert.equal(clients[0].match.phase, "complete", "concede ended the duel");
    assert.equal(clients[0].match.winner, loser === 1 ? 2 : 1, "the surviving seat won");
  });
}

// Determinism guarantee the lockstep relies on: the very same seed + the very same
// command stream reproduces the exact same final state hash, independent of (random)
// delivery latency. Captured from one deterministic playthrough, replayed twice.
test("a replayed command stream reproduces an identical final hash", () => {
  const seed = 24680;
  const size = 13;
  const squads = { 1: DEFAULT_SQUAD, 2: DEFAULT_SQUAD };
  const cfg = () => createMatchState({ size, seed, squads });

  const log = [];
  let match = cfg();
  let guard = 0;
  while (match.phase === "playing" && guard < 8000) {
    guard += 1;
    const commands = chooseActivation(match, {
      difficulty: "normal",
      cpuPlayer: match.currentPlayer,
      rng: cpuRng(match),
    });
    for (const command of commands) {
      log.push(command);
      match = applyAccepted(match, command);
      if (match.phase === "complete") break;
    }
  }
  assert.equal(match.phase, "complete");

  let a = cfg();
  let b = cfg();
  for (const command of log) {
    a = applyAccepted(a, command);
    b = applyAccepted(b, command);
    assert.equal(hashState(a), hashState(b), "replay diverged mid-stream");
  }
  assert.equal(hashState(a), hashState(b), "replay final hash matches");
});
