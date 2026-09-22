import test from "node:test";
import assert from "node:assert/strict";

import { createCpuController, predictBallRailAngle } from "../src/controllers/cpu-controller.js";
import { createMatch } from "../src/core/simulation.js";

test("CPU predicts a rail interception instead of reading the ball's current angle", () => {
  const match = createMatch();
  Object.assign(match.ball, { x: 0, y: -120, vx: 260, vy: 110 });
  const predicted = predictBallRailAngle(match);
  const current = Math.atan2(match.ball.y, match.ball.x);
  assert.notEqual(predicted, null);
  assert.ok(Math.abs(predicted - current) > 0.25);
});

test("CPU produces only the shared normalized orbit command", () => {
  const match = createMatch();
  match.phase = "PLAYING";
  Object.assign(match.ball, { x: 0, y: 0, vx: -300, vy: 0 });
  match.paddles[1].angle = 0;
  const cpu = createCpuController({ difficulty: "hard", random: () => 0.5 });
  const command = cpu.getCommand(match, 1);
  assert.deepEqual(Object.keys(command), ["orbit"]);
  assert.ok([-1, 0, 1].includes(command.orbit));
});

test("CPU reaction delay retains its previous command", () => {
  const match = createMatch();
  match.phase = "PLAYING";
  const cpu = createCpuController({ difficulty: "easy", random: () => 0.5 });
  const first = cpu.getCommand(match, 1);
  match.ball.vx *= -1;
  const second = cpu.getCommand(match, 1);
  assert.equal(second.orbit, first.orbit);
});

test("CPU yields the rail after its own return so the opponent gets the next play", () => {
  const match = createMatch();
  match.phase = "PLAYING";
  match.ball.lastTouchPlayerId = match.paddles[1].playerId;
  Object.assign(match.ball, { x: 0, y: 0, vx: 300, vy: 0 });
  match.paddles[1].angle = Math.PI;
  const cpu = createCpuController({ difficulty: "hard", random: () => 0.5 });

  assert.deepEqual(cpu.getCommand(match, 1), { orbit: 0 });
  assert.equal(cpu.getTargetAngle(), null);
});
