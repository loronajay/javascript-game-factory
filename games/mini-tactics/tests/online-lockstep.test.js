import test from "node:test";
import assert from "node:assert/strict";

import { createMatchState } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import { hashState } from "../src/core/state-hash.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";

// Headless validation of the ONLINE deterministic-lockstep contract (see
// src/online/onlineSession.js). The real game never sends rendered state — each
// client applies its own accepted command and broadcasts the COMMAND; the peer
// replays it through the same seeded reducer. This harness proves that contract
// holds end-to-end without a browser or the live relay:
//
//   * Two INDEPENDENT match states (host + guest) built from one shared seed.
//   * Accepted commands cross a relay with jittered async latency, exercising the
//     fact that delivery timing must not change the result.
//   * After every applied command both states must be byte-identical (equal
//     state hash, the same FNV check the host broadcasts for desync detection).
//   * Both clients independently agree on every move and on the final winner.
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

// Drive one client's full squad turn. The actor plans from its OWN state (proving
// the two states are genuinely in sync — a divergent state would plan a different
// move), applies locally, then relays each command to the peer over async
// latency. Both states must match after every single command.
async function takeSquadTurn(actor, peer, latency) {
  let guard = 0;
  while (
    actor.match.phase === "playing" &&
    actor.match.currentPlayer === actor.seat &&
    guard < 64
  ) {
    guard += 1;
    const commands = chooseActivation(actor.match, {
      difficulty: "normal", // greedy ⇒ deterministic decisions from equal state
      cpuPlayer: actor.seat,
      rng: cpuRng(actor.match),
    });
    assert.ok(commands.length > 0, "a living squad always has a move");

    for (const command of commands) {
      // Originator applies locally and broadcasts the command…
      actor.match = applyAccepted(actor.match, command);
      // …the peer receives it (after some latency, when enabled) and replays it.
      if (latency) await delay(jitter());
      peer.match = applyAccepted(peer.match, command);

      // The whole point: identical command stream on one shared seed ⇒ identical
      // state, including the RNG stream the dice are drawn from.
      assert.equal(
        hashState(actor.match),
        hashState(peer.match),
        `state hash diverged after ${command.type}`,
      );

      if (actor.match.phase === "complete") return;
    }
  }
  assert.ok(guard < 64, "squad turn terminated");
}

async function playLockstepMatch({ seed, size, latency = false, compositions = null }) {
  // Both clients build from the SAME { seat: composition } map — exactly what the
  // lobby's two-way blind-pick exchange produces (each side keys its own squad and
  // the peer's by seat). Asymmetric squads must not break determinism.
  const host = {
    seat: 1,
    match: createMatchState({ size, seed, mode: "online", compositions }),
  };
  const guest = {
    seat: 2,
    match: createMatchState({ size, seed, mode: "online", compositions }),
  };

  // Same starting position on both clients before a single command is exchanged.
  assert.equal(hashState(host.match), hashState(guest.match), "initial state hash");

  let guard = 0;
  while (host.match.phase === "playing" && guard < 400) {
    guard += 1;
    // Both clients agree on whose turn it is (guaranteed by hash-equality above).
    const current = host.match.currentPlayer;
    const actor = current === 1 ? host : guest;
    const peer = current === 1 ? guest : host;
    await takeSquadTurn(actor, peer, latency);
  }

  assert.equal(host.match.phase, "complete", "match reached a clean finish");
  assert.equal(hashState(host.match), hashState(guest.match), "final state hash");
  assert.equal(
    host.match.winner,
    guest.match.winner,
    "both clients agree on the winner",
  );
  assert.notEqual(host.match.winner, null, "a winner was decided");
  return host.match.winner;
}

// Breadth: a spread of seeds (different dice streams) over both board sizes. A
// single seed could mask an order-sensitive bug; the spread makes a real desync
// near-certain to trip at least one case. Run without artificial timers so the
// matrix stays fast — determinism is what's under test, not wall-clock timing.
for (const size of [10, 13]) {
  for (const seed of [1, 7, 42, 1000, 31337]) {
    test(`online lockstep stays in sync over a full match (size ${size}, seed ${seed})`, async () => {
      await playLockstepMatch({ seed, size });
    });
  }
}

// Latency proof: a small subset replayed across a relay with real jittered async
// delivery, demonstrating that delivery timing cannot change the synced outcome.
for (const { size, seed } of [{ size: 10, seed: 31337 }]) {
  test(`online lockstep survives jittered network latency (size ${size}, seed ${seed})`, async () => {
    await playLockstepMatch({ seed, size, latency: true });
  });
}

// Blind-pick custom squads: asymmetric compositions exchanged over the relay must
// stay in perfect lockstep just like the classic mirror. Each pairing is keyed by
// seat (1 = host, 2 = guest) and handed to BOTH clients, modelling the post-
// exchange state. Aggressive comps so matches resolve decisively within the guard.
const CUSTOM_PAIRINGS = [
  { 1: ["ranger", "ranger", "warrior", "tank"], 2: ["tank", "warrior", "warrior", "ranger"] },
  { 1: ["warrior", "warrior", "warrior", "warrior"], 2: ["ranger", "ranger", "tank", "tank"] },
  { 1: ["ranger", "tank", "warrior", "medic"], 2: ["medic", "warrior", "tank", "ranger"] },
];

for (const size of [10, 13]) {
  CUSTOM_PAIRINGS.forEach((compositions, index) => {
    test(`online lockstep stays in sync with custom squads (size ${size}, pairing ${index})`, async () => {
      await playLockstepMatch({ seed: 42, size, compositions });
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
    latency: true,
    compositions: CUSTOM_PAIRINGS[0],
  });
});

// Determinism guarantee the lockstep relies on: the very same seed + the very
// same command stream reproduces the exact same final state hash, independent of
// the (random) delivery latency above.
test("a replayed command stream reproduces an identical final hash", async () => {
  const seed = 24680;
  // Capture the canonical command log from one deterministic playthrough.
  const log = [];
  {
    let match = createMatchState({ size: 10, seed, mode: "online" });
    let guard = 0;
    while (match.phase === "playing" && guard < 4000) {
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

  // Replay that exact log onto a fresh same-seed state — must land bit-identical.
  let a = createMatchState({ size: 10, seed, mode: "online" });
  let b = createMatchState({ size: 10, seed, mode: "online" });
  for (const command of log) {
    a = applyAccepted(a, command);
    b = applyAccepted(b, command);
    assert.equal(hashState(a), hashState(b), "replay diverged mid-stream");
  }
  assert.equal(a.phase, "complete");
  assert.equal(hashState(a), hashState(b), "replay final hash matches");
});
