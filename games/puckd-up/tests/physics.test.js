import test from 'node:test';
import assert from 'node:assert/strict';
import { capPuck, hardContainPuck, goalCrossing, capturePuck, sweptMalletContact } from '../scripts/physics/collisions.js';
const vector = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x, y, z) {
        Object.assign(this, { x, y, z });
    } });
const body = (x = 0, z = 0, vx = 0, vz = 0) => ({ position: vector(x, .2, z), velocity: vector(vx, 0, vz), angularVelocity: vector() });
test('29 m/s cap preserves shot direction', () => {
    const puck = body(0, 0, 30, 40);
    capPuck(puck);
    assert.equal(Math.hypot(puck.velocity.x, puck.velocity.z), 29);
    assert.equal(puck.velocity.x / puck.velocity.z, .75);
});
test('side and end rails contain overshoot and reflect outward velocity', () => {
    const puck = body(6, 9, 10, 12);
    assert.equal(hardContainPuck(puck), 2);
    assert.ok(Math.abs(puck.position.x - 4.555) < 1e-12);
    assert.ok(Math.abs(puck.position.z - 7.555) < 1e-12);
    assert.equal(puck.velocity.x, -9.65);
    assert.equal(puck.velocity.z, -11.58);
    puck.velocity.x = -2;
    assert.equal(hardContainPuck(puck), 0);
    assert.equal(puck.velocity.x, -2);
});
test('every successive wall bounce reports an impact, but position correction alone does not', () => {
    const puck = body();
    for (let i = 0; i < 8; i++) {
        const sign = i % 2 ? 1 : -1;
        puck.position.x = sign * 4.7;
        puck.velocity.x = sign * 10;
        assert.equal(hardContainPuck(puck), 1);
        assert.equal(hardContainPuck(puck), 0);
    }
    puck.position.x = 5;
    puck.velocity.x = -10;
    assert.equal(hardContainPuck(puck), 0);
});
test('goal channel stays open and scores both ends at full speed', () => {
    for (const sign of [-1, 1]) {
        const puck = body(0, sign * 8.3, 0, sign * 29);
        hardContainPuck(puck);
        assert.equal(puck.position.z, sign * 8.3);
        assert.equal(goalCrossing(puck, sign * 8), sign < 0 ? 'player' : 'cpu');
    }
    assert.equal(goalCrossing(body(2, 9), 8), null);
    assert.equal(goalCrossing(body(0, 7), 6), null);
});
test('goal capture freezes the puck inside the goal', () => {
    const puck = body(2, -12, 10, -29);
    capturePuck(puck, true);
    assert.equal(puck.position.z, -8.42);
    assert.ok(puck.position.x < 1.15);
    assert.equal(puck.velocity.x, 0);
    assert.equal(puck.velocity.z, 0);
});
test('swept collision catches tunneling without bouncing separating contacts twice', () => {
    const puck = body(2, 0, 29, 0), mallet = { body: body() };
    assert.equal(sweptMalletContact(puck, mallet, -2, 0, 0, 0), true);
    assert.ok(puck.position.x < 0);
    assert.ok(puck.velocity.x < 0);
    assert.ok(Math.hypot(puck.velocity.x, puck.velocity.z) <= 29);
    assert.equal(sweptMalletContact(puck, mallet, -2, 0, 0, 0), false);
});
test('swept strikes transfer mallet energy before applying the final speed cap', () => {
    const puck = body(2, 0, 29, 0), mallet = { body: body(0, 0, -20, 0) };
    let speedBeforeBoost = 0;
    sweptMalletContact(puck, mallet, -2, 0, 0, 0, () => {
        speedBeforeBoost = Math.abs(puck.velocity.x);
        puck.velocity.z += 8;
    });
    assert.ok(speedBeforeBoost > 29);
    assert.ok(puck.velocity.z > 0);
    assert.ok(Math.abs(Math.hypot(puck.velocity.x, puck.velocity.z) - 29) < 1e-12);
});
