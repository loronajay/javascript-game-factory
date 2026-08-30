// The CPU bodies, run in every registered map rather than in the one they were written for.
//
// The hotel was the only building for a long time, and the AI paid for that in arithmetic: a
// corridor spine at x=0, a list of patrol Z values, a dogleg to the doorway. Each map now publishes
// its own navigation graph and its own spawn seats, and these tests are the standing proof that the
// demons, the CPU seeker and the CPU hiders read them — every one of them iterates the catalog, so
// a fourth map is covered the day its row is added, not the day somebody writes it a test.
const test = require('node:test');
const assert = require('node:assert/strict');
const maps = require('../map-catalog.js');
const { mapRuntime } = require('./helpers/map-fixture.js');
const hiderLogic = require('../hider-logic.js');
const seekerLogic = require('../seeker-logic.js');
const demonLogic = require('../demon-logic.js');
const enemyLogic = require('../enemy-logic.js');

const PLAYABLE = maps.playableMaps();

function demonContext(context) {
  return {
    space: context.space,
    movement: context.movement,
    enemy: enemyLogic,
    candidates: [],
    huntCandidates: [],
    navigation: context.plan.navigation,
    rooms: context.plan.roomCenters,
    isRoomLocked: () => false,
    openDoor: () => {},
    config: { ...demonLogic.DEFAULTS, floorCount: maps.floorCountFor(context.mapId) },
  };
}

test('every playable map publishes navigation of its own, standing in its own building', async () => {
  for (const map of PLAYABLE) {
    const { plan, space } = await mapRuntime(map.id);
    const navigation = plan.navigation;
    assert.ok(navigation && navigation.nodes.length > 1, `${map.id} publishes no waypoints`);
    assert.ok(navigation.edges.length > 0, `${map.id} publishes no edges`);
    assert.ok(navigation.connectors.length > 0, `${map.id} publishes no vertical connectors`);
    assert.ok(navigation.spawnNodes && navigation.spawnNodes.length >= map.demons.length,
      `${map.id} has fewer demon spawn nodes than demons`);
    for (const node of [...navigation.nodes, ...navigation.spawnNodes]) {
      assert.ok(node.floor >= 1 && node.floor <= map.floorCount, `${map.id} waypoint is on floor ${node.floor}`);
      assert.equal(space.blocked(node.x, node.z, (node.floor - 1) * 4.6 + 0.05), false,
        `${map.id} waypoint (${node.x}, ${node.z}) is inside geometry`);
    }
  }
});

test('a patrolling demon is only ever sent to waypoints and rooms of the map it is in', async () => {
  for (const map of PLAYABLE) {
    const context = await mapRuntime(map.id);
    const ctx = { ...demonContext(context), random: (() => { let n = 0; return () => (n = (n * 9301 + 49297) % 233280 / 233280); })() };
    const nodes = new Set(context.plan.navigation.nodes.map((node) => `${node.floor}:${node.x.toFixed(3)}:${node.z.toFixed(3)}`));
    const rooms = new Set(context.plan.roomCenters.map((room) => `${room.floor}:${room.x.toFixed(3)}:${room.z.toFixed(3)}`));
    let demon = demonLogic.createDemon({ id: 'patrol', spawn: { ...context.plan.spawns.seeker, floor: context.plan.spawns.seeker.floor || 1 } });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      demon = demonLogic.choosePatrol(demon, ctx);
      const destination = demon.route.at(-1);
      if (!destination) continue;
      const key = `${destination.floor}:${destination.x.toFixed(3)}:${destination.z.toFixed(3)}`;
      assert.ok(nodes.has(key) || rooms.has(key),
        `${map.id}: patrol destination ${key} is not on this map's graph — the demon fell back to hotel coordinates`);
    }
  }
});

test('a demon physically reaches every room of every map', async () => {
  for (const map of PLAYABLE) {
    const context = await mapRuntime(map.id);
    const ctx = demonContext(context);
    const spawn = context.plan.navigation.spawnNodes[0];
    let demon = demonLogic.createDemon({ id: 'router', spawn: { x: spawn.x, y: (spawn.floor - 1) * 4.6, z: spawn.z, floor: spawn.floor } });
    for (const room of context.plan.roomCenters) {
      demon = demonLogic.planRoute(demon, room, 'roam', ctx);
      // Arriving is the assertion, not an emptied route: `tickDemon` picks a fresh patrol the moment
      // the last waypoint is consumed, so a route that has gone empty has usually already refilled.
      let reached = false;
      for (let tick = 0; tick < 20000 && !reached; tick += 1) {
        demon = demonLogic.tickDemon(demon, 1 / 60, ctx);
        reached = demon.floor === room.floor && Math.hypot(demon.x - room.x, demon.z - room.z) < 1.2;
      }
      assert.ok(reached, `${map.id}: demon cannot reach ${room.roomNumber}`);
    }
  }
});

test('CPU hiders start on their map\'s own seats and settle inside its rooms', async () => {
  for (const map of PLAYABLE) {
    const context = await mapRuntime(map.id);
    const { createHiders } = await import('../modules/hiders.js');
    const hiders = createHiders({ ...context, logic: hiderLogic, tuning: hiderLogic.HIDER_DEFAULTS, count: 8 });
    const seats = context.plan.spawns.hiders;
    hiders.list().forEach((hider, index) => {
      const seat = seats[index % seats.length];
      assert.deepEqual([hider.x, hider.y, hider.z], [seat.x, seat.y, seat.z], `${map.id}: hider ${index} did not take its map seat`);
    });
    for (let tick = 0; tick < 180 * 60; tick += 1) hiders.update(1 / 60, []);
    for (const hider of hiders.list()) {
      const room = context.world.collections.roomCenters.get(hider.spot);
      assert.equal(hider.state, 'hidden', `${map.id}: ${hider.id} never reached cover`);
      assert.ok(room && Math.hypot(hider.x - room.x, hider.z - room.z) < 2.2, `${map.id}: ${hider.id} is not in its room`);
      assert.equal(hider.floor, room.floor, `${map.id}: ${hider.id} is on the wrong floor`);
      assert.equal(context.space.blocked(hider.x, hider.z, hider.y), false, `${map.id}: ${hider.id} settled inside geometry`);
    }
  }
});

test('the CPU seeker sweeps rooms on every map through that map\'s own graph', async () => {
  for (const map of PLAYABLE) {
    const context = await mapRuntime(map.id);
    const { createSeeker } = await import('../modules/seeker.js');
    const seeker = createSeeker({ ...context, logic: seekerLogic, tuning: seekerLogic.SEEKER_DEFAULTS });
    seeker.setHeld(false);
    // Unlocked rooms only: a locked door is a key the seeker does not have, and skipping it is the
    // rule rather than a navigation failure.
    const wanted = context.plan.roomCenters
      .filter((room) => !context.world.collections.roomDoors.get(room.roomNumber)?.locked)
      .slice(0, 4);
    const visited = new Set();
    for (let tick = 0; tick < 900 * 60 && visited.size < wanted.length; tick += 1) {
      seeker.update(1 / 60, []);
      const body = seeker.getState();
      for (const room of wanted) {
        if (body.floor === room.floor && Math.hypot(body.x - room.x, body.z - room.z) < 0.6) visited.add(room.roomNumber);
      }
    }
    assert.equal(visited.size, wanted.length, `${map.id}: the seeker reached ${visited.size} of ${wanted.length} rooms`);
  }
});
