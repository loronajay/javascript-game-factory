// Pure collision/runtime rules for reusable sandbox pieces.
//
// The main ball integrator continues to own gravity, room, rim, and backboard.
// Trick Shot Lab calls this once per physics substep after that integration, so
// thin neon boards cannot be skipped at 60 Hz and cannon timing is deterministic.

import { BALL_RADIUS_WORLD } from "./constants.js";
import { BOARD_PIECE, CANNON_PIECE, cannonDirection } from "./trick-shot.js";

const BOARD_HALF_THICKNESS = 0.024;
const CANNON_MOUTH_RADIUS = 0.135;
const CANNON_MOUTH_HEIGHT = 0.08;
const CANNON_MUZZLE_CLEARANCE = 0.17;
const CANNON_COOLDOWN = 0.22;

export function createTrickShotPhysics() {
  return { capture: null, cooldowns: Object.create(null) };
}

export function resetTrickShotPhysics(runtime) {
  runtime.capture = null;
  runtime.cooldowns = Object.create(null);
  return runtime;
}

function tickCooldowns(runtime, dt) {
  for (const id of Object.keys(runtime.cooldowns)) {
    runtime.cooldowns[id] -= dt;
    if (runtime.cooldowns[id] <= 0) delete runtime.cooldowns[id];
  }
}

function holdOrLaunch(ball, pieces, runtime, dt) {
  if (!runtime.capture) return null;
  const cannon = pieces.find((piece) => piece.type === CANNON_PIECE && piece.id === runtime.capture.pieceId);
  if (!cannon) {
    runtime.capture = null;
    return { contacts: [], captured: false, launched: false };
  }

  ball.x = cannon.x;
  ball.y = cannon.y + CANNON_MOUTH_HEIGHT;
  ball.z = cannon.z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.omegaX = 0;
  runtime.capture.remaining -= dt;
  if (runtime.capture.remaining > 1e-9) {
    return { contacts: [], captured: true, launched: false };
  }

  const direction = cannonDirection(cannon);
  ball.x = cannon.x + direction.x * CANNON_MUZZLE_CLEARANCE;
  ball.y = cannon.y + CANNON_MOUTH_HEIGHT + direction.y * CANNON_MUZZLE_CLEARANCE;
  ball.z = cannon.z + direction.z * CANNON_MUZZLE_CLEARANCE;
  ball.vx = direction.x * cannon.speed;
  ball.vy = direction.y * cannon.speed;
  ball.vz = direction.z * cannon.speed;
  ball.omegaX = cannon.speed / BALL_RADIUS_WORLD;
  runtime.cooldowns[cannon.id] = CANNON_COOLDOWN;
  runtime.capture = null;
  return { contacts: ["sandbox-cannon-fire"], captured: false, launched: true };
}

function catchWithCannon(ball, previous, cannon, runtime) {
  if (runtime.cooldowns[cannon.id] > 0 || ball.vy >= 0) return false;
  const mouthY = cannon.y + CANNON_MOUTH_HEIGHT;
  // The centre crosses the lip plane downward inside a circular x/z mouth.
  if (previous.y < mouthY || ball.y > mouthY) return false;
  if (Math.hypot(ball.x - cannon.x, ball.z - cannon.z) > CANNON_MOUTH_RADIUS) return false;

  runtime.capture = { pieceId: cannon.id, remaining: cannon.delay };
  ball.x = cannon.x;
  ball.y = mouthY;
  ball.z = cannon.z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
  ball.omegaX = 0;
  return true;
}

function resolveBoard(ball, board) {
  const half = board.length / 2;
  const dx = Math.cos(board.angle);
  const dy = Math.sin(board.angle);
  const ax = board.x - dx * half;
  const ay = board.y - dy * half;
  const az = board.z;
  const segmentLength2 = board.length * board.length;
  const along = Math.max(0, Math.min(1, ((ball.x - ax) * (dx * board.length) + (ball.y - ay) * (dy * board.length)) / segmentLength2));
  const closest = {
    x: ax + dx * board.length * along,
    y: ay + dy * board.length * along,
    z: az,
  };
  let nx = ball.x - closest.x;
  let ny = ball.y - closest.y;
  let nz = ball.z - closest.z;
  const distance = Math.hypot(nx, ny, nz);
  const clearance = BALL_RADIUS_WORLD + BOARD_HALF_THICKNESS;
  if (distance >= clearance) return false;

  if (distance < 1e-8) {
    // Pick the board-normal direction opposing the incoming velocity. This is
    // rare but keeps an exact centre hit finite and deterministic.
    nx = -dy;
    ny = dx;
    nz = 0;
    if (ball.vx * nx + ball.vy * ny > 0) {
      nx *= -1;
      ny *= -1;
    }
  } else {
    nx /= distance;
    ny /= distance;
    nz /= distance;
  }

  const normalSpeed = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (normalSpeed >= 0) return false;
  const impulse = (1 + board.restitution) * normalSpeed;
  ball.vx -= impulse * nx;
  ball.vy -= impulse * ny;
  ball.vz -= impulse * nz;
  ball.x = closest.x + nx * clearance;
  ball.y = closest.y + ny * clearance;
  ball.z = closest.z + nz * clearance;
  return true;
}

/** Advance capture timing and resolve any piece contacts for one substep. */
export function stepTrickShotPieces(ball, previous, pieces, runtime, dt) {
  tickCooldowns(runtime, dt);
  const held = holdOrLaunch(ball, pieces, runtime, dt);
  if (held) return held;

  for (const cannon of pieces) {
    if (cannon.type === CANNON_PIECE && catchWithCannon(ball, previous, cannon, runtime)) {
      return { contacts: ["sandbox-cannon-catch"], captured: true, launched: false };
    }
  }

  const contacts = [];
  for (const board of pieces) {
    if (board.type === BOARD_PIECE && resolveBoard(ball, board)) contacts.push("sandbox-board");
  }
  return { contacts, captured: false, launched: false };
}

