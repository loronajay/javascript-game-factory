const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./helpers/hospital-fixture.js');
const enemyLogic = require('../enemy-logic.js');
const movement = require('../movement-logic.js');
const sanityLogic = require('../sanity-logic.js');
const hiderLogic = require('../hider-logic.js');
const seekerLogic = require('../seeker-logic.js');
const demonLogic = require('../demon-logic.js');

async function runtime(plan = fixture.buildHospital()) {
  const THREE = await import('../vendor/three.module.js');
  const space = fixture.createSpace(plan, Object.fromEntries([...plan.swingDoors.map(d => [d.id, d.openAngle]), ...plan.hallDoors.map(d => [d.id, 1])]));
  const world = {
    space, state: { floorCount: plan.elevator.floors.length }, getPlan: () => plan, sightBlocked: (...args) => space.sightBlocked(...args),
    collections: { roomCenters: new Map(plan.roomCenters.map(r => [r.roomNumber, r])),
      roomDoors: new Map(plan.roomDoors.map(d => [d.roomNumber, { ...d, open: true }])), secretTunnels: [] },
  };
  const avatars = { spawn() {}, setPose() {}, remove() {}, setVisible() {} };
  return { THREE, plan, world, space, avatars, config: fixture.CONFIG, floorY: fixture.floorY, enemyLogic, movement, sanityLogic,
    avatarLogic: { ROLES: { HIDER: 'hider', SEEKER: 'seeker' } } };
}

test('eight CPU hiders start at the map spawns and physically settle inside departments', async () => {
  const context = await runtime();
  const { createHiders } = await import('../modules/hiders.js');
  const hiders = createHiders({ ...context, logic: hiderLogic, count: 8, tuning: hiderLogic.HIDER_DEFAULTS });
  const initial = hiders.list();
  for (let i = 0; i < initial.length; i++) {
    const actual = initial[i], spawn = context.plan.spawns.hiders[i];
    assert.deepEqual([actual.x, actual.y, actual.z], [spawn.x, spawn.y, spawn.z]);
  }
  for (let tick = 0; tick < 180 * 60; tick++) hiders.update(1 / 60, []);
  for (const hider of hiders.list()) {
    const room = context.world.collections.roomCenters.get(hider.spot);
    assert.equal(hider.state, 'hidden', `${hider.id} never reached cover`);
    assert.ok(Math.hypot(hider.x - room.x, hider.z - room.z) < 2.2);
    assert.equal(hider.floor, room.floor);
    assert.equal(context.space.blocked(hider.x, hider.z, hider.y), false);
  }
});

test('CPU hider teammates reserve the local hider spawn seat', async () => {
  const context = await runtime();
  const { createHiders } = await import('../modules/hiders.js');
  const hiders = createHiders({ ...context, logic: hiderLogic, count: 7, spawnOffset: 1 });
  assert.deepEqual(hiders.list().map(h => [h.x,h.y,h.z]), context.plan.spawns.hiders.slice(1).map(h => [h.x,h.y,h.z]));
});

test('the existing hotel seeker still exits bedrooms and reaches its next room', async () => {
  const plan = fixture.buildHotel();
  const context = await runtime(plan);
  const { createSeeker } = await import('../modules/seeker.js');
  const seeker = createSeeker({ ...context, logic: seekerLogic, tuning: seekerLogic.SEEKER_DEFAULTS });
  const rooms = plan.roomCenters.filter(r => !context.world.collections.roomDoors.get(r.roomNumber).locked).slice(0, 3);
  const visited = new Set();
  seeker.setHeld(false);
  for (let tick = 0; tick < 300 * 60; tick++) {
    seeker.update(1 / 60, []);
    const body = seeker.getState();
    for (const room of rooms) if (body.floor === room.floor && Math.hypot(body.x-room.x, body.z-room.z) < .5) visited.add(room.roomNumber);
  }
  assert.equal(visited.size, rooms.length);
});

test('the CPU seeker sweeps every department through the real map graph', async () => {
  const context = await runtime();
  const { createSeeker } = await import('../modules/seeker.js');
  const seeker = createSeeker({ ...context, logic: seekerLogic, tuning: seekerLogic.SEEKER_DEFAULTS });
  seeker.setHeld(false);
  const visited = new Set();
  for (let tick = 0; tick < 800 * 60 && visited.size < 14; tick++) {
    seeker.update(1 / 60, []);
    const body = seeker.getState();
    for (const room of context.plan.roomCenters) {
      if (body.floor === room.floor && Math.hypot(body.x - room.x, body.z - room.z) < .5) visited.add(room.roomNumber);
    }
  }
  assert.deepEqual([...visited].sort(), context.plan.roomCenters.map(r => r.roomNumber).sort());
});

test('a full-height demon physically visits every hospital department across both floors', async () => {
  const context = await runtime();
  const ctx = { ...context, enemy: enemyLogic, sanity: sanityLogic, candidates: [], huntCandidates: [],
    navigation: context.plan.navigation, rooms: context.plan.roomCenters, isRoomLocked: () => false,
    config: { ...demonLogic.DEFAULTS, floorCount: 2 } };
  let demon = demonLogic.createDemon({ id: 'surgeon', spawn: { ...context.plan.navigation.spawnNodes.at(-1), y: fixture.floorY(2) } });
  for (const room of context.plan.roomCenters) {
    demon = demonLogic.planRoute(demon, room, 'roam', ctx);
    for (let tick = 0; tick < 15000 && demon.route.length; tick++) demon = demonLogic.tickDemon(demon, 1 / 60, ctx);
    assert.equal(demon.route.length, 0, `demon cannot reach ${room.roomNumber}`);
    assert.equal(demon.floor, room.floor);
    assert.ok(Math.hypot(demon.x-room.x, demon.z-room.z) < .25);
    assert.equal(context.space.blocked(demon.x,demon.z,demon.y,2.25,.32), false);
  }
});
