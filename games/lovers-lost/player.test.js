// player.test.js — run with: node player.test.js
'use strict';

const {
  createPlayer,
  speedMultiplier,
  scoreMultiplier,
  distPerFrame,
  applyPerfect,
  applyGood,
  applyMiss,
  advanceDistance,
  projectedFinish,
  checkAssist,
  applyAssistBoost,
  deactivateAssistIfRecovered,
  isFinished,
  SPEED_FLOOR,
  RUN_DISTANCE,
  ASSIST_TRIGGER_SECS,
} = require('./player');

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg || `expected ${a} === ${b}`);
}

function assertClose(a, b, msg, eps = 0.0001) {
  if (Math.abs(a - b) > eps) throw new Error(msg || `expected ${a} ≈ ${b} (diff ${Math.abs(a-b)})`);
}

// ─── createPlayer ─────────────────────────────────────────────────────────────
console.log('\ncreatePlayer');

test('boy starts at speed floor', () => {
  const p = createPlayer('boy');
  assertEq(p.speed, SPEED_FLOOR);
});

test('girl starts at speed floor', () => {
  const p = createPlayer('girl');
  assertEq(p.speed, SPEED_FLOOR);
});

test('initial score is 0', () => {
  assertEq(createPlayer('boy').score, 0);
});

test('initial distance is 0', () => {
  assertEq(createPlayer('boy').distance, 0);
});

test('initial chain is 0', () => {
  assertEq(createPlayer('boy').chain, 0);
});

test('initial obstaclesFaced is 0', () => {
  assertEq(createPlayer('boy').obstaclesFaced, 0);
});

test('initial state is running', () => {
  assertEq(createPlayer('boy').state, 'running');
});

test('assist not active initially', () => {
  assertEq(createPlayer('boy').assistActive, false);
});

test('side is stored on player', () => {
  assertEq(createPlayer('boy').side, 'boy');
  assertEq(createPlayer('girl').side, 'girl');
});

// ─── speedMultiplier ──────────────────────────────────────────────────────────
console.log('\nspeedMultiplier');

test('at chain 0, multiplier is 1', () => {
  assertEq(speedMultiplier(0, 104), 1);
});

test('at chain 1, 104 faced: 1 + sqrt(1)*0.25*1 = 1.25', () => {
  assertClose(speedMultiplier(1, 104), 1.25);
});

test('at chain 4, 52 faced: 1 + sqrt(4)*0.25*0.5 = 1.25', () => {
  assertClose(speedMultiplier(4, 52), 1.25);
});

test('at chain 0, any faced: multiplier is 1', () => {
  assertEq(speedMultiplier(0, 0), 1);
});

// ─── scoreMultiplier ──────────────────────────────────────────────────────────
console.log('\nscoreMultiplier');

test('at chain 0, multiplier is 1', () => {
  assertEq(scoreMultiplier(0, 104), 1);
});

test('at chain 2, 104 faced: 1 + 2*0.06*1 = 1.12', () => {
  assertClose(scoreMultiplier(2, 104), 1.12);
});

test('at chain 2, 52 faced: 1 + 2*0.06*0.5 = 1.06', () => {
  assertClose(scoreMultiplier(2, 52), 1.06);
});

// ─── distPerFrame ─────────────────────────────────────────────────────────────
console.log('\ndistPerFrame');

test('at speed 5: (5/5)^0.2 = 1.0', () => {
  assertClose(distPerFrame(5), 1.0);
});

test('at speed 10: (10/5)^0.2 = 2^0.2 ≈ 1.1487', () => {
  assertClose(distPerFrame(10), Math.pow(2, 0.2));
});

test('at speed 20: (20/5)^0.2 = 4^0.2 ≈ 1.3195', () => {
  assertClose(distPerFrame(20), Math.pow(4, 0.2));
});

test('at speed 50: (50/5)^0.2 = 10^0.2 ≈ 1.5849', () => {
  assertClose(distPerFrame(50), Math.pow(10, 0.2));
});

// ─── applyPerfect ─────────────────────────────────────────────────────────────
console.log('\napplyPerfect');

test('at chain 0: speed += 3, chain becomes 1, obstaclesFaced increments', () => {
  const p = applyPerfect(createPlayer('boy'));
  assertClose(p.speed, SPEED_FLOOR + 3);
  assertEq(p.chain, 1);
  assertEq(p.obstaclesFaced, 1);
});

test('at chain 0: score += 300', () => {
  const p = applyPerfect(createPlayer('boy'));
  assertEq(p.score, 300);
});

test('at chain 1, 104 faced: speed multiplier = 1.25, gain = 3*1.25 = 3.75', () => {
  let p = createPlayer('boy');
  p = { ...p, chain: 1, obstaclesFaced: 104, speed: 10 };
  p = applyPerfect(p);
  assertClose(p.speed, 10 + 3 * 1.25);
});

