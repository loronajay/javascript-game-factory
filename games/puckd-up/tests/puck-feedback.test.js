import test from 'node:test';
import assert from 'node:assert/strict';
import { getPuckFeedback, PUCK_FEEDBACK_TIERS } from '../scripts/render/puck-feedback.js';

test('puck feedback follows the requested five velocity bands', () => {
    assert.deepEqual([0, 9.99, 10, 17.99, 18, 22.99, 23, 26.99, 27, 29].map(speed => getPuckFeedback(speed).id),
        ['normal', 'normal', 'charged', 'charged', 'fast', 'fast', 'hot', 'hot', 'extreme', 'extreme']);
    assert.equal(PUCK_FEEDBACK_TIERS.length, 5);
});

test('trail, glow, impact scale and audio pitch rise monotonically with speed', () => {
    const values = PUCK_FEEDBACK_TIERS.map(tier => [tier.trail, tier.glow, tier.impact, tier.pitch]);
    for (let i = 1; i < values.length; i++)
        for (let field = 0; field < values[i].length; field++)
            assert.ok(values[i][field] >= values[i - 1][field]);
    assert.equal(getPuckFeedback(Number.NaN).id, 'normal');
    assert.equal(getPuckFeedback(-20).id, 'normal');
});
