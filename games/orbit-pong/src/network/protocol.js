import { GAME_CONFIG } from "../config.js";
import { clamp, wrapAngle } from "../core/math.js";

export function createInputPacket(matchId, sequence, command) {
  return {
    type: "orbit_input",
    matchId: String(matchId || ""),
    sequence: Math.max(0, Math.floor(Number(sequence) || 0)),
    orbit: Math.sign(clamp(Number(command?.orbit) || 0, -1, 1)),
  };
}

function finite(value) {
  return Number.isFinite(Number(value));
}

export function normalizeSnapshot(value) {
  if (!value || !finite(value.tick) || !value.ball || !Array.isArray(value.paddles)) return null;
  if (value.paddles.length !== 2 || !Array.isArray(value.scores) || value.scores.length !== 2) return null;
  if (![value.ball.x, value.ball.y, value.ball.vx, value.ball.vy].every(finite)) return null;
  if (!value.paddles.every((paddle) => paddle && finite(paddle.angle) && finite(paddle.angularVelocity))) return null;
  const servePlan = value.servePlan
    && finite(value.servePlan.targetAngle)
    && finite(value.servePlan.velocity?.x)
    && finite(value.servePlan.velocity?.y)
    ? {
        targetAngle: wrapAngle(Number(value.servePlan.targetAngle)),
        receiverIndex: Number(value.servePlan.receiverIndex) === 1 ? 1 : 0,
        receiverPlayerId: typeof value.servePlan.receiverPlayerId === "string" ? value.servePlan.receiverPlayerId : null,
        velocity: { x: Number(value.servePlan.velocity.x), y: Number(value.servePlan.velocity.y) },
      }
    : null;
  return {
    tick: Math.max(0, Math.floor(Number(value.tick))),
    phase: typeof value.phase === "string" ? value.phase : "PLAYING",
    ball: {
      x: Number(value.ball.x),
      y: Number(value.ball.y),
      vx: Number(value.ball.vx),
      vy: Number(value.ball.vy),
      lastTouchPlayerId: typeof value.ball.lastTouchPlayerId === "string" ? value.ball.lastTouchPlayerId : null,
    },
    paddles: value.paddles.map((paddle, index) => ({
      id: String(paddle.id || `paddle-${index + 1}`),
      angle: wrapAngle(Number(paddle.angle)),
      angularVelocity: Number(paddle.angularVelocity),
    })),
    scores: value.scores.map((score) => Math.max(0, Math.floor(Number(score) || 0))),
    acknowledgedSequence: Math.max(0, Math.floor(Number(value.acknowledgedSequence) || 0)),
    winnerId: typeof value.winnerId === "string" ? value.winnerId : null,
    servePlan,
  };
}

export function replayUnacknowledgedInputs(angle, angularVelocity, inputHistory, acknowledgedSequence, dt) {
  const pending = inputHistory.filter((input) => input.sequence > acknowledgedSequence);
  let nextAngle = angle;
  let nextVelocity = angularVelocity;
  for (const input of pending) {
    nextVelocity = Math.sign(input.orbit) * GAME_CONFIG.paddle.maxAngularSpeed;
    nextAngle = wrapAngle(nextAngle + nextVelocity * dt);
  }
  return { angle: nextAngle, angularVelocity: nextVelocity, pending };
}
