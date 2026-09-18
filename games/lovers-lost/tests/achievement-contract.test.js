// achievement-contract.test.js — the cabinet's telemetry against the platform's
// Lovers Lost achievement catalog. Run with: node tests/achievement-contract.test.js
//
// The API deploys separately and mirrors a few game constants rather than
// importing this folder; this test is what keeps the mirror honest. It also
// drives a REAL run through the sim with a scripted bot and proves the
// resulting telemetry passes the server's plausibility gate and detects what
// it should, so the two halves cannot drift apart silently.
import {
  createGameState, tickFrame, resolveContactAction, startJump, applyCrouchHeld,
} from '../scripts/game-tick.js';
import { HARD_CUTOFF_FRAMES } from '../scripts/game-constants.js';
import { WAVE_COUNTS, WARMUP_SEQUENCE, spikeLatestJumpDelta, perfectWindow } from '../scripts/obstacles.js';
import { distPerFrame } from '../scripts/player.js';
import { buildRunResult } from '../scripts/run-telemetry.js';
import {
  LOVERS_LOST_HARD_CUTOFF_FRAMES, LOVERS_LOST_TOTAL_OBSTACLES, LOVERS_LOST_WARMUP_COUNT,
  LOVERS_LOST_MAX_LANE_SCORE, LOVERS_LOST_ACHIEVEMENTS, normalizeLoversLostRun,
} from '../../../platform-api/src/services/lovers-lost-achievement-catalog.mjs';
import { evaluateAchievementRun } from '../../../platform-api/src/services/achievement-catalog.mjs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`); }

console.log('\nmirrored constants');

test('server mirrors the cutoff, obstacle count and warmup length exactly', () => {
  assertEq(LOVERS_LOST_HARD_CUTOFF_FRAMES, HARD_CUTOFF_FRAMES);
  assertEq(LOVERS_LOST_TOTAL_OBSTACLES, WARMUP_SEQUENCE.length + WAVE_COUNTS.reduce((a, b) => a + b, 0));
  assertEq(LOVERS_LOST_WARMUP_COUNT, WARMUP_SEQUENCE.length);
});

// ─── A scripted runner ───────────────────────────────────────────────────────
// Plays one lane of a real game state. `policy` decides, per frame, whether
// to press jump/attack/block or hold crouch given the front obstacle and the
// distance delta to it. Mirrors init-game's frame order: input → contact →
// tick. Returns the finished game state.
function playSoloLane(side, policy, seed = 7) {
  let gs = { ...createGameState('single', seed), phase: 'playing' };
  const partner = side === 'boy' ? 'girl' : 'boy';
  gs = { ...gs, [partner]: { ...gs[partner], distance: 5400 }, [`${partner}Obstacles`]: [] };
  const obsKey = `${side}Obstacles`;
  let anim = { state: 'running', actionTick: 0 };
  let acted = null;   // obstacle we already acted on

  while (gs.phase === 'playing') {
    let player = gs[side];
    let obstacles = gs[obsKey];
    const front = obstacles[0];
    const delta = front ? front.position - player.distance : Infinity;
    const decision = front && player.state !== 'finished' ? policy(front, delta, player, acted) : {};

    const crouchHeld = !!decision.crouch;
    player = applyCrouchHeld(player, crouchHeld);
    if (crouchHeld) anim = { state: 'crouch', actionTick: 0 };
    else if (anim.state === 'crouch') anim = { state: 'running', actionTick: 0 };

    if (decision.jump && front !== acted && player.state === 'running') { player = startJump(player); acted = front; }
    if (decision.attack && front !== acted) { anim = { state: 'attack', actionTick: 0 }; acted = front; }
    if (decision.block && front !== acted) { anim = { state: 'block', actionTick: 0 }; acted = front; }

    const contact = resolveContactAction(player, obstacles, anim);
    if (contact.action) { player = contact.player; obstacles = contact.obstacles; }
    gs = { ...gs, [side]: player, [obsKey]: obstacles };
    gs = tickFrame(gs);

    if (anim.state === 'attack' || anim.state === 'block') {
      anim.actionTick++;
      if (anim.actionTick >= 18) anim = { state: 'running', actionTick: 0 };
    }
  }
  return gs;
}

