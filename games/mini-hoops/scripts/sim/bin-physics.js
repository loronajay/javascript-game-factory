// Reusable trash-bin geometry and ball integration. A bin is not a score zone:
// it is a tapered body plus a torus lip, with a descending mouth-plane crossing
// registering the make. The same target objects can be reused by later modes.

import { ballFlight, rollPhasePerRadian } from "../assets/ball-catalog.js";
import {
  BALL_RADIUS_WORLD,
  BOARD_Z,
  CEILING_Y,
  FLOOR_RESTITUTION,
  GRAVITY,
  PHYSICS_SUBSTEP_SECONDS,
  SPIN_DECAY_PER_TICK,
} from "./constants.js";

export const BIN_MOUTH_Y = 0.36;
export const BIN_MOUTH_RADIUS = 0.16;
export const BIN_BOTTOM_RADIUS = 0.11;
export const BIN_RIM_TUBE_RADIUS = 0.024;
export const BIN_WALL_THICKNESS = 0.018;

// The front row deliberately starts at z=.40. A target body has real depth and
// the held ball has real radius; moving it closer would make the ball begin its
// shot already intersecting the front wall of the nearest bin.
const ROW_Z = Object.freeze([0.87, 0.60, 0.33]);
const COLUMN_X = Object.freeze([-0.5, 0, 0.5]);
const SEPARATION = 0.0015;

export function createBinTargets() {
  return ROW_Z.flatMap((z, row) => COLUMN_X.map((x, column) => Object.freeze({
    index: row * 3 + column,
    row,
    column,
    x,
    z,
    topY: BIN_MOUTH_Y,
    mouthRadius: BIN_MOUTH_RADIUS,
    bottomRadius: BIN_BOTTOM_RADIUS,
    rimTubeRadius: BIN_RIM_TUBE_RADIUS,
  })));
}

export function detectBinScore(ball, previous, bin) {
  if (ball.vy >= 0 || previous.y <= bin.topY || ball.y > bin.topY) return false;
  const drop = previous.y - ball.y;
  if (drop <= 1e-7) return false;
  const t = (previous.y - bin.topY) / drop;
  const x = previous.x + (ball.x - previous.x) * t;
  const z = previous.z + (ball.z - previous.z) * t;
  const clearance = bin.mouthRadius - BALL_RADIUS_WORLD - bin.rimTubeRadius * 0.55;
  return Math.hypot(x - bin.x, z - bin.z) < clearance;
}

export function resolveBinRimContact(ball, bin, flight = { bounce: 1, grip: 1 }) {
  const dx = ball.x - bin.x;
  const dz = ball.z - bin.z;
  const radial = Math.hypot(dx, dz);
  if (radial < 1e-7) return null;
  const cx = bin.x + (bin.mouthRadius * dx) / radial;
  const cz = bin.z + (bin.mouthRadius * dz) / radial;
  let nx = ball.x - cx;
  let ny = ball.y - bin.topY;
  let nz = ball.z - cz;
  const distance = Math.hypot(nx, ny, nz);
  const contact = BALL_RADIUS_WORLD + bin.rimTubeRadius;
  if (distance >= contact || distance < 1e-7) return null;
  nx /= distance; ny /= distance; nz /= distance;
  const penetration = contact - distance + SEPARATION;
  ball.x += nx * penetration;
  ball.y += ny * penetration;
  ball.z += nz * penetration;
  const normalSpeed = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (normalSpeed < 0) {
    const restitution = Math.max(0, Math.min(0.86, 0.58 * (flight.bounce ?? 1)));
    ball.vx -= (1 + restitution) * normalSpeed * nx;
    ball.vy -= (1 + restitution) * normalSpeed * ny;
    ball.vz -= (1 + restitution) * normalSpeed * nz;
    const grip = Math.min(0.3, 0.09 * (flight.grip ?? 1));
    ball.vx *= 1 - grip;
    ball.vz *= 1 - grip;
  }
  return "bin-rim";
}

