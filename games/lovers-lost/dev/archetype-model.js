// Archetype simulation model for Lovers Lost
// Run with: node dev/archetype-model.js

const WAVE_SIZES   = [10, 15, 20, 25, 30]; // 5 waves, 100 obstacles total
const TOTAL_OBS    = 4 + WAVE_SIZES.reduce((a, b) => a + b, 0); // 104 inc. warmup
const BASE_SPEED   = 5;
const SPEED_FLOOR  = 5;
const PERFECT_GAIN = 3;
const GOOD_GAIN    = 1;
const HIT_PENALTY  = 0.15;  // 15% of current speed
const CURVE_EXP    = 0.2;
const FPS          = 60;
const DEADLINE     = 90 * FPS; // 5400 frames

// ─── Chain multipliers ────────────────────────────────────────────────────────
// speed_mult = 1 + sqrt(chain) * 0.15 * (obstacles_faced / total)
// score_mult = 1 + chain * 0.10 * (obstacles_faced / total)
const SPEED_CHAIN_K   = 0.25;  // LOCKED
const SCORE_CHAIN_K   = 0.06;  // LOCKED
const CHAIN_BREAK_K   = 2.0;   // LOCKED — speed lost on chain break = chain_length × this

function speedMult(chain, faced) {
  return 1 + Math.sqrt(chain) * SPEED_CHAIN_K * (faced / TOTAL_OBS);
}
function scoreMult(chain, faced) {
  return 1 + chain * SCORE_CHAIN_K * (faced / TOTAL_OBS);
}

// Speed → distance per frame
function distPerFrame(speed) {
  return Math.pow(speed / BASE_SPEED, CURVE_EXP);
}

// Simulate a full run given a per-obstacle outcome function
// outcomesFn(obstacleIndex, currentSpeed) -> 'perfect' | 'good' | 'miss'
function simulateRun(outcomesFn) {
  let speed        = BASE_SPEED;
  let totalDist    = 0;
  let totalFrames  = 0;
  let perfects     = 0;
  let goods        = 0;
  let misses       = 0;
  let score        = 0;

  // Warmup: 4 fixed obstacles (one of each type), generous 120-frame spacing
  // Warmup doesn't adapt — always gives the player a clean intro
  for (let i = 0; i < 4; i++) {
    const framesToNext = 120;
    totalDist   += distPerFrame(speed) * framesToNext;
    totalFrames += framesToNext;
    // Warmup outcomes: treat as Good clears (teaching moment, not competitive)
    speed += GOOD_GAIN;
    score += 100;
    goods++;
  }

  let obstacleIndex = 0;

  for (const waveSize of WAVE_SIZES) {
    for (let i = 0; i < waveSize; i++) {
      // Frames between this obstacle and the next (base spacing 40 units)
      const framesToNext = Math.round(40 / distPerFrame(speed));
      totalDist   += distPerFrame(speed) * framesToNext;
      totalFrames += framesToNext;

      const outcome = outcomesFn(obstacleIndex, speed);

      if (outcome === 'perfect') {
        speed += PERFECT_GAIN;
        score += 300;
        perfects++;
      } else if (outcome === 'good') {
        speed += GOOD_GAIN;
        score += 100;
        goods++;
      } else {
        // miss
        const loss = speed * HIT_PENALTY;
        speed = Math.max(SPEED_FLOOR, speed - loss);
        score = Math.max(0, score - 150);
        misses++;
      }

      obstacleIndex++;
    }

    // Brief gap between waves (200 frames at current speed)
    const waveGap = 200;
    totalDist   += distPerFrame(speed) * waveGap;
    totalFrames += waveGap;
  }

  return {
    finalSpeed:   Math.round(speed * 10) / 10,
    totalDist:    Math.round(totalDist),
    totalFrames,
    totalSeconds: Math.round((totalFrames / FPS) * 10) / 10,
    perfects,
    goods,
    misses,
    score,
    avgDistPerFrame: Math.round((totalDist / totalFrames) * 1000) / 1000,
  };
}

// ─── Archetypes ───────────────────────────────────────────────────────────────

