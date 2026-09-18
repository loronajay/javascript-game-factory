// Per-lane run telemetry — the authoritative tally of what a runner did.
//
// A lane's stats live on the player object (`player.stats`) and are written at
// exactly one place: `recordObstacleOutcome`, called from game-tick's grade
// resolution. Scoring, visual feedback, the online snapshot and the achievement
// submission all read the SAME resolved grade, so a Perfect the player earned
// cannot be tallied as anything else somewhere downstream.
//
// Pure: no DOM, no storage, no clock. Player objects are treated as immutable,
// matching the rest of the sim.

const OBSTACLE_TYPE_KEYS = ['spikes', 'bird', 'arrowwall', 'goblin'];

function emptyByType() {
  return { spikes: 0, bird: 0, arrowwall: 0, goblin: 0 };
}

function createLaneStats() {
  return {
    perfects: 0,
    goods: 0,
    misses: 0,
    successfulByType: emptyByType(),
    perfectByType:    emptyByType(),
    missesByType:     emptyByType(),
    // The fixed four-obstacle warmup, tracked directly rather than inferred
    // from score: the obstacles carry `isWarmup` and this counts them as they
    // resolve, so "Clean Start" is a fact about those four and nothing else.
    warmupFaced:  0,
    warmupMisses: 0,
  };
}

function isKnownType(type) {
  return OBSTACLE_TYPE_KEYS.includes(type);
}

// Returns a new player with the outcome tallied. `grade` is the single resolved
// grade for this obstacle ('perfect' | 'good' | 'miss'); anything else is a
// programming error upstream and is counted as a miss so it cannot inflate a
// clean-run stat.
function recordObstacleOutcome(player, obstacle, grade) {
  const prev = player.stats || createLaneStats();
  const type = obstacle && isKnownType(obstacle.type) ? obstacle.type : null;
  const stats = {
    ...prev,
    successfulByType: { ...prev.successfulByType },
    perfectByType:    { ...prev.perfectByType },
    missesByType:     { ...prev.missesByType },
  };

  if (grade === 'perfect') {
    stats.perfects += 1;
    if (type) { stats.successfulByType[type] += 1; stats.perfectByType[type] += 1; }
  } else if (grade === 'good') {
    stats.goods += 1;
    if (type) stats.successfulByType[type] += 1;
  } else {
    stats.misses += 1;
    if (type) stats.missesByType[type] += 1;
  }

  if (obstacle && obstacle.isWarmup) {
    stats.warmupFaced += 1;
    if (grade !== 'perfect' && grade !== 'good') stats.warmupMisses += 1;
  }

  return { ...player, stats };
}

// Defensive copy used when stats arrive over the wire (online snapshots).
function sanitizeLaneStats(value) {
  const src = value && typeof value === 'object' ? value : {};
  const count = (n) => {
    const v = Math.floor(Number(n));
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const byType = (map) => {
    const out = emptyByType();
    for (const key of OBSTACLE_TYPE_KEYS) out[key] = count(map && map[key]);
    return out;
  };
  return {
    perfects: count(src.perfects),
    goods:    count(src.goods),
    misses:   count(src.misses),
    successfulByType: byType(src.successfulByType),
    perfectByType:    byType(src.perfectByType),
    missesByType:     byType(src.missesByType),
    warmupFaced:  count(src.warmupFaced),
    warmupMisses: count(src.warmupMisses),
  };
}

export {
  OBSTACLE_TYPE_KEYS,
  createLaneStats,
  recordObstacleOutcome,
  sanitizeLaneStats,
};