export function resolveBinWallContact(ball, previous, bin, flight = { bounce: 1 }) {
  if (ball.y <= BALL_RADIUS_WORLD || ball.y >= bin.topY + BALL_RADIUS_WORLD) return null;
  const height = Math.max(0, Math.min(1, ball.y / bin.topY));
  const bodyRadius = bin.bottomRadius + (bin.mouthRadius - bin.bottomRadius) * height;
  const dx = ball.x - bin.x;
  const dz = ball.z - bin.z;
  const radial = Math.hypot(dx, dz);
  if (radial < 1e-7) return null;
  const insideLimit = bodyRadius - BIN_WALL_THICKNESS - BALL_RADIUS_WORLD;
  const outsideLimit = bodyRadius + BIN_WALL_THICKNESS + BALL_RADIUS_WORLD;
  if (radial < insideLimit || radial > outsideLimit) return null;

  const previousRadial = Math.hypot(previous.x - bin.x, previous.z - bin.z);
  const fromInside = previousRadial < bodyRadius;
  const ux = dx / radial;
  const uz = dz / radial;
  const normalSign = fromInside ? -1 : 1;
  const nx = ux * normalSign;
  const nz = uz * normalSign;
  const target = fromInside ? insideLimit - SEPARATION : outsideLimit + SEPARATION;
  ball.x = bin.x + ux * target;
  ball.z = bin.z + uz * target;
  const normalSpeed = ball.vx * nx + ball.vz * nz;
  if (normalSpeed < 0) {
    const bounce = Math.min(0.72, 0.34 * (flight.bounce ?? 1));
    ball.vx -= (1 + bounce) * normalSpeed * nx;
    ball.vz -= (1 + bounce) * normalSpeed * nz;
    ball.vy *= 0.88;
  }
  return "bin-wall";
}

export function stepBallAgainstBins(ball, bins, tickSeconds, { ballId = "basketball", capturedBin = null } = {}) {
  const substeps = Math.max(1, Math.ceil(tickSeconds / PHYSICS_SUBSTEP_SECONDS));
  const dt = tickSeconds / substeps;
  const flight = ballFlight(ballId);
  const gravity = GRAVITY * flight.weight;
  const dragKeep = flight.drag > 0 ? Math.exp(-flight.drag * dt) : 1;
  const phasePerRadian = rollPhasePerRadian(ballId);
  const contacts = [];
  let scoredBin = null;
  let capture = capturedBin;

  for (let step = 0; step < substeps; step++) {
    const previous = { x: ball.x, y: ball.y, z: ball.z };
    ball.vy -= gravity * dt;
    ball.vx *= dragKeep; ball.vy *= dragKeep; ball.vz *= dragKeep;
    ball.x += ball.vx * dt; ball.y += ball.vy * dt; ball.z += ball.vz * dt;
    ball.omegaX *= Math.pow(SPIN_DECAY_PER_TICK, dt * 60);
    ball.rollPhase += ball.omegaX * dt * phasePerRadian;

    if (capture === null) {
      for (const bin of bins) {
        if (detectBinScore(ball, previous, bin)) {
          scoredBin = bin.index;
          capture = bin.index;
          contacts.push("bin-score");
          break;
        }
      }
    }

    for (const bin of bins) {
      if (bin.index === capture) continue;
      const rim = resolveBinRimContact(ball, bin, flight);
      if (rim) contacts.push(rim);
      const wall = resolveBinWallContact(ball, previous, bin, flight);
      if (wall) contacts.push(wall);
    }

    if (capture !== null) {
      const target = bins.find((bin) => bin.index === capture);
      if (target) containCapturedBall(ball, target, dt);
    }
    containRoom(ball, flight);
  }
  return { contacts, scoredBin, capturedBin: capture };
}

function containCapturedBall(ball, bin, dt) {
  const dx = ball.x - bin.x;
  const dz = ball.z - bin.z;
  const radial = Math.hypot(dx, dz);
  const limit = Math.max(0.015, bin.mouthRadius - BALL_RADIUS_WORLD - BIN_WALL_THICKNESS);
  if (radial > limit) {
    const scale = limit / radial;
    ball.x = bin.x + dx * scale;
    ball.z = bin.z + dz * scale;
  }
  const keep = Math.pow(0.035, dt);
  ball.vx *= keep;
  ball.vz *= keep;
  ball.vy = Math.min(ball.vy, -0.45);
}

function containRoom(ball, flight) {
  const ceiling = CEILING_Y - BALL_RADIUS_WORLD;
  if (ball.y > ceiling) {
    ball.y = ceiling - SEPARATION;
    ball.vy = -Math.abs(ball.vy) * 0.25 * flight.bounce;
  }
  const wall = BOARD_Z - BALL_RADIUS_WORLD;
  if (ball.z > wall) {
    ball.z = wall - SEPARATION;
    ball.vz = -Math.abs(ball.vz) * 0.3 * flight.bounce;
  }
  if (ball.y < BALL_RADIUS_WORLD) {
    ball.y = BALL_RADIUS_WORLD;
    if (Math.abs(ball.vy) > 0.42) ball.vy = Math.abs(ball.vy) * FLOOR_RESTITUTION * flight.bounce;
    else ball.vy = 0;
    ball.vx *= 0.72;
    ball.vz *= 0.72;
  }
}