const archetypes = {
  // Never misses, always Perfect
  perfect: (i, speed) => 'perfect',

  // Mostly perfect with occasional goods
  competitive: (i, speed) => i % 7 === 6 ? 'good' : 'perfect',

  // Solid player — mostly good with some perfects, rare misses
  average: (i, speed) => {
    if (i % 10 === 9) return 'miss';
    if (i % 3 === 0)  return 'perfect';
    return 'good';
  },

  // Mostly good clears, hits fairly often
  casual: (i, speed) => {
    if (i % 5 === 4) return 'miss';
    if (i % 8 === 0) return 'perfect';
    return 'good';
  },

  // Struggle player — misses a lot, barely clears
  struggle: (i, speed) => {
    if (i % 3 === 2) return 'miss';
    return 'good';
  },

  // Worst case — misses everything, never gains speed
  floor: (i, speed) => 'miss',
};

// ─── Fixed-distance model ─────────────────────────────────────────────────────
// Simulate how long each archetype takes to cover a fixed distance D.
// Obstacles are placed at evenly spaced positions along the route.

function simulateFixedRun(outcomesFn, targetDist) {
  // Place obstacles: warmup (4) + 100 main, evenly across targetDist
  const totalObstacles = 4 + WAVE_SIZES.reduce((a, b) => a + b, 0); // 104
  const spacing = targetDist / (totalObstacles + 1);

  // Build obstacle list: position + type (warmup vs scored)
  const obstacles = [];
  for (let i = 0; i < totalObstacles; i++) {
    obstacles.push({ pos: spacing * (i + 1), index: i });
  }

  let speed       = BASE_SPEED;
  let pos         = 0;
  let frames      = 0;
  let perfects    = 0;
  let goods       = 0;
  let misses      = 0;
  let nextObs     = 0;
  const DEADLINE  = 90 * FPS; // 5400 frames

  while (pos < targetDist && frames < DEADLINE) {
    pos += distPerFrame(speed);
    frames++;

    // Check if we've passed the next obstacle
    while (nextObs < obstacles.length && pos >= obstacles[nextObs].pos) {
      const outcome = outcomesFn(obstacles[nextObs].index, speed);
      if (outcome === 'perfect') {
        speed += PERFECT_GAIN;
        perfects++;
      } else if (outcome === 'good') {
        speed += GOOD_GAIN;
        goods++;
      } else {
        speed = Math.max(SPEED_FLOOR, speed - speed * HIT_PENALTY);
        misses++;
      }
      nextObs++;
    }
  }

  const arrived = pos >= targetDist;
  return {
    arrived,
    frames,
    seconds:  Math.round((frames / FPS) * 10) / 10,
    finalSpeed: Math.round(speed * 10) / 10,
    perfects, goods, misses,
  };
}

// ─── Exponent comparison ──────────────────────────────────────────────────────
// For each exponent, find the distance where floor hits 90s,
// then show the full archetype spread at that distance.

function findDistanceForFloor90(exp, scoreK = SCORE_CHAIN_K, speedK = SPEED_CHAIN_K, breakK = CHAIN_BREAK_K) {
  const dpf = s => Math.pow(s / BASE_SPEED, exp);

  function simFixed(outcomesFn, targetDist) {
    const spacing   = targetDist / (TOTAL_OBS + 1);
    const obstacles = Array.from({ length: TOTAL_OBS }, (_, i) => ({ pos: spacing * (i + 1), index: i }));

    let speed = BASE_SPEED, pos = 0, frames = 0, nextObs = 0;
    let perfects = 0, goods = 0, misses = 0, score = 0;
    let chain = 0;

    while (pos < targetDist && frames < DEADLINE) {
      pos += dpf(speed);
      frames++;
      while (nextObs < obstacles.length && pos >= obstacles[nextObs].pos) {
        const faced   = nextObs + 1;
        const outcome = outcomesFn(obstacles[nextObs].index, speed);
        if (outcome === 'perfect') {
          chain++;
          const sm = 1 + Math.sqrt(chain) * speedK * (faced / TOTAL_OBS);
          const sc = 1 + chain * scoreK * (faced / TOTAL_OBS);
          speed += PERFECT_GAIN * sm;
          score += Math.round(300 * sc);
          perfects++;
        } else if (outcome === 'good') {
          speed = Math.max(SPEED_FLOOR, speed - chain * breakK);
          chain = 0;
          speed += GOOD_GAIN;
          score += 100;
          goods++;
        } else {
          speed = Math.max(SPEED_FLOOR, speed - chain * breakK);
          chain = 0;
          speed = Math.max(SPEED_FLOOR, speed - speed * HIT_PENALTY);
          score = Math.max(0, score - 150);
          misses++;
        }
        nextObs++;
      }
    }
    return {
      arrived: pos >= targetDist, frames,
      seconds: Math.round((frames / FPS) * 10) / 10,
      finalSpeed: Math.round(speed * 10) / 10,
      perfects, goods, misses, score,
      maxChain: chain,
    };
  }

  // Binary search for distance where floor arrives at exactly 90s
  let lo = 1000, hi = 20000, best = 5400;
  for (let i = 0; i < 40; i++) {
    const mid = Math.round((lo + hi) / 2);
    const r = simFixed(archetypes.floor, mid);
    if (!r.arrived) { hi = mid; best = mid; }
    else            { lo = mid; }
  }

  // Full breakdown at that distance
  const results = {};
  for (const [name, fn] of Object.entries(archetypes)) {
    results[name] = simFixed(fn, best);
  }
  return { dist: best, results };
}

