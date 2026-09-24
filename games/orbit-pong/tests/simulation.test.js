import test from "node:test";
import assert from "node:assert/strict";

import { GAME_CONFIG } from "../src/config.js";
import {
  createMatch,
  planServe,
  startMatch,
  stepMatch,
} from "../src/core/simulation.js";

const idle = Object.freeze({ orbit: 0 });

function forcePlaying(match) {
  match.phase = "PLAYING";
  match.phaseTicks = 0;
  return match;
}

test("both paddles consume the same abstract orbit command", () => {
  const match = forcePlaying(createMatch());
  const before = match.paddles.map((paddle) => paddle.angle);
  for (let i = 0; i < 12; i += 1) {
    stepMatch(match, [{ orbit: 1 }, { orbit: -1 }]);
  }
  assert.ok(match.paddles[0].angle > before[0]);
  assert.ok(match.paddles[1].angle < before[1]);
  assert.ok(match.paddles[0].angularVelocity > 0);
  assert.ok(match.paddles[1].angularVelocity < 0);
});

test("serve preview launches the exact planned trajectory", () => {
  const match = createMatch({ seed: 4 });
  startMatch(match);
  const planned = { ...match.servePlan };
  while (match.phase === "SERVE_PREVIEW") stepMatch(match, [idle, idle]);
  assert.equal(match.phase, "PLAYING");
  assert.ok(Math.abs(match.ball.vx - planned.velocity.x) < 1e-9);
  assert.ok(Math.abs(match.ball.vy - planned.velocity.y) < 1e-9);
  assert.equal(match.ball.lastTouchPlayerId, null);
});

test("planned serves alternate receivers and remain inside their reachable arc", () => {
  const match = createMatch({ seed: 12 });
  const first = planServe(match, 0);
  const second = planServe(match, 1);
  assert.equal(first.receiverIndex, 0);
  assert.equal(second.receiverIndex, 1);
  assert.ok(Math.abs(first.angularTravel) <= first.reachableArc * GAME_CONFIG.serve.reachabilityFactor);
  assert.ok(Math.abs(second.angularTravel) <= second.reachableArc * GAME_CONFIG.serve.reachabilityFactor);
});

test("swept boundary collision catches a fast ball and records last touch", () => {
  const match = forcePlaying(createMatch());
  const paddle = match.paddles[0];
  paddle.angle = 0;
  match.ball.x = GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 4;
  match.ball.y = 0;
  match.ball.vx = 1200;
  match.ball.vy = 0;
  match.ball.lastTouchPlayerId = null;

  stepMatch(match, [idle, idle]);

  assert.equal(match.phase, "PLAYING");
  assert.equal(match.ball.lastTouchPlayerId, paddle.playerId);
  assert.ok(match.ball.vx < 0);
  assert.ok(Math.hypot(match.ball.x, match.ball.y) < GAME_CONFIG.arena.radius);
});

test("every successful return adds a noticeable fixed amount of ball speed", () => {
  const match = forcePlaying(createMatch());
  match.paddles[0].angle = 0;
  match.paddles[1].angle = Math.PI;
  Object.assign(match.ball, {
    x: GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 2,
    y: 0,
    vx: GAME_CONFIG.ball.startSpeed,
    vy: 0,
    speed: GAME_CONFIG.ball.startSpeed,
    lastTouchPlayerId: null,
  });

  const firstEvents = stepMatch(match, [idle, idle]);
  const firstSpeed = match.ball.speed;
  assert.equal(firstSpeed, GAME_CONFIG.ball.startSpeed + GAME_CONFIG.ball.hitSpeedIncrease);
  assert.ok(firstEvents.some((event) => event.type === "BALL_HIT" && event.speed === firstSpeed));

  Object.assign(match.ball, {
    x: -(GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 2),
    y: 0,
    vx: -firstSpeed,
    vy: 0,
  });
  const secondEvents = stepMatch(match, [idle, idle]);
  const secondSpeed = match.ball.speed;
  assert.equal(secondSpeed, firstSpeed + GAME_CONFIG.ball.hitSpeedIncrease);
  assert.ok(secondEvents.some((event) => event.type === "BALL_HIT" && event.speed === secondSpeed));
});

test("a miss awards the point to the last toucher regardless of exit location", () => {
  const match = forcePlaying(createMatch());
  match.paddles[0].angle = Math.PI;
  match.paddles[1].angle = Math.PI;
  match.ball.x = GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 1;
  match.ball.y = 0;
  match.ball.vx = 900;
  match.ball.vy = 0;
  match.ball.lastTouchPlayerId = match.players[1].id;

  stepMatch(match, [idle, idle]);

  assert.equal(match.players[1].score, 1);
  assert.equal(match.players[0].score, 0);
  assert.equal(match.phase, "POINT_SCORED");
});

test("a paddle cannot return twice in a row; a double touch awards the opponent", () => {
  const match = forcePlaying(createMatch());
  match.paddles[0].angle = 0;
  match.paddles[1].angle = Math.PI;
  Object.assign(match.ball, {
    x: GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 2,
    y: 0,
    vx: 900,
    vy: 0,
    lastTouchPlayerId: match.players[0].id,
  });

  const events = stepMatch(match, [idle, idle]);

  assert.deepEqual(match.players.map((player) => player.score), [0, 1]);
  assert.equal(match.phase, "POINT_SCORED");
  assert.ok(events.some((event) => event.type === "DOUBLE_TOUCH_FAULT" && event.playerId === match.players[0].id));
  assert.ok(!events.some((event) => event.type === "BALL_HIT"));
});

test("an untouched escaped serve scores nothing and schedules a replay", () => {
  const match = forcePlaying(createMatch());
  match.paddles[0].angle = Math.PI;
  match.paddles[1].angle = Math.PI;
  match.ball.x = GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 1;
  match.ball.y = 0;
  match.ball.vx = 900;
  match.ball.vy = 0;
  match.ball.lastTouchPlayerId = null;

  stepMatch(match, [idle, idle]);

  assert.deepEqual(match.players.map((player) => player.score), [0, 0]);
  assert.equal(match.phase, "ROUND_RESET");
  assert.equal(match.lastPoint, null);
});

test("a match ends at the configured score", () => {
  const match = forcePlaying(createMatch({ scoreToWin: 2 }));
  match.players[0].score = 1;
  match.paddles[0].angle = Math.PI;
  match.paddles[1].angle = Math.PI;
  Object.assign(match.ball, {
    x: GAME_CONFIG.arena.radius - GAME_CONFIG.ball.radius - 1,
    y: 0,
    vx: 900,
    vy: 0,
    lastTouchPlayerId: match.players[0].id,
  });
  stepMatch(match, [idle, idle]);
  assert.equal(match.phase, "MATCH_OVER");
  assert.equal(match.winnerId, match.players[0].id);
});
