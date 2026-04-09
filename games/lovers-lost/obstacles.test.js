// obstacles.test.js — run with: node obstacles.test.js
'use strict';

const {
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
} = require('./obstacles');

const { distPerFrame } = require('./player');

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

function assertClose(a, b, msg, eps = 0.0001) {
  if (Math.abs(a - b) > eps) throw new Error(msg || `expected ${a} ≈ ${b}`);
}

// ─── createObstacle ───────────────────────────────────────────────────────────
console.log('\ncreateObstacle');

test('creates spikes at given position', () => {
  const o = createObstacle('spikes', 100);
  assertEq(o.type, 'spikes');
  assertEq(o.position, 100);
});

test('creates bird at given position', () => {
  const o = createObstacle('bird', 200);
  assertEq(o.type, 'bird');
  assertEq(o.position, 200);
});

test('creates arrowwall at given position', () => {
  const o = createObstacle('arrowwall', 300);
  assertEq(o.type, 'arrowwall');
});

test('goblin defaults to single-phase', () => {
  const o = createObstacle('goblin', 400);
  assertEq(o.twoPhase, false);
  assertEq(o.phase, 0);
});

test('goblin can be two-phase', () => {
  const o = createObstacle('goblin', 400, { twoPhase: true });
  assertEq(o.twoPhase, true);
});

test('does not mutate options object', () => {
  const opts = { twoPhase: true };
  createObstacle('goblin', 400, opts);
  assertEq(Object.keys(opts).length, 1);
});

// ─── requiredInput ────────────────────────────────────────────────────────────
console.log('\nrequiredInput');

test('spikes requires jump', () => {
  assertEq(requiredInput(createObstacle('spikes', 0)), 'jump');
});

test('bird requires crouch', () => {
  assertEq(requiredInput(createObstacle('bird', 0)), 'crouch');
});

test('arrowwall requires block', () => {
  assertEq(requiredInput(createObstacle('arrowwall', 0)), 'block');
});

test('single-phase goblin requires attack', () => {
  assertEq(requiredInput(createObstacle('goblin', 0)), 'attack');
});

test('two-phase goblin phase 0 requires block', () => {
  const o = createObstacle('goblin', 0, { twoPhase: true });
  assertEq(requiredInput(o), 'block');
});

test('two-phase goblin phase 1 requires attack', () => {
  const o = { ...createObstacle('goblin', 0, { twoPhase: true }), phase: 1 };
  assertEq(requiredInput(o), 'attack');
});

// ─── advanceGoblinPhase ───────────────────────────────────────────────────────
console.log('\nadvanceGoblinPhase');

test('advances two-phase goblin from phase 0 to 1', () => {
  const o = createObstacle('goblin', 0, { twoPhase: true });
  const next = advanceGoblinPhase(o);
  assertEq(next.phase, 1);
});

test('does not mutate original obstacle', () => {
  const o = createObstacle('goblin', 0, { twoPhase: true });
  advanceGoblinPhase(o);
  assertEq(o.phase, 0);
});

// ─── gradeInput ───────────────────────────────────────────────────────────────
console.log('\ngradeInput');

test('exact match returns perfect', () => {
  const o = createObstacle('spikes', 100);
  assertEq(gradeInput(o, 100, 5), 'perfect');
});

test('within 1 frame returns perfect', () => {
  const o = createObstacle('spikes', 100);
  const frame = distPerFrame(5);
  assertEq(gradeInput(o, 100 - frame * 0.9, 5), 'perfect');
  assertEq(gradeInput(o, 100 + frame * 0.9, 5), 'perfect');
});

test('just outside 1 frame but within 4 frames returns good', () => {
  const o = createObstacle('spikes', 100);
  const frame = distPerFrame(5);
  assertEq(gradeInput(o, 100 - frame * 2, 5), 'good');
  assertEq(gradeInput(o, 100 + frame * 2, 5), 'good');
});

test('exactly at 4 frame boundary returns good', () => {
  const o = createObstacle('spikes', 100);
  const frame = distPerFrame(5);
  assertEq(gradeInput(o, 100 - frame * 4, 5), 'good');
});

test('beyond 4 frames returns miss', () => {
  const o = createObstacle('spikes', 100);
  const frame = distPerFrame(5);
  assertEq(gradeInput(o, 100 - frame * 5, 5), 'miss');
  assertEq(gradeInput(o, 100 + frame * 5, 5), 'miss');
});

test('window scales with speed', () => {
  const o = createObstacle('spikes', 100);
  const frame10 = distPerFrame(10);
  // within 1 frame at speed 10 should be perfect
  assertEq(gradeInput(o, 100 - frame10 * 0.9, 10), 'perfect');
  // just outside 1 frame but within 4 at speed 10 should be good
  assertEq(gradeInput(o, 100 - frame10 * 2, 10), 'good');
});

// ─── windowExpired ────────────────────────────────────────────────────────────
console.log('\nwindowExpired');

