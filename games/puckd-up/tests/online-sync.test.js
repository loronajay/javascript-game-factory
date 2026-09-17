import test from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION } from '../scripts/online/protocol.js';
import { createOnlineSync } from '../scripts/online/sync.js';
import { createMatch } from '../scripts/core/match.js';
const body = (x, z) => ({ x, z, vx: 0, vz: 0 });
const snapshot = patch => ({ protocolVersion: PROTOCOL_VERSION, matchId: 'm1', tick: 0, seats: ['a', 'b'], colors: ['#c24b86', '#38bdf8'], phase: 'live', remaining: 0,
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
test('the puck is carried ahead of the newest sample by the measured round trip, and freezes on a stall', () => {
    const f = fixture(); f.deliver(snapshot({ puck: { x: 0, z: 0, vx: 0, vz: -10 } }));
    const idle = { dx: 0, dz: 0, target: null, keys: new Set() };
    // Twelve ticks in, acknowledge the first command: a 12-tick (50 ms) round trip.
    for (let i = 0; i < 12; i++) f.sync.tick(1 / 240, idle);
    const sampled = -10 * 12 / 240;
    f.deliver(snapshot({ tick: 12, ack: [1, 0], puck: { x: 0, z: sampled, vx: 0, vz: -10 } }));
    const lead = sampled - f.sync.bodies.puckBody.position.z;
    assert.ok(lead > 10 * 12 / 240 * .9 && lead < 10 * 16 / 240, `puck shown ~one round trip ahead of the sample (${lead.toFixed(3)})`);
    // With no further snapshots the horizon grows only to its cap, then holds.
    for (let i = 0; i < 240; i++) f.sync.tick(1 / 240, idle);
    const frozen = -f.sync.bodies.puckBody.position.z;
    assert.ok(Math.abs(frozen - (-sampled + 10 * 36 / 240)) < .02, `frozen at the horizon (${frozen.toFixed(3)})`);
    f.sync.tick(1 / 240, idle);
    assert.ok(Math.abs(-f.sync.bodies.puckBody.position.z - frozen) < 1e-9, 'held');
    f.sync.dispose();
});
test('a snapshot that disagrees with the prediction slides the puck into place instead of popping it', () => {
    const f = fixture(); f.deliver(snapshot({ puck: { x: 0, z: 0, vx: 0, vz: -10 } }));
    const idle = { dx: 0, dz: 0, target: null, keys: new Set() };
    for (let i = 0; i < 4; i++) f.sync.tick(1 / 240, idle);
    const shown = f.sync.bodies.puckBody.position.x;
    // The server says the puck was struck sideways 1 m to the right.
    f.deliver(snapshot({ tick: 4, puck: { x: 1, z: -10 * 4 / 240, vx: 0, vz: -10 } }));
    assert.ok(Math.abs(f.sync.bodies.puckBody.position.x - shown) < .05, 'no teleport on arrival');
    for (let i = 0; i < 6; i++) f.sync.tick(1 / 240, idle);
    const midway = f.sync.bodies.puckBody.position.x;
    assert.ok(midway > .2 && midway < 1, `converging (${midway.toFixed(3)})`);
    for (let i = 0; i < 60; i++) f.sync.tick(1 / 240, idle);
    assert.ok(Math.abs(f.sync.bodies.puckBody.position.x - 1) < .01, 'settled on the authority');
    // A serve-sized jump is a discontinuity, not a correction: snap.
    f.deliver(snapshot({ tick: 70, puck: { x: 0, z: 1.15, vx: 0, vz: 0 } }));
    assert.equal(f.sync.bodies.puckBody.position.x, 0);
    f.sync.dispose();
});
test('a strike shows on the striker\'s screen before the server confirms it', () => {
    const f = fixture(); f.deliver(snapshot({ puck: body(0, 1.15) }));
    // Sweep the paddle straight through the resting puck.
    for (let i = 0; i < 60; i++) f.sync.tick(1 / 240, { dx: 0, dz: 0, target: { x: 0, z: .8 }, keys: new Set() });
    assert.ok(f.sync.bodies.puckBody.velocity.z < -5, `puck already moving away (${f.sync.bodies.puckBody.velocity.z.toFixed(2)})`);
    assert.ok(f.sync.bodies.puckBody.position.z < 1.15);
    f.sync.dispose();
});