test('perfect does not mutate original player', () => {
  const p = createPlayer('boy');
  applyPerfect(p);
  assertEq(p.speed, SPEED_FLOOR);
  assertEq(p.chain, 0);
});

test('chaining perfects: chain increments each time', () => {
  let p = createPlayer('boy');
  p = applyPerfect(p);
  p = applyPerfect(p);
  p = applyPerfect(p);
  assertEq(p.chain, 3);
  assertEq(p.obstaclesFaced, 3);
});

// ─── applyGood ────────────────────────────────────────────────────────────────
console.log('\napplyGood');

test('at chain 0: no break penalty, speed += 1', () => {
  const p = applyGood(createPlayer('boy'));
  assertClose(p.speed, SPEED_FLOOR + 1);
});

test('at chain 0: chain stays 0, obstaclesFaced increments', () => {
  const p = applyGood(createPlayer('boy'));
  assertEq(p.chain, 0);
  assertEq(p.obstaclesFaced, 1);
});

test('at chain 0: score += 100', () => {
  assertEq(applyGood(createPlayer('boy')).score, 100);
});

test('at chain 3, speed 10: break penalty = 6 first, speed → 5 (floor), then +1 = 6', () => {
  let p = { ...createPlayer('boy'), chain: 3, speed: 10 };
  p = applyGood(p);
  assertClose(p.speed, 6);
  assertEq(p.chain, 0);
});

test('good does not mutate original player', () => {
  const p = createPlayer('boy');
  applyGood(p);
  assertEq(p.speed, SPEED_FLOOR);
});

// ─── applyMiss ────────────────────────────────────────────────────────────────
console.log('\napplyMiss');

test('at chain 0, speed 10: 15% penalty → speed 8.5', () => {
  let p = { ...createPlayer('boy'), speed: 10 };
  p = applyMiss(p);
  assertClose(p.speed, 8.5);
});

test('at chain 0, speed 10: score -= 150', () => {
  let p = { ...createPlayer('boy'), speed: 10 };
  p = applyMiss(p);
  assertEq(p.score, -150);
});

test('at chain 2, speed 10: break penalty 4 → speed 6, then 15% → speed 5.1', () => {
  let p = { ...createPlayer('boy'), chain: 2, speed: 10 };
  p = applyMiss(p);
  assertClose(p.speed, 10 - 4 - (10 - 4) * 0.15);
});

test('at chain 0, speed at floor: speed stays at floor (no further loss)', () => {
  let p = createPlayer('boy'); // speed = 5
  p = applyMiss(p);
  assertEq(p.speed, SPEED_FLOOR);
});

test('large chain break cannot push speed below floor', () => {
  let p = { ...createPlayer('boy'), chain: 100, speed: 5 };
  p = applyMiss(p);
  assertEq(p.speed, SPEED_FLOOR);
});

test('miss does not mutate original player', () => {
  const p = { ...createPlayer('boy'), speed: 10 };
  applyMiss(p);
  assertEq(p.speed, 10);
});

test('miss resets chain', () => {
  let p = { ...createPlayer('boy'), chain: 5, speed: 20 };
  p = applyMiss(p);
  assertEq(p.chain, 0);
});

test('miss increments obstaclesFaced', () => {
  let p = createPlayer('boy');
  p = applyMiss(p);
  assertEq(p.obstaclesFaced, 1);
});

// ─── advanceDistance ──────────────────────────────────────────────────────────
console.log('\nadvanceDistance');

test('at speed 5: distance increases by 1.0 per frame', () => {
  const p = advanceDistance(createPlayer('boy'));
  assertClose(p.distance, 1.0);
});

test('at speed 10: distance increases by distPerFrame(10) per frame', () => {
  let p = { ...createPlayer('boy'), speed: 10 };
  p = advanceDistance(p);
  assertClose(p.distance, distPerFrame(10));
});

test('does not mutate original player', () => {
  const p = createPlayer('boy');
  advanceDistance(p);
  assertEq(p.distance, 0);
});

test('advances correctly over multiple frames', () => {
  let p = createPlayer('boy');
  p = advanceDistance(p);
  p = advanceDistance(p);
  p = advanceDistance(p);
  assertClose(p.distance, 3.0);
});

// ─── isFinished ───────────────────────────────────────────────────────────────
console.log('\nisFinished');

test('false when distance is 0', () => {
  assert(!isFinished(createPlayer('boy')));
});

test('false below RUN_DISTANCE', () => {
  assert(!isFinished({ ...createPlayer('boy'), distance: RUN_DISTANCE - 1 }));
});

test('true at RUN_DISTANCE', () => {
  assert(isFinished({ ...createPlayer('boy'), distance: RUN_DISTANCE }));
});

test('true beyond RUN_DISTANCE', () => {
  assert(isFinished({ ...createPlayer('boy'), distance: RUN_DISTANCE + 100 }));
});

// ─── projectedFinish ──────────────────────────────────────────────────────────
console.log('\nprojectedFinish');

