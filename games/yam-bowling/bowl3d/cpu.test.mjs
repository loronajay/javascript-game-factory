import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { create3dCpu } from './cpu.mjs';
import { create3dPhysics } from './physics.mjs';
const require = createRequire(import.meta.url);
const Physics = require('../physics-core.js');
const balls = require('../ball-core.js').BALLS;
const cpu = create3dCpu(Physics);
test('the 3D CPU aims at surviving pins with legal, ball-aware inputs', () => {
  const left = Physics.createRack().filter(p => p.id === 7);
  const right = Physics.createRack().filter(p => p.id === 10);
  const a = cpu.createCpuPlan({ pins: left, balls, levelId: 'pro', random: () => .5 });
  const b = cpu.createCpuPlan({ pins: right, balls, levelId: 'pro', random: () => .5 });
  assert.ok(a.position < 0 && b.position > 0);
  for (const p of [a,b]) {
    assert.ok(Math.abs(p.position) <= .46 && Math.abs(p.aim) <= .45 && Math.abs(p.hook) <= 1);
    assert.ok(p.power >= .08 && p.power <= 1);
    const engine = create3dPhysics(Physics);
    const sim = engine.createSimulation(p === a ? left : right, p);
    for (let i = 0; i < 1600 && !sim.complete; i++) engine.stepSimulation(sim, 1/180);
    assert.equal(engine.knockedCount(sim), 1, 'a precise CPU should convert a lone corner pin');
  }
});
