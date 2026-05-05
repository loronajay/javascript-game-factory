// board.test.js — pure board logic tests
// Run: node tests/board.test.js  (from games/battleshits/)

import {
  BOARD_SIZE,
  FLEET_DEFS,
  cellIndex,
  createFleetBoard,
  createTargetBoard,
  isValidPlacement,
  placeShip,
  removeShip,
  resolveIncomingShot,
  isShipSunk,
  isFleetDestroyed,
  recordShotResult,
  isCellShot,
} from '../scripts/board.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(a, b, message) {
  if (a !== b) throw new Error(message || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── cellIndex ────────────────────────────────────────────────────────────────

console.log('\ncellIndex');

test('(0,0) → 0',   () => assertEqual(cellIndex(0, 0), 0));
test('(9,0) → 9',   () => assertEqual(cellIndex(9, 0), 9));
test('(0,1) → 10',  () => assertEqual(cellIndex(0, 1), 10));
test('(9,9) → 99',  () => assertEqual(cellIndex(9, 9), 99));

// ─── createFleetBoard ─────────────────────────────────────────────────────────

console.log('\ncreateFleetBoard');

test('returns 100 cells', () => assertEqual(createFleetBoard().length, 100));
test('all cells empty and unhit', () => assert(createFleetBoard().every(c => c.ship === null && c.hit === false)));

// ─── createTargetBoard ────────────────────────────────────────────────────────

console.log('\ncreateTargetBoard');

test('returns 100 null cells', () => {
  const b = createTargetBoard();
  assertEqual(b.length, 100);
  assert(b.every(c => c === null));
});

// ─── isValidPlacement ─────────────────────────────────────────────────────────

console.log('\nisValidPlacement');

test('horizontal within bounds',     () => assert(isValidPlacement(createFleetBoard(), 3, 0, 0, true)));
test('vertical within bounds',       () => assert(isValidPlacement(createFleetBoard(), 3, 0, 0, false)));
test('horizontal overflow invalid',  () => assert(!isValidPlacement(createFleetBoard(), 5, 8, 0, true)));
test('vertical overflow invalid',    () => assert(!isValidPlacement(createFleetBoard(), 5, 0, 8, false)));
test('overlap with placed ship',     () => {
  const b = placeShip(createFleetBoard(), 'carrier', 5, 0, 0, true);
  assert(!isValidPlacement(b, 3, 0, 0, true));
});
test('adjacent to placed ship ok',   () => {
  const b = placeShip(createFleetBoard(), 'carrier', 5, 0, 0, true);
  assert(isValidPlacement(b, 3, 0, 1, true));
});
test('negative col invalid',         () => assert(!isValidPlacement(createFleetBoard(), 3, -1, 0, true)));
test('negative row invalid',         () => assert(!isValidPlacement(createFleetBoard(), 3, 0, -1, false)));
test('fills board edge exactly',     () => assert(isValidPlacement(createFleetBoard(), 10, 0, 0, true)));
test('one past board edge invalid',  () => assert(!isValidPlacement(createFleetBoard(), 10, 1, 0, true)));

// ─── placeShip ────────────────────────────────────────────────────────────────

console.log('\nplaceShip');

test('places horizontal cells correctly', () => {
  const b = placeShip(createFleetBoard(), 'carrier', 5, 2, 3, true);
  assert(b !== null);
  for (let i = 0; i < 5; i++) assertEqual(b[cellIndex(2 + i, 3)].ship, 'carrier');
});

test('places vertical cells correctly', () => {
  const b = placeShip(createFleetBoard(), 'carrier', 5, 2, 3, false);
  assert(b !== null);
  for (let i = 0; i < 5; i++) assertEqual(b[cellIndex(2, 3 + i)].ship, 'carrier');
});

test('returns null for invalid placement', () => {
  assertEqual(placeShip(createFleetBoard(), 'carrier', 5, 8, 0, true), null);
});

test('does not mutate original board', () => {
  const orig = createFleetBoard();
  placeShip(orig, 'carrier', 5, 0, 0, true);
  assert(orig[0].ship === null);
});

// ─── removeShip ───────────────────────────────────────────────────────────────

console.log('\nremoveShip');

test('removes all cells of a ship', () => {
  let b = placeShip(createFleetBoard(), 'carrier', 5, 0, 0, true);
  b = removeShip(b, 'carrier');
  assert(b.every(c => c.ship === null));
});

test('preserves other ships', () => {
  let b = placeShip(createFleetBoard(), 'carrier', 5, 0, 0, true);
  b = placeShip(b, 'destroyer', 2, 0, 1, true);
  b = removeShip(b, 'carrier');
  assertEqual(b[cellIndex(0, 1)].ship, 'destroyer');
  assertEqual(b[cellIndex(0, 0)].ship, null);
});

// ─── resolveIncomingShot ──────────────────────────────────────────────────────

console.log('\nresolveIncomingShot');

test('miss on empty cell', () => {
  const r = resolveIncomingShot(createFleetBoard(), 0, 0);
  assert(r.valid && !r.hit && r.shipId === null);
});

test('hit on ship cell', () => {
  let b = placeShip(createFleetBoard(), 'destroyer', 2, 3, 4, true);
  const r = resolveIncomingShot(b, 3, 4);
  assert(r.valid && r.hit && r.shipId === 'destroyer');
});

test('does not mutate original board', () => {
  let b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  resolveIncomingShot(b, 0, 0);
  assert(!b[0].hit);
});

test('duplicate shot returns invalid', () => {
  const b = createFleetBoard();
  const r1 = resolveIncomingShot(b, 5, 5);
  const r2 = resolveIncomingShot(r1.board, 5, 5);
  assert(r1.valid && !r2.valid);
});

test('sunk flag set when last cell hit', () => {
  let b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  const r1 = resolveIncomingShot(b, 0, 0);
  const r2 = resolveIncomingShot(r1.board, 1, 0);
  assert(!r1.sunk && r2.sunk);
});

// ─── isShipSunk ───────────────────────────────────────────────────────────────

console.log('\nisShipSunk');

test('not sunk with no hits', () => {
  const b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  assert(!isShipSunk(b, 'destroyer'));
});

test('not sunk with partial hits', () => {
  let b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  b = resolveIncomingShot(b, 0, 0).board;
  assert(!isShipSunk(b, 'destroyer'));
});

test('sunk when all cells hit', () => {
  let b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  b = resolveIncomingShot(b, 0, 0).board;
  b = resolveIncomingShot(b, 1, 0).board;
  assert(isShipSunk(b, 'destroyer'));
});

// ─── isFleetDestroyed ─────────────────────────────────────────────────────────

console.log('\nisFleetDestroyed');

test('not destroyed with ships afloat', () => {
  const b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  assert(!isFleetDestroyed(b, [{ id: 'destroyer' }]));
});

test('destroyed when all ships sunk', () => {
  let b = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  b = resolveIncomingShot(b, 0, 0).board;
  b = resolveIncomingShot(b, 1, 0).board;
  assert(isFleetDestroyed(b, [{ id: 'destroyer' }]));
});

// ─── recordShotResult ─────────────────────────────────────────────────────────

console.log('\nrecordShotResult');

test('records a miss', () => {
  const t = recordShotResult(createTargetBoard(), 3, 4, false, false, null);
  assertEqual(t[cellIndex(3, 4)]?.result, 'miss');
});

test('records a hit', () => {
  const t = recordShotResult(createTargetBoard(), 3, 4, true, false, 'carrier');
  assertEqual(t[cellIndex(3, 4)]?.result, 'hit');
  assertEqual(t[cellIndex(3, 4)]?.shipId, 'carrier');
});

test('sunk updates all prior hits on that ship', () => {
  let t = createTargetBoard();
  t = recordShotResult(t, 0, 0, true, false, 'carrier');
  t = recordShotResult(t, 1, 0, true, false, 'carrier');
  t = recordShotResult(t, 2, 0, true, true,  'carrier');
  assertEqual(t[cellIndex(0, 0)]?.result, 'sunk');
  assertEqual(t[cellIndex(1, 0)]?.result, 'sunk');
  assertEqual(t[cellIndex(2, 0)]?.result, 'sunk');
});

test('sunk does not affect other ships', () => {
  let t = createTargetBoard();
  t = recordShotResult(t, 0, 0, true, false, 'destroyer');
  t = recordShotResult(t, 5, 5, true, true,  'carrier');
  assertEqual(t[cellIndex(0, 0)]?.result, 'hit');
  assertEqual(t[cellIndex(0, 0)]?.shipId, 'destroyer');
});

// ─── isCellShot ───────────────────────────────────────────────────────────────

console.log('\nisCellShot');

test('unshot cell returns false', () => assert(!isCellShot(createTargetBoard(), 5, 5)));
test('shot cell returns true', () => {
  const t = recordShotResult(createTargetBoard(), 5, 5, false, false, null);
  assert(isCellShot(t, 5, 5));
});

// ─── FLEET_DEFS ───────────────────────────────────────────────────────────────

console.log('\nFLEET_DEFS');

test('has 5 ships',              () => assertEqual(FLEET_DEFS.length, 5));
test('lengths sum to 17',        () => assertEqual(FLEET_DEFS.reduce((s, d) => s + d.length, 0), 17));
test('carrier has length 5',     () => assertEqual(FLEET_DEFS.find(d => d.id === 'carrier')?.length, 5));
test('destroyer has length 2',   () => assertEqual(FLEET_DEFS.find(d => d.id === 'destroyer')?.length, 2));
test('no ship named Silent But Deadly', () => assert(!FLEET_DEFS.some(d => d.name === 'Silent But Deadly')));

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
