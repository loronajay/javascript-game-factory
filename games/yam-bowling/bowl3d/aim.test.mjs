import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { create3dPhysics } from './physics.mjs';
import * as Geometry from './geometry.mjs';
import { lanePointForShot, createAimPreview } from './shot-path.mjs';

const require = createRequire(import.meta.url);
const physics = require('../physics-core.js');
const balls = require('../ball-core.js').BALLS;
const shot = { position: -.2, aim: .16, hook: .8, power: .7, ...balls[0] };
const near = (a, b, message) => assert.ok(Math.abs(a - b) < .015, `${message}: ${a} vs ${b}`);

test('the release-to-rack distance reads as a full lane without stretching pins or the pit', () => {
  const lane = Geometry.ROOM_BOXES.find(b => b.surface === 'lane');
  assert.ok((Geometry.RELEASE_Z - Geometry.HEAD_Z) / lane.size[0] >= 14);
  near(Geometry.PIN_POSITIONS[9][1] - Geometry.HEAD_Z, -3 * 1.4 * .8660254, 'rack spacing');
  near(lane.pos[2] - lane.size[2] / 2, Geometry.HEAD_Z - 4.75, 'deck edge follows rack');
  for (const z of [0, .3, .86, .92]) near(Geometry.normalizedZ(Geometry.worldZ(z)), z, 'depth round trip');
});

test('3D aim and release use the 2D line model and power moves the hook breakpoint', () => {
  for (const ball of balls) for (const power of [.08, .5, 1]) {
    const s = { ...shot, ...ball, power, release: .025 };
    for (const z of [0, .2, .45, .65, .86]) {
      near(lanePointForShot(physics, s, z).x, physics.trajectoryX(z, s) * Geometry.SHOT_X_SCALE, 'shared line');
    }
  }
  const soft = createAimPreview(physics, { ...shot, power: .1 });
  const hard = createAimPreview(physics, { ...shot, power: 1 });
  assert.ok(soft.breakpoint.z > hard.breakpoint.z, 'more power delays the hook farther down lane');
  const a = createAimPreview(physics, { ...shot, hook: 0, power: .08 });
  const b = createAimPreview(physics, { ...shot, hook: 0, power: 1, speedScale: 1.4 });
  near(a.target.x, b.target.x, 'straight aim is independent of speed');
});

test('preview shows a spare target and stops at the first gutter crossing', () => {
  const spare = createAimPreview(physics, shot, physics.createRack().filter(p => p.id === 10));
  near(spare.target.z, Geometry.PIN_POSITIONS[9][1], 'spare target plane');
  const gutter = createAimPreview(physics, { ...shot, position: .46, aim: .45, hook: 1 });
  assert.equal(gutter.gutter.side, 1);
  assert.equal(gutter.target, null, 'no misleading rack target after a gutter');
  near(gutter.gutter.x, Geometry.GUTTER_CAPTURE_X, 'exact gutter entry');
  assert.ok([...gutter.skid, ...gutter.hook].every(p => Math.abs(p.x) <= Geometry.GUTTER_CAPTURE_X + .001));
});

test('all eight balls follow the preview up to first impact at both power extremes', () => {
  const engine = create3dPhysics(physics);
  for (const ball of balls) for (const power of [.08, 1]) {
    const s = { ...shot, ...ball, power, release: .02 };
    const sim = engine.createSimulation([], s);
    while (sim.body.position.z > Geometry.HEAD_Z) {
      engine.stepSimulation(sim, 1 / 180);
      assert.equal(sim.complete, false, 'long soft shots must reach the rack before timing out');
      near(sim.body.position.x, lanePointForShot(physics, s, Geometry.normalizedZ(sim.body.position.z)).x,
        `${ball.name} power ${power} preview tracks ball`);
    }
    assert.ok(sim.elapsed > 3, 'ball travel conveys the longer lane');
  }
});

test('lane guidance releases permanently at first pin impact', () => {
  const engine = create3dPhysics(physics);
  const sim = engine.createSimulation(physics.createRack(), { ...shot, position: .07, aim: 0, hook: 0 });
  for (let i = 0; i < 180 * 7 && !sim.pins.some(p => p.contacted); i++) engine.stepSimulation(sim, 1 / 180);
  assert.ok(sim.pins.some(p => p.contacted));
  assert.equal(sim.guided, false);
  sim.body.position.z = Geometry.HEAD_Z + 2;
  sim.body.velocity.x = -3;
  engine.stepSimulation(sim, 1 / 180);
  assert.ok(sim.body.velocity.x < -2, 'pin deflection must not be steered back onto the preview');
});

test('every ball resolves a minimum-power roll and a gutter before the bounded deadline', () => {
  const engine = create3dPhysics(physics);
  for (const ball of balls) for (const gutter of [false, true]) {
    const s = { ...shot, ...ball, power: .08, position: gutter ? .46 : 0, aim: gutter ? .45 : 0, hook: gutter ? 1 : 0 };
    const sim = engine.createSimulation(physics.createRack(), s);
    for (let i = 0; i < 180 * 12 && !sim.complete; i++) engine.stepSimulation(sim, 1 / 180);
    assert.equal(sim.complete, true, `${ball.name} ${gutter ? 'gutter' : 'soft roll'} timed out`);
    assert.ok(sim.elapsed < 12);
    if (gutter) {
      assert.equal(sim.ball.gutterSide, 1);
      assert.equal(engine.knockedCount(sim), 0);
    } else assert.ok(engine.knockedCount(sim) > 0, 'minimum power reaches the rack');
  }
});
