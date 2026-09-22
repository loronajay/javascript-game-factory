import { GAME_CONFIG } from "../config.js";
import { angleDifference, rayCircleIntersection } from "../core/math.js";

const DIFFICULTIES = Object.freeze({
  easy: { reactionTicks: 18, predictionError: 0.2, deadZone: 0.12, speedBias: 0.9 },
  normal: { reactionTicks: 8, predictionError: 0.08, deadZone: 0.07, speedBias: 1 },
  hard: { reactionTicks: 2, predictionError: 0.025, deadZone: 0.035, speedBias: 1 },
});

export function predictBallRailAngle(match) {
  const ball = match.ball;
  const hit = rayCircleIntersection(
    { x: ball.x, y: ball.y },
    { x: ball.vx, y: ball.vy },
    GAME_CONFIG.arena.radius - ball.radius,
  );
  return hit ? Math.atan2(hit.y, hit.x) : null;
}

export function createCpuController({ difficulty = "normal", random = Math.random } = {}) {
  const tuning = DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;
  let reactionCooldown = 0;
  let command = { orbit: 0 };
  let targetAngle = null;

  function getCommand(match, paddleIndex) {
    if (match.phase !== "PLAYING" && match.phase !== "SERVE_PREVIEW") return { orbit: 0 };
    const paddle = match.paddles[paddleIndex];
    // Once the CPU has returned the ball, its job is to yield the rail until
    // the opponent touches it. This prevents the bot from chasing down and
    // profiting from its own shot.
    if (match.ball.lastTouchPlayerId === paddle.playerId) {
      command = { orbit: 0 };
      targetAngle = null;
      reactionCooldown = 0;
      return { ...command };
    }
    if (reactionCooldown > 0) {
      reactionCooldown -= 1;
      return { ...command };
    }
    reactionCooldown = tuning.reactionTicks;
    const predicted = match.phase === "SERVE_PREVIEW" && match.servePlan
      ? match.servePlan.targetAngle
      : predictBallRailAngle(match);
    if (predicted === null) return { orbit: 0 };
    const error = (random() * 2 - 1) * tuning.predictionError;
    targetAngle = predicted + error;
    const difference = angleDifference(targetAngle, paddle.angle);
    command = { orbit: Math.abs(difference) <= tuning.deadZone ? 0 : Math.sign(difference) };
    return { ...command };
  }

  return {
    getCommand,
    getTargetAngle: () => targetAngle,
    reset() {
      reactionCooldown = 0;
      command = { orbit: 0 };
      targetAngle = null;
    },
  };
}
