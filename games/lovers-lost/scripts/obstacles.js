
import { distPerFrame } from './player.js';

// ─── Constants ────────────────────────────────────────────────────────────────
const OBSTACLE_TYPES   = ['spikes', 'bird', 'arrowwall', 'goblin'];
const WARMUP_SEQUENCE  = ['spikes', 'bird', 'goblin', 'arrowwall'];
const WARMUP_SPACING   = 80;   // distance units between warmup obstacles
const WAVE_SPACING_MIN = 54;   // min distance units between wave obstacles
const WAVE_SPACING_MAX = 74;   // max distance units between wave obstacles
const WAVE_COUNTS      = [10, 15, 20, 25, 30]; // obstacles per wave (waves 1–5)
const MAX_REPEAT       = 3;
const PAIR_SPACING_BUFFER = 1;
const SPIKE_CHAIN_MAX_SPACING = 18;
const SPIKE_RESET_MIN_SPACING = 40;
// Bird moves at 2× visual PPU (BIRD_SPEED_MULT=2 in renderer). When bird precedes another
// obstacle, their screen positions overlap when bird.distDelta == spacing. To keep the
// trailing obstacle off-screen at that moment: spacing >= (HALF_W - contactX)/(2×PPU) ≈ 40.
// 50 gives ~82px of on-screen separation when the trailing obstacle first enters view.
const BIRD_VISUAL_FOLLOW_MIN = 50;
const HITBOX_WINDOWS   = {
  spikes:    { open: 9,  perfect: 1.5, late: 2 },
  bird:      { open: 12, perfect: 2,   late: 3 },
  arrowwall: { open: 12, perfect: 2.5, late: 2 },
  goblin:    { open: 10, perfect: 2,   late: 3 },
};
const RESOLVE_TAILS = {
  spikes: 18,
  bird: 11,
  arrowwall: 4,
  goblin: 4,
};

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
function createObstacle(type, position) {
  return { type, position };
}

// ─── Required input ───────────────────────────────────────────────────────────
const SINGLE_PHASE_INPUT = {
  spikes:    'jump',
  bird:      'crouch',
  arrowwall: 'block',
  goblin:    'attack',
};

function requiredInput(obstacle) {
  return SINGLE_PHASE_INPUT[obstacle.type];
}

// ─── Timing windows ───────────────────────────────────────────────────────────
function obstacleWindow(obstacle) {
  return HITBOX_WINDOWS[obstacle.type] || HITBOX_WINDOWS.spikes;
}

// Inputs are sampled once per tick, so a Perfect window narrower than a tick
// of travel can fall between two frames and be impossible to hit. The base
// windows above are tuned for starting speed (1 unit/tick); as speed climbs the
// window keeps at least this many ticks of width so Perfect stays reachable.
const PERFECT_MIN_TICKS = 2;

function perfectWindow(obstacle, speed) {
  const base = obstacleWindow(obstacle).perfect;
  if (speed == null) return base;
  return Math.max(base, PERFECT_MIN_TICKS * distPerFrame(speed));
}

// Grades an input made at `playerDistance` against the obstacle's window.
// `speed` (optional) widens the Perfect band per PERFECT_MIN_TICKS.
function gradeInput(obstacle, playerDistance, speed) {
  const { open, late } = obstacleWindow(obstacle);
  const perfect = perfectWindow(obstacle, speed);
  const delta = obstacle.position - playerDistance;

  if (delta > open) return 'miss';
  if (delta < -late) return 'miss';
  if (Math.abs(delta) <= perfect) return 'perfect';
  return 'good';
}

// ─── Spike jump reference ─────────────────────────────────────────────────────
// A spike is not cleared at its position: the jump needs SPIKE_JUMP_RISE_TICKS
// ticks of rise (jumpY 14.5px under JUMP_VY=8, gravity 0.5) before the first
// spike tip reaches the runner's feet, and at that tick the tip sits
// SPIKE_TIP_LEAD units past the spike's position. So the latest jump that
// clears a spike starts `2·distPerFrame(speed) − 1.16` units ahead of it — at
// starting speed ~0.8 units, at speed 50 ~3.3. Grading the jump around the
// spike position itself (the previous behaviour) put the Perfect band on
// frames where the jump had already failed, which is why Perfect on spikes
// stopped being reachable once a chain raised the speed.
//
// The lead is the GIRL's figure. The boy's contact point sits one pixel
// further from his sprite (BOY_CONTACT_REL_PX 42 vs a visible edge at 41), so
// he can jump a quarter-unit later; the band is symmetric around the
// reference, so that quarter-unit still grades Perfect for him. Using the
// tighter side means neither side can be graded Perfect on a jump that
// would have failed. tests/telemetry.test.js checks this constant against
// the real collision sim at several speeds for both sides.
const SPIKE_JUMP_RISE_TICKS = 2;
const SPIKE_TIP_LEAD        = 1.16;

function spikeLatestJumpDelta(speed) {
  return SPIKE_JUMP_RISE_TICKS * distPerFrame(speed) - SPIKE_TIP_LEAD;
}

// Grades a spike jump by how late it started relative to the latest safe
// jump: inside the Perfect band past that point is Perfect, any earlier valid
// jump is Good. Same window shape as every other obstacle, shifted reference.
function gradeSpikeJump(obstacle, jumpStartDistance, speed) {
  const reference = jumpStartDistance + spikeLatestJumpDelta(speed);
  return gradeInput(obstacle, reference, speed);
}

