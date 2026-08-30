const test = require('node:test');
const assert = require('node:assert/strict');
const flashlight = require('../flashlight-logic.js');
const maps = require('../map-catalog.js');
const { buildPlan, createSpace } = require('./helpers/map-fixture.js');
const { CONFIG, seededRandom } = require('./helpers/hotel-fixture.js');
const sim = require('../sim-logic.js');

for (const map of maps.playableMaps()) {
  test(`${map.id}: flashlight spots are authored, grounded, and clear of furniture and door swings`, () => {
    const plan = buildPlan(map.id);
    const points = plan.spawns.flashlights;
    assert.ok(points?.length > 0, 'the map needs flashlight spawn points');
    assert.equal(new Set(points.map(p => p.id)).size, points.length);
    const space = createSpace(plan);
    for (let floor = 1; floor <= map.floorCount; floor++) {
      assert.ok(points.filter(p => p.floor === floor).length >= 4, `floor ${floor} needs a choice of spots`);
    }
    for (const point of points) {
      assert.ok(point.label, `${point.id} needs a meaningful location label`);
      assert.ok([point.x, point.y, point.z].every(Number.isFinite));
      assert.ok(Math.abs(space.groundAt(point.x, point.z, point.y) - point.y) < 0.001, `${point.id} is not grounded`);
      assert.notEqual(space.groundAt(point.x, point.z, point.y), null, `${point.id} is over a void`);
      for (const fraction of [0, 0.5, 1]) {
        for (const door of plan.swingDoors) space.setOpening(door.id, door.openAngle * fraction);
        assert.equal(space.blocked(point.x, point.z, point.y, CONFIG.bodyHeight, 0.4), false, `${point.id} is blocked at door swing ${fraction}`);
      }
      const clearLeg = (from, to) => {
        const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.2));
        let y = point.y;
        for (let i = 0; i <= steps; i++) {
          const x = from.x + (to.x - from.x) * i / steps;
          const z = from.z + (to.z - from.z) * i / steps;
          y = space.groundAt(x, z, y);
          if (y === null || space.blocked(x, z, y, CONFIG.bodyHeight, CONFIG.playerRadius)) return false;
        }
        return true;
      };
      const nodes = plan.navigation.nodes.filter(node => node.floor === point.floor);
      // A spare beside a dresser need not see the doorway directly: the room's clear centre can
      // supply the turn between its aisle and the doorway graph node.
      const reachable = nodes.some(node => clearLeg(point, node)) || plan.roomCenters.some(room =>
        room.floor === point.floor && clearLeg(point, room) && nodes.some(node => clearLeg(room, node)));
      assert.ok(reachable, `${point.id} has no walkable approach from the map's navigation graph`);
    }
    const selected = flashlight.createFloorPickups(points, seededRandom(42));
    for (let floor = 1; floor <= map.floorCount; floor++) {
      assert.equal(selected.filter(p => p.floor === floor).length, Math.ceil(points.filter(p => p.floor === floor).length / 2));
    }
  });
}

test('floor pickups are seeded, sampled without replacement, and never mutate the plan', () => {
  const points = Array.from({ length: 12 }, (_, i) => ({ id: `spot-${i}`, label: 'Test spot', floor: i < 6 ? 1 : 2, x: i * 4, y: i < 6 ? 0 : 4.6, z: 0 }));
  const before = structuredClone(points);
  const a = flashlight.createFloorPickups(points, seededRandom(7));
  assert.deepEqual(a, flashlight.createFloorPickups(points, seededRandom(7)));
  assert.notDeepEqual(a, flashlight.createFloorPickups(points, seededRandom(92)));
  assert.equal(a.length, 6);
  assert.equal(new Set(a.map(p => p.id)).size, a.length);
  for (const p of a) {
    assert.ok(p.charge >= 0.35 && p.charge <= 0.65);
    assert.ok(points.some(s => p.id === `floor-flashlight-${s.id}` && p.x === s.x && p.y === s.y && p.z === s.z));
  }
  assert.deepEqual(points, before);
  assert.deepEqual(flashlight.createFloorPickups(), []);
});

function authority(seed = 7, blocked = false) {
  const plan = buildPlan('grand-hotel');
  const engine = sim.createSimulation({
    plan, random: seededRandom(seed), flashlight,
    movement: require('../movement-logic.js'), round: require('../round-logic.js'),
    stamina: require('../stamina-logic.js'), heat: require('../heat-logic.js'),
    space: { groundAt: (x, z, y) => y, blocked: () => false, sightBlocked: () => blocked },
  });
  const state = engine.createState({ players: ['seeker', 'a', 'b'].map(id => ({ id, spawn: { x: 0, y: 0, z: -50 } })), seekerId: 'seeker' });
  return { engine, state };
}

test('authority creates floor pickups once; snapshots carry placement and inputs cannot forge it', () => {
  const { engine, state } = authority();
  assert.ok(state.pickups.length > 0);
  assert.deepEqual(state.pickups, authority().state.pickups);
  assert.notDeepEqual(state.pickups, authority(99).state.pickups);
  const before = structuredClone(state);
  const next = engine.tick(state, 1 / 60, { a: { pickups: [], pickupId: state.pickups[0].id, flashlightCharge: 1, x: state.pickups[0].x } });
  assert.deepEqual(next.pickups, state.pickups);
  assert.deepEqual(state, before);
  assert.deepEqual(engine.snapshot(next).pickups, engine.snapshot(state).pickups);
});

test('one server tick grants a contested floor pickup only once and reports the resulting charge', () => {
  const { engine, state } = authority();
  const pickup = state.pickups[0];
  const staged = { ...state, pickups: [pickup], bodies: state.bodies.map(b => b.id === 'seeker' ? b : { ...b, x: pickup.x, y: pickup.y, z: pickup.z, flashlight: { on: false, charge: 0.6 } }) };
  const next = engine.tick(staged, 1 / 60, {});
  assert.equal(next.pickups.length, 0);
  const events = next.events.filter(e => e.type === 'flashlight-pickup');
  assert.equal(events.length, 1);
  assert.equal(events[0].charge, engine.bodyOf(next, events[0].playerId).flashlight.charge);
  assert.equal(next.bodies.filter(b => b.id !== 'seeker' && b.flashlight.charge > 0.6).length, 1);
  assert.equal(engine.tick(next, 1 / 60, {}).pickups.length, 0, 'consumed pickups never respawn during a round');
  assert.equal(staged.pickups.length, 1);
});

test('floor pickups refuse full, eliminated, distant, wrong-height and wall-separated players', () => {
  for (const reason of ['full', 'dead', 'distant', 'height', 'wall']) {
    const { engine, state } = authority(7, reason === 'wall');
    const pickup = state.pickups[0];
    let staged = { ...state, pickups: [pickup], bodies: state.bodies.map(b => b.id !== 'a' ? b : { ...b, x: pickup.x + (reason === 'distant' ? 5 : 0), y: pickup.y + (reason === 'height' ? 4.6 : 0), z: pickup.z, flashlight: { on: false, charge: reason === 'full' ? 1 : 0.2 } }) };
    if (reason === 'dead') staged = engine.resolveDemonCatch(staged, 'a');
    const next = engine.tick(staged, 1 / 60, {});
    assert.equal(next.pickups.length, 1, reason);
    assert.equal(next.events.some(e => e.type === 'flashlight-pickup'), false, reason);
  }
});
