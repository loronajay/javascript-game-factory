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
