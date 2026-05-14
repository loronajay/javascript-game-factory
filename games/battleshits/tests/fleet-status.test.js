import {
  createFleetBoard,
  createTargetBoard,
  placeShip,
  recordShotResult,
  resolveIncomingShot,
} from '../scripts/board.js';
import {
  buildOwnFleetStatusRows,
  buildOpponentFleetStatusRows,
  getFleetStatusLabel,
} from '../scripts/renderer.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`    ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('\nfleet status');

test('own fleet status marks ships sunk from the local fleet board', () => {
  let board = placeShip(createFleetBoard(), 'destroyer', 2, 0, 0, true);
  board = resolveIncomingShot(board, 0, 0).board;
  board = resolveIncomingShot(board, 1, 0).board;

  const rows = buildOwnFleetStatusRows(board);
  const destroyer = rows.find(row => row.id === 'destroyer');
  const carrier = rows.find(row => row.id === 'carrier');

  assertEqual(destroyer.sunk, true);
  assertEqual(carrier.sunk, false);
});

test('opponent fleet status marks only confirmed sunk ships from the target board', () => {
  let target = createTargetBoard();
  target = recordShotResult(target, 0, 0, true, false, 'carrier');
  target = recordShotResult(target, 5, 5, true, true, 'destroyer');

  const rows = buildOpponentFleetStatusRows(target);
  const destroyer = rows.find(row => row.id === 'destroyer');
  const carrier = rows.find(row => row.id === 'carrier');

  assertEqual(destroyer.sunk, true);
  assertEqual(carrier.sunk, false);
});

test('fleet status labels keep poop and skull markers', () => {
  assertEqual(getFleetStatusLabel({ name: 'Poop Chute', sunk: false }), '💩 Poop Chute');
  assertEqual(getFleetStatusLabel({ name: 'Poop Chute', sunk: true }), '💀 Poop Chute');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
