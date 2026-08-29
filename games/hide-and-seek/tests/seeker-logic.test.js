const test = require('node:test');
const assert = require('node:assert/strict');

const seeker = require('../seeker-logic.js');

const CONFIG = { visionDistance: 15, fieldOfView: Math.PI * 0.8, memorySeconds: 3 };

test('the solo seeker only acquires living hiders it can see', () => {
  const hunter = { x: 0, y: 0, z: 0, yaw: 0 };
  const players = [
    { id: 'dead', role: 'hider', alive: false, x: 0, y: 0, z: 4 },
    { id: 'behind', role: 'hider', alive: true, x: 0, y: 0, z: -4 },
    { id: 'seen', role: 'hider', alive: true, x: 1, y: 0, z: 5 },
  ];

  assert.equal(seeker.selectVisibleHider(players, hunter, { config: CONFIG, isOccluded: () => false }).id, 'seen');
  assert.equal(seeker.selectVisibleHider(players, hunter, { config: CONFIG, isOccluded: (entry) => entry.id === 'seen' }), null);
});

test('the seeker remembers a sighting briefly, then resumes searching', () => {
  let state = seeker.createSeekerState();
  const target = { id: 'hider', x: 2, y: 0, z: 8, floor: 1 };

  state = seeker.updateSeeker(state, { delta: 0.1, visible: target, config: CONFIG });
  assert.equal(state.mode, seeker.SEEKER_STATES.CHASING);
  assert.equal(state.targetId, 'hider');

  state = seeker.updateSeeker(state, { delta: 2, visible: null, config: CONFIG });
  assert.equal(state.mode, seeker.SEEKER_STATES.SEARCHING);
  assert.equal(state.targetId, 'hider');

  state = seeker.updateSeeker(state, { delta: 2, visible: null, config: CONFIG });
  assert.equal(state.mode, seeker.SEEKER_STATES.PATROLLING);
  assert.equal(state.targetId, null);
});
