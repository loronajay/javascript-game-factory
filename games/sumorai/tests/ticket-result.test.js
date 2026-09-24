// The result Sumorai files for ticket settlement.
// Run: node tests/ticket-result.test.js  (from games/sumorai/)

import assert from 'node:assert/strict';
import { buildTicketResult, ticketSideFor } from '../scripts/ticket-result.js';

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

const gameState = (p1Wins, p2Wins, roundNum, roundTarget = 3) => ({
  roundTarget, roundNum, p1: { wins: p1Wins }, p2: { wins: p2Wins },
});
const cpu = (side = 'p2', difficulty = 'hard') => ({ enabled: true, side, difficulty });

console.log('ticket-result');

test('the player is whichever side the CPU is not', () => {
  assert.equal(ticketSideFor({ isOnline: false, botConfig: cpu('p2') }), 'p1');
  assert.equal(ticketSideFor({ isOnline: false, botConfig: cpu('p1') }), 'p2');
  assert.equal(ticketSideFor({ isOnline: true, botConfig: cpu('p2'), onlineSide: 'p2' }), 'p2');
});

test('local 2P is never reported', () => {
  const local = { enabled: false, side: 'p2', difficulty: 'hard' };
  assert.equal(ticketSideFor({ isOnline: false, botConfig: local }), null);
  assert.equal(buildTicketResult({ isOnline: false, botConfig: local, gameState: gameState(3, 1, 4), winner: 'p1', resultId: 'sumorai-x-12345678', durationMs: 60_000 }), null);
});

test('a CPU match reports the difficulty and the player-side score', () => {
  const payload = buildTicketResult({
    isOnline: false, botConfig: cpu('p1', 'medium'), gameState: gameState(1, 2, 4, 2),
    winner: 'p2', resultId: 'sumorai-x-12345678', durationMs: 75_000.9,
  });
  assert.deepEqual(payload, {
    resultId: 'sumorai-x-12345678', mode: 'cpu', difficulty: 'medium', outcome: 'win',
    roundTarget: 2, myWins: 2, opponentWins: 1, rounds: 4, durationMs: 75_000,
  });
});

test('an online match reports ranked and the outcome from its own side', () => {
  const payload = buildTicketResult({
    isOnline: true, botConfig: cpu(), onlineSide: 'p1', onlineIsRanked: true,
    gameState: gameState(2, 3, 5), winner: 'p2', resultId: 'sumorai-y-12345678', durationMs: 180_000,
  });
  assert.equal(payload.mode, 'online');
  assert.equal(payload.ranked, true);
  assert.equal(payload.outcome, 'loss');
  assert.equal(payload.myWins, 2);
  assert.equal(payload.opponentWins, 3);
  assert.equal('difficulty' in payload, false);
});

test('nothing is reported without an id or a decided winner', () => {
  const args = { isOnline: false, botConfig: cpu(), gameState: gameState(3, 0, 3), winner: 'p1', resultId: 'sumorai-x-12345678', durationMs: 60_000 };
  assert.equal(buildTicketResult({ ...args, resultId: null }), null);
  assert.equal(buildTicketResult({ ...args, winner: 'draw' }), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