function windowExpired(obstacle, playerDistance) {
  return playerDistance > obstacle.position + obstacleWindow(obstacle).late;
}

function obstacleResolveTail(obstacle) {
  return RESOLVE_TAILS[obstacle.type] || RESOLVE_TAILS.spikes;
}

function minimumSpacingForPair(previousObstacle, nextObstacle) {
  if (!previousObstacle || !nextObstacle) return WAVE_SPACING_MIN;
  if (previousObstacle.type === 'spikes' && nextObstacle.type === 'spikes') {
    return SPIKE_RESET_MIN_SPACING;
  }

  const prevTail = obstacleResolveTail(previousObstacle);
  const nextOpen = obstacleWindow(nextObstacle).open;
  const actionMin = Math.ceil(prevTail + nextOpen + PAIR_SPACING_BUFFER);

  // Bird's 2× visual speed makes it appear to overlap with any trailing obstacle
  // when bird.distDelta == spacing. Enforce the visual-safe minimum.
  if (previousObstacle.type === 'bird') {
    return Math.max(actionMin, BIRD_VISUAL_FOLLOW_MIN);
  }

  return actionMin;
}

function pairSpacingIsFeasible(previousObstacle, nextObstacle) {
  if (!previousObstacle || !nextObstacle) return true;
  const spacing = nextObstacle.position - previousObstacle.position;
  if (spacing <= 0) return false;

  if (previousObstacle.type === 'spikes' && nextObstacle.type === 'spikes') {
    return spacing <= SPIKE_CHAIN_MAX_SPACING || spacing >= SPIKE_RESET_MIN_SPACING;
  }

  return spacing >= minimumSpacingForPair(previousObstacle, nextObstacle);
}

function chooseFeasibleSpacing(previousObstacle, nextObstacle, desiredSpacing) {
  if (!previousObstacle || !nextObstacle) return desiredSpacing;

  if (previousObstacle.type === 'spikes' && nextObstacle.type === 'spikes') {
    if (desiredSpacing <= SPIKE_CHAIN_MAX_SPACING) return desiredSpacing;
    if (desiredSpacing < SPIKE_RESET_MIN_SPACING) return SPIKE_RESET_MIN_SPACING;
    return desiredSpacing;
  }

  return Math.max(desiredSpacing, minimumSpacingForPair(previousObstacle, nextObstacle));
}

// ─── Warmup sequence (fixed) ──────────────────────────────────────────────────
function generateWarmup(startPosition, spacing) {
  const sp = spacing !== undefined ? spacing : WARMUP_SPACING;
  return WARMUP_SEQUENCE.map((type, i) => ({
    ...createObstacle(type, startPosition + sp * (i + 1)),
    isWarmup: true,
  }));
}

// ─── Wave generation (procedural) ────────────────────────────────────────────
function pickType(rng, lastTypes) {
  const runLen = lastTypes.length;
  // If we've hit the repeat cap, exclude the last type
  const last = runLen >= MAX_REPEAT ? lastTypes[runLen - 1] : null;
  const pool = last ? OBSTACLE_TYPES.filter(t => t !== last) : OBSTACLE_TYPES;
  return pool[Math.floor(rng() * pool.length)];
}

function generateWave(waveNumber, rng, prevLastObstacle) {
  const count     = WAVE_COUNTS[waveNumber - 1];
  const start     = WAVE_START_POSITIONS[waveNumber - 1];
  const obstacles = [];
  const recent    = []; // tracks last MAX_REPEAT types to enforce repeat cap
  let pos         = start;

  for (let i = 0; i < count; i++) {
    const type    = pickType(rng, recent);
    const previousObstacle = obstacles[obstacles.length - 1] || prevLastObstacle || null;
    const desiredSpacing = WAVE_SPACING_MIN + Math.floor(rng() * (WAVE_SPACING_MAX - WAVE_SPACING_MIN + 1));
    const candidate = createObstacle(type, 0);
    const spacing = chooseFeasibleSpacing(previousObstacle, candidate, desiredSpacing);
    // For the first obstacle in a wave, anchor spacing against the previous wave's last
    // obstacle position (not the hardcoded wave start) to avoid cross-wave crowding.
    if (i === 0 && prevLastObstacle) {
      pos = Math.max(pos + spacing, prevLastObstacle.position + spacing);
    } else {
      pos += spacing;
    }

    obstacles.push(createObstacle(type, pos));

    recent.push(type);
    if (recent.length > MAX_REPEAT) recent.shift();
  }

  return obstacles;
}

// ─── Exports ─────────────────────────────────────────────────────────────────
export {
  createObstacle,
  generateWarmup,
  generateWave,
  minimumSpacingForPair,
  pairSpacingIsFeasible,
  requiredInput,
  gradeInput,
  perfectWindow,
  gradeSpikeJump,
  spikeLatestJumpDelta,
  windowExpired,
  makeRng,
  OBSTACLE_TYPES,
  WARMUP_SEQUENCE,
  WAVE_COUNTS,
  BIRD_VISUAL_FOLLOW_MIN,
  PERFECT_MIN_TICKS,
};
