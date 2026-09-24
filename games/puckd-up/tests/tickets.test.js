import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildTicketResult, finishedMatchFacts } from '../scripts/core/ticket-result.js';
import { createTicketReporter } from '../scripts/platform/ticket-reporter.js';
import { createMatch } from '../scripts/core/match.js';

const id = 'puckdup-abc-12345678';

test('a CPU or circuit match reports its rival, score and outcome', () => {
    assert.deepEqual(buildTicketResult({ mode: 'cpu', rivalId: 'viper', won: true, myGoals: 7, opponentGoals: 3, resultId: id, durationMs: 190_000.7 }), {
        resultId: id, mode: 'cpu', rivalId: 'viper', outcome: 'win', myGoals: 7, opponentGoals: 3, durationMs: 190_000,
    });
    const circuit = buildTicketResult({ mode: 'campaign', rivalId: 'ace', won: false, myGoals: 2, opponentGoals: 7, resultId: id, durationMs: 90_000 });
    assert.equal(circuit.mode, 'circuit');
    assert.equal(circuit.outcome, 'loss');
});

test('online carries no rival, and a forfeit is never reported', () => {
    const online = buildTicketResult({ mode: 'online', won: true, myGoals: 7, opponentGoals: 5, resultId: id, durationMs: 200_000 });
    assert.equal(online.mode, 'online');
    assert.equal('rivalId' in online, false);
    assert.equal(buildTicketResult({ mode: 'online', won: true, myGoals: 2, opponentGoals: 1, reason: 'forfeit', resultId: id, durationMs: 60_000 }), null);
});

test('nothing is reported without an id, a known mode, or a CPU rival', () => {
    assert.equal(buildTicketResult({ mode: 'cpu', rivalId: 'viper', won: true, myGoals: 7, opponentGoals: 0, resultId: null, durationMs: 1 }), null);
    assert.equal(buildTicketResult({ mode: 'practice', rivalId: 'viper', won: true, myGoals: 7, opponentGoals: 0, resultId: id, durationMs: 1 }), null);
    assert.equal(buildTicketResult({ mode: 'cpu', won: true, myGoals: 7, opponentGoals: 0, resultId: id, durationMs: 1 }), null);
});

test('the real match end is read into facts: the final score, not a goal behind', () => {
    const events = [];
    const match = createMatch({ config: { rivalId: 'banks' }, emit: event => events.push(event) });
    match.setup();
    match.start();
    for (let goal = 0; goal < 7; goal++) {
        match.state.phase = 'live';
        match.score(goal < 7);
    }
    const end = events.find(event => event.type === 'match-end');
    assert.deepEqual(finishedMatchFacts(end, match.state), { mode: 'cpu', rivalId: 'banks', won: true, myGoals: 7, opponentGoals: 0 });
});

test('an online match ends when the screen turns to the result', () => {
    const state = { mode: 'online', winner: 1, reason: '', playerScore: 4, cpuScore: 7 };
    assert.deepEqual(finishedMatchFacts({ type: 'screen', screen: 'result' }, state), { mode: 'online', won: false, myGoals: 4, opponentGoals: 7, reason: '' });
    assert.equal(finishedMatchFacts({ type: 'screen', screen: 'result' }, { ...state, mode: 'cpu' }), null);
    assert.equal(finishedMatchFacts({ type: 'goal' }, state), null);
});

test('the reporter files one match once, with the time it took', async () => {
    const filed = [];
    let clock = 0;
    const tickets = createTicketReporter({
        load: async () => ({
            createGameResultReporter: () => ({ report: (slug, payload) => filed.push({ slug, payload }) }),
            createGameResultId: prefix => `${prefix}-fixed-00000001`,
        }),
        now: () => clock,
    });
    const state = { mode: 'cpu', playerScore: 7, cpuScore: 2 };
    tickets.handle({ type: 'match-start' }, state);
    await new Promise(resolve => setTimeout(resolve, 0));
    clock = 150_000;
    const end = { type: 'match-end', mode: 'cpu', winner: 'player', rivalId: 'brick' };
    tickets.handle(end, state);
    tickets.handle(end, state);
    assert.equal(filed.length, 1);
    assert.equal(filed[0].slug, 'puckd-up');
    assert.deepEqual(filed[0].payload, { resultId: 'puckdup-fixed-00000001', mode: 'cpu', rivalId: 'brick', outcome: 'win', myGoals: 7, opponentGoals: 2, durationMs: 150_000 });
});

test('standalone, a missing platform module files nothing and throws nothing', async () => {
    const tickets = createTicketReporter({ load: () => Promise.reject(new Error('no platform')) });
    tickets.handle({ type: 'match-start' }, {});
    await new Promise(resolve => setTimeout(resolve, 0));
    tickets.handle({ type: 'match-end', mode: 'cpu', winner: 'cpu', rivalId: 'ace' }, { playerScore: 0, cpuScore: 7 });
});

test('the page loads the platform config, or nothing is filed off localhost', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /js\/platform-config\.mjs/);
});
