import {
  applyPlayerLeftToLobby,
  buildPlayersFromLobby,
  createOnlineRuntimeState,
  resetOnlineRuntimeState,
  shouldTickLobbyCountdown,
} from "../scripts/online-runtime-state.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (error) {
    console.log(`  FAIL  ${name}: ${error.message}`);
    failed++;
  }
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `expected ${JSON.stringify(actual)} === ${JSON.stringify(expected)}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "assertion failed");
  }
}

console.log("\necho-duel online-runtime-state");

test("online runtime state starts with stable defaults", () => {
  const online = createOnlineRuntimeState();
  assertEq(online.net, null);
  assertEq(online.lobby, null);
  assertEq(online.isHost, false);
  assertEq(online.authorityMode, null);
  assertEq(online.pendingAction, null);
  assertEq(online.outboundStateSeq, 0);
});

test("resetOnlineRuntimeState clears mutable online session flags in place", () => {
  const online = createOnlineRuntimeState();
  online.net = { connected: true };
  online.lobby = { roomCode: "ABCDE" };
  online.profiles = { c1: { displayName: "Alpha" } };
  online.isHost = true;
  online.startRequested = true;
  online.pendingAction = () => {};
  online.inboundStateSeq = 9;

  const next = resetOnlineRuntimeState(online);
  assertEq(next, online);
  assertEq(online.net, null);
  assertEq(online.lobby, null);
  assertEq(Object.keys(online.profiles).length, 0);
  assertEq(online.isHost, false);
  assertEq(online.startRequested, false);
  assertEq(online.pendingAction, null);
  assertEq(online.inboundStateSeq, 0);
});

test("buildPlayersFromLobby prefers known profiles and falls back for unnamed members", () => {
  const players = buildPlayersFromLobby({
    lobby: { members: ["c1", "c2"] },
    profiles: { c1: { displayName: "Alpha" } },
    localClientId: "c2",
    identity: { displayName: "Bravo" },
  });

  assertEq(players.length, 2);
  assertEq(players[0].name, "Alpha");
  assertEq(players[1].name, "Bravo");
});

test("applyPlayerLeftToLobby removes the member and updates owner metadata", () => {
  const next = applyPlayerLeftToLobby(
    {
      ownerId: "c1",
      playerCount: 3,
      members: ["c1", "c2", "c3"],
    },
    {
      clientId: "c2",
      ownerId: "c3",
      playerCount: 2,
    }
  );

  assertEq(next.playerCount, 2);
  assertEq(next.ownerId, "c3");
  assertEq(next.members.join(","), "c1,c3");
});

test("countdown ticking only stays active for future countdowns", () => {
  assertEq(shouldTickLobbyCountdown({ status: "countdown", startAt: 2000 }, 1000), true);
  assertEq(shouldTickLobbyCountdown({ status: "started", startAt: 2000 }, 1000), true);
  assertEq(shouldTickLobbyCountdown({ status: "open", startAt: 2000 }, 1000), false);
  assertEq(shouldTickLobbyCountdown({ status: "countdown", startAt: 500 }, 1000), false);
  assertEq(shouldTickLobbyCountdown(null, 1000), false);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\n${passed} test(s) passed.`);
