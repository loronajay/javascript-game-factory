const test = require('node:test');
const assert = require('node:assert/strict');

const sim = require('../sim-logic.js');
const maps = require('../map-catalog.js');
const roundLogic = require('../round-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

const PLAYERS = [
  { id: 'a', spawn: { floor: 1, x: 0, y: 0, z: 0 } },
  { id: 'b', spawn: { floor: 1, x: 0, y: 0, z: 6 } },
  { id: 'c', spawn: { floor: 2, x: 0, y: 4.6, z: 0 } },
];

function standUp(demons) {
  const { engine } = fixture.createFullSim({ config: demons ? { demons } : {} });
  return engine.createState({ players: PLAYERS, seekerId: 'a' });
}

test('a simulation given no roster still runs the hotel it always ran', () => {
  const state = standUp(null);
  assert.deepEqual(state.demons.map((entry) => entry.name), ['The Bellhop', 'The Housekeeper']);
});

test('the roster is the demon count — three names put three demons in the building', () => {
  const state = standUp(maps.demonRosterFor('cinder-mall'));
  assert.deepEqual(state.demons.map((entry) => entry.id), ['greeter', 'custodian', 'nightwatch']);
  assert.deepEqual(state.demons.map((entry) => entry.hunts), [true, false, false]);
});

test('demons open apart from each other, whether or not the map has a floor each', () => {
  // A floor each was the rule while the only map was four floors deep. Cinder Mall is two levels
  // with three demons, so "one per floor" is arithmetic that cannot be satisfied — and the thing it
  // was really protecting was never the floor, it was the distance. A round must not open with two
  // demons in one corridor; it may perfectly well open with two on one level at opposite ends of a
  // building that is 96 metres wide.
  const state = standUp(maps.demonRosterFor('cinder-mall'));
  const spawns = state.demons.map((entry) => ({ x: entry.x, y: entry.y, z: entry.z }));
  for (let i = 0; i < spawns.length; i += 1) {
    for (let j = i + 1; j < spawns.length; j += 1) {
      const apart = Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z);
      const floorsApart = Math.abs(spawns[i].y - spawns[j].y) > 1;
      assert.ok(apart > 12 || floorsApart, `demons ${i} and ${j} opened ${apart.toFixed(1)}m apart on one level`);
    }
  }
});

test('a third demon is a third catcher, not decoration', () => {
  const roster = maps.demonRosterFor('cinder-mall');
  const { engine } = fixture.createFullSim({ config: { demons: roster } });
  let state = engine.createState({ players: PLAYERS, seekerId: 'a' });
  // Past the head start, during which no demon in any roster is allowed to catch — see
  // `tests/head-start-grace.test.js`. This test is about the third demon, not about the phase.
  state = { ...state, round: { ...state.round, hideRemaining: 0, phase: roundLogic.PHASES.SEEKING } };
  // Put the last demon in the roster on top of a hider. The round has to end for that player
  // through the same path the first demon uses; there is no "the first two are the real ones".
  const victim = state.bodies.find((entry) => entry.id === 'b');
  state = {
    ...state,
    demons: state.demons.map((entry, index) => (index === roster.length - 1
      ? { ...entry, x: victim.x, y: victim.y, z: victim.z, floor: victim.floor }
      : { ...entry, x: 400, y: 0, z: 400 })),
  };
  for (let tick = 0; tick < 30 && !state.round.eliminated?.includes?.('b'); tick += 1) {
    state = engine.tick(state, 1 / 60, {});
  }
  const participant = state.round.participants.find((entry) => entry.id === 'b');
  assert.equal(participant.alive, false, 'the third demon must be able to catch');
});

test('a roster off the wire is bounded rather than trusted', () => {
  assert.equal(sim.normalizeRoster([]).length, sim.DEFAULT_DEMONS.length);
  assert.equal(sim.normalizeRoster(null).length, sim.DEFAULT_DEMONS.length);
  assert.equal(sim.normalizeRoster([{ id: 'x' }, null, 'nope', { name: 'no id' }]).length, 1);
  const flood = Array.from({ length: 40 }, (_, index) => ({ id: `d${index}`, name: `Demon ${index}` }));
  assert.equal(sim.normalizeRoster(flood).length, sim.MAX_DEMONS);
  assert.deepEqual(sim.normalizeRoster([{ id: 'x' }])[0], { id: 'x', name: 'x', hunts: false });
});
