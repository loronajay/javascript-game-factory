import { GAME_CONFIG, TICK_SECONDS } from "../config.js";
import {
  angleDifference,
  approach,
  clamp,
  normalizeVector,
  segmentCircleIntersection,
  wrapAngle,
} from "./math.js";

const DEFAULT_PLAYERS = Object.freeze([
  { id: "player-1", displayName: "Player 1", color: "#48e6ff" },
  { id: "player-2", displayName: "Player 2", color: "#ff4fd8" },
]);

function ticksFromMs(ms) {
  return Math.max(1, Math.round(ms / (1000 / GAME_CONFIG.simulation.tickRate)));
}

function nextRandom(match) {
  let value = match.rngState | 0;
  value = (value + 0x6d2b79f5) | 0;
  let mixed = value;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  match.rngState = value;
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

function makePlayer(source, index) {
  const fallback = DEFAULT_PLAYERS[index];
  return {
    id: String(source?.id || fallback.id),
    displayName: String(source?.displayName || fallback.displayName).slice(0, 18),
    color: String(source?.color || fallback.color),
    score: 0,
  };
}

export function createMatch(options = {}) {
  const players = [
    makePlayer(options.players?.[0], 0),
    makePlayer(options.players?.[1], 1),
  ];
  const paddleAngles = [Math.PI, Math.PI * 1.5];
  return {
    tick: 0,
    rngState: Number.isFinite(options.seed) ? options.seed | 0 : 1,
    phase: "IDLE",
    phaseTicks: 0,
    roundIndex: 0,
    scoreToWin: Math.max(1, Math.floor(options.scoreToWin ?? GAME_CONFIG.match.scoreToWin)),
    winByTwo: options.winByTwo ?? GAME_CONFIG.match.winByTwo,
    players,
    paddles: players.map((player, index) => ({
      id: `paddle-${index + 1}`,
      playerId: player.id,
      angle: paddleAngles[index],
      previousAngle: paddleAngles[index],
      angularVelocity: 0,
      arc: GAME_CONFIG.paddle.arcRadians,
    })),
    ball: {
      x: 0,
      y: 0,
      previousX: 0,
      previousY: 0,
      vx: 0,
      vy: 0,
      radius: GAME_CONFIG.ball.radius,
      speed: GAME_CONFIG.ball.startSpeed,
      lastTouchPlayerId: null,
    },
    servePlan: null,
    lastPoint: null,
    winnerId: null,
    lastCollision: null,
    events: [],
  };
}

export function planServe(match, receiverIndex = match.roundIndex % match.paddles.length) {
  const receiver = match.paddles[receiverIndex];
  const collisionRadius = GAME_CONFIG.arena.radius - match.ball.radius;
  const timeToImpact = collisionRadius / GAME_CONFIG.ball.startSpeed;
  const reachableArc = GAME_CONFIG.paddle.maxAngularSpeed * timeToImpact;
  const maximumTravel = reachableArc * GAME_CONFIG.serve.reachabilityFactor;
  const minimumTravel = Math.min(GAME_CONFIG.serve.minimumTravelRadians, maximumTravel);
  const direction = nextRandom(match) < 0.5 ? -1 : 1;
  const travel = minimumTravel + (maximumTravel - minimumTravel) * (0.35 + nextRandom(match) * 0.5);
  const angularTravel = direction * travel;
  const targetAngle = wrapAngle(receiver.angle + angularTravel);
  const velocity = {
    x: Math.cos(targetAngle) * GAME_CONFIG.ball.startSpeed,
    y: Math.sin(targetAngle) * GAME_CONFIG.ball.startSpeed,
  };
  return {
    receiverIndex,
    receiverPlayerId: receiver.playerId,
    targetAngle,
    angularTravel,
    reachableArc,
    velocity,
  };
}

export function beginServe(match) {
  match.servePlan = planServe(match);
  match.phase = "SERVE_PREVIEW";
  match.phaseTicks = ticksFromMs(GAME_CONFIG.serve.previewDurationMs);
  Object.assign(match.ball, {
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    speed: GAME_CONFIG.ball.startSpeed,
    lastTouchPlayerId: null,
  });
  match.events.push({ type: "SERVE_PREVIEW_STARTED", plan: match.servePlan });
}

export function startMatch(match) {
  for (const player of match.players) player.score = 0;
  match.roundIndex = 0;
  match.winnerId = null;
  match.lastPoint = null;
  match.events.length = 0;
  beginServe(match);
  match.events.push({ type: "MATCH_STARTED" });
  return match;
}

function updatePaddles(match, commands) {
  match.paddles.forEach((paddle, index) => {
    const orbit = clamp(Number(commands?.[index]?.orbit) || 0, -1, 1);
    const target = orbit * GAME_CONFIG.paddle.maxAngularSpeed;
    const rate = orbit === 0 ? GAME_CONFIG.paddle.braking : GAME_CONFIG.paddle.acceleration;
    paddle.previousAngle = paddle.angle;
    paddle.angularVelocity = approach(paddle.angularVelocity, target, rate * TICK_SECONDS);
    paddle.angle = wrapAngle(paddle.angle + paddle.angularVelocity * TICK_SECONDS);
  });
}

function paddleAtAngle(match, contactAngle) {
  const ballAngularRadius = Math.asin(clamp(match.ball.radius / GAME_CONFIG.arena.radius, 0, 1));
  let best = null;
  for (const paddle of match.paddles) {
    const offset = angleDifference(contactAngle, paddle.angle);
    const halfArc = paddle.arc / 2 + ballAngularRadius;
    if (Math.abs(offset) <= halfArc && (!best || Math.abs(offset) < Math.abs(best.offset))) {
      best = { paddle, offset, halfArc };
    }
  }
  return best;
}

function returnBall(match, hit, occupancy) {
  const normal = normalizeVector(hit.x, hit.y);
  const tangent = { x: -normal.y, y: normal.x };
  const ball = match.ball;
  const incomingDot = ball.vx * normal.x + ball.vy * normal.y;
  let vx = ball.vx - 2 * incomingDot * normal.x;
  let vy = ball.vy - 2 * incomingDot * normal.y;
  const contactOffset = clamp(occupancy.offset / occupancy.halfArc, -1, 1);
  const tangentInfluence =
    contactOffset * GAME_CONFIG.ball.contactOffsetInfluence
    + occupancy.paddle.angularVelocity * GAME_CONFIG.ball.paddleVelocityInfluence;
  vx += tangent.x * tangentInfluence;
  vy += tangent.y * tangentInfluence;
  const direction = normalizeVector(vx, vy, -normal.x, -normal.y);
  const speed = Math.min(
    GAME_CONFIG.ball.maxSpeed,
    Math.max(ball.speed, Math.hypot(ball.vx, ball.vy)) + GAME_CONFIG.ball.hitSpeedIncrease,
  );
  const safeRadius = GAME_CONFIG.arena.radius - ball.radius - 0.5;
  ball.x = normal.x * safeRadius;
  ball.y = normal.y * safeRadius;
  ball.vx = direction.x * speed;
  ball.vy = direction.y * speed;
  ball.speed = speed;
  ball.lastTouchPlayerId = occupancy.paddle.playerId;
  match.lastCollision = {
    tick: match.tick,
    angle: Math.atan2(hit.y, hit.x),
    playerId: occupancy.paddle.playerId,
    contactOffset,
  };
  match.events.push({
    type: "BALL_HIT",
    playerId: occupancy.paddle.playerId,
    position: { x: ball.x, y: ball.y },
    speed,
  });
}

function hasWon(match, player) {
  if (player.score < match.scoreToWin) return false;
  if (!match.winByTwo) return true;
  const other = match.players.find((candidate) => candidate.id !== player.id);
  return player.score - (other?.score ?? 0) >= 2;
}

function awardPoint(match, ownerId, angle) {
  const player = match.players.find((candidate) => candidate.id === ownerId);
  if (!player) return;
  player.score += 1;
  match.lastPoint = { playerId: ownerId, angle, score: player.score };
  match.events.push({ type: "POINT_SCORED", ...match.lastPoint });
  if (hasWon(match, player)) {
    match.phase = "MATCH_OVER";
    match.phaseTicks = 0;
    match.winnerId = ownerId;
    match.events.push({ type: "MATCH_ENDED", winnerId: ownerId });
  } else {
    match.phase = "POINT_SCORED";
    match.phaseTicks = ticksFromMs(GAME_CONFIG.match.pointPauseMs);
  }
}

function resolveEscape(match, angle) {
  const ownerId = match.ball.lastTouchPlayerId;
  match.events.push({ type: "BALL_EXITED_ARENA", angle, lastTouchPlayerId: ownerId });
  if (ownerId === null) {
    match.lastPoint = null;
    match.phase = "ROUND_RESET";
    match.phaseTicks = ticksFromMs(GAME_CONFIG.match.resetPauseMs);
    return;
  }
  awardPoint(match, ownerId, angle);
}

function resolveDoubleTouch(match, playerId, angle) {
  const opponent = match.players.find((player) => player.id !== playerId);
  if (!opponent) return;
  awardPoint(match, opponent.id, angle);
  match.events.push({
    type: "DOUBLE_TOUCH_FAULT",
    playerId,
    awardedPlayerId: opponent.id,
    angle,
  });
}

function updateBall(match) {
  const ball = match.ball;
  const start = { x: ball.x, y: ball.y };
  const end = {
    x: ball.x + ball.vx * TICK_SECONDS,
    y: ball.y + ball.vy * TICK_SECONDS,
  };
  ball.previousX = start.x;
  ball.previousY = start.y;
  const collisionRadius = GAME_CONFIG.arena.radius - ball.radius;
  const movingOutward = start.x * ball.vx + start.y * ball.vy >= 0;
  const crossing = movingOutward ? segmentCircleIntersection(start, end, collisionRadius) : null;
  if (crossing) {
    const contactAngle = Math.atan2(crossing.y, crossing.x);
    const occupancy = paddleAtAngle(match, contactAngle);
    if (occupancy) {
      if (occupancy.paddle.playerId === ball.lastTouchPlayerId) {
        ball.x = end.x;
        ball.y = end.y;
        resolveDoubleTouch(match, occupancy.paddle.playerId, contactAngle);
        return;
      }
      returnBall(match, crossing, occupancy);
      return;
    }
    ball.x = end.x;
    ball.y = end.y;
    resolveEscape(match, contactAngle);
    return;
  }
  ball.x = end.x;
  ball.y = end.y;
}

function updatePhase(match) {
  if (match.phaseTicks > 0) match.phaseTicks -= 1;
  if (match.phase === "SERVE_PREVIEW" && match.phaseTicks <= 0) {
    match.phase = "PLAYING";
    match.ball.vx = match.servePlan.velocity.x;
    match.ball.vy = match.servePlan.velocity.y;
    match.ball.speed = GAME_CONFIG.ball.startSpeed;
    match.events.push({ type: "SERVE_LAUNCHED", plan: match.servePlan });
  } else if (match.phase === "POINT_SCORED" && match.phaseTicks <= 0) {
    match.phase = "ROUND_RESET";
    match.phaseTicks = ticksFromMs(GAME_CONFIG.match.resetPauseMs);
  } else if (match.phase === "ROUND_RESET" && match.phaseTicks <= 0) {
    match.roundIndex += 1;
    beginServe(match);
  }
}

export function stepMatch(match, commands = []) {
  match.events.length = 0;
  match.tick += 1;
  if (match.phase !== "IDLE" && match.phase !== "MATCH_OVER") updatePaddles(match, commands);
  if (match.phase === "PLAYING") updateBall(match);
  updatePhase(match);
  return match.events;
}
