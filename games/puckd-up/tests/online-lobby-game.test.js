import test from 'node:test';
import assert from 'node:assert/strict';
import { createLobbyGame } from '../server/lobby-game.js';

function fixture() {
    let starts = 0, clock = 0;
    const messages = [], intervals = new Set();
    const game = createLobbyGame({ broadcast: (code, data) => messages.push(data), update: () => {}, now: () => clock,
        schedule: fn => { intervals.add(fn); return fn; }, cancel: fn => intervals.delete(fn),
        makeAuthority: ({ matchId, seats, colors }) => { starts++; return { tick() {}, expire() {}, dispose() {}, input: () => false,
            snapshot: () => ({ matchId, seats, colors, phase: 'faceoff', tick: 0 }), disconnect() {}, reconnect: () => true }; },
    });
    const lobby = { roomCode: 'ABCDE', members: new Set(['a', 'b']), settings: { protocolVersion: 3 }, status: 'open' };
    const send = (id, type, value) => game.handleMessage(lobby, id, type, JSON.stringify(value));
    return { game, lobby, messages, intervals, send, starts: () => starts, pump: () => { clock += 40; for (const fn of intervals) fn(); } };
}
test('both seats must opt into the supported protocol; guest can ready without host permission', () => {
    const f = fixture();
    f.send('a', 'puck_ready', { protocolVersion: 1, ready: true }); assert.equal(f.starts(), 0);
    f.send('outsider', 'puck_ready', { protocolVersion: 3, ready: true, playerColor: '#ffffff' }); assert.equal(f.starts(), 0);
    f.send('b', 'puck_ready', { protocolVersion: 3, ready: true, playerColor: '#38bdf8' }); assert.equal(f.starts(), 0);
    f.send('a', 'puck_ready', { protocolVersion: 3, ready: true, playerColor: '#c24b86' }); assert.equal(f.starts(), 1);
    f.send('a', 'puck_ready', { protocolVersion: 3, ready: true, playerColor: '#c24b86' }); assert.equal(f.starts(), 1);
    assert.equal(f.lobby.status, 'started');
    assert.equal(f.messages[0].event, 'lobby_started');
    assert.equal(f.messages[0].authorityMode, 'server');
    assert.deepEqual(f.messages[0].matchState.colors, ['#c24b86', '#38bdf8']);
    f.game.clearTimers(f.lobby); assert.equal(f.intervals.size, 0);
});
test('unrecognized gameplay is never relayed, and unsupported settings cannot start', () => {
    const f = fixture();
    assert.equal(f.send('a', 'match_result', { winner: 'a' }).handled, true);
    assert.ok(f.send('a', 'match_result', {}).error);
    f.lobby.settings.protocolVersion = 1;
    for (const id of ['a', 'b']) f.send(id, 'puck_ready', { protocolVersion: 3, ready: true, playerColor: '#c24b86' });
    assert.equal(f.starts(), 0);
});
