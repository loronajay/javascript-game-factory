import test from 'node:test';
import assert from 'node:assert/strict';
import { predictPuck, paddlePath } from '../scripts/online/puck-predictor.js';
import { X_LIMIT, CONTACT_R, FIXED_DT } from '../scripts/config.js';

const still = (x, z) => ({ x, z, vx: 0, vz: 0 });
const parked = () => [still(0, 5.8), still(0, -5.8)];

test('a free puck is carried forward ballistically and reflects off the side rail', () => {
    const glide = predictPuck({ x: 0, z: 0, vx: 0, vz: -10 }, 24, parked);
    assert.ok(Math.abs(glide.z - (-10 * 24 * FIXED_DT)) < .02, 'travels v·t with only light damping');
    assert.ok(glide.vz < -9.9 && glide.vz > -10, 'Cannon-shaped damping, not a rewrite of it');
    const rebound = predictPuck({ x: X_LIMIT - .1, z: 0, vx: 20, vz: 0 }, 24, parked);
    assert.ok(rebound.vx < 0, 'came back off the rail');
    assert.ok(rebound.x <= X_LIMIT, 'never rendered inside the rail');
});

test('a paddle swung into a resting puck sends it away instead of passing through', () => {
    // The local paddle closes on the puck at 20 m/s over the horizon.
    const path = Array.from({ length: 25 }, (_, j) => ({ x: 0, z: 3 - 20 * j * FIXED_DT, vx: 0, vz: -20 }));
    const puck = predictPuck(still(0, 1.15), 24, j => [path[j], still(0, -5.8)]);
    assert.ok(puck.vz < -20, `puck leaves faster than the paddle arrived (${puck.vz.toFixed(1)})`);
    assert.ok(Math.hypot(puck.x - path[24].x, puck.z - path[24].z) >= CONTACT_R, 'puck is outside the mallet at the end');
});

test('a puck already inside a mallet is pushed out rather than left overlapping', () => {
    const puck = predictPuck({ x: 0, z: 5.8 - CONTACT_R + .3, vx: 0, vz: 4 }, 1, parked);
    assert.ok(5.8 - puck.z >= CONTACT_R, 'resolved to the contact radius');
    assert.ok(puck.vz < 0, 'and moving away');
});

test('a goal-bound puck stops at the goal instead of flying off the cabinet', () => {
    const puck = predictPuck({ x: 0, z: 7.9, vx: 0, vz: 29 }, 36, parked);
    assert.ok(puck.z < 9, 'held near the goal mouth');
    assert.equal(puck.vz, 0);
});

test('a remote paddle sample runs to the target its velocity names, then stops', () => {
    // Human motion closes the gap over PLAYER_TRACK_TIME: v = gap / .022.
    const path = paddlePath({ x: -2, z: -5, vx: .5 / .022, vz: 0 }, 36, true);
    assert.equal(path.length, 37);
    assert.ok(Math.abs(path[36].x - -1.5) < .01, `settled at the inferred target (${path[36].x.toFixed(3)})`);
    assert.ok(Math.abs(path[36].x - path[24].x) < .01, 'no invented motion beyond it');
    const idle = paddlePath(still(0, -5.8), 12, true);
    assert.deepEqual(idle.at(-1), still(0, -5.8));
});
