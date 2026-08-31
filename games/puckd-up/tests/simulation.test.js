import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatch } from '../scripts/core/match.js';
import { createFixedStep } from '../scripts/core/fixed-step.js';
import { createSimulation } from '../scripts/physics/simulation.js';
// A motion-only world exercises orchestration without importing a browser CDN.
// Collision equations are covered separately; this does not mock their results.
function rig() {
    const vec = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x, y, z) {
            Object.assign(this, { x, y, z });
        } });
    function body(z = 0) {
        const listeners = new Map();
        return { position: vec(0, .2, z), velocity: vec(), angularVelocity: vec(), quaternion: { set() {
                } },
            addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
            collide: event => listeners.get('collide')?.(event) };
    }
    const puckBody = body(), player = { body: body(5.8), target: vec(0, .25, 5.8) }, cpu = { body: body(-5.8), target: vec(0, .25, -5.8) };
    const world = { step(dt) {
            for (const b of [puckBody, player.body, cpu.body]) {
                b.position.x += b.velocity.x * dt;
                b.position.z += b.velocity.z * dt;
            }
        } };
    return { world, puckBody, player, cpu };
}
function fixture() {
    const bodies = rig(), events = [];
    let simulation;
    const match = createMatch({ emit: event => {
            events.push(event);
            simulation?.handle(event);
        } });
    simulation = createSimulation(null, match, { bodies, random: () => .5, emit: event => events.push(event) });
    const input = { keys: new Set(), target: null, dx: 0, dz: 0 };
    const tick = dt => {
        match.tick(dt);
        simulation.tick(dt, input);
    };
    match.start();
    return { bodies, events, match, simulation, input, tick };
}
test('successive safety-envelope bounces emit a sound event every time', () => {
    const { bodies, events, tick } = fixture();
    tick(.65);
    for (let i = 0; i < 6; i++) {
        const sign = i % 2 ? 1 : -1;
        bodies.puckBody.position.set(sign * 4.54, .2, 0);
        bodies.puckBody.velocity.set(sign * 29, 0, 0);
        tick(1 / 240);
    }
    assert.equal(events.filter(e => e.type === 'wall-hit').length, 6);
});
test('native wall contact and containment do not report a reflected hit twice', () => {
    const { bodies, events, tick } = fixture();
    tick(.65);
    bodies.puckBody.velocity.set(10, 0, 0);
    bodies.puckBody.collide({ body: {}, contact: { getImpactVelocityAlongNormal: () => 10 } });
    bodies.puckBody.position.set(4.6, .2, 0);
    bodies.puckBody.velocity.set(-10, 0, 0);
    tick(1 / 240);
    assert.equal(events.filter(e => e.type === 'wall-hit').length, 1);
});
test('scoring freezes the puck and pausing freezes the pending next serve', () => {
    const { bodies, match, simulation, tick } = fixture();
    tick(.65);
    bodies.puckBody.position.set(0, .2, -8.05);
    bodies.puckBody.velocity.set(0, 0, -29);
    tick(1 / 240);
    assert.equal(match.state.playerScore, 1);
    assert.equal(bodies.puckBody.position.z, -8.42);
    assert.equal(bodies.puckBody.velocity.z, 0);
    match.pause();
    tick(4);
    assert.equal(match.state.phase, 'goal');
    match.resume();
    tick(1.05);
    assert.equal(match.state.phase, 'faceoff');
    tick(.65);
    assert.equal(bodies.puckBody.velocity.z, 3.6);
    simulation.dispose();
    assert.equal(bodies.puckBody.velocity.z, 0);
});
test('paddle motion and CPU sampling use the same fixed ticks at every refresh rate', () => {
    const outcomes = [];
    for (const rate of [30, 60, 120, 144]) {
        const { bodies, input, tick } = fixture();
        tick(.65);
        input.keys.add('d');
        const clock = createFixedStep(tick);
        for (let i = 0; i < rate; i++)
            clock.advance(1 / rate);
        outcomes.push([bodies.player.body.position.x, bodies.cpu.body.position.x]);
    }
    for (const outcome of outcomes)
        assert.deepEqual(outcome, outcomes[0]);
    assert.ok(outcomes[0][0] > 0 && outcomes[0][0] <= 4.23);
});
