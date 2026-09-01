import test from 'node:test';
import assert from 'node:assert/strict';
import { CIRCUIT_STOPS, createCircuitProgress, recordCircuitResult, stopStatus } from '../scripts/core/circuit.js';

test('Arcade Circuit is a twelve-match tour across all eight venues and all rivals', () => {
    assert.equal(CIRCUIT_STOPS.length, 12);
    assert.equal(new Set(CIRCUIT_STOPS.map(stop => stop.rivalId)).size, 12);
    assert.equal(new Set(CIRCUIT_STOPS.map(stop => stop.arenaId)).size, 8);
    assert.deepEqual(CIRCUIT_STOPS.map(stop => stop.number), Array.from({ length: 12 }, (_, i) => i + 1));
});

test('wins unlock the next stop while losses preserve a replayable current stop', () => {
    let progress = createCircuitProgress();
    assert.equal(stopStatus(progress, 0), 'current');
    assert.equal(stopStatus(progress, 1), 'locked');
    progress = recordCircuitResult(progress, { rivalId: CIRCUIT_STOPS[0].rivalId, won: false });
    assert.equal(progress.records[CIRCUIT_STOPS[0].rivalId].losses, 1);
    assert.equal(stopStatus(progress, 0), 'current');
    progress = recordCircuitResult(progress, { rivalId: CIRCUIT_STOPS[0].rivalId, won: true });
    assert.equal(stopStatus(progress, 0), 'cleared');
    assert.equal(stopStatus(progress, 1), 'current');
});

test('malformed saved progress is normalized and the final win completes the circuit', () => {
    let progress = createCircuitProgress({ cleared: ['constructor', 'rookie'], records: { rookie: { wins: 2, losses: -8 } } });
    assert.deepEqual(progress.cleared, ['rookie']);
    assert.deepEqual(progress.records.rookie, { wins: 2, losses: 0 });
    for (const stop of CIRCUIT_STOPS)
        progress = recordCircuitResult(progress, { rivalId: stop.rivalId, won: true });
    assert.equal(progress.complete, true);
    assert.equal(stopStatus(progress, 11), 'cleared');
});
