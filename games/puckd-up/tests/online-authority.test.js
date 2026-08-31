import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthority } from '../server/authority.js';
import { createMatch } from '../scripts/core/match.js';
import { toSeatSnapshot, validSnapshot } from '../scripts/online/protocol.js';

function bodies() {
    const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x, y, z) { Object.assign(this, { x, y, z }); } });
    const body = z => ({ position: vec(0, .2, z), velocity: vec(), angularVelocity: vec(), quaternion: { set() {} }, addEventListener() {}, removeEventListener() {} });
    const puckBody = body(0), player = { body: body(5.8), target: vec(0, .25, 5.8) }, cpu = { body: body(-5.8), target: vec(0, .25, -5.8) };
    return { puckBody, player, cpu, world: { step(dt) {
        for (const b of [puckBody, player.body, cpu.body]) { b.position.x += b.velocity.x * dt; b.position.z += b.velocity.z * dt; }
    } } };
}
const make = () => createAuthority({ matchId: 'match-1', seats: ['a', 'b'], bodies: bodies() });
const advance = (engine, n) => { for (let i = 0; i < n; i++) engine.tick(1 / 240); };

test('authority accepts only current seated, sequenced, finite, bounded intent', () => {
    const engine = make(); advance(engine, 160);
    const input = { matchId: 'match-1', seq: 1, x: 900, z: -900 };
    assert.equal(engine.input('stranger', input), false);
    assert.equal(engine.input('a', { ...input, matchId: 'old' }), false);
    assert.equal(engine.input('a', { ...input, x: NaN }), false);
    assert.equal(engine.input('a', input), true);
    assert.equal(engine.input('a', input), false);
    assert.equal(engine.input('a', { ...input, seq: 2 }), false, 'rate limit within a server tick');
    advance(engine, 240);
    const snapshot = engine.snapshot();
    assert.ok(snapshot.paddles[0].x <= 4.23);
    assert.ok(snapshot.paddles[0].z >= .72);
    assert.ok(Math.hypot(snapshot.paddles[0].vx, snapshot.paddles[0].vz) <= 38);
    assert.deepEqual(snapshot.scores, [0, 0]);
    engine.dispose();
});

test('both human seats have mirrored movement, equal strike energy and no CPU auto-serve', () => {
    const engine = make(); advance(engine, 160);
    for (let i = 0; i < 120; i++) {
        for (const id of ['a', 'b']) engine.input(id, { matchId: 'match-1', seq: i + 1, x: 2, z: 4 });
        advance(engine, 2);
    }
    const snapshot = engine.snapshot();
    assert.equal(snapshot.paddles[0].x, -snapshot.paddles[1].x);
    assert.equal(snapshot.paddles[0].z, -snapshot.paddles[1].z);
    assert.equal(snapshot.puck.vz, 0);
    engine.dispose();
});

test('server scores both goal directions, completes once and rejects post-result input', () => {
    const engine = make(); advance(engine, 160);
    function goal(seat) {
        engine.simulation.bodies.puckBody.position.set(0, .2, seat === 0 ? -8.05 : 8.05);
        engine.simulation.bodies.puckBody.velocity.set(0, 0, seat === 0 ? -29 : 29);
        advance(engine, 1);
    }
    goal(1); assert.deepEqual(engine.snapshot().scores, [0, 1]);
    advance(engine, 410);
    for (let i = 0; i < 7; i++) { goal(0); if (i < 6) advance(engine, 410); }
    assert.deepEqual(engine.snapshot().scores, [7, 1]);
    assert.equal(engine.snapshot().winner, 0);
    assert.equal(engine.snapshot().phase, 'finished');
    assert.equal(engine.input('a', { matchId: 'match-1', seq: 100, x: 0, z: 3 }), false);
    advance(engine, 500); assert.deepEqual(engine.snapshot().scores, [7, 1]);
    engine.dispose();
});

test('disconnect grace freezes play, reconnect resumes, expiry awards one forfeit', () => {
    const engine = make(); advance(engine, 160);
    engine.disconnect('a', 1000);
    assert.deepEqual(engine.snapshot().disconnected, [true, false]);
    advance(engine, 240); assert.equal(engine.snapshot().phase, 'live');
    assert.equal(engine.reconnect('a', 2000), true);
    assert.deepEqual(engine.snapshot().disconnected, [false, false]);
    engine.disconnect('b', 3000); engine.expire(13001);
    assert.equal(engine.snapshot().winner, 0);
    assert.equal(engine.snapshot().reason, 'forfeit');
    assert.equal(engine.reconnect('b', 13002), false);
    engine.disconnect('a', 14000, true);
    assert.equal(engine.snapshot().winner, 0);
    engine.dispose();
});

test('snapshots validate and mirror seat 1 scores, bodies, serve and winner together', () => {
    const engine = make(), snapshot = engine.snapshot();
    assert.equal(validSnapshot(snapshot), true);
    assert.equal(validSnapshot({ ...snapshot, puck: { ...snapshot.puck, x: Infinity } }), false);
    const mirrored = toSeatSnapshot({ ...snapshot, scores: [2, 4], winner: 1 }, 1);
    assert.deepEqual(mirrored.scores, [4, 2]);
    assert.equal(mirrored.paddles[0].z, 5.8);
    assert.equal(mirrored.puck.z, -snapshot.puck.z);
    assert.equal(mirrored.servingPlayer, false);
    assert.equal(mirrored.winner, 0);
    engine.dispose();
});

test('online match cannot score, restart or pause locally and returns to CPU safely', () => {
    const match = createMatch(), engine = make();
    match.beginOnline({ matchId: 'match-1', opponentName: 'Bob' });
    match.applyOnline(toSeatSnapshot(engine.snapshot(), 0));
    const before = { ...match.state };
    match.tick(50); match.pause(); match.start(); match.score(true);
    assert.deepEqual(match.state, before);
    match.menu(); match.setup(); match.start();
    assert.equal(match.state.mode, 'cpu');
    assert.equal(match.state.screen, 'playing');
    engine.dispose();
});
