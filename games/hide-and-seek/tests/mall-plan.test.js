const test = require('node:test');
const assert = require('node:assert/strict');

const fixture = require('./helpers/mall-fixture.js');
const enemy = require('../enemy-logic.js');
const roundLogic = require('../round-logic.js');
const maps = require('../map-catalog.js');

// Cinder Mall.
//
// The point of these is not that the plan has the right field names — MAP_AUTHORING.md lists those
// and a typo would fail loudly anyway. The point is that the building is *playable*: that a body can
// stand where the plan says it spawns, that both levels can be reached from each other, that the
// demons can route to anywhere they might want to go, and that a whole round ticks in it without a
// renderer in the process.

const TICK = 1 / 60;
const mall = fixture.buildMall();

test('the mall is data, with no renderer anywhere in it', () => {
  const raw = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'mall-plan.js'), 'utf8');
  // Comments may name a renderer — the file's own header explains what it was grown out of. The rule
  // is about what the module *does*, so strip the prose before looking.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const forbidden of ['THREE', 'Mesh', 'Geometry', 'Material', 'document']) {
    assert.doesNotMatch(source, new RegExp(`\\b${forbidden}\\b`), `mall-plan.js must not mention ${forbidden}`);
  }
});

test('every number the plan publishes is finite', () => {
  const walk = (value, path) => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${path} is not finite`);
    else if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
    else if (value && typeof value === 'object') for (const key of Object.keys(value)) walk(value[key], `${path}.${key}`);
  };
  walk(mall, 'mall');
});

test('every spawn is somewhere a body can actually stand', () => {
  const space = fixture.createSpace(mall);
  const places = [mall.spawns.seeker, ...mall.spawns.hiders];
  for (const spawn of places) {
    const ground = space.groundAt(spawn.x, spawn.z, spawn.y);
    assert.ok(ground !== null, `nothing to stand on at (${spawn.x}, ${spawn.z}) on floor ${spawn.floor}`);
    assert.ok(Math.abs(ground - spawn.y) < 0.75, `spawn at (${spawn.x}, ${spawn.z}) is not on its own floor`);
    assert.equal(space.blocked(spawn.x, spawn.z, ground), false, `spawn at (${spawn.x}, ${spawn.z}) is inside something`);
  }
});

test('the hiders are spread over both levels', () => {
  const floors = new Set(mall.spawns.hiders.map((spawn) => spawn.floor));
  assert.deepEqual([...floors].sort(), [1, 2]);
  // Eight of them, because the lobby seats up to eight and a spawn per seat beats stacking bodies.
  assert.ok(mall.spawns.hiders.length >= 8, 'a 2-8 player lobby needs a spawn for every seat');
});

test('the atrium is a real void: the upper gallery is a ring, not a slab', () => {
  const space = fixture.createSpace(mall);
  const upper = fixture.floorY(2);
  // Over the middle of the atrium there is no upper floor to stand on.
  assert.equal(space.groundAt(0, 0, upper), null, 'the atrium void has an upper floor over it');
  // On the gallery around it, there is.
  for (const [x, z] of [[0, -18], [-20, 0], [20, 0], [0, 20]]) {
    assert.ok(space.groundAt(x, z, upper) !== null, `the upper gallery is missing at (${x}, ${z})`);
  }
});

test('both levels are reachable from each other on foot', () => {
  const space = fixture.createSpace(mall);
  // The escalator run and the service stair flights are the two ways up. Walk each one in small
  // steps and check the ground climbs with you rather than dropping out from under the body.
  const escalator = mall.surfaces.find((surface) => surface.kind === 'ramp' && surface.minX < 6 && surface.maxX > 0);
  assert.ok(escalator, 'the escalators are missing');
  let feet = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const z = escalator.startZ + (escalator.endZ - escalator.startZ) * t;
    const ground = space.groundAt((escalator.minX + escalator.maxX) / 2, z, feet);
    assert.ok(ground !== null, `the escalator has no surface at t=${t.toFixed(2)}`);
    feet = ground;
  }
  assert.ok(Math.abs(feet - fixture.floorY(2)) < 0.3, `the escalator ends at ${feet}, not the upper gallery`);
});

test('the demons can route to every store, on either level', () => {
  const navigator = enemy.createNavigator(mall.navigation);
  for (const room of mall.roomCenters) {
    const route = navigator.planFloorRoute({
      from: { x: 0, z: -18 }, target: { x: room.x, z: room.z },
      fromFloor: 1, toFloor: room.floor, floorHeight: fixture.CONFIG.floorHeight,
    });
    assert.ok(route.length > 0, `no route to ${room.roomNumber}`);
    const last = route.at(-1);
    assert.ok(Math.hypot(last.x - room.x, last.z - room.z) < 0.001, `the route to ${room.roomNumber} does not arrive`);
    if (room.floor !== 1) {
      assert.ok(route.some((step) => step.stair), `the route to ${room.roomNumber} changes floor without taking any stairs`);
    }
  }
});

test('a routed body can physically reach every shop from the concourse', () => {
  const movement = require('../movement-logic.js');
  const space = fixture.createSpace(mall, Object.fromEntries(mall.swingDoors.map(d => [d.id, d.openAngle])));
  const navigator = enemy.createNavigator(mall.navigation);
  for (const room of mall.roomCenters) {
    let body = { x: 0, z: -18, y: 0 };
    const route = navigator.planFloorRoute({ from: body, target: room, fromFloor: 1, toFloor: room.floor, floorHeight: fixture.CONFIG.floorHeight });
    for (const target of route) {
      let arrived = false;
      for (let i = 0; i < 1600; i++) {
        const next = movement.stepToward(space, { radius: 0.34, height: 1.78 }, body, target,
          { speed: 4, delta: 1 / 30, arriveRadius: 0.03, guided: target.guided });
        body = next;
        if (next.arrived) { arrived = true; break; }
        if (next.blocked) break;
      }
      assert.ok(arrived, `${room.roomNumber}: stuck en route to ${target.x}, ${target.z} from ${body.x}, ${body.z}`);
    }
    assert.ok(Math.hypot(body.x - room.x, body.z - room.z) < 0.05);
  }
});

test('the navigation graph is one connected loop per level, not islands', () => {
  const byFloor = new Map();
  for (const node of mall.navigation.nodes) {
    if (!byFloor.has(node.floor)) byFloor.set(node.floor, new Set());
    byFloor.get(node.floor).add(node.id);
  }
  const links = new Map(mall.navigation.nodes.map((node) => [node.id, []]));
  for (const [a, b] of mall.navigation.edges) { links.get(a).push(b); links.get(b).push(a); }
  for (const [floor, ids] of byFloor) {
    const seen = new Set();
    const queue = [[...ids][0]];
    while (queue.length) {
      const id = queue.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of links.get(id)) if (ids.has(next)) queue.push(next);
    }
    assert.equal(seen.size, ids.size, `level ${floor} has ${ids.size - seen.size} waypoints nothing can walk to`);
  }
});

test('three demons open apart in a two-level building', () => {
  const { engine } = fixture.createFullSim();
  const state = engine.createState({
    players: [
      { id: 'seeker', spawn: mall.spawns.seeker },
      ...mall.spawns.hiders.slice(0, 3).map((spawn, index) => ({ id: `hider-${index}`, spawn })),
    ],
    seekerId: 'seeker',
  });
  assert.equal(state.demons.length, 3);
  assert.deepEqual(state.demons.map((entry) => entry.name), ['The Greeter', 'The Custodian', 'The Nightwatch']);
  for (let i = 0; i < state.demons.length; i += 1) {
    for (let j = i + 1; j < state.demons.length; j += 1) {
      const apart = Math.hypot(state.demons[i].x - state.demons[j].x, state.demons[i].z - state.demons[j].z);
      const levelsApart = Math.abs(state.demons[i].y - state.demons[j].y) > 1;
      assert.ok(apart > 12 || levelsApart, `two demons opened ${apart.toFixed(1)}m apart on one level`);
    }
  }
});

test('a whole round ticks in the mall with no renderer in the process', () => {
  const { engine } = fixture.createFullSim();
  const players = [
    { id: 'seeker', spawn: mall.spawns.seeker },
    ...mall.spawns.hiders.slice(0, 4).map((spawn, index) => ({ id: `hider-${index}`, spawn })),
  ];
  let state = engine.createState({ players, seekerId: 'seeker' });
  const walking = { forward: 1, strafe: 0, yaw: 0, crouch: false, sprint: false, light: false };
  const inputs = Object.fromEntries(players.map((player) => [player.id, walking]));

  for (let tick = 0; tick < 60 * 50; tick += 1) state = engine.tick(state, TICK, inputs);

  // Nothing is required to have *happened* — the round may still be running, someone may have been
  // caught. What must hold is that fifty seconds of a real building did not put a body through a
  // wall, out of the world, or into a floor that does not exist.
  for (const body of state.bodies) {
    assert.ok(Number.isFinite(body.x) && Number.isFinite(body.y) && Number.isFinite(body.z), `${body.id} left the number line`);
    assert.ok(Math.abs(body.x) <= 50 && Math.abs(body.z) <= 40, `${body.id} walked outside the building`);
    assert.ok(body.y >= -0.5 && body.y <= fixture.floorY(2) + 0.5, `${body.id} is on a floor the mall does not have`);
    assert.ok(body.floor >= 1 && body.floor <= maps.floorCountFor(fixture.MAP_ID), `${body.id} is on floor ${body.floor}`);
  }
  assert.ok(state.round.phase === roundLogic.PHASES.SEEKING || state.round.phase === roundLogic.PHASES.ENDED);
});

test('the mall carries its own lift, and it opens toward the concourse', () => {
  assert.deepEqual(mall.elevator.floors, [1, 2]);
  assert.equal(mall.elevator.centerX, 34);
  assert.equal(mall.elevator.centerZ, -29);
  assert.equal(mall.elevator.frontZ, -26.9, 'the reference lift opens north into the south concourse');
  assert.equal(mall.hallDoors.length, 4, 'two leaves per level');
});

test('reference shopfronts are glazed, with all twenty public openings intact', () => {
  assert.equal(mall.storeEntries.length, 20);
  assert.ok(mall.boxes.filter(box => box.material === 'glass' && box.collider).length >= 20);
  const openings = Object.fromEntries(mall.swingDoors.map(door => [door.id, door.openAngle]));
  const space = fixture.createSpace(mall, openings);
  for (const entry of mall.storeEntries) {
    for (const lateral of [-0.42, 0, 0.42]) {
      for (let distance = -1.8; distance <= 0.9; distance += 0.2) {
        const x = entry.axis === 'x' ? entry.center + lateral : entry.fixed + entry.outward * distance;
        const z = entry.axis === 'x' ? entry.fixed + entry.outward * distance : entry.center + lateral;
        const y = fixture.floorY(entry.floor);
        assert.equal(space.groundAt(x, z, y), y, `${entry.name}: missing threshold`);
        assert.equal(space.blocked(x, z, y), false, `${entry.name}: blocked entrance ${entry.center} at ${x}, ${z}`);
      }
    }
  }
});

test('each vertical route exits on its own landing without doubling back or visiting hotel coordinates', () => {
  for (const connector of mall.navigation.connectors) for (const [fromFloor, toFloor] of [[1, 2], [2, 1]]) {
    const route = enemy.createStairRoute({ fromFloor, toFloor, floorHeight: fixture.CONFIG.floorHeight,
      stairLayout: connector.layout, approach: connector.approach, approaches: connector.approaches });
    assert.ok(route.every(p => Math.abs(p.z) <= 36), `${connector.id} routed out of the mall`);
    const sign = toFloor > fromFloor ? 1 : -1;
    for (let i = 1; i < route.length; i++) assert.ok((route[i].y - route[i - 1].y) * sign >= 0, 'a straight escalator doubles back');
    const end = connector.approaches?.[toFloor] || connector.approach;
    assert.deepEqual({ x: route.at(-1).x, z: route.at(-1).z }, end);
  }
});

test('a demon can pursue a player halfway up either escalator without a missing second flight', () => {
  const connector = mall.navigation.connectors.find(c => c.id === 'escalators');
  const route = enemy.createStairPursuitRoute({
    enemy: { x: 2, z: 8.5, y: 0, floor: 1 }, target: { x: 2, z: -2, y: fixture.floorY(2) / 2 },
    floorHeight: fixture.CONFIG.floorHeight, stairLayout: connector.layout, approach: connector.approach,
  });
  assert.ok(route.length > 1);
  assert.equal(route[0].x, 2);
  assert.ok(route.every(p => Number.isFinite(p.y) && p.y <= fixture.floorY(2) / 2));
});

test('inspection views are authored by the map and stand in clear playable spaces', () => {
  const space = fixture.createSpace(mall, Object.fromEntries(mall.swingDoors.map(d => [d.id, d.openAngle])));
  for (const view of Object.values(mall.inspectionViews)) {
    const feet = view.y - 1.62;
    assert.equal(space.groundAt(view.x, view.z, feet), feet);
    assert.equal(space.blocked(view.x, view.z, feet), false);
  }
});

test('a shop uses its actual bounds for heat without filling the concourse outside its glass', () => {
  const heat = require('../heat-logic.js');
  const zones = mall.roomCenters.map(room => ({ ...room, id: room.roomNumber, kind: 'room' }));
  assert.deepEqual(heat.locateZone(zones, { floor: 1, x: -36, z: -15 }), { id: '101', kind: 'room' });
  assert.equal(heat.locateZone(zones, { floor: 1, x: -23, z: 8 }).kind, 'hallway');
});

test('the atrium has no low ceiling, and the fountain and shop-specific interiors match the reference', () => {
  assert.equal(mall.boxes.some(b => b.kind === 'ceiling' && b.floor === 1
    && Math.abs(b.x) < b.w / 2 && Math.abs(b.z) < b.d / 2), false);
  const count = type => mall.furnishings.filter(p => p.type === type).length;
  assert.equal(count('fountain'), 1);
  assert.equal(count('rack'), 12);
  assert.equal(count('table'), 6);
  assert.equal(count('arcade'), 15);
  assert.equal(count('display-bed'), 4);
  assert.equal(count('toy-display'), 4);
  assert.equal(count('bookcase'), 4);
  assert.equal(count('cinema-seat'), 30);
  assert.equal(count('cinema-screen'), 2);
  assert.equal(count('bed'), 0, 'hotel beds do not belong in the shops');
  assert.equal(mall.stairs.treads.filter(t => t.rotationX && t.material === 'metal').length, 2, 'escalators need solid inclined decks');
  assert.ok(mall.boxes.filter(b => b.kind === 'slab' && b.floor === 1 && b.material === 'carpetRed').every(b => b.localY + b.h / 2 > 0), 'shop floor finishes must not z-fight the concourse slab');
});

test('furniture is solid and every authored navigation edge is walkable', () => {
  const openings = Object.fromEntries(mall.swingDoors.map(door => [door.id, door.openAngle]));
  const space = fixture.createSpace(mall, openings);
  for (const type of ['rack', 'arcade', 'bookcase', 'cinema-seat', 'table', 'fountain']) {
    const p = mall.furnishings.find(p => p.type === type);
    assert.ok(p, `missing ${type}`);
    assert.equal(space.blocked(p.x, p.z, p.y), true, `${type} is only scenery`);
  }
  const nodes = new Map(mall.navigation.nodes.map(n => [n.id, n]));
  for (const [a, b] of mall.navigation.edges) {
    const from = nodes.get(a), to = nodes.get(b);
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.2);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const y = fixture.floorY(from.floor);
      assert.equal(space.blocked(x, z, y), false, `${a} -> ${b} crosses a solid at ${x}, ${z}`);
      assert.equal(space.groundAt(x, z, y), y, `${a} -> ${b} crosses a void or ramp`);
    }
  }
  for (const p of [...mall.roomCenters, ...mall.navigation.spawnNodes]) {
    assert.equal(space.blocked(p.x, p.z, fixture.floorY(p.floor)), false, `target/spawn obstructed at ${p.x}, ${p.z}`);
  }
});

test('the cinema projection refuge is inside the shell and reachable from both auditoriums', () => {
  const tunnel = mall.secretTunnels.find(t => t.floor === 2);
  assert.deepEqual([tunnel.minX, tunnel.maxX, tunnel.minZ, tunnel.maxZ], [20.2, 37.8, 31.7, 35]);
  const space = fixture.createSpace(mall);
  for (const x of [23, 32, 36.7]) for (let z = 31.2; z <= 34.2; z += 0.2) {
    assert.equal(space.groundAt(x, z, fixture.floorY(2)), fixture.floorY(2));
    assert.equal(space.blocked(x, z, fixture.floorY(2)), false, `projection entrance ${x} blocked at ${z}`);
  }
});

test('lift call buttons, upper shaft opening and sill are part of the plan', () => {
  assert.equal(mall.boxes.filter(b => b.kind === 'call-button').length, 2);
  const space = fixture.createSpace(mall, Object.fromEntries(mall.hallDoors.map(d => [d.id, 1])));
  assert.equal(space.groundAt(34, -29, fixture.floorY(2)), null, 'upper shaft must not be filled by a slab');
  for (const floor of [1, 2]) for (let z = -26.4; z >= -27.45; z -= 0.1) {
    assert.equal(space.groundAt(34, z, fixture.floorY(floor)), fixture.floorY(floor), `lift sill missing on ${floor} at ${z}`);
    assert.equal(space.blocked(34, z, fixture.floorY(floor)), false);
  }
});

test('the service corridors drain heat, and the stores fill it', () => {
  assert.equal(mall.secretTunnels.length, 2);
  for (const tunnel of mall.secretTunnels) assert.equal(tunnel.kind, 'tunnel');
  // Every store is a room the meter can fill in and the hunter can walk to.
  assert.ok(mall.roomCenters.length >= 12);
  const doors = new Set(mall.roomDoors.map((door) => door.roomNumber));
  for (const room of mall.roomCenters) {
    assert.ok(doors.has(room.roomNumber), `${room.roomNumber} has no door, so nothing will ever patrol into it`);
  }
});

test('each level hides its own master key behind a locked door', () => {
  const keys = mall.furnishings.filter((entry) => entry.keyId);
  assert.equal(keys.length, 2, 'one master key per level');
  const locked = mall.roomDoors.filter((door) => door.locked);
  assert.ok(locked.length >= 3, 'a key with nothing to unlock is not a key');
  for (const door of locked) {
    assert.ok(keys.some((entry) => entry.keyId === door.requiredKey), `nothing in the mall opens ${door.roomNumber}`);
  }
});

test('a patrolling demon walks the mall, not the hotel it is not in', () => {
  const demonLogic = require('../demon-logic.js');
  const nav = mall.navigation;
  // Every waypoint the roam picker can hand back has to be a point in this building. The fallback is
  // the hotel's corridor Z values, which reach z=-52 and z=49 — outside the mall's shell entirely.
  const picked = [];
  const ctx = {
    enemy: {
      chooseRoamTarget: ({ hallTargets }) => { picked.push(...hallTargets); return null; },
    },
    rooms: [], navigation: nav, isRoomLocked: () => true,
    config: { floorHeight: fixture.CONFIG.floorHeight, floorCount: 2, roomChance: 0 },
    random: () => 0.5,
  };
  demonLogic.choosePatrol({ x: 0, y: 0, z: 0 }, ctx);
  assert.ok(picked.length > 0);
  for (const point of picked) {
    assert.ok(Math.abs(point.x) <= 48 && Math.abs(point.z) <= 36, `patrol target (${point.x}, ${point.z}) is outside the mall`);
    assert.ok(point.floor >= 1 && point.floor <= 2, `patrol target is on floor ${point.floor}`);
  }
});
