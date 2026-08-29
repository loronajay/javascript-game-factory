const test = require('node:test');
const assert = require('node:assert/strict');

const hiders = require('../hider-logic.js');

const CONFIG = {
  seekerPanicDistance: 9,
  demonPanicDistance: 7,
  calmSeconds: 4,
  settleSeconds: 1.5,
  spotSpreadDistance: 12,
  floorPenalty: 26,
};

const SPOTS = [
  { id: '101', x: -10, z: -50, floor: 1 },
  { id: '102', x: 10, z: -50, floor: 1 },
  { id: '201', x: -10, z: 30, floor: 2 },
  { id: '401', x: 10, z: 30, floor: 4 },
];

function at(x, z, floor = 1) {
  return { x, z, floor, y: (floor - 1) * 3.2 };
}

test('a fresh hider is on its way to a spot, standing, with nowhere claimed yet', () => {
  const state = hiders.createHiderState();

  assert.equal(state.state, hiders.HIDER_STATES.SETTLING);
  assert.equal(state.spot, null);
  assert.equal(state.crouching, false);
});

test('a hiding spot is chosen away from every known threat', () => {
  const spot = hiders.chooseHideSpot(SPOTS, { threats: [at(-10, -50, 1)], random: () => 0, config: CONFIG });

  assert.notEqual(spot.id, '101', 'the room a threat is standing in is never the best hiding place');
});

test('hiders spread out instead of piling into one room', () => {
  const taken = SPOTS.filter((spot) => spot.id !== '401');
  const spot = hiders.chooseHideSpot(SPOTS, { taken, random: () => 0, config: CONFIG });

  assert.equal(spot.id, '401');
});

test('every spot being taken still yields a spot rather than a stranded hider', () => {
  const spot = hiders.chooseHideSpot(SPOTS, { taken: SPOTS, random: () => 0, config: CONFIG });

  assert.ok(spot && SPOTS.includes(spot));
});

test('a floor between a hider and a threat counts as real distance', () => {
  const near = hiders.threatDistance(at(0, 0, 1), at(4, 0, 1), CONFIG);
  const above = hiders.threatDistance(at(0, 0, 1), at(4, 0, 2), CONFIG);

  assert.equal(near, 4);
  assert.ok(above > CONFIG.floorPenalty);
});

test('arriving at the spot settles the hider into a crouch', () => {
  let state = hiders.createHiderState();
  state = { ...state, spot: SPOTS[0] };

  state = hiders.updateHider(state, { delta: 0.5, self: at(-10, -50, 1), arrived: true, config: CONFIG });
  assert.equal(state.state, hiders.HIDER_STATES.SETTLING, 'settling takes a moment, it is not instant');

  state = hiders.updateHider(state, { delta: 1.2, self: at(-10, -50, 1), arrived: true, config: CONFIG });
  assert.equal(state.state, hiders.HIDER_STATES.HIDDEN);
  assert.equal(state.crouching, true);
});

test('a seeker closing in makes a hidden hider bolt and drop its spot', () => {
  let state = { ...hiders.createHiderState(), state: hiders.HIDER_STATES.HIDDEN, spot: SPOTS[0], crouching: true };

  state = hiders.updateHider(state, {
    delta: 0.1,
    self: at(-10, -50, 1),
    threats: [{ ...at(-6, -50, 1), kind: hiders.THREATS.SEEKER }],
    arrived: true,
    config: CONFIG,
  });

  assert.equal(state.state, hiders.HIDER_STATES.FLEEING);
  assert.equal(state.spot, null, 'a burned spot is not worth returning to');
  assert.equal(state.crouching, false, 'you do not crawl away from a seeker');
});

test('the demon has a shorter fuse than the seeker but is still fled from', () => {
  const self = at(0, 0, 1);
  const spotted = (kind, x) => hiders.updateHider(
    { ...hiders.createHiderState(), state: hiders.HIDER_STATES.HIDDEN, spot: SPOTS[0] },
    { delta: 0.1, self, threats: [{ ...at(x, 0, 1), kind }], arrived: true, config: CONFIG },
  ).state;

  assert.equal(spotted(hiders.THREATS.SEEKER, 8), hiders.HIDER_STATES.FLEEING);
  assert.equal(spotted(hiders.THREATS.DEMON, 8), hiders.HIDER_STATES.HIDDEN, 'the demon has to get closer');
  assert.equal(spotted(hiders.THREATS.DEMON, 6), hiders.HIDER_STATES.FLEEING);
});

test('a fled hider stays spooked for a while before looking for a new spot', () => {
  let state = { ...hiders.createHiderState(), state: hiders.HIDER_STATES.FLEEING, calmRemaining: CONFIG.calmSeconds };

  state = hiders.updateHider(state, { delta: 2, self: at(0, 0, 1), config: CONFIG });
  assert.equal(state.state, hiders.HIDER_STATES.FLEEING);

  state = hiders.updateHider(state, { delta: 2.5, self: at(0, 0, 1), config: CONFIG });
  assert.equal(state.state, hiders.HIDER_STATES.SETTLING, 'calm again, so go find somewhere new');
  assert.equal(state.needsSpot, true);
});

test('a threat still in the room keeps resetting the calm timer', () => {
  let state = { ...hiders.createHiderState(), state: hiders.HIDER_STATES.FLEEING, calmRemaining: 0.2 };
  const threats = [{ ...at(2, 0, 1), kind: hiders.THREATS.SEEKER }];

  state = hiders.updateHider(state, { delta: 1, self: at(0, 0, 1), threats, config: CONFIG });

  assert.equal(state.state, hiders.HIDER_STATES.FLEEING);
  assert.equal(state.calmRemaining, CONFIG.calmSeconds);
});

test('the speed a hider moves at follows what it is doing', () => {
  const speeds = {
    settling: hiders.movementSpeed({ state: hiders.HIDER_STATES.SETTLING }),
    hidden: hiders.movementSpeed({ state: hiders.HIDER_STATES.HIDDEN }),
    fleeing: hiders.movementSpeed({ state: hiders.HIDER_STATES.FLEEING }),
  };

  assert.equal(speeds.hidden, 0);
  assert.ok(speeds.fleeing > speeds.settling);
});