// ─── Chain break K sweep (speed_k=0.25, score_k=0.06 locked) ─────────────────

const LOCKED_SCORE_K = 0.06;
const LOCKED_SPEED_K = 0.25;

console.log(`=== Chain Break K Sweep (speed_k=${LOCKED_SPEED_K}, score_k=${LOCKED_SCORE_K}) ===\n`);
console.log('Chain break penalty = chain_length × k, applied on any good or miss\n');
console.log(`${'break_k'.padEnd(9)} ${'perfect'.padEnd(9)} ${'competitive'.padEnd(13)} ${'time gap'.padEnd(10)} score ratio`);
console.log('─'.repeat(58));

for (const bk of [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]) {
  const { results } = findDistanceForFloor90(CURVE_EXP, LOCKED_SCORE_K, LOCKED_SPEED_K, bk);
  const timeGap  = (results.competitive.seconds - results.perfect.seconds).toFixed(1);
  const scoreRat = (results.perfect.score / results.competitive.score).toFixed(2);
  const floorStatus = results.floor.arrived ? results.floor.seconds + 's' : 'FAIL';
  console.log(`${String(bk).padEnd(9)} ${String(results.perfect.seconds + 's').padEnd(9)} ${String(results.competitive.seconds + 's').padEnd(13)} ${String(timeGap + 's').padEnd(10)} ${scoreRat}x  floor:${floorStatus}`);
}

// ─── Full breakdown at chosen break_k ────────────────────────────────────────
const CHOSEN_BREAK_K = 1.5;
console.log(`\n${'─'.repeat(58)}`);
console.log(`\nFull breakdown at break_k=${CHOSEN_BREAK_K}, speed_k=${LOCKED_SPEED_K}, score_k=${LOCKED_SCORE_K}:\n`);
const { dist: BEST_D, results: bestResults } = findDistanceForFloor90(CURVE_EXP, LOCKED_SCORE_K, LOCKED_SPEED_K, CHOSEN_BREAK_K);

for (const [name, r] of Object.entries(bestResults)) {
  const status = r.arrived ? `${r.seconds}s ✓` : `FAIL ✗`;
  console.log(
    `[${name.padEnd(12)}]  ${r.perfects}p/${r.goods}g/${r.misses}m` +
    `  spd:${r.finalSpeed}  score:${r.score}  chain:${r.maxChain}  ${status}`
  );
}
const perf = bestResults.perfect;
const comp = bestResults.competitive;
const avg  = bestResults.average;
console.log(`\nKey gaps:`);
console.log(`  perfect → competitive:  ${(comp.seconds - perf.seconds).toFixed(1)}s  |  score ratio: ${(perf.score / comp.score).toFixed(2)}x`);
console.log(`  perfect → average:      ${(avg.seconds  - perf.seconds).toFixed(1)}s  |  score ratio: ${(perf.score / avg.score).toFixed(2)}x`);