test('false before obstacle position', () => {
  const o = createObstacle('spikes', 100);
  assert(!windowExpired(o, 50, 5));
});

test('false within good window', () => {
  const o = createObstacle('spikes', 100);
  const frame = distPerFrame(5);
  assert(!windowExpired(o, 100 + frame * 3, 5));
});

test('true when player distance exceeds position by more than 4 frames', () => {
  const o = createObstacle('spikes', 100);
  const frame = distPerFrame(5);
  assert(windowExpired(o, 100 + frame * 4.1, 5));
});

// ─── generateWarmup ───────────────────────────────────────────────────────────
console.log('\ngenerateWarmup');

test('generates exactly 4 obstacles', () => {
  assertEq(generateWarmup(0, 80).length, 4);
});

test('warmup order: spikes, bird, goblin, arrowwall', () => {
  const seq = generateWarmup(0, 80);
  assertEq(seq[0].type, WARMUP_SEQUENCE[0]);
  assertEq(seq[1].type, WARMUP_SEQUENCE[1]);
  assertEq(seq[2].type, WARMUP_SEQUENCE[2]);
  assertEq(seq[3].type, WARMUP_SEQUENCE[3]);
});

test('warmup goblin is always single-phase', () => {
  const seq = generateWarmup(0, 80);
  const goblin = seq.find(o => o.type === 'goblin');
  assertEq(goblin.twoPhase, false);
});

test('positions are monotonically increasing', () => {
  const seq = generateWarmup(0, 80);
  for (let i = 1; i < seq.length; i++) {
    assert(seq[i].position > seq[i-1].position,
      `position ${seq[i].position} not > ${seq[i-1].position}`);
  }
});

test('first obstacle at startPosition + spacing', () => {
  const seq = generateWarmup(100, 80);
  assertEq(seq[0].position, 180);
});

test('spacing is consistent', () => {
  const seq = generateWarmup(0, 80);
  assertEq(seq[0].position, 80);
  assertEq(seq[1].position, 160);
  assertEq(seq[2].position, 240);
  assertEq(seq[3].position, 320);
});

// ─── generateWave ─────────────────────────────────────────────────────────────
console.log('\ngenerateWave');

const rng = makeRng(42);

test('wave 1 generates 10 obstacles', () => {
  assertEq(generateWave(1, makeRng(1)).length, WAVE_COUNTS[0]);
});

test('wave 2 generates 15 obstacles', () => {
  assertEq(generateWave(2, makeRng(2)).length, WAVE_COUNTS[1]);
});

test('wave 5 generates 30 obstacles', () => {
  assertEq(generateWave(5, makeRng(5)).length, WAVE_COUNTS[4]);
});

test('all obstacle types are valid', () => {
  const wave = generateWave(1, makeRng(99));
  for (const o of wave) {
    assert(OBSTACLE_TYPES.includes(o.type), `invalid type: ${o.type}`);
  }
});

test('positions are monotonically increasing', () => {
  const wave = generateWave(1, makeRng(7));
  for (let i = 1; i < wave.length; i++) {
    assert(wave[i].position > wave[i-1].position,
      `position ${wave[i].position} not > ${wave[i-1].position}`);
  }
});

test('repeat cap: never more than 3 same type in a row', () => {
  // test across multiple seeds to be thorough
  for (let seed = 0; seed < 20; seed++) {
    const wave = generateWave(3, makeRng(seed));
    let runLen = 1;
    for (let i = 1; i < wave.length; i++) {
      if (wave[i].type === wave[i-1].type) {
        runLen++;
        assert(runLen <= 3, `seed ${seed}: ${wave[i].type} repeated ${runLen} times in a row`);
      } else {
        runLen = 1;
      }
    }
  }
});

test('two-phase goblin never appears in wave 1 (warmup wave)', () => {
  for (let seed = 0; seed < 10; seed++) {
    const wave = generateWave(1, makeRng(seed));
    const goblins = wave.filter(o => o.type === 'goblin');
    for (const g of goblins) {
      assert(!g.twoPhase, `wave 1 should not have two-phase goblins (seed ${seed})`);
    }
  }
});

test('two-phase goblins can appear in wave 2+', () => {
  // run many seeds, at least one wave 3+ should have a two-phase goblin
  let found = false;
  for (let seed = 0; seed < 50; seed++) {
    const wave = generateWave(3, makeRng(seed));
    if (wave.some(o => o.type === 'goblin' && o.twoPhase)) {
      found = true;
      break;
    }
  }
  assert(found, 'expected at least one two-phase goblin across 50 seeds of wave 3');
});

test('makeRng produces different values each call', () => {
  const rng = makeRng(42);
  const a = rng();
  const b = rng();
  assert(a !== b, 'rng should produce different values');
});

test('same seed produces same sequence', () => {
  const a = generateWave(2, makeRng(123));
  const b = generateWave(2, makeRng(123));
  assertEq(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assertEq(a[i].type, b[i].type);
    assertEq(a[i].position, b[i].position);
  }
});

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
