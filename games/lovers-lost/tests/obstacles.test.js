// obstacles.test.js — run with: node obstacles.test.js
import {
  createObstacle,
  generateWarmup,
  generateWave,
  minimumSpacingForPair,
  pairSpacingIsFeasible,
  requiredInput,
  gradeInput,
  windowExpired,
  makeRng,
  OBSTACLE_TYPES,
  WARMUP_SEQUENCE,
  WAVE_COUNTS,
  BIRD_VISUAL_FOLLOW_MIN,
} from '../scripts/obstacles.js';

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

test('goblin creates obstacle with type and position', () => {
  const o = createObstacle('goblin', 400);
  assertEq(o.type, 'goblin');
  assertEq(o.position, 400);
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

test('goblin requires attack', () => {
  assertEq(requiredInput(createObstacle('goblin', 0)), 'attack');
});

// ─── gradeInput ───────────────────────────────────────────────────────────────
console.log('\ngradeInput');

test('exact match returns perfect', () => {
  const o = createObstacle('spikes', 100);
  assertEq(gradeInput(o, 100), 'perfect');
});

test('small contact offset still returns perfect', () => {
  const o = createObstacle('spikes', 100);
  assertEq(gradeInput(o, 98.8), 'perfect');
  assertEq(gradeInput(o, 101.2), 'perfect');
});

test('inside spikes hitbox but outside perfect returns good', () => {
  const o = createObstacle('spikes', 100);
  assertEq(gradeInput(o, 92), 'good');
  assertEq(gradeInput(o, 101.8), 'good');
});

test('arrow wall can be blocked before contact', () => {
  const o = createObstacle('arrowwall', 100);
  assertEq(gradeInput(o, 88), 'good');
});

test('before the hitbox opens returns miss', () => {
  const o = createObstacle('spikes', 100);
  assertEq(gradeInput(o, 80), 'miss');
});

test('too far past contact returns miss', () => {
  const o = createObstacle('spikes', 100);
  assertEq(gradeInput(o, 103), 'miss');
});

// ─── windowExpired ────────────────────────────────────────────────────────────
console.log('\nwindowExpired');

test('false before obstacle position', () => {
  const o = createObstacle('spikes', 100);
  assert(!windowExpired(o, 50));
});

test('false while obstacle is still inside the player hitbox', () => {
  const o = createObstacle('spikes', 100);
  assert(!windowExpired(o, 101.5));
});

test('true once obstacle has passed beyond the late edge', () => {
  const o = createObstacle('spikes', 100);
  assert(windowExpired(o, 103));
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

test('wave 1 goblins have no extra properties', () => {
  for (let seed = 0; seed < 10; seed++) {
    const wave = generateWave(1, makeRng(seed));
    const goblins = wave.filter(o => o.type === 'goblin');
    for (const g of goblins) {
      assertEq(Object.keys(g).sort().join(','), 'position,type');
    }
  }
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
test('minimumSpacingForPair forces spike chains to be either one-jump close or full reset far', () => {
  const first = createObstacle('spikes', 100);
  const second = createObstacle('spikes', 100);
  const minSpacing = minimumSpacingForPair(first, second);

  assert(minSpacing >= 40, `expected spike reset spacing to be conservative, got ${minSpacing}`);
  assertEq(pairSpacingIsFeasible(first, { ...second, position: first.position + 25 }), false);
  assertEq(pairSpacingIsFeasible(first, { ...second, position: first.position + minSpacing }), true);
  assertEq(pairSpacingIsFeasible(first, { ...second, position: first.position + 18 }), true);
});

test('minimumSpacingForPair keeps mixed-action obstacles from overlapping impossibly', () => {
  const bird = createObstacle('bird', 100);
  const arrow = createObstacle('arrowwall', 100);
  const minSpacing = minimumSpacingForPair(bird, arrow);

  assert(minSpacing >= BIRD_VISUAL_FOLLOW_MIN, `expected >= BIRD_VISUAL_FOLLOW_MIN (${BIRD_VISUAL_FOLLOW_MIN}), got ${minSpacing}`);
  assertEq(pairSpacingIsFeasible(bird, { ...arrow, position: bird.position + minSpacing - 1 }), false);
  assertEq(pairSpacingIsFeasible(bird, { ...arrow, position: bird.position + minSpacing }), true);
});

test('bird visual speed: all obstacle types after bird enforce BIRD_VISUAL_FOLLOW_MIN', () => {
  const bird = createObstacle('bird', 100);
  for (const type of ['spikes', 'arrowwall', 'goblin', 'bird']) {
    const next = createObstacle(type, 100);
    const min = minimumSpacingForPair(bird, next);
    assert(min >= BIRD_VISUAL_FOLLOW_MIN, `bird->${type}: expected >= ${BIRD_VISUAL_FOLLOW_MIN}, got ${min}`);
  }
});

test('non-bird leading obstacle does not apply BIRD_VISUAL_FOLLOW_MIN', () => {
  // Normal obstacles don't have the 2× visual speed problem
  const spike = createObstacle('spikes', 100);
  const bird  = createObstacle('bird', 100);
  const min = minimumSpacingForPair(spike, bird);
  // Should be action-window based, not the larger visual minimum
  assert(min < BIRD_VISUAL_FOLLOW_MIN, `spikes->bird should not apply bird visual min, got ${min}`);
});

test('generateWave never emits an infeasible adjacent obstacle pair', () => {
  for (let seed = 0; seed < 50; seed++) {
    const wave = generateWave(4, makeRng(seed));
    for (let i = 1; i < wave.length; i++) {
      assert(
        pairSpacingIsFeasible(wave[i - 1], wave[i]),
        `seed ${seed}: infeasible pair ${wave[i - 1].type}->${wave[i].type} at ${wave[i - 1].position}/${wave[i].position}`
      );
    }
  }
});


test('cross-wave boundary: first obstacle of wave N+1 is feasibly spaced from last of wave N', () => {
  for (let seed = 0; seed < 50; seed++) {
    const rngA = makeRng(seed);
    const rngB = makeRng(seed);
    let prevLast = null;
    for (let w = 1; w <= 5; w++) {
      const wave = generateWave(w, rngA, prevLast);
      if (prevLast && wave.length > 0) {
        assert(
          pairSpacingIsFeasible(prevLast, wave[0]),
          `seed ${seed}: infeasible cross-wave pair wave${w-1}->wave${w}: ` +
          `${prevLast.type}@${prevLast.position} -> ${wave[0].type}@${wave[0].position}`
        );
      }
      prevLast = wave[wave.length - 1] || prevLast;
    }
  }
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
