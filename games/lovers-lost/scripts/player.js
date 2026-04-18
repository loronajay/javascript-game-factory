// ─── Constants ────────────────────────────────────────────────────────────────
const SPEED_FLOOR           = 5;
const RUN_DISTANCE          = 5400;
const FRAMERATE             = 60;
const PERFECT_BASE_GAIN     = 3;
const GOOD_GAIN             = 1;
const MISS_PENALTY_PCT      = 0.15;
const CHAIN_BREAK_MULT      = 2.0;
const SPEED_CHAIN_K         = 0.25;
const SCORE_CHAIN_K         = 0.06;
const TOTAL_OBSTACLES       = 104;
const ASSIST_TRIGGER_SECS   = 90;
const ASSIST_BOOST_PCT      = 0.60;
const ASSIST_MAX_OPP        = 3;
const WARMUP_OBSTACLE_COUNT = 4;
const STARTING_SPEED        = 10; // players begin here; floor (5) is reached only after heavy misses

// ─── Factory ──────────────────────────────────────────────────────────────────
function createPlayer(side) {
  return {
    side,               // 'boy' | 'girl'
    speed: SPEED_FLOOR,
    score: 0,
    distance: 0,
    chain: 0,
    obstaclesFaced: 0,
    state: 'running',   // running | jumping | crouching | blocking | attacking | hit | finished
    jumpStartDistance: null,
    assistActive: false,
    assistOpportunities: 0,
  };
}

// ─── Multipliers ──────────────────────────────────────────────────────────────
function speedMultiplier(chain, obstaclesFaced) {
  return 1 + Math.sqrt(chain) * SPEED_CHAIN_K * (obstaclesFaced / TOTAL_OBSTACLES);
}

function scoreMultiplier(chain, obstaclesFaced) {
  return 1 + chain * SCORE_CHAIN_K * (obstaclesFaced / TOTAL_OBSTACLES);
}

// ─── Speed helpers ────────────────────────────────────────────────────────────
function clampSpeed(speed) {
  return Math.max(SPEED_FLOOR, speed);
}

function clampScore(score) {
  return Math.max(0, score);
}

function applyChainBreak(player) {
  if (player.chain === 0) return player;
  return {
    ...player,
    speed: clampSpeed(player.speed - player.chain * CHAIN_BREAK_MULT),
    chain: 0,
  };
}

// ─── Timing grade outcomes ────────────────────────────────────────────────────
function applyPerfect(player) {
  const sMult = speedMultiplier(player.chain, player.obstaclesFaced);
  const cMult = scoreMultiplier(player.chain, player.obstaclesFaced);
  return {
    ...player,
    speed: player.speed + PERFECT_BASE_GAIN * sMult,
    score: player.score + Math.round(300 * cMult),
    chain: player.chain + 1,
    obstaclesFaced: player.obstaclesFaced + 1,
  };
}

function applyGood(player) {
  const after = applyChainBreak(player);
  return {
    ...after,
    speed: clampSpeed(after.speed + GOOD_GAIN),
    score: after.score + 100,
    obstaclesFaced: after.obstaclesFaced + 1,
  };
}

function applyMiss(player) {
  const after = applyChainBreak(player);
  return {
    ...after,
    speed: clampSpeed(after.speed - after.speed * MISS_PENALTY_PCT),
    score: clampScore(after.score - 150),
    obstaclesFaced: after.obstaclesFaced + 1,
  };
}

// ─── Distance / movement ──────────────────────────────────────────────────────
function distPerFrame(speed) {
  // sqrt(speed/10): smooth curve throughout, floor(5)→0.707, start(10)→1.0, speed50→2.24.
  // Each perfect gives ~10% visual speed gain at start, tapering to ~4% at high speed.
  return Math.sqrt(speed / 10);
}

function advanceDistance(player) {
  return { ...player, distance: player.distance + distPerFrame(player.speed) };
}

function isFinished(player) {
  return player.distance >= RUN_DISTANCE;
}

// ─── Projected finish time ────────────────────────────────────────────────────
function projectedFinish(player, elapsedSeconds) {
  if (isFinished(player)) return elapsedSeconds;
  const remaining = RUN_DISTANCE - player.distance;
  const framesRemaining = remaining / distPerFrame(player.speed);
  return elapsedSeconds + framesRemaining / FRAMERATE;
}

// ─── Assist system ────────────────────────────────────────────────────────────
function checkAssist(player, elapsedSeconds) {
  if (player.assistActive) return player;
  if (player.obstaclesFaced < WARMUP_OBSTACLE_COUNT) return player;
  if (projectedFinish(player, elapsedSeconds) >= ASSIST_TRIGGER_SECS) {
    return { ...player, assistActive: true, assistOpportunities: ASSIST_MAX_OPP };
  }
  return player;
}

function applyAssistBoost(player) {
  if (!player.assistActive || player.assistOpportunities <= 0) return player;
  const remaining = player.assistOpportunities - 1;
  return {
    ...player,
    speed: player.speed + player.speed * ASSIST_BOOST_PCT,
    assistOpportunities: remaining,
    assistActive: remaining > 0,
  };
}

function deactivateAssistIfRecovered(player, elapsedSeconds) {
  if (!player.assistActive) return player;
  if (projectedFinish(player, elapsedSeconds) < ASSIST_TRIGGER_SECS) {
    return { ...player, assistActive: false };
  }
  return player;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  createPlayer,
  speedMultiplier,
  scoreMultiplier,
  distPerFrame,
  applyPerfect,
  applyGood,
  applyMiss,
  advanceDistance,
  isFinished,
  projectedFinish,
  checkAssist,
  applyAssistBoost,
  deactivateAssistIfRecovered,
  SPEED_FLOOR,
  RUN_DISTANCE,
  STARTING_SPEED,
  ASSIST_TRIGGER_SECS,
};
