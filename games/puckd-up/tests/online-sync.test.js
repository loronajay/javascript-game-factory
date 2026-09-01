import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineSync } from '../scripts/online/sync.js';
import { createMatch } from '../scripts/core/match.js';
const body = (x, z) => ({ x, z, vx: 0, vz: 0 });
const snapshot = patch => ({ protocolVersion: 3, matchId: 'm1', tick: 0, seats: ['a', 'b'], colors: ['#c24b86', '#38bdf8'], phase: 'live', remaining: 0,
    scores: [0, 0], serving: 0, winner: null, reason: '', ack: [0, 0], disconnected: [false, false],
    puck: body(0, 1.15), paddles: [body(0, 5.8), body(0, -5.8)], events: [], ...patch });
function fixture(seat = 0) {
    const listeners = new Set(), sent = [], events = [];
    let state = { status: 'idle', clientId: seat ? 'b' : 'a', lobby: { players: [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }] } };
    const client = { getSnapshot: () => state, sendInput: i => sent.push(i), subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
    const match = createMatch();
    const sync = createOnlineSync({ client, match, emit: e => events.push(e) });
    function deliver(s, status = 'playing') { state = { ...state, status, match: s }; for (const fn of listeners) fn(state); }
    return { sync, match, sent, events, deliver };
}
const input = { dx: 0, dz: 0, target: null, keys: new Set(['d']) };
test('both seat views predict their own paddle at fixed ticks and cap sends at 60Hz', () => {
    for (const seat of [0, 1]) {
        const f = fixture(seat); f.deliver(snapshot());
        for (let i = 0; i < 240; i++) f.sync.tick(1 / 240, input);
        assert.equal(f.match.state.opponentName, seat ? 'Alice' : 'Bob');
        assert.deepEqual(f.match.state.playerColors, seat ? ['#38bdf8', '#c24b86'] : ['#c24b86', '#38bdf8']);
        assert.equal(f.sent.length, 60);
        assert.ok(f.sync.bodies.player.body.position.x > 4);
        assert.equal(f.sync.bodies.cpu.body.position.z, -5.8);
        assert.ok(f.sent.every(i => i.x <= 4.2 && i.z >= .8));
        f.sync.dispose();
    }
});
test('snapshots reconcile acknowledged intent, interpolate remote bodies, dedupe events and reset rematch', () => {
    const f = fixture(); f.deliver(snapshot());
    for (let i = 0; i < 8; i++) f.sync.tick(1 / 240, input);
    f.deliver(snapshot({ tick: 8, ack: [2, 0], puck: body(2, 1), events: [{ id: 1, type: 'wall-hit' }] }));
    f.deliver(snapshot({ tick: 16, ack: [2, 0], puck: body(4, 1), events: [{ id: 1, type: 'wall-hit' }] }));
    assert.equal(f.events.filter(e => e.type === 'wall-hit').length, 1);
    for (let i = 0; i < 6; i++) f.sync.tick(1 / 240, { ...input, keys: new Set() });
    assert.ok(f.sync.bodies.puckBody.position.x >= 0 && f.sync.bodies.puckBody.position.x <= 4);
    f.deliver(snapshot({ matchId: 'm2' }));
    assert.equal(f.match.state.matchId, 'm2');
    assert.equal(f.sync.bodies.player.body.position.x, 0);
    f.deliver(null, 'idle');
    assert.equal(f.match.state.screen, 'online');
    assert.equal(f.match.state.mode, 'cpu');
    f.sync.dispose();
});
test('disconnect presentation freezes input without locally deciding the result', () => {
    const f = fixture(); f.deliver(snapshot(), 'reconnecting');
    for (let i = 0; i < 240; i++) f.sync.tick(1 / 240, input);
    assert.equal(f.sent.length, 0);
    assert.equal(f.match.state.disconnected, true);
    assert.equal(f.match.state.screen, 'playing');
    f.sync.dispose();
});
