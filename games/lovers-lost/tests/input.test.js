// input.test.js — run with: node input.test.js
import { keyToAction, createInput } from '../scripts/input.js';

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

function assertNull(val, msg) {
  if (val !== null) throw new Error(msg || `expected null, got ${JSON.stringify(val)}`);
}

// ─── keyToAction ──────────────────────────────────────────────────────────────
console.log('\nkeyToAction — boy (WASD)');

test('W → boy jump', () => {
  const r = keyToAction('w');
  assertEq(r.side, 'boy');
  assertEq(r.action, 'jump');
});

test('w uppercase → boy jump (normalised)', () => {
  const r = keyToAction('W');
  assertEq(r.side, 'boy');
  assertEq(r.action, 'jump');
});

test('S → boy crouch', () => {
  const r = keyToAction('s');
  assertEq(r.side, 'boy');
  assertEq(r.action, 'crouch');
});

test('D → boy attack', () => {
  const r = keyToAction('d');
  assertEq(r.side, 'boy');
  assertEq(r.action, 'attack');
});

test('A → boy block', () => {
  const r = keyToAction('a');
  assertEq(r.side, 'boy');
  assertEq(r.action, 'block');
});

console.log('\nkeyToAction — girl (Arrow keys)');

test('ArrowUp → girl jump', () => {
  const r = keyToAction('ArrowUp');
  assertEq(r.side, 'girl');
  assertEq(r.action, 'jump');
});

test('ArrowDown → girl crouch', () => {
  const r = keyToAction('ArrowDown');
  assertEq(r.side, 'girl');
  assertEq(r.action, 'crouch');
});

test('ArrowLeft → girl attack', () => {
  const r = keyToAction('ArrowLeft');
  assertEq(r.side, 'girl');
  assertEq(r.action, 'attack');
});

test('ArrowRight → girl block', () => {
  const r = keyToAction('ArrowRight');
  assertEq(r.side, 'girl');
  assertEq(r.action, 'block');
});

console.log('\nkeyToAction — unmapped keys');

test('unmapped key returns null', () => {
  assertNull(keyToAction('q'));
});

test('Enter returns null', () => {
  assertNull(keyToAction('Enter'));
});

test('empty string returns null', () => {
  assertNull(keyToAction(''));
});

// ─── createInput — initial state ──────────────────────────────────────────────
console.log('\ncreateInput — initial state');

test('isHeld starts false for boy jump', () => {
  const inp = createInput();
  assert(!inp.isHeld('boy', 'jump'));
});

test('isHeld starts false for girl crouch', () => {
  const inp = createInput();
  assert(!inp.isHeld('girl', 'crouch'));
});

test('isPressed starts false for boy attack', () => {
  const inp = createInput();
  assert(!inp.isPressed('boy', 'attack'));
});

// ─── createInput — keydown sets held + pressed ────────────────────────────────
console.log('\ncreateInput — keydown');

test('keydown W sets boy jump held', () => {
  const inp = createInput();
  inp.keydown('w');
  assert(inp.isHeld('boy', 'jump'));
});

test('keydown W sets boy jump pressed', () => {
  const inp = createInput();
  inp.keydown('w');
  assert(inp.isPressed('boy', 'jump'));
});

test('keydown ArrowUp sets girl jump held', () => {
  const inp = createInput();
  inp.keydown('ArrowUp');
  assert(inp.isHeld('girl', 'jump'));
});

test('keydown ArrowUp sets girl jump pressed', () => {
  const inp = createInput();
  inp.keydown('ArrowUp');
  assert(inp.isPressed('girl', 'jump'));
});

test('unmapped keydown has no effect', () => {
  const inp = createInput();
  inp.keydown('q');
  assert(!inp.isHeld('boy', 'jump'));
  assert(!inp.isHeld('girl', 'jump'));
});

// ─── createInput — keyup clears held ─────────────────────────────────────────
console.log('\ncreateInput — keyup');

test('keyup W clears boy jump held', () => {
  const inp = createInput();
  inp.keydown('w');
  inp.keyup('w');
  assert(!inp.isHeld('boy', 'jump'));
});

test('keyup W does not clear boy jump pressed', () => {
  const inp = createInput();
  inp.keydown('w');
  inp.keyup('w');
  assert(inp.isPressed('boy', 'jump'));
});

test('keyup ArrowDown clears girl crouch held', () => {
  const inp = createInput();
  inp.keydown('ArrowDown');
  inp.keyup('ArrowDown');
  assert(!inp.isHeld('girl', 'crouch'));
});

// ─── createInput — tick clears pressed ───────────────────────────────────────
console.log('\ncreateInput — tick');

test('tick clears pressed for boy jump', () => {
  const inp = createInput();
  inp.keydown('w');
  inp.tick();
  assert(!inp.isPressed('boy', 'jump'));
});

test('tick clears pressed for girl attack', () => {
  const inp = createInput();
  inp.keydown('ArrowLeft');
  inp.tick();
  assert(!inp.isPressed('girl', 'attack'));
});

test('tick does not clear held', () => {
  const inp = createInput();
  inp.keydown('s');
  inp.tick();
  assert(inp.isHeld('boy', 'crouch'));
});

test('tick clears all pressed actions at once', () => {
  const inp = createInput();
  inp.keydown('w');
  inp.keydown('s');
  inp.keydown('ArrowUp');
  inp.tick();
  assert(!inp.isPressed('boy', 'jump'));
  assert(!inp.isPressed('boy', 'crouch'));
  assert(!inp.isPressed('girl', 'jump'));
});

// ─── createInput — held not re-triggered on hold ──────────────────────────────
console.log('\ncreateInput — held does not re-trigger pressed');

test('second keydown while held does not re-set pressed after tick', () => {
  const inp = createInput();
  inp.keydown('w');
  inp.tick();
  inp.keydown('w'); // still held, simulating browser key-repeat
  assert(!inp.isPressed('boy', 'jump'), 'should not re-trigger pressed if already held');
});

// ─── createInput — injectAction / clearAction (online mode) ──────────────────
console.log('\ncreateInput — injectAction / clearAction');

test('injectAction sets held', () => {
  const inp = createInput();
  inp.injectAction('girl', 'block');
  assert(inp.isHeld('girl', 'block'));
});

test('injectAction sets pressed', () => {
  const inp = createInput();
  inp.injectAction('girl', 'block');
  assert(inp.isPressed('girl', 'block'));
});

test('clearAction clears held', () => {
  const inp = createInput();
  inp.injectAction('girl', 'block');
  inp.clearAction('girl', 'block');
  assert(!inp.isHeld('girl', 'block'));
});

test('clearAction does not clear pressed', () => {
  const inp = createInput();
  inp.injectAction('girl', 'block');
  inp.clearAction('girl', 'block');
  assert(inp.isPressed('girl', 'block'));
});

// ─── createInput — uppercase normalisation via keydown ────────────────────────
console.log('\ncreateInput — key normalisation');

test('keydown uppercase D maps to boy attack', () => {
  const inp = createInput();
  inp.keydown('D');
  assert(inp.isHeld('boy', 'attack'));
});

test('keyup uppercase D clears boy attack', () => {
  const inp = createInput();
  inp.keydown('D');
  inp.keyup('D');
  assert(!inp.isHeld('boy', 'attack'));
});

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
