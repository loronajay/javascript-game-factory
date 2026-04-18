// scoring.test.js — run with: node scoring.test.js
import { evaluateRun, OUTCOMES } from '../scripts/scoring.js';
import { createPlayer, RUN_DISTANCE } from '../scripts/player.js';

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
  if (a !== b) throw new Error(msg || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function finished(side, score = 0) {
  return { ...createPlayer(side), distance: RUN_DISTANCE, score };
}

function notFinished(side, score = 0) {
  return { ...createPlayer(side), distance: 0, score };
}

// ─── evaluateRun — outcome ────────────────────────────────────────────────────
console.log('\nevaluateRun — outcome');

test('both finish → reunion', () => {
  const result = evaluateRun(finished('boy'), finished('girl'));
  assertEq(result.outcome, OUTCOMES.REUNION);
});

test('only boy finishes → partial', () => {
  const result = evaluateRun(finished('boy'), notFinished('girl'));
  assertEq(result.outcome, OUTCOMES.PARTIAL);
});

test('only girl finishes → partial', () => {
  const result = evaluateRun(notFinished('boy'), finished('girl'));
  assertEq(result.outcome, OUTCOMES.PARTIAL);
});

test('neither finishes → game_over', () => {
  const result = evaluateRun(notFinished('boy'), notFinished('girl'));
  assertEq(result.outcome, OUTCOMES.GAME_OVER);
});

// ─── evaluateRun — finished flags ─────────────────────────────────────────────
console.log('\nevaluateRun — finished flags');

test('boyFinished true when boy reached finish', () => {
  assert(evaluateRun(finished('boy'), notFinished('girl')).boyFinished);
});

test('boyFinished false when boy did not finish', () => {
  assert(!evaluateRun(notFinished('boy'), finished('girl')).boyFinished);
});

test('girlFinished true when girl reached finish', () => {
  assert(evaluateRun(notFinished('boy'), finished('girl')).girlFinished);
});

test('girlFinished false when girl did not finish', () => {
  assert(!evaluateRun(finished('boy'), notFinished('girl')).girlFinished);
});

// ─── evaluateRun — score accounting ───────────────────────────────────────────
console.log('\nevaluateRun — score accounting');

test('reunion: both scores counted', () => {
  const result = evaluateRun(finished('boy', 15000), finished('girl', 20000));
  assertEq(result.boyScore, 15000);
  assertEq(result.girlScore, 20000);
  assertEq(result.totalScore, 35000);
});

test('partial (boy only): boy score counted, girl score forfeited', () => {
  const result = evaluateRun(finished('boy', 15000), notFinished('girl', 9999));
  assertEq(result.boyScore, 15000);
  assertEq(result.girlScore, 0);
  assertEq(result.totalScore, 15000);
});

test('partial (girl only): girl score counted, boy score forfeited', () => {
  const result = evaluateRun(notFinished('boy', 9999), finished('girl', 20000));
  assertEq(result.boyScore, 0);
  assertEq(result.girlScore, 20000);
  assertEq(result.totalScore, 20000);
});

test('game_over: both scores forfeited, total is 0', () => {
  const result = evaluateRun(notFinished('boy', 9999), notFinished('girl', 9999));
  assertEq(result.boyScore, 0);
  assertEq(result.girlScore, 0);
  assertEq(result.totalScore, 0);
});

test('score of 0 is valid (not forfeited) when side finished', () => {
  const result = evaluateRun(finished('boy', 0), finished('girl', 0));
  assertEq(result.totalScore, 0);
  assertEq(result.outcome, OUTCOMES.REUNION);
});

test('negative score is preserved when side finished', () => {
  const result = evaluateRun(finished('boy', -500), finished('girl', 1000));
  assertEq(result.boyScore, -500);
  assertEq(result.totalScore, 500);
});

// ─── evaluateRun — immutability ───────────────────────────────────────────────
console.log('\nevaluateRun — immutability');

test('does not mutate boy player', () => {
  const boy = finished('boy', 5000);
  evaluateRun(boy, finished('girl', 5000));
  assertEq(boy.score, 5000);
  assertEq(boy.distance, RUN_DISTANCE);
});

test('does not mutate girl player', () => {
  const girl = finished('girl', 7000);
  evaluateRun(notFinished('boy'), girl);
  assertEq(girl.score, 7000);
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
