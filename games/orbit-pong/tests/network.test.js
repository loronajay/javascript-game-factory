import test from "node:test";
import assert from "node:assert/strict";

import {
  createInputPacket,
  normalizeSnapshot,
  replayUnacknowledgedInputs,
} from "../src/network/protocol.js";

test("network input packets contain commands, never DOM events", () => {
  assert.deepEqual(createInputPacket("match-1", 8, { orbit: 7 }), {
    type: "orbit_input",
    matchId: "match-1",
    sequence: 8,
    orbit: 1,
  });
});

test("snapshot normalization rejects malformed state and preserves authoritative serve data", () => {
  assert.equal(normalizeSnapshot({ tick: "oops" }), null);
  assert.equal(normalizeSnapshot({ tick: 1, ball: {}, paddles: [] }), null);
  const snapshot = normalizeSnapshot({
    tick: 4,
    phase: "PLAYING",
    ball: { x: 1, y: 2, vx: 3, vy: 4, lastTouchPlayerId: null },
    paddles: [
      { id: "paddle-1", angle: 0, angularVelocity: 0 },
      { id: "paddle-2", angle: 3, angularVelocity: 0 },
    ],
    scores: [0, 0],
    acknowledgedSequence: 2,
    winnerId: "player-1",
    servePlan: { targetAngle: 1.2, receiverIndex: 0, velocity: { x: 40, y: 50 } },
  });
  assert.ok(snapshot);
  assert.equal(snapshot.winnerId, "player-1");
  assert.equal(snapshot.servePlan.targetAngle, 1.2);
  assert.deepEqual(snapshot.servePlan.velocity, { x: 40, y: 50 });
});

test("local reconciliation replays only unacknowledged inputs", () => {
  const result = replayUnacknowledgedInputs(1, 0, [
    { sequence: 3, orbit: -1 },
    { sequence: 4, orbit: 1 },
    { sequence: 5, orbit: 1 },
  ], 3, 0.1);
  assert.ok(result.angle > 1);
  assert.equal(result.pending.length, 2);
});