// Acts on the first frame inside every Perfect window. Frames are one
// distPerFrame apart, so "first frame at or below the window's top edge"
// always lands inside a window that is at least one tick wide.
function perfectPolicy(front, delta, player, acted) {
  const dpf = distPerFrame(player.speed);
  const w = perfectWindow(front, player.speed);
  // Still airborne from the previous spike with a new obstacle ahead: crouch
  // to cancel the jump (the game's crouch-cancel), unless the obstacle is the
  // next spike of a chain, which the same jump clears.
  if (player.state === 'jumping' && front !== acted) {
    const chained = front.type === 'spikes' && acted && acted.type === 'spikes' && front.position - acted.position <= 18;
    if (!chained && delta > w + dpf) return { crouch: true };
  }
  if (front.type === 'spikes')    return { jump: delta <= spikeLatestJumpDelta(player.speed) + dpf };
  if (front.type === 'bird')      return { crouch: delta <= w && delta > -12 };
  if (front.type === 'arrowwall') return { block: delta <= w };
  if (front.type === 'goblin')    return { attack: delta <= w };
  return {};
}

// Never acts: every obstacle is a Miss.
function idlePolicy() { return {}; }

console.log('\nreal runs through the server gate');

test('an idle solo run reaches the cutoff, normalizes as game_over and earns nothing', () => {
  const gs = playSoloLane('boy', idlePolicy);
  assertEq(gs.phase, 'gameover');
  const run = buildRunResult(gs, { runId: 'idle-run-000001', soloSide: 'boy' });
  assertEq(run.elapsedFrames, HARD_CUTOFF_FRAMES);
  assertEq(run.lanes.boy.perfects, 0);
  assert(run.lanes.boy.misses > 0, 'missed obstacles');
  assertEq(run.lanes.boy.perfects + run.lanes.boy.goods + run.lanes.boy.misses, run.lanes.boy.obstaclesFaced);
  const normalized = normalizeLoversLostRun(run);
  assert(normalized.ok, `gate refused a real run: ${normalized.error}`);
  assertEq(normalized.run.outcome, 'game_over');
  assertEq(evaluateAchievementRun(LOVERS_LOST_ACHIEVEMENTS, normalized.run, []).length, 0);
});

test('a perfect-timing solo run finishes, passes the gate and unlocks the precision branch', () => {
  const gs = playSoloLane('girl', perfectPolicy);
  assertEq(gs.phase, 'reunion', 'bot must finish the course');
  const run = buildRunResult(gs, { runId: 'perfect-run-00001', soloSide: 'girl' });
  const lane = run.lanes.girl;
  assert(lane.finished && lane.finishFrame === run.elapsedFrames, 'finish frame is the reunion tick');
  assert(lane.obstaclesFaced > 20, `faced ${lane.obstaclesFaced}`);
  assertEq(lane.misses, 0, `misses ${lane.misses}`);
  assertEq(lane.goods, 0, `goods ${lane.goods} — a Good means a Perfect window was unreachable somewhere`);
  assertEq(lane.perfects, lane.obstaclesFaced);
  assertEq(lane.warmupFaced, 4);
  assert(lane.score <= LOVERS_LOST_MAX_LANE_SCORE, `score ${lane.score} exceeds the server ceiling`);
  assert(['spikes', 'bird', 'arrowwall', 'goblin'].every(t => lane.perfectByType[t] > 0), 'every type perfected');

  const normalized = normalizeLoversLostRun(run);
  assert(normalized.ok, `gate refused a real perfect run: ${normalized.error}`);
  const ids = evaluateAchievementRun(LOVERS_LOST_ACHIEVEMENTS, normalized.run, []);
  for (const id of ['ll_found_again', 'll_her_side', 'll_clean_start', 'll_four_moves', 'll_sharp_timing', 'll_untouchable', 'll_perfect_run']) {
    assert(ids.includes(id), `expected ${id} in ${ids.join(',')}`);
  }
  assert(!ids.includes('ll_his_side'));
  assert(!ids.includes('ll_perfect_pair'), 'solo is never a pair');
});

test('the perfect bot is genuinely perfect in the boy lane too (facing is mirrored)', () => {
  const gs = playSoloLane('boy', perfectPolicy, 99);
  assertEq(gs.phase, 'reunion');
  const lane = buildRunResult(gs, { runId: 'perfect-run-00002', soloSide: 'boy' }).lanes.boy;
  assertEq(lane.misses + lane.goods, 0, `boy lane goods ${lane.goods} misses ${lane.misses}`);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
