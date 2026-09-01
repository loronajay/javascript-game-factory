import test from 'node:test';
import assert from 'node:assert/strict';
import { RIVALS, RIVAL_IDS, getRival, planRivalMove } from '../scripts/physics/rivals.js';

test('the roster contains twelve named rivals with complete presentation and playstyle data', () => {
    assert.equal(RIVALS.length, 12);
    assert.equal(new Set(RIVAL_IDS).size, 12);
    assert.equal(new Set(RIVALS.map(rival => rival.name)).size, 12);
    assert.equal(new Set(RIVALS.map(rival => rival.homeArena)).size, 8);
    for (const rival of RIVALS) {
        assert.ok(rival.name && rival.style && rival.intro && rival.color && rival.portrait);
        assert.match(rival.portrait, /^\.\/assets\/rivals\/[a-z-]+\.jpg$/);
        assert.ok(rival.speed > 0 && rival.error >= 0 && rival.strikePower > 0);
        assert.equal(getRival(rival.id), rival);
    }
});

test('rival planners make meaningfully different choices from the same loose puck', () => {
    const state = {
        cpu: { x: 0, z: -5.6 },
        puck: { x: 2.2, z: -1.8, vx: 4.2, vz: 3.4 },
        player: { x: -2.4, z: 5.1 },
    };
    const plans = ['brick', 'viper', 'banks', 'mirror', 'gambler', 'ace']
        .map(id => planRivalMove(id, state, () => .5));
    assert.equal(new Set(plans.map(plan => `${plan.x.toFixed(2)},${plan.z.toFixed(2)}`)).size, plans.length);
    assert.ok(plans.every(plan => Number.isFinite(plan.x) && Number.isFinite(plan.z) && plan.speed > 0));
});

test('unknown rivals safely fall back to Rookie', () => {
    assert.equal(getRival('not-a-rival').id, 'rookie');
});
