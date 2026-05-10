// bot.test.js — pure bot logic tests
// Run: node tests/bot.test.js  (from games/battleshits/)

import {
  BOARD_SIZE, FLEET_DEFS, cellIndex,
  createTargetBoard, isFleetDestroyed, isValidPlacement, resolveIncomingShot,
} from '../scripts/board.js';
import {
  createBotFleet, createBotState, botPickShot, updateBotState,
} from '../scripts/bot.js';

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

// ─── createBotFleet ───────────────────────────────────────────────────────────

console.log('\ncreateBotFleet');

test('places all fleet ships', () => {
  const board = createBotFleet();
  for (const def of FLEET_DEFS) {
    const cells = board.filter(c => c.ship === def.id);
    assertEqual(cells.length, def.length, `Ship ${def.id}: expected ${def.length} cells, got ${cells.length}`);
  }
});

test('ships do not overlap', () => {
  const board = createBotFleet();
  // Each cell has at most one ship
  for (let i = 0; i < board.length; i++) {
    const ship = board[i].ship;
    if (ship !== null) {
      const count = FLEET_DEFS.filter(d => d.id === ship).length;
      assertEqual(count, 1, `Cell ${i} has unknown shipId ${ship}`);
    }
  }
  // Total occupied cells = sum of ship lengths
  const occupied = board.filter(c => c.ship !== null).length;
  const expected = FLEET_DEFS.reduce((s, d) => s + d.length, 0);
  assertEqual(occupied, expected, `Expected ${expected} occupied cells, got ${occupied}`);
});

test('ships stay within board bounds', () => {
  const board = createBotFleet();
  // Every occupied cell index is in [0, 99]
  board.forEach((cell, idx) => {
    if (cell.ship !== null) {
      assert(idx >= 0 && idx < BOARD_SIZE * BOARD_SIZE, `Cell index ${idx} out of bounds`);
    }
  });
});

test('creates different fleets on repeated calls (random)', () => {
  // Run 5 times; at least 2 should differ (probability of all identical is astronomically low)
  const serialise = b => b.map(c => c.ship ?? '.').join('');
  const results = new Set();
  for (let i = 0; i < 5; i++) results.add(serialise(createBotFleet()));
  assert(results.size > 1, 'All 5 fleets were identical — likely not random');
});

// ─── Easy bot — never repeats shots ──────────────────────────────────────────

console.log('\nEasy bot');

test('never repeats shots across a full game', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();

  const shotsSeen = new Set();
  // A full 10x10 board has 100 cells; bot should never repeat
  for (let i = 0; i < 100; i++) {
    const { col, row } = botPickShot(botTarget, 'easy', botState);
    const key = `${col},${row}`;
    assert(!shotsSeen.has(key), `Easy bot repeated shot at ${key} on turn ${i + 1}`);
    shotsSeen.add(key);
    // Mark as shot (miss)
    botTarget = [...botTarget];
    botTarget[cellIndex(col, row)] = { result: 'miss', shipId: null };
    updateBotState(botState, col, row, false, false, null);
  }
  assertEqual(shotsSeen.size, 100, `Expected 100 unique shots, got ${shotsSeen.size}`);
});

test('only picks cells inside the board', () => {
  const botState = createBotState();
  const botTarget = createTargetBoard();
  for (let i = 0; i < 50; i++) {
    const { col, row } = botPickShot(botTarget, 'easy', botState);
    assert(col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE,
      `Easy bot picked out-of-bounds cell (${col}, ${row})`);
  }
});

// ─── Medium bot — follows up after hit ───────────────────────────────────────

console.log('\nMedium bot');

test('after a hit, next shot is adjacent to the hit', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();

  // Simulate a hit at (5, 5)
  const hitCol = 5; const hitRow = 5;
  botTarget = [...botTarget];
  botTarget[cellIndex(hitCol, hitRow)] = { result: 'hit', shipId: 'destroyer' };
  updateBotState(botState, hitCol, hitRow, true, false, 'destroyer');

  const { col, row } = botPickShot(botTarget, 'medium', botState);
  const adjacent =
    (col === hitCol - 1 && row === hitRow) ||
    (col === hitCol + 1 && row === hitRow) ||
    (col === hitCol     && row === hitRow - 1) ||
    (col === hitCol     && row === hitRow + 1);
  assert(adjacent, `Medium bot should pick adjacent cell after hit at (${hitCol},${hitRow}), picked (${col},${row})`);
});

test('after two horizontal hits, continues along horizontal axis', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();

  // Hits at (4,3) and (5,3)
  botTarget = [...botTarget];
  botTarget[cellIndex(4, 3)] = { result: 'hit', shipId: 'cruiser' };
  botTarget[cellIndex(5, 3)] = { result: 'hit', shipId: 'cruiser' };
  updateBotState(botState, 4, 3, true, false, 'cruiser');
  updateBotState(botState, 5, 3, true, false, 'cruiser');

  const { col, row } = botPickShot(botTarget, 'medium', botState);
  assertEqual(row, 3, `Expected row 3 after horizontal hits, got row ${row}`);
  assert(col === 3 || col === 6, `Expected col 3 or 6 after horizontal hits at 4,5, got ${col}`);
});

