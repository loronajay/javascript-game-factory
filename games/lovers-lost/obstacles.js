'use strict';

const { distPerFrame } = typeof module !== 'undefined'
  ? require('./player')
  : window;

// ─── Constants ────────────────────────────────────────────────────────────────
const OBSTACLE_TYPES   = ['spikes', 'bird', 'arrowwall', 'goblin'];
const WARMUP_SEQUENCE  = ['spikes', 'bird', 'goblin', 'arrowwall'];
const WARMUP_SPACING   = 80;   // distance units between warmup obstacles
const WAVE_SPACING_MIN = 35;   // min distance units between wave obstacles
const WAVE_SPACING_MAX = 55;   // max distance units between wave obstacles
const WAVE_COUNTS      = [10, 15, 20, 25, 30]; // obstacles per wave (waves 1–5)
const PERFECT_FRAMES   = 1;
const GOOD_FRAMES      = 4;
const MAX_REPEAT       = 3;

// Wave 1 start position (after warmup: 4 obstacles × 80 spacing = 320 + buffer)
const WAVE_START_POSITIONS = [420, 1020, 1770, 2720, 3820];

// ─── RNG (seedable LCG for deterministic generation) ─────────────────────────
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────
function createObstacle(type, position, options) {
  const base = { type, position };
  if (type === 'goblin') {
    return {
      ...base,
      twoPhase: (options && options.twoPhase) || false,
      phase: 0,
    };
  }
  return base;
}

// ─── Required input ───────────────────────────────────────────────────────────
const SINGLE_PHASE_INPUT = {
  spikes:    'jump',
  bird:      'crouch',
  arrowwall: 'block',
  goblin:    'attack',
};

const GOBLIN_TWO_PHASE_INPUTS = ['block', 'attack'];

function requiredInput(obstacle) {
  if (obstacle.type === 'goblin' && obstacle.twoPhase) {
    return GOBLIN_TWO_PHASE_INPUTS[obstacle.phase];
  }
  return SINGLE_PHASE_INPUT[obstacle.type];
}

function advanceGoblinPhase(obstacle) {
  return { ...obstacle, phase: obstacle.phase + 1 };
}

// ─── Timing windows ───────────────────────────────────────────────────────────
function gradeInput(obstacle, playerDistance, playerSpeed) {
  const delta = Math.abs(playerDistance - obstacle.position);
  const frame = distPerFrame(playerSpeed);
  if (delta <= frame * PERFECT_FRAMES) return 'perfect';
  if (delta <= frame * GOOD_FRAMES)    return 'good';
  return 'miss';
}

function windowExpired(obstacle, playerDistance, playerSpeed) {
  return playerDistance > obstacle.position + distPerFrame(playerSpeed) * GOOD_FRAMES;
}

// ─── Warmup sequence (fixed) ──────────────────────────────────────────────────
function generateWarmup(startPosition, spacing) {
  const sp = spacing !== undefined ? spacing : WARMUP_SPACING;
  return WARMUP_SEQUENCE.map((type, i) =>
    createObstacle(type, startPosition + sp * (i + 1))
  );
}

// ─── Wave generation (procedural) ────────────────────────────────────────────
function pickType(rng, lastTypes) {
  const runLen = lastTypes.length;
  // If we've hit the repeat cap, exclude the last type
  const last = runLen >= MAX_REPEAT ? lastTypes[runLen - 1] : null;
  const pool = last ? OBSTACLE_TYPES.filter(t => t !== last) : OBSTACLE_TYPES;
  return pool[Math.floor(rng() * pool.length)];
}

function generateWave(waveNumber, rng) {
  const count     = WAVE_COUNTS[waveNumber - 1];
  const start     = WAVE_START_POSITIONS[waveNumber - 1];
  const obstacles = [];
  const recent    = []; // tracks last MAX_REPEAT types to enforce repeat cap
  let pos         = start;

  for (let i = 0; i < count; i++) {
    const type    = pickType(rng, recent);
    const spacing = WAVE_SPACING_MIN + Math.floor(rng() * (WAVE_SPACING_MAX - WAVE_SPACING_MIN + 1));
    pos          += spacing;

    // Two-phase goblins only appear in wave 2+
    const twoPhase = type === 'goblin'
      && waveNumber >= 2
      && rng() < 0.35; // ~35% of goblins in wave 2+ are two-phase

    obstacles.push(createObstacle(type, pos, { twoPhase }));

    recent.push(type);
    if (recent.length > MAX_REPEAT) recent.shift();
  }

  return obstacles;
}

// ─── Exports ─────────────────────────────────────────────────────────────────
const obstaclesModule = {
  createObstacle,
  generateWarmup,
  generateWave,
  requiredInput,
  advanceGoblinPhase,
  gradeInput,
  windowExpired,
  makeRng,
  OBSTACLE_TYPES,
  WARMUP_SEQUENCE,
  WAVE_COUNTS,
};

if (typeof module !== 'undefined') module.exports = obstaclesModule;
else Object.assign(window, obstaclesModule);
