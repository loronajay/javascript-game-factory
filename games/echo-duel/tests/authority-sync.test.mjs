import { PHASES } from "../scripts/config.js";
import { createMatchState, serializeStateForNetwork } from "../scripts/state.js";
import {
  applyAuthoritativeMatchMessage,
  isAuthoritativeMatchMessageType,
} from "../scripts/authority-sync.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === "function") {
      return result
        .then(() => {
          console.log(`  PASS  ${name}`);
          passed++;
        })
        .catch((error) => {
          console.log(`  FAIL  ${name}: ${error.message}`);
          failed++;
        });
    }

    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }

  return Promise.resolve();
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

function createOnlineMatchState() {
  return createMatchState({
    mode: "online",
    seed: 1,
    players: [
      { id: "p1", clientId: "c1", name: "Alpha" },
      { id: "p2", clientId: "c2", name: "Bravo" },
      { id: "p3", clientId: "c3", name: "Charlie" },
    ],
    penaltyWord: "STATIC",
    network: {
      roomCode: "ECHO",
      hostId: "c1",
      lobbyOwnerId: "c1",
    },
  });
}

console.log("\necho-duel authority-sync");

await test("recognizes server-authoritative match message types", () => {
  assertEq(isAuthoritativeMatchMessageType("match_state"), true);
  assertEq(isAuthoritativeMatchMessageType("signal_playback"), true);
  assertEq(isAuthoritativeMatchMessageType("phase_result"), true);
  assertEq(isAuthoritativeMatchMessageType("match_ended"), true);
  assertEq(isAuthoritativeMatchMessageType("profile"), false);
  assertEq(isAuthoritativeMatchMessageType("state_sync"), false);
});

await test("hydrates full authoritative match snapshots and stamps server authority metadata", () => {
  const matchState = createOnlineMatchState();
  const snapshot = serializeStateForNetwork(matchState);
  snapshot.network = {
    ...(snapshot.network || {}),
    syncSeq: 4,
  };

  const next = applyAuthoritativeMatchMessage(
    null,
    "match_state",
    JSON.stringify(snapshot),
    {
      myClientId: "c2",
      lobbyOwnerId: "c1",
      hostId: "c1",
    }
  );

  assert(next, "expected a hydrated state");
  assertEq(next.phase, PHASES.OWNER_CREATE_INITIAL);
  assertEq(next.players.length, 3);
  assertEq(next.network.authorityMode, "server");
  assertEq(next.network.myClientId, "c2");
  assertEq(next.network.lobbyOwnerId, "c1");
  assertEq(next.network.hostId, "c1");
  assertEq(next.network.syncSeq, 4);
});

await test("merges partial signal playback payloads onto the existing state", () => {
  const current = createOnlineMatchState();
  const next = applyAuthoritativeMatchMessage(
    current,
    "signal_playback",
    JSON.stringify({
      turnId: 7,
      phaseId: 11,
      status: "Memorize the sequence.",
      playback: {
        sequence: ["W", "A", "S", "D"],
        totalMs: 1800,
        remainingMs: 1800,
        stepMs: 450,
        gapMs: 120,
        holdMs: 700,
      },
    }),
    {
      myClientId: "c2",
      lobbyOwnerId: "c1",
      hostId: "c1",
    }
  );

  assert(next, "expected signal playback state");
  assertEq(next.phase, PHASES.SIGNAL_PLAYBACK);
  assertEq(next.turnId, 7);
  assertEq(next.phaseId, 11);
  assertEq(next.players.length, current.players.length);
  assertEq(next.playback.sequence.join(""), "WASD");
  assertEq(next.network.authorityMode, "server");
});

await test("turns partial match-ended payloads into a finished authoritative state", () => {
  const current = createOnlineMatchState();
  const next = applyAuthoritativeMatchMessage(
    current,
    "match_ended",
    JSON.stringify({
      winnerId: "p3",
      status: "Charlie wins.",
    }),
    {
      myClientId: "c2",
      lobbyOwnerId: "c1",
      hostId: "c1",
    }
  );

  assert(next, "expected match-over state");
  assertEq(next.phase, PHASES.MATCH_OVER);
  assertEq(next.winnerId, "p3");
  assertEq(next.status, "Charlie wins.");
  assertEq(next.network.authorityMode, "server");
});

await test("ignores malformed authoritative payloads", () => {
  const current = createOnlineMatchState();
  const next = applyAuthoritativeMatchMessage(current, "match_state", "{not-json", {
    myClientId: "c2",
    lobbyOwnerId: "c1",
    hostId: "c1",
  });

  assertEq(next, null);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
