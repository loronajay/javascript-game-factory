const test = require('node:test');
const assert = require('node:assert/strict');

const spectator = require('../spectator-logic.js');

const players = [
  { id: 'me', alive: false, role: 'hider' },
  { id: 'hider-2', alive: true, role: 'hider' },
  { id: 'seeker', alive: true, role: 'seeker' },
  { id: 'hider-3', alive: false, role: 'hider' },
];

test('a caught player may watch every other living player', () => {
  assert.deepEqual(spectator.targetsFor(players, 'me').map((entry) => entry.id), ['hider-2', 'seeker']);
});

test('spectator cycling wraps and survives a target being eliminated', () => {
  assert.equal(spectator.cycleTarget(players, 'me', 'hider-2', 1), 'seeker');
  assert.equal(spectator.cycleTarget(players, 'me', 'seeker', 1), 'hider-2');
  assert.equal(spectator.cycleTarget(players, 'me', 'hider-2', -1), 'seeker');
  assert.equal(spectator.cycleTarget(players.filter((entry) => entry.id !== 'hider-2'), 'me', 'hider-2', 1), 'seeker');
  assert.equal(spectator.cycleTarget([{ id: 'me', alive: false }], 'me', null, 1), null);
});

test('a spectator camera uses the watched player eye height and facing', () => {
  const pose = spectator.cameraPose({ x: 4, y: 9.2, z: -3, yaw: 1.4, crouching: true }, { eyeHeight: 1.7, crouchEyeHeight: 1.02 });
  assert.deepEqual({ ...pose, y: Number(pose.y.toFixed(2)) }, { x: 4, y: 10.22, z: -3, yaw: 1.4, pitch: 0 });
});

test('CPU spectator poses look along their avatar forward, not backwards or at a fixed heading', async () => {
  const { mapRuntime } = require('./helpers/map-fixture.js');
  const context = await mapRuntime('grand-hotel');
  const { createSeeker } = await import('../modules/seeker.js');
  const { createHiders } = await import('../modules/hiders.js');
  const seekerLogic = require('../seeker-logic.js');
  const hiderLogic = require('../hider-logic.js');
  const poses = new Map();
  context.avatars.setPose = (id, pose) => poses.set(id, pose);
  const seeker = createSeeker({ ...context, logic: seekerLogic, tuning: seekerLogic.SEEKER_DEFAULTS });
  const hiders = createHiders({ ...context, logic: hiderLogic, tuning: hiderLogic.HIDER_DEFAULTS, count: 1 });
  seeker.setHeld(false);
  for (let tick = 0; tick < 120; tick++) {
    seeker.update(1 / 60, []);
    hiders.update(1 / 60, []);
    for (const target of [seeker.getState(), ...hiders.list()]) {
      const view = spectator.cameraPose(target);
      const body = poses.get(target.id);
      const alignment = -Math.sin(view.yaw) * Math.sin(body.yaw) - Math.cos(view.yaw) * Math.cos(body.yaw);
      assert.ok(alignment > .999, `${target.id}: camera must face the same way as the body`);
    }
  }
});
