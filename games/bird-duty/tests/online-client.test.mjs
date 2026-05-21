import {
  buildLobbySettings,
  resolveWebSocketUrl,
  sanitizeOnlineIdentity,
} from "../scripts/online-client.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    passed++;
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${actual} to equal ${expected}`);
  }
}

test("resolveWebSocketUrl targets local server on localhost", () => {
  assertEqual(
    resolveWebSocketUrl({ protocol: "http:", hostname: "127.0.0.1" }),
    "ws://127.0.0.1:3000"
  );
});

test("sanitizeOnlineIdentity keeps factory names bounded", () => {
  const identity = sanitizeOnlineIdentity({
    playerId: " player-1 ",
    displayName: " Very Long Factory Username ",
  });

  assertEqual(identity.playerId, "player-1");
  assertEqual(identity.displayName, "Very Long Factory");
});

test("buildLobbySettings clamps Bird Duty online rooms to two through four players", () => {
  assertEqual(buildLobbySettings({ minPlayers: 1, maxPlayers: 9 }).minPlayers, 2);
  assertEqual(buildLobbySettings({ minPlayers: 1, maxPlayers: 9 }).maxPlayers, 4);
  assertEqual(buildLobbySettings({ minPlayers: 3, maxPlayers: 3 }).maxPlayers, 3);
});

console.log(`${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
