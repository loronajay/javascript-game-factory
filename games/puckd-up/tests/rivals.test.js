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
        assert.match(rival.portraitFocus, /^\d+% \d+%$/, `${rival.name} needs an explicit portrait focal point`);
        const [focusX, focusY] = rival.portraitFocus.split(' ').map(Number.parseFloat);
        assert.ok(focusX >= 0 && focusX <= 100 && focusY >= 0 && focusY <= 100, `${rival.name}'s portrait focal point must stay within the image`);
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

test('every rival circles behind and clears a puck trapped in the CPU back zone', () => {
    for (const rival of RIVALS) {
        const trappedPuck = { x: 0, z: -6.45, vx: 8, vz: 0 };
        const circlePlan = planRivalMove(rival.id, {
            cpu: { x: 0, z: -5.55 }, puck: trappedPuck, player: { x: 0, z: 5.4 },
        }, () => .5);
        assert.ok(circlePlan.z < trappedPuck.z, `${rival.name} must retreat behind the puck`);
        assert.ok(Math.abs(circlePlan.x - trappedPuck.x) > 1.1, `${rival.name} must circle around without knocking the puck into their own goal`);

        const clearPlan = planRivalMove(rival.id, {
            cpu: { x: 1.4, z: -7.1 }, puck: trappedPuck, player: { x: 0, z: 5.4 },
        }, () => .5);
        assert.ok(clearPlan.z > trappedPuck.z, `${rival.name} must drive forward through the puck once behind it`);
        assert.ok(Math.abs(clearPlan.x - trappedPuck.x) < Math.abs(circlePlan.x - trappedPuck.x), `${rival.name} must close on the puck to clear it`);
    }
});

test('unknown rivals safely fall back to Rookie', () => {
    assert.equal(getRival('not-a-rival').id, 'rookie');
});
