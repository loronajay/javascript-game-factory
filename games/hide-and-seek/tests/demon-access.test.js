const test = require('node:test');
const assert = require('node:assert/strict');
const maps = require('../map-catalog.js');
const demon = require('../demon-logic.js');
const enemy = require('../enemy-logic.js');
const movement = require('../movement-logic.js');
const fixtures = require('../fixtures-logic.js');
const base = require('./helpers/hotel-fixture.js');
const { buildPlan, createSpace } = require('./helpers/map-fixture.js');

for (const map of maps.playableMaps()) {
  test(`${map.id}: demons start clear of every hider and seeker seat`, () => {
    const plan = buildPlan(map.id);
    const players = [plan.spawns.seeker, ...plan.spawns.hiders];
    for (let seed = 1; seed <= 80; seed++) {
      const random = base.seededRandom(seed), taken = [];
      for (const entry of map.demons) {
        const spawn = demon.chooseDemonSpawn({ enemy, player: players[0], players, random, taken,
          navigation: plan.navigation, config: { floorCount: map.floorCount } });
        assert.ok(spawn, `${entry.id} has no safe start`);
        for (const player of players) {
          assert.ok(spawn.floor !== player.floor || Math.hypot(spawn.x - player.x, spawn.z - player.z) >= plan.navigation.minSpawnSeparation,
            `${entry.id} starts beside player ${JSON.stringify(player)} at ${JSON.stringify(spawn)}`);
        }
        for (const other of taken) assert.ok(spawn.floor !== other.floor
          || Math.hypot(spawn.x - other.x, spawn.z - other.z) >= plan.navigation.minSpawnSeparation);
        taken.push(spawn);
      }
    }
  });

  test(`${map.id}: a demon pursues through every room door from both sides`, () => {
    const plan = buildPlan(map.id), space = createSpace(plan);
    const catalog = fixtures.createFixtureCatalog(plan);
    const doors = catalog.filter(item => item.kind === 'door');
    const cfg = { ...fixtures.FIXTURE_DEFAULTS, elevatorCenterX: plan.elevator.centerX,
      elevatorCenterZ: plan.elevator.centerZ, elevatorFrontZ: plan.elevator.frontZ };
    const failures = [];
    for (const leaf of plan.roomDoors) {
      const alongZ = leaf.d > leaf.w;
      for (const direction of [-1, 1]) for (const offset of [0, -.6, .6]) {
        let state = fixtures.createFixtureState(catalog, { config: cfg });
        state.doors[leaf.id] = { ...state.doors[leaf.id], angle: 0, target: 0, open: false };
        fixtures.publishFixtures(state, { config: cfg, space });
        const point = (side, offset) => [2.5, 1.5, 1].map(distance => {
          const x = leaf.x + (alongZ ? side * distance : offset), z = leaf.z + (alongZ ? offset : side * distance);
          return { floor: leaf.floor, x, z, y: space.groundAt(x, z, base.floorY(leaf.floor)) };
        }).find(p => p.y !== null && !space.blocked(p.x, p.z, p.y, 2.05, .32));
        const start = point(direction, offset), end = point(-direction, -offset);
        assert.ok(start && end, `${leaf.id} has no clear approach in direction ${direction} offset ${offset}`);
        const target = { ...end, id: 'hider' };
        let hunter = demon.createDemon({ spawn: start });
        hunter.awareness = { ...enemy.createAwareness(), state: 'chase', targetId: target.id, lastSeen: target, searchRemaining: 9, pursuitRemaining: 5.5 };
        const ctx = { space, movement, enemy, navigation: plan.navigation, rooms: [], candidates: [target], huntCandidates: [],
          config: { ...demon.DEFAULTS, floorCount: map.floorCount }, random: () => 0,
          openDoorAhead(body, goal, options) {
            const door = demon.selectBlockingDoor(body, goal, doors.filter(d => !state.doors[d.id].open || state.doors[d.id].locked || Math.abs(state.doors[d.id].angle - d.openAngle) > .01));
            if (door) state = fixtures.forceDoorOpen(state, door, options);
            return !!door && state.doors[door.id].open && Math.abs(state.doors[door.id].angle - door.openAngle) > .01;
          } };
        hunter = demon.planRoute(hunter, target, 'chase', ctx);
        let reached = false;
        for (let tick = 0; tick < 60 * 20 && !reached; tick++) {
          hunter = demon.tickDemon(hunter, 1 / 60, ctx);
          state = fixtures.tickFixtures(state, 1 / 60, { config: cfg, space });
          reached = Math.hypot(hunter.x - target.x, hunter.z - target.z) < .8;
        }
        if (!reached) failures.push(`${leaf.id} direction ${direction}, offset ${offset}: ${hunter.x},${hunter.z} -> ${target.x},${target.z}; next ${JSON.stringify(hunter.route[0])}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  test(`${map.id}: an open elevator protects occupants but not the hallway`, () => {
    const plan = buildPlan(map.id), space = createSpace(plan), lift = plan.elevator;
    const facing = Math.sign(lift.frontZ - lift.centerZ);
    const occupant = { id: 'inside', x: lift.centerX, y: 0, z: lift.frontZ - facing * .3, floor: 1 };
    const outside = { ...occupant, id: 'outside', z: lift.frontZ + facing * .4 };
    let hunter = demon.createDemon({ spawn: outside });
    const config = { ...demon.DEFAULTS, elevator: lift, floorCount: map.floorCount };
    assert.deepEqual(demon.caughtBy(hunter, [occupant, outside], config, space), ['outside']);
    const ctx = { space, movement, enemy, config, navigation: plan.navigation, rooms: [], candidates: [occupant], huntCandidates: [] };
    assert.deepEqual(demon.planRoute(hunter, occupant, 'chase', ctx).route, []);
    hunter.route = [{ ...occupant, guided: false }];
    for (let i = 0; i < 60; i++) hunter = demon.tickDemon(hunter, 1 / 60, ctx);
    assert.ok((hunter.z - lift.frontZ) * facing >= 0, 'demon entered the cabin');
  });

  test(`${map.id}: eight-player authority starts without an immediate elimination`, () => {
    const plan = buildPlan(map.id);
    const players = [plan.spawns.seeker, ...plan.spawns.hiders.slice(0, 7)].map((spawn, i) => ({ id: `p${i}`, spawn }));
    for (const seed of [1, 11, 81]) {
      const { engine } = base.createFullSim({ hotel: plan, seed, config: {
        player: { ...base.SIM_CONFIG.player, floorCount: map.floorCount }, demons: map.demons,
      } });
      let state = engine.createState({ players, seekerId: 'p0' });
      for (let tick = 0; tick < 60; tick++) state = engine.tick(state, 1 / 60, {});
      assert.equal(state.round.phase, 'hiding');
      assert.ok(state.round.participants.every(p => p.alive), 'a player was caught during startup');
    }
  });
}

test('spawn fallback never relaxes player safety to separate demons', () => {
  const players = [{ floor: 1, x: 0, z: 0 }];
  const safe = { floor: 1, x: 30, z: 0 };
  const navigation = { spawnNodes: [players[0], safe], minSpawnSeparation: 24 };
  assert.equal(demon.chooseDemonSpawn({ enemy, players, taken: [safe], navigation, random: () => 0 }).x, 30);
  assert.throws(() => demon.chooseDemonSpawn({ enemy, players, navigation: { ...navigation, spawnNodes: players } }), /no demon start/);
});

test('hotel secret passages can be entered and exited by a pursuing demon', () => {
  const plan = buildPlan('grand-hotel'), space = createSpace(plan);
  const catalog = fixtures.createFixtureCatalog(plan), doors = catalog.filter(d => d.kind === 'door' || d.kind === 'panel');
  const failures = [];
  for (const tunnel of plan.secretTunnels) for (const roomId of tunnel.id.split('-').slice(0, 2)) {
    const room = plan.roomCenters.find(r => r.roomNumber === roomId);
    for (const reverse of [false, true]) {
      let state = fixtures.createFixtureState(catalog);
      // Room doors are already open, but the passage panel must be opened by the demon itself.
      for (const d of plan.roomDoors) state = fixtures.forceDoorOpen(state, catalog.find(c => c.id === d.id), { unlock: true });
      state = fixtures.tickFixtures(state, 1, { space });
      fixtures.publishFixtures(state, { space });
      const center = { floor: tunnel.floor, x: (tunnel.minX + tunnel.maxX) / 2, z: (tunnel.minZ + tunnel.maxZ) / 2 };
      const start = { ...(reverse ? center : room), y: base.floorY(room.floor) }, target = reverse ? room : center;
      let hunter = demon.createDemon({ spawn: start });
      const ctx = { space, movement, enemy, navigation: plan.navigation, rooms: [], candidates: [], huntCandidates: [],
        config: demon.DEFAULTS, openDoorAhead(body, goal, options) {
          const d = demon.selectBlockingDoor(body, goal, doors.filter(d => !state.doors[d.id].open || Math.abs(state.doors[d.id].angle - d.openAngle) > .01));
          if (d) state = fixtures.forceDoorOpen(state, d, options);
          return !!d && state.doors[d.id].open && Math.abs(state.doors[d.id].angle - d.openAngle) > .01;
        } };
      hunter = demon.planRoute(hunter, target, 'hunt', ctx);
      const planned = hunter.route;
      let reached = false;
      let nearest = Infinity;
      for (let tick = 0; tick < 60 * 30 && !reached; tick++) {
        hunter = demon.tickDemon(hunter, 1 / 60, ctx);
        state = fixtures.tickFixtures(state, 1 / 60, { space });
        reached = Math.hypot(hunter.x - target.x, hunter.z - target.z) < .5;
        nearest = Math.min(nearest, Math.hypot(hunter.x - target.x, hunter.z - target.z));
      }
      if (!reached) failures.push(`${roomId} ${reverse ? 'exit' : 'enter'}: ${hunter.x},${hunter.z}; nearest ${nearest}; route ${JSON.stringify(planned)}`);
    }
  }
  assert.deepEqual(failures, []);
});
