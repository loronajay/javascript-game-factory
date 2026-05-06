import {
  buildCreateRoomPayload,
  buildFindMatchPayload,
  buildJoinRoomPayload,
  buildQueueStatusPayload,
  parseProfileMessage,
  serializeCircuitActionIntent,
  serializeProfileMessage
} from "../../scripts/shared/commands.js";

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

console.log("\ncommands");

test("buildFindMatchPayload includes the game id, side, and sanitized identity", () => {
  const payload = buildFindMatchPayload("blue", "circuit-siege", {
    playerId: " player-7 ",
    displayName: "  Casey  "
  });

  assertEqual(payload.type, "find_match");
  assertEqual(payload.gameId, "circuit-siege");
  assertEqual(payload.side, "blue");
  assertEqual(payload.playerId, "player-7");
  assertEqual(payload.displayName, "Casey");
});

test("buildCreateRoomPayload creates the expected private-room payload", () => {
  const payload = buildCreateRoomPayload("red", "circuit-siege", {
    playerId: "p2",
    displayName: "Riley"
  });

  assertEqual(payload.type, "create_room");
  assertEqual(payload.gameId, "circuit-siege");
  assertEqual(payload.side, "red");
  assertEqual(payload.playerId, "p2");
  assertEqual(payload.displayName, "Riley");
});

test("buildJoinRoomPayload normalizes the room code to uppercase", () => {
  const payload = buildJoinRoomPayload("red", " ab12 ", "circuit-siege", {
    playerId: "p9",
    displayName: "Jordan"
  });

  assertEqual(payload.type, "join_room");
  assertEqual(payload.gameId, "circuit-siege");
  assertEqual(payload.side, "red");
  assertEqual(payload.roomCode, "AB12");
});

test("buildQueueStatusPayload requests queue counts for this game", () => {
  const payload = buildQueueStatusPayload("circuit-siege");

  assertEqual(payload.type, "queue_status");
  assertEqual(payload.gameId, "circuit-siege");
});

test("serializeProfileMessage and parseProfileMessage round-trip profile state", () => {
  const value = serializeProfileMessage({
    playerId: "p1",
    displayName: "Morgan"
  }, "blue");

  const profile = parseProfileMessage(value);
  assertEqual(profile.playerId, "p1");
  assertEqual(profile.displayName, "Morgan");
  assertEqual(profile.side, "blue");
});

test("serializeCircuitActionIntent preserves route-edit intent payloads", () => {
  const value = serializeCircuitActionIntent({
    intentType: "PLACE_TILE",
    slotId: "blue_route_01_rp_1",
    pieceType: "straight",
    rotation: 90
  });

  const parsed = JSON.parse(value);
  assertEqual(parsed.intentType, "PLACE_TILE");
  assertEqual(parsed.slotId, "blue_route_01_rp_1");
  assertEqual(parsed.pieceType, "straight");
  assertEqual(parsed.rotation, 90);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
