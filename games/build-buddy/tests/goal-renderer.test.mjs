import test from 'node:test';
import assert from 'node:assert/strict';
import { GoalRenderer } from '../js/render/goal-renderer.js';

test('goal label is centered inside the actual goal rectangle', () => {
  const calls = [];
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient: () => gradient,
    fillText: (...args) => calls.push(args),
  }, { get: (target, key) => target[key] ?? (() => {}), set: (target, key, value) => { target[key] = value; return true; } });
  const goal = { x: 900, y: 220, w: 100, h: 160 };
  new GoalRenderer({ goal }).draw(ctx);
  assert.deepEqual(calls, [['GOAL', 950, 300]]);
  assert.equal(ctx.textAlign, 'center');
  assert.equal(ctx.textBaseline, 'middle');
});
