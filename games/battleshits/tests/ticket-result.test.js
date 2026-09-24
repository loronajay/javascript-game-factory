// ticket-result.test.js — the result Battleshits files for ticket settlement
// Run: node tests/ticket-result.test.js  (from games/battleshits/)

import { buildTicketResult } from '../scripts/ticket-result.js';

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

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

const stats = { shots: 40, hits: 17, shipsSunk: 5, shipsLost: 2 };
const base = { result: 'win', isSoloMode: true, botDifficulty: 'hard', stats, resultId: 'bs-abc-12345678', durationMs: 241_500.7 };

console.log('ticket-result');

test('a solo battle reports cpu mode with its difficulty', () => {
  const payload = buildTicketResult(base);
  assert(payload.mode === 'cpu');
  assert(payload.difficulty === 'hard');
  assert(payload.outcome === 'win');
  assert(payload.shots === 40 && payload.hits === 17 && payload.shipsSunk === 5 && payload.shipsLost === 2);
  assert(payload.durationMs === 241_500, `durationMs ${payload.durationMs}`);
  assert(payload.resultId === 'bs-abc-12345678');
});

test('an online battle reports online mode and no difficulty', () => {
  const payload = buildTicketResult({ ...base, isSoloMode: false, botDifficulty: null, result: 'loss' });
  assert(payload.mode === 'online');
  assert(!('difficulty' in payload));
  assert(payload.outcome === 'loss');
});

test('a forfeit win is not reported', () => {
  assert(buildTicketResult({ ...base, isSoloMode: false, result: 'forfeit_win' }) === null);
});

test('nothing is reported without an id or a known difficulty', () => {
  assert(buildTicketResult({ ...base, resultId: null }) === null);
  assert(buildTicketResult({ ...base, botDifficulty: null }) === null);
});

test('the payload never carries an amount', () => {
  const payload = buildTicketResult(base);
  for (const key of ['tickets', 'reward', 'amount']) assert(!(key in payload), `payload has ${key}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