test('after sunk, clears active hits and hunts randomly', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();

  // Simulate hit + sunk
  botTarget = [...botTarget];
  botTarget[cellIndex(2, 2)] = { result: 'sunk', shipId: 'destroyer' };
  updateBotState(botState, 2, 2, true, false, 'destroyer');
  updateBotState(botState, 3, 2, true, true, 'destroyer');

  assertEqual(botState.activeHits.length, 0, 'activeHits should be empty after sunk');

  // Next shot should not be adjacent (it will be random — just verify no crash and in-bounds)
  const { col, row } = botPickShot(botTarget, 'medium', botState);
  assert(col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE, 'Shot out of bounds after sunk');
});

test('never repeats shots in medium mode', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();
  const shotsSeen = new Set();

  for (let i = 0; i < 100; i++) {
    const { col, row } = botPickShot(botTarget, 'medium', botState);
    const key = `${col},${row}`;
    assert(!shotsSeen.has(key), `Medium bot repeated shot at ${key} on turn ${i + 1}`);
    shotsSeen.add(key);
    botTarget = [...botTarget];
    botTarget[cellIndex(col, row)] = { result: 'miss', shipId: null };
    updateBotState(botState, col, row, false, false, null);
  }
});

// ─── Hard bot — checkerboard hunt ────────────────────────────────────────────

console.log('\nHard bot');

test('initial hunt shots follow checkerboard pattern', () => {
  const botState = createBotState();
  const botTarget = createTargetBoard();

  // Shoot 20 times with no hits and verify each is on a (col+row)%2===0 cell
  let target = [...botTarget];
  for (let i = 0; i < 20; i++) {
    const { col, row } = botPickShot(target, 'hard', botState);
    assert((col + row) % 2 === 0, `Hard bot picked non-checkerboard cell (${col},${row}) on turn ${i + 1}`);
    target = [...target];
    target[cellIndex(col, row)] = { result: 'miss', shipId: null };
    updateBotState(botState, col, row, false, false, null);
  }
});

test('never repeats shots in hard mode', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();
  const shotsSeen = new Set();

  for (let i = 0; i < 100; i++) {
    const { col, row } = botPickShot(botTarget, 'hard', botState);
    const key = `${col},${row}`;
    assert(!shotsSeen.has(key), `Hard bot repeated shot at ${key} on turn ${i + 1}`);
    shotsSeen.add(key);
    botTarget = [...botTarget];
    botTarget[cellIndex(col, row)] = { result: 'miss', shipId: null };
    updateBotState(botState, col, row, false, false, null);
  }
});

test('hard bot follows up on hits like medium', () => {
  const botState = createBotState();
  let botTarget = createTargetBoard();

  botTarget = [...botTarget];
  botTarget[cellIndex(3, 4)] = { result: 'hit', shipId: 'submarine' };
  updateBotState(botState, 3, 4, true, false, 'submarine');

  const { col, row } = botPickShot(botTarget, 'hard', botState);
  const adjacent =
    (col === 2 && row === 4) || (col === 4 && row === 4) ||
    (col === 3 && row === 3) || (col === 3 && row === 5);
  assert(adjacent, `Hard bot should pick adjacent cell after hit, picked (${col},${row})`);
});

// ─── updateBotState ───────────────────────────────────────────────────────────

console.log('\nupdateBotState');

test('miss leaves activeHits unchanged', () => {
  const botState = createBotState();
  botState.activeHits.push({ col: 1, row: 1, shipId: 'destroyer' });
  updateBotState(botState, 5, 5, false, false, null);
  assertEqual(botState.activeHits.length, 1, 'Miss should not change activeHits');
});

test('hit adds to activeHits', () => {
  const botState = createBotState();
  updateBotState(botState, 2, 3, true, false, 'cruiser');
  assertEqual(botState.activeHits.length, 1);
  assertEqual(botState.activeHits[0].col, 2);
  assertEqual(botState.activeHits[0].row, 3);
});

test('sunk removes ship from activeHits', () => {
  const botState = createBotState();
  botState.activeHits.push({ col: 1, row: 1, shipId: 'destroyer' });
  botState.activeHits.push({ col: 2, row: 1, shipId: 'destroyer' });
  botState.activeHits.push({ col: 5, row: 5, shipId: 'cruiser' }); // different ship
  updateBotState(botState, 2, 1, true, true, 'destroyer');
  assertEqual(botState.activeHits.length, 1, 'Should only keep hits from other ships');
  assertEqual(botState.activeHits[0].shipId, 'cruiser');
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