test('at speed 5, distance 0, elapsed 0: projects to exactly 90s', () => {
  assertClose(projectedFinish(createPlayer('boy'), 0), 90);
});

test('at speed 5, distance 2700, elapsed 45: still projects to 90s', () => {
  let p = { ...createPlayer('boy'), distance: 2700 };
  assertClose(projectedFinish(p, 45), 90);
});

test('at speed 10, distance 0, elapsed 0: projects below 90s', () => {
  let p = { ...createPlayer('boy'), speed: 10 };
  assert(projectedFinish(p, 0) < 90);
});

test('finished player returns elapsed time', () => {
  let p = { ...createPlayer('boy'), distance: RUN_DISTANCE };
  assertClose(projectedFinish(p, 55), 55);
});

// ─── checkAssist ─────────────────────────────────────────────────────────────
console.log('\ncheckAssist');

test('does not activate before warmup ends (obstaclesFaced < 4)', () => {
  let p = { ...createPlayer('boy'), obstaclesFaced: 3 };
  p = checkAssist(p, 0);
  assertEq(p.assistActive, false);
});

test('activates when projected >= 90s and post-warmup', () => {
  // speed 5 at elapsed 0 projects to exactly 90s — should trigger
  let p = { ...createPlayer('boy'), obstaclesFaced: 4 };
  p = checkAssist(p, 0);
  assertEq(p.assistActive, true);
});

test('grants 3 opportunities on activation', () => {
  let p = { ...createPlayer('boy'), obstaclesFaced: 4 };
  p = checkAssist(p, 0);
  assertEq(p.assistOpportunities, 3);
});

test('does not activate when projected < 90s', () => {
  let p = { ...createPlayer('boy'), speed: 20, obstaclesFaced: 4 };
  p = checkAssist(p, 0);
  assertEq(p.assistActive, false);
});

test('does not re-activate if already active', () => {
  let p = { ...createPlayer('boy'), obstaclesFaced: 4, assistActive: true, assistOpportunities: 1 };
  p = checkAssist(p, 0);
  assertEq(p.assistOpportunities, 1); // not reset to 3
});

// ─── applyAssistBoost ────────────────────────────────────────────────────────
console.log('\napplyAssistBoost');

test('at speed 10: boost = +6, speed becomes 16', () => {
  let p = { ...createPlayer('boy'), speed: 10, assistActive: true, assistOpportunities: 3 };
  p = applyAssistBoost(p);
  assertClose(p.speed, 16);
});

test('at speed 5: boost = +3, speed becomes 8', () => {
  let p = { ...createPlayer('boy'), speed: 5, assistActive: true, assistOpportunities: 3 };
  p = applyAssistBoost(p);
  assertClose(p.speed, 8);
});

test('decrements opportunities', () => {
  let p = { ...createPlayer('boy'), speed: 10, assistActive: true, assistOpportunities: 3 };
  p = applyAssistBoost(p);
  assertEq(p.assistOpportunities, 2);
});

test('last opportunity deactivates assist', () => {
  let p = { ...createPlayer('boy'), speed: 10, assistActive: true, assistOpportunities: 1 };
  p = applyAssistBoost(p);
  assertEq(p.assistActive, false);
  assertEq(p.assistOpportunities, 0);
});

test('no effect when assist not active', () => {
  let p = { ...createPlayer('boy'), speed: 10, assistActive: false };
  const after = applyAssistBoost(p);
  assertEq(after.speed, 10);
});

test('no effect when 0 opportunities remain', () => {
  let p = { ...createPlayer('boy'), speed: 10, assistActive: true, assistOpportunities: 0 };
  const after = applyAssistBoost(p);
  assertEq(after.speed, 10);
});

test('does not mutate original player', () => {
  const p = { ...createPlayer('boy'), speed: 10, assistActive: true, assistOpportunities: 3 };
  applyAssistBoost(p);
  assertEq(p.speed, 10);
  assertEq(p.assistOpportunities, 3);
});

// ─── deactivateAssistIfRecovered ─────────────────────────────────────────────
console.log('\ndeactivateAssistIfRecovered');

test('deactivates when projected < 90s', () => {
  let p = { ...createPlayer('boy'), speed: 20, assistActive: true, assistOpportunities: 2, obstaclesFaced: 10 };
  p = deactivateAssistIfRecovered(p, 0);
  assertEq(p.assistActive, false);
});

test('stays active when projected >= 90s', () => {
  let p = { ...createPlayer('boy'), speed: 5, assistActive: true, assistOpportunities: 2, obstaclesFaced: 4 };
  p = deactivateAssistIfRecovered(p, 0);
  assertEq(p.assistActive, true);
});

test('no change when assist already inactive', () => {
  let p = { ...createPlayer('boy'), speed: 5, assistActive: false };
  p = deactivateAssistIfRecovered(p, 0);
  assertEq(p.assistActive, false);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
