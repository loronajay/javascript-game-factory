import {
  parseMatchEventMessage,
  parseMatchSnapshotMessage,
  serializeMatchEvent,
  serializeMatchSnapshot
} from "../../scripts/shared/snapshots.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\nsnapshots");

test("serializeMatchSnapshot and parseMatchSnapshotMessage round-trip an authoritative snapshot", () => {
  const serialized = serializeMatchSnapshot({
    matchId: "match_123",
    phase: "live",
    timerMsRemaining: 240000,
    players: {
      blue: { playerId: "p1", score: 2, connected: true },
      red: { playerId: "p2", score: 1, connected: true }
    },
    slots: {
      blue_route_01_rp_1: { placedMask: "NS", locked: false }
    }
  });

  const snapshot = parseMatchSnapshotMessage(serialized);
  assertEqual(snapshot.matchId, "match_123");
  assertEqual(snapshot.phase, "live");
  assertEqual(snapshot.timerMsRemaining, 240000);
  assertEqual(snapshot.players.blue.score, 2);
  assertEqual(snapshot.slots.blue_route_01_rp_1.placedMask, "NS");
});

test("parseMatchSnapshotMessage rejects malformed values", () => {
  assertEqual(parseMatchSnapshotMessage(""), null);
  assertEqual(parseMatchSnapshotMessage("{"), null);
  assertEqual(parseMatchSnapshotMessage(JSON.stringify({ phase: 7 })), null);
});

test("serializeMatchEvent and parseMatchEventMessage round-trip feedback events", () => {
  const serialized = serializeMatchEvent({
    eventType: "route_resolved",
    routeId: "blue_route_03",
    terminalType: "damage"
  });

  const event = parseMatchEventMessage(serialized);
  assertEqual(event.eventType, "route_resolved");
  assertEqual(event.routeId, "blue_route_03");
  assertEqual(event.terminalType, "damage");
});

test("parseMatchEventMessage rejects non-object payloads", () => {
  assertEqual(parseMatchEventMessage("3"), null);
  assertEqual(parseMatchEventMessage(JSON.stringify(["bad"])), null);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
