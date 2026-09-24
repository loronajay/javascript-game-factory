import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildTicketResult } from './ticket-result.mjs';

const id = 'cb-abc-12345678';

test('a training battle reports its outcome, rounds and time', () => {
  assert.deepEqual(buildTicketResult({ winner: 'player', isOnline: false, rounds: 9, resultId: id, durationMs: 240_000.4 }), {
    resultId: id, mode: 'training', outcome: 'win', rounds: 9, durationMs: 240_000,
  });
  assert.equal(buildTicketResult({ winner: 'opponent', isOnline: false, rounds: 9, resultId: id, durationMs: 1 }).outcome, 'loss');
  assert.equal(buildTicketResult({ winner: 'draw', isOnline: false, rounds: 9, resultId: id, durationMs: 1 }).outcome, 'draw');
});

test('an online battle is reported; a disconnect win is not', () => {
  assert.equal(buildTicketResult({ winner: 'player', isOnline: true, rounds: 6, resultId: id, durationMs: 1 }).mode, 'online');
  assert.equal(buildTicketResult({ winner: 'player', reason: 'disconnect', isOnline: true, rounds: 3, resultId: id, durationMs: 1 }), null);
});

test('nothing is reported without an id or a known winner', () => {
  assert.equal(buildTicketResult({ winner: 'player', isOnline: false, rounds: 3, resultId: null, durationMs: 1 }), null);
  assert.equal(buildTicketResult({ winner: 'nobody', isOnline: false, rounds: 3, resultId: id, durationMs: 1 }), null);
});

test('the battle start and end hooks are wired, and the page loads the platform config', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(html, /js\/platform-config\.mjs/);
  assert.match(html, /window\.__onBattleStart\s*=/);
  assert.match(html, /createGameResultReporter/);
  const state = readFileSync(new URL('./state.js', import.meta.url), 'utf8');
  assert.match(state, /__onBattleStart/);
  const screen = readFileSync(new URL('./screen-battle.js', import.meta.url), 'utf8');
  assert.match(screen, /__publishBattleResult\(winner, reason, \{/);
  assert.doesNotMatch(html, /window\.state/, 'state is a lexical global, never window.state');
});
