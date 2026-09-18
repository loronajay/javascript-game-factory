// telemetry.test.js — timing grades, lane stats, and the run result.
// Run with: node tests/telemetry.test.js
import {
  resolveObstacleGrade, spikeClearGrade, birdClearGrade, birdTimingGrade,
  resolveContactAction, tickSideFrame, startJump, applyCrouchHeld, processAction,
  createGameState, tickFrame,
} from '../scripts/game-tick.js';
import { createPlayer, STARTING_SPEED, RUN_DISTANCE } from '../scripts/player.js';
import { createObstacle, generateWarmup, gradeSpikeJump, spikeLatestJumpDelta, perfectWindow, PERFECT_MIN_TICKS } from '../scripts/obstacles.js';
import { distPerFrame } from '../scripts/player.js';
import { createLaneStats, recordObstacleOutcome, sanitizeLaneStats } from '../scripts/lane-stats.js';
import { buildRunResult, ownedLanesForMode, createRunId } from '../scripts/run-telemetry.js';
import { buildLaneSnapshot, applyLaneSnapshot } from '../scripts/lane-snapshot.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  PASS  ${name}`); passed++; }
  catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); failed++; }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function assertEq(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`); }

// ─── Frame-accurate simulation harness ───────────────────────────────────────
// Runs a lane toward one obstacle exactly the way init-game + lane-input do:
// input first (crouch held / jump pressed at a chosen distance-delta), then the
// contact resolution with the matching anim state, then the side tick. Returns
// the resolved grade.
function simulateObstacle(type, { jumpAtDelta = null, crouchAtDelta = null, speed = STARTING_SPEED } = {}) {
  const obstacle = createObstacle(type, 200);
  let player = { ...createPlayer('boy'), speed, distance: 100 };
  let obstacles = [obstacle];
  let jumped = false;

  for (let frame = 0; frame < 600; frame++) {
    const delta = obstacle.position - player.distance;
    const crouchHeld = crouchAtDelta != null && delta <= crouchAtDelta;
    player = applyCrouchHeld(player, crouchHeld);
    if (!crouchHeld && jumpAtDelta != null && !jumped && delta <= jumpAtDelta) {
      player = startJump(player);
      jumped = true;
    }
    const anim = { state: player.state === 'crouching' ? 'crouch' : 'running', actionTick: 0 };
    const contact = resolveContactAction(player, obstacles, anim);
    if (contact.action && contact.obstacles.length === 0) return { grade: contact.grade, player: contact.player };

    const tick = tickSideFrame(player, obstacles, frame / 60, true, frame);
    player = tick.player; obstacles = tick.obstacles;
    if (tick.resolved.length) return { grade: tick.resolved[0].grade, player };
  }
  throw new Error('obstacle never resolved');
}

// ─── Bird timing ─────────────────────────────────────────────────────────────
console.log('\nbird timing');

test('birdClearGrade: crouch inside the perfect window is Perfect', () => {
  const bird = createObstacle('bird', 500);
  for (const start of [498, 499, 500, 501, 502]) {
    assertEq(birdClearGrade({ crouchStartDistance: start, speed: 10 }, bird), 'perfect', `start ${start}`);
  }
});

test('birdClearGrade: crouch inside the good window (but not perfect) is Good', () => {
  const bird = createObstacle('bird', 500);
  for (const start of [497.9, 495, 490, 488]) {
    assertEq(birdClearGrade({ crouchStartDistance: start, speed: 10 }, bird), 'good', `start ${start}`);
  }
});

test('birdClearGrade: crouching far too early still clears as Good, never Perfect', () => {
  const bird = createObstacle('bird', 500);
  assertEq(birdClearGrade({ crouchStartDistance: 400, speed: 10 }, bird), 'good');
  assertEq(birdTimingGrade({ crouchStartDistance: 400, speed: 10 }, bird), 'miss');
});

test('birdTimingGrade: no crouch recorded is a timing miss', () => {
  assertEq(birdTimingGrade({ crouchStartDistance: null, speed: 10 }, createObstacle('bird', 500)), 'miss');
});

test('simulated bird: crouch at the boundary of the perfect window → perfect', () => {
  assertEq(simulateObstacle('bird', { crouchAtDelta: 2 }).grade, 'perfect');
  assertEq(simulateObstacle('bird', { crouchAtDelta: 0.5 }).grade, 'perfect');
});

test('simulated bird: crouch early but valid → good', () => {
  assertEq(simulateObstacle('bird', { crouchAtDelta: 6 }).grade, 'good');
  assertEq(simulateObstacle('bird', { crouchAtDelta: 11 }).grade, 'good');
});

test('simulated bird: never crouching → miss (collision)', () => {
  assertEq(simulateObstacle('bird', {}).grade, 'miss');
});

test('simulated bird: crouching after contact is a miss, not a late perfect', () => {
  assertEq(simulateObstacle('bird', { crouchAtDelta: -1 }).grade, 'miss');
});

test('simulated bird: perfect is still reachable at high speed', () => {
  assertEq(simulateObstacle('bird', { crouchAtDelta: 3, speed: 50 }).grade, 'perfect');
});

// ─── Spike timing ────────────────────────────────────────────────────────────
console.log('\nspike timing');

// Finds, by running the real collision sim, the earliest jump-start delta that
// still clears a spike at a given speed and phase. This is the ground truth the
// SPIKE_TIP_LEAD constant is checked against.
function earliestClearingJumpDelta(speed, phase = 0, side = 'boy') {
  let best = null;
  for (let d = 0; d <= 12; d += 0.05) {
    const obstacle = createObstacle('spikes', 200);
    let player = { ...createPlayer(side), speed, distance: 100 + phase };
    let obstacles = [obstacle]; let jumped = false; let jumpedAt = null;
    for (let frame = 0; frame < 600; frame++) {
      const delta = obstacle.position - player.distance;
      if (!jumped && delta <= d) { player = startJump(player); jumped = true; jumpedAt = delta; }
      const contact = resolveContactAction(player, obstacles, { state: 'running', actionTick: 0 });
      if (contact.action && contact.obstacles.length === 0) { if (contact.grade !== 'miss') best = best == null ? jumpedAt : Math.min(best, jumpedAt); break; }
      const tick = tickSideFrame(player, obstacles, frame / 60, true, frame);
      player = tick.player; obstacles = tick.obstacles;
      if (tick.resolved.length) { if (tick.resolved[0].grade !== 'miss') best = best == null ? jumpedAt : Math.min(best, jumpedAt); break; }
    }
  }
  return best;
}

test('spikeLatestJumpDelta matches the collision sim within one tick at every speed, both sides', () => {
  for (const side of ['girl', 'boy']) {
    // The girl's contact geometry is the tighter one and sets the constant;
    // the boy may clear from up to a quarter-unit later (see obstacles.js).
    const slack = side === 'boy' ? 0.3 : 0.05;
    for (const speed of [5, 10, 20, 30, 50, 80, 120]) {
      const dpf = distPerFrame(speed);
      const predicted = spikeLatestJumpDelta(speed);
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        const observed = earliestClearingJumpDelta(speed, phase * dpf, side);
        assert(observed != null, `${side} speed ${speed}: some jump must clear`);
        // The sim samples once per tick, so the observed latest jump lands in
        // [predicted, predicted + one tick); a jump before the prediction must fail.
        assert(observed >= predicted - slack && observed < predicted + dpf + 0.05,
          `${side} speed ${speed} phase ${phase}: observed ${observed.toFixed(2)} vs predicted ${predicted.toFixed(2)} (dpf ${dpf.toFixed(2)})`);
      }
    }
  }
});

test('gradeSpikeJump: jump inside the perfect band after the latest safe jump is Perfect', () => {
  const spike = createObstacle('spikes', 500);
  const latest = spikeLatestJumpDelta(10);           // 0.84 at starting speed
  const width  = perfectWindow(spike, 10);           // 2 (PERFECT_MIN_TICKS × 1)
  for (const lateness of [0, 0.5, 1, width]) {
    assertEq(gradeSpikeJump(spike, 500 - latest - lateness, 10), 'perfect', 'lateness ' + lateness);
  }
});

test('gradeSpikeJump: earlier valid jumps are Good, boundary exact', () => {
  const spike = createObstacle('spikes', 500);
  const latest = spikeLatestJumpDelta(10);
  const width  = perfectWindow(spike, 10);
  assertEq(gradeSpikeJump(spike, 500 - latest - width - 0.01, 10), 'good');
  assertEq(gradeSpikeJump(spike, 500 - latest - 5, 10), 'good');
});

test('spikeClearGrade reads the player speed and jump start', () => {
  const spike = createObstacle('spikes', 500);
  assertEq(spikeClearGrade({ jumpStartDistance: 499, speed: 10 }, spike), 'perfect');
  assertEq(spikeClearGrade({ jumpStartDistance: 494, speed: 10 }, spike), 'good');
  assertEq(spikeClearGrade({ jumpStartDistance: null, speed: 10 }, spike), 'good', 'cleared without a recorded jump is Good');
});

test('simulated spikes (speed 10): latest safe jumps → perfect, earlier → good, none/late → miss', () => {
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 1 }).grade, 'perfect');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 2 }).grade, 'perfect');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 3 }).grade, 'good');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 8 }).grade, 'good');
  assertEq(simulateObstacle('spikes', {}).grade, 'miss');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 0 }).grade, 'miss');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: -2 }).grade, 'miss');
});

test('simulated spikes (speed 50): perfect is reachable and early jumps are still good', () => {
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 4, speed: 50 }).grade, 'perfect');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 9, speed: 50 }).grade, 'good');
  assertEq(simulateObstacle('spikes', { jumpAtDelta: 2, speed: 50 }).grade, 'miss');
});

// Every phase (fractional position relative to the obstacle) must offer at
// least one frame on which the input grades Perfect — otherwise a Perfect Run
// would be decided by floating-point luck rather than timing.
function perfectReachable(type, speed, phase) {
  const obstacle = createObstacle(type, 200);
  const dpf = distPerFrame(speed);
  for (let startDelta = 0; startDelta <= 14; startDelta += dpf / 4) {
    let player = { ...createPlayer('boy'), speed, distance: 100 + phase };
    let obstacles = [obstacle]; let acted = false;
    for (let frame = 0; frame < 600; frame++) {
      const delta = obstacle.position - player.distance;
      const act = !acted && delta <= startDelta;
      if (type === 'bird') player = applyCrouchHeld(player, acted || act);
      else if (act) player = startJump(player);
      if (act) acted = true;
      const anim = { state: player.state === 'crouching' ? 'crouch' : 'running', actionTick: 0 };
      const contact = resolveContactAction(player, obstacles, anim);
      let grade = null;
      if (contact.action && contact.obstacles.length === 0) grade = contact.grade;
      else {
        const tick = tickSideFrame(player, obstacles, frame / 60, true, frame);
        player = tick.player; obstacles = tick.obstacles;
        if (tick.resolved.length) grade = tick.resolved[0].grade;
      }
      if (grade === 'perfect') return true;
      if (grade) break;
    }
  }
  return false;
}

test('spike Perfect is reachable at every speed and phase', () => {
  for (const speed of [5, 10, 20, 40, 80, 150, 250]) {
    const dpf = distPerFrame(speed);
    for (const phase of [0, 0.2, 0.4, 0.6, 0.8]) {
      assert(perfectReachable('spikes', speed, phase * dpf), 'spikes speed ' + speed + ' phase ' + phase);
    }
  }
});

test('bird Perfect is reachable at every speed and phase', () => {
  for (const speed of [5, 10, 20, 40, 80, 150, 250]) {
    const dpf = distPerFrame(speed);
    for (const phase of [0, 0.2, 0.4, 0.6, 0.8]) {
      assert(perfectReachable('bird', speed, phase * dpf), 'bird speed ' + speed + ' phase ' + phase);
    }
  }
});

test('perfectWindow never narrows below PERFECT_MIN_TICKS of travel', () => {
  for (const type of ['spikes', 'bird', 'arrowwall', 'goblin']) {
    const o = createObstacle(type, 0);
    assert(perfectWindow(o, 200) >= PERFECT_MIN_TICKS * distPerFrame(200) - 1e-9, type);
    assertEq(perfectWindow(o, undefined), perfectWindow(o), 'no speed keeps the base window');
  }
  assertEq(perfectWindow(createObstacle('arrowwall', 0), 10), 2.5, 'starting speed leaves the base window');
});

test('a spike chain inherits the jump grade: Perfect jump → both spikes Perfect, Good jump → both Good', () => {
  // A one-jump chain needs the jump to carry ~34 units, so this runs at a
  // speed where it does. (Generated courses never place spikes this close —
  // chooseFeasibleSpacing pushes spike pairs to 40+ — but the debug course can.)
  const SPEED = 40;
  function chain(jumpAtDelta) {
    const a = createObstacle('spikes', 200), b = createObstacle('spikes', 216);
    let player = { ...createPlayer('boy'), speed: SPEED, distance: 100 };
    let obstacles = [a, b]; let jumped = false; const grades = [];
    for (let frame = 0; frame < 600 && obstacles.length; frame++) {
      if (!jumped && a.position - player.distance <= jumpAtDelta) { player = startJump(player); jumped = true; }
      const contact = resolveContactAction(player, obstacles, { state: 'running', actionTick: 0 });
      if (contact.action) { grades.push(contact.grade); player = contact.player; obstacles = contact.obstacles; continue; }
      const tick = tickSideFrame(player, obstacles, frame / 60, true, frame);
      player = tick.player; obstacles = tick.obstacles;
      for (const r of tick.resolved) grades.push(r.grade);
    }
    return grades;
  }
  const latest = spikeLatestJumpDelta(SPEED);
  assertEq(chain(latest + distPerFrame(SPEED)).join(), 'perfect,perfect');
  assertEq(chain(latest + perfectWindow(createObstacle('spikes', 0), SPEED) + 3).join(), 'good,good');
});

// ─── Arrow wall / goblin still grade through the same seam ──────────────────
console.log('\nunified grading');

test('arrow wall block inside perfect window tallies a perfect arrowwall', () => {
  const player = { ...createPlayer('boy'), distance: 500 };
  const result = resolveContactAction(player, [createObstacle('arrowwall', 500)], { state: 'block', actionTick: 6 });
  assertEq(result.grade, 'perfect');
  assertEq(result.player.stats.perfects, 1);
  assertEq(result.player.stats.perfectByType.arrowwall, 1);
});

test('goblin attack inside perfect window tallies a perfect goblin', () => {
  const player = { ...createPlayer('boy'), distance: 500 };
  const result = resolveContactAction(player, [createObstacle('goblin', 500)], { state: 'attack', actionTick: 6 });
  assertEq(result.grade, 'perfect');
  assertEq(result.player.stats.perfectByType.goblin, 1);
});

test('every obstacle type can produce all three grades through the sim', () => {
  const grades = {
    spikes: [simulateObstacle('spikes', { jumpAtDelta: 1 }).grade, simulateObstacle('spikes', { jumpAtDelta: 6 }).grade, simulateObstacle('spikes', {}).grade],
    bird:   [simulateObstacle('bird',   { crouchAtDelta: 1 }).grade, simulateObstacle('bird', { crouchAtDelta: 8 }).grade, simulateObstacle('bird', {}).grade],
  };
  for (const [type, [p, g, m]] of Object.entries(grades)) {
    assertEq(p, 'perfect', `${type} perfect`);
    assertEq(g, 'good',    `${type} good`);
    assertEq(m, 'miss',    `${type} miss`);
  }
});

// ─── Lane stats ──────────────────────────────────────────────────────────────
console.log('\nlane stats');

test('createPlayer starts with empty stats and no finish frame', () => {
  const p = createPlayer('girl');
  assertEq(p.stats.perfects, 0);
  assertEq(p.stats.warmupFaced, 0);
  assertEq(p.finishFrame, null);
  assertEq(p.crouchStartDistance, null);
});

test('recordObstacleOutcome tallies grade, by-type and warmup counts immutably', () => {
  const p0 = createPlayer('boy');
  const p1 = recordObstacleOutcome(p0, { type: 'spikes', isWarmup: true }, 'perfect');
  const p2 = recordObstacleOutcome(p1, { type: 'bird',   isWarmup: true }, 'good');
  const p3 = recordObstacleOutcome(p2, { type: 'goblin', isWarmup: true }, 'miss');
  const p4 = recordObstacleOutcome(p3, { type: 'arrowwall' }, 'perfect');
  assertEq(p0.stats.perfects, 0, 'original untouched');
  assertEq(p4.stats.perfects, 2);
  assertEq(p4.stats.goods, 1);
  assertEq(p4.stats.misses, 1);
  assertEq(p4.stats.successfulByType.spikes, 1);
  assertEq(p4.stats.successfulByType.bird, 1);
  assertEq(p4.stats.successfulByType.goblin, 0);
  assertEq(p4.stats.perfectByType.arrowwall, 1);
  assertEq(p4.stats.missesByType.goblin, 1);
  assertEq(p4.stats.warmupFaced, 3);
  assertEq(p4.stats.warmupMisses, 1);
});

test('resolveObstacleGrade applies score AND stats from one grade', () => {
  const p = resolveObstacleGrade(createPlayer('boy'), createObstacle('spikes', 1), 'perfect');
  assertEq(p.score, 300);
  assertEq(p.obstaclesFaced, 1);
  assertEq(p.stats.perfects, 1);
  const q = resolveObstacleGrade(p, createObstacle('bird', 2), 'miss');
  assertEq(q.stats.misses, 1);
  assertEq(q.obstaclesFaced, 2);
  assertEq(q.stats.perfects + q.stats.goods + q.stats.misses, q.obstaclesFaced);
});

test('sanitizeLaneStats rejects junk and fills every type key', () => {
  const s = sanitizeLaneStats({ perfects: '3', goods: -2, missesByType: { bird: 'x', goblin: 2 } });
  assertEq(s.perfects, 3);
  assertEq(s.goods, 0);
  assertEq(s.missesByType.bird, 0);
  assertEq(s.missesByType.goblin, 2);
  assertEq(s.successfulByType.spikes, 0);
});

test('warmup misses are counted off the isWarmup flag of the generated course', () => {
  const warmup = generateWarmup(0);
  assert(warmup.every(o => o.isWarmup), 'warmup obstacles carry isWarmup');
  let p = createPlayer('boy');
  for (const o of warmup) p = resolveObstacleGrade(p, o, 'good');
  assertEq(p.stats.warmupFaced, 4);
  assertEq(p.stats.warmupMisses, 0);
});

// ─── finishFrame and crouch tracking ─────────────────────────────────────────
console.log('\nfinish frame');

test('tickSideFrame stamps finishFrame once when the lane crosses RUN_DISTANCE', () => {
  const p = { ...createPlayer('boy'), distance: RUN_DISTANCE - 0.5 };
  const r1 = tickSideFrame(p, [], 10, true, 600);
  assertEq(r1.player.state, 'finished');
  assertEq(r1.player.finishFrame, 600);
  const r2 = tickSideFrame(r1.player, [], 10.1, true, 601);
  assertEq(r2.player.finishFrame, 600, 'does not move once set');
});

test('tickFrame passes the elapsed frame count as the finish frame', () => {
  let gs = { ...createGameState('local', 1), phase: 'playing', elapsed: 99 };
  gs = { ...gs, boy: { ...gs.boy, distance: RUN_DISTANCE - 0.1 }, boyObstacles: [] };
  gs = tickFrame(gs);
  assertEq(gs.boy.finishFrame, 100);
});

test('applyCrouchHeld stamps crouchStartDistance on entry and clears it on release', () => {
  const p = { ...createPlayer('boy'), distance: 123 };
  const c = applyCrouchHeld(p, true);
  assertEq(c.state, 'crouching');
  assertEq(c.crouchStartDistance, 123);
  const held = applyCrouchHeld({ ...c, distance: 130 }, true);
  assertEq(held.crouchStartDistance, 123, 'holding keeps the entry distance');
  const released = applyCrouchHeld(held, false);
  assertEq(released.state, 'running');
  assertEq(released.crouchStartDistance, null);
});

test('applyCrouchHeld mid-jump cancels the jump (existing behaviour preserved)', () => {
  const j = startJump({ ...createPlayer('boy'), distance: 50 });
  const c = applyCrouchHeld(j, true);
  assertEq(c.state, 'crouching');
  assertEq(c.jumpY, 0);
  assertEq(c.jumpStartDistance, null);
});

// ─── Snapshot carries telemetry ───────────────────────────────────────────────
console.log('\nsnapshot telemetry');

test('lane snapshot ships stats + finishFrame and applies them on the other side', () => {
  let p = { ...createPlayer('girl'), finishFrame: 4321 };
  p = resolveObstacleGrade(p, createObstacle('bird', 1), 'perfect');
  const snap = buildLaneSnapshot(p, [], { state: 'running', actionTick: 0 }, [], 4321, 7);
  assertEq(snap.player.stats.perfectByType.bird, 1);
  assertEq(snap.player.finishFrame, 4321);
  const applied = applyLaneSnapshot({ player: createPlayer('girl'), obstacles: [], anim: {} }, JSON.parse(JSON.stringify(snap)), -1);
  assertEq(applied.player.stats.perfects, 1);
  assertEq(applied.player.finishFrame, 4321);
});

// ─── Run result ──────────────────────────────────────────────────────────────
console.log('\nrun result');

function finishedLane(side, extra = {}) {
  let p = { ...createPlayer(side), distance: RUN_DISTANCE, state: 'finished', finishFrame: 3000, score: 12000, obstaclesFaced: 2 };
  p = { ...p, stats: { ...createLaneStats(), perfects: 2, perfectByType: { spikes: 1, bird: 1, arrowwall: 0, goblin: 0 }, successfulByType: { spikes: 1, bird: 1, arrowwall: 0, goblin: 0 } } };
  return { ...p, ...extra };
}

test('ownedLanesForMode follows the account ownership model', () => {
  assertEq(ownedLanesForMode('single', 'girl').join(), 'girl');
  assertEq(ownedLanesForMode('single', 'boy').join(), 'boy');
  assertEq(ownedLanesForMode('local').join(), 'boy,girl');
  assertEq(ownedLanesForMode('online', null, 'girl').join(), 'girl');
});

test('buildRunResult (solo) marks the partner lane inactive and owns only the solo side', () => {
  const gs = {
    mode: 'single', seed: 5, elapsed: 3000,
    boy: finishedLane('boy'),
    girl: { ...createPlayer('girl'), distance: RUN_DISTANCE, state: 'finished' },
    runSummary: { outcome: 'reunion', elapsedFrames: 3000 },
  };
  const run = buildRunResult(gs, { runId: 'abc', soloSide: 'boy' });
  assertEq(run.gameSlug, 'lovers-lost');
  assertEq(run.runId, 'abc');
  assertEq(run.mode, 'single');
  assertEq(run.soloSide, 'boy');
  assertEq(run.ownedLanes.join(), 'boy');
  assertEq(run.outcome, 'reunion');
  assertEq(run.elapsedFrames, 3000);
  assertEq(run.lanes.boy.active, true);
  assertEq(run.lanes.boy.finished, true);
  assertEq(run.lanes.boy.finishFrame, 3000);
  assertEq(run.lanes.boy.perfects, 2);
  assertEq(run.lanes.girl.active, false);
  assertEq(run.lanes.girl.finished, false);
  assertEq(run.lanes.girl.score, 0);
});

test('buildRunResult (online) owns only the local side and keeps the partner lane active', () => {
  const gs = {
    mode: 'online', seed: 5, elapsed: 3100,
    boy: finishedLane('boy'), girl: finishedLane('girl', { finishFrame: 3100 }),
    runSummary: { outcome: 'reunion', elapsedFrames: 3100 },
  };
  const run = buildRunResult(gs, { runId: 'r', onlineSide: 'girl' });
  assertEq(run.ownedLanes.join(), 'girl');
  assertEq(run.soloSide, null);
  assertEq(run.lanes.boy.active, true);
  assertEq(run.lanes.girl.finishFrame, 3100);
});

test('buildRunResult (local, game over) reports unfinished lanes without a finish frame', () => {
  const gs = {
    mode: 'local', seed: 5, elapsed: 5400,
    boy: { ...createPlayer('boy'), distance: 4000 }, girl: { ...createPlayer('girl'), distance: 3000 },
    runSummary: { outcome: 'game_over', elapsedFrames: 5400 },
  };
  const run = buildRunResult(gs, { runId: 'r' });
  assertEq(run.outcome, 'game_over');
  assertEq(run.ownedLanes.join(), 'boy,girl');
  assertEq(run.lanes.boy.finished, false);
  assertEq(run.lanes.boy.finishFrame, null);
});

test('createRunId is stable per call and unique across calls', () => {
  const a = createRunId(42, 1000), b = createRunId(42, 1000);
  assert(a.startsWith('ll-'), 'prefixed');
  assert(a !== b, 'nonce differs');
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
