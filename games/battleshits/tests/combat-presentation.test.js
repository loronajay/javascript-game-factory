import { createFleetBoard, cellIndex } from '../scripts/board.js';
import { SHOT_ANIMATION_MS } from '../scripts/presentation.js';

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

function assertDeepEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(message || `Expected ${expectedJson}, got ${actualJson}`);
  }
}

const originalDocument = globalThis.document;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

globalThis.document = {
  getElementById() { return null; },
  querySelector() { return null; },
};

const queuedTimers = [];
globalThis.setTimeout = (fn, delay) => {
  const timer = { fn, delay, cleared: false };
  queuedTimers.push(timer);
  return timer;
};
globalThis.clearTimeout = (timer) => {
  if (timer) timer.cleared = true;
};

const { clearBattleTimers, handleIncomingShot } = await import('../scripts/battle.js');

function makeLiveFleet() {
  const board = createFleetBoard();
  const shipIds = ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'];
  shipIds.forEach((ship, col) => {
    board[cellIndex(col, 0)] = { ship, hit: false };
  });
  return board;
}

function makeBattleState() {
  return {
    phase: 'battle',
    turn: 'theirs',
    myFleet: makeLiveFleet(),
    myTarget: new Array(100).fill(null),
    incomingShot: null,
    pendingShot: null,
    activeEmotes: { mine: null, theirs: null },
  };
}

console.log('\ncombat presentation');

test('incoming opponent shots wait for the impact animation before resolving', () => {
  clearBattleTimers();
  queuedTimers.length = 0;
  const gs = makeBattleState();
  const sentResults = [];
  const net = {
    sendShotResult(col, row, hit, sunk, shipId, fleetDestroyed) {
      sentResults.push({ col, row, hit, sunk, shipId, fleetDestroyed });
    },
  };

  handleIncomingShot(gs, net, 0, 0, { clearAll() {} });

  assertDeepEqual(gs.incomingShot, { col: 0, row: 0 }, 'Expected incoming shot marker to be visible immediately.');
  assertEqual(gs.myFleet[cellIndex(0, 0)].hit, false, 'Expected board damage to wait until impact.');
  assertEqual(sentResults.length, 0, 'Expected shot_result to wait until impact.');
  assertEqual(queuedTimers.length, 1, 'Expected one reveal timer.');
  assertEqual(queuedTimers[0].delay, SHOT_ANIMATION_MS, 'Expected reveal timer to match shot animation duration.');

  queuedTimers[0].fn();

  assertEqual(gs.incomingShot, null, 'Expected incoming shot marker to clear after impact.');
  assertEqual(gs.myFleet[cellIndex(0, 0)].hit, true, 'Expected board damage after impact.');
  assertDeepEqual(sentResults, [{
    col: 0,
    row: 0,
    hit: true,
    sunk: true,
    shipId: 'carrier',
    fleetDestroyed: false,
  }]);
  assertEqual(gs.turn, 'mine', 'Expected turn to return after the incoming shot resolves.');
});

test('invalid repeat incoming shots do not start an animation delay', () => {
  clearBattleTimers();
  queuedTimers.length = 0;
  const gs = makeBattleState();
  gs.myFleet[cellIndex(0, 0)].hit = true;
  const net = { sendShotResult() { throw new Error('Should not send invalid repeat shot result.'); } };

  handleIncomingShot(gs, net, 0, 0, { clearAll() {} });

  assertEqual(gs.incomingShot, null);
  assertEqual(queuedTimers.length, 0);
});

clearBattleTimers();
globalThis.document = originalDocument;
globalThis.setTimeout = originalSetTimeout;
globalThis.clearTimeout = originalClearTimeout;

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
