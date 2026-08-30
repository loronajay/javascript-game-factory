const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('./helpers/hospital-fixture.js');
const enemy = require('../enemy-logic.js');
const movement = require('../movement-logic.js');
const maps = require('../map-catalog.js');
const preview = require('../map-preview.js');
const hospital = fixture.buildHospital();
const openings = Object.fromEntries([...hospital.swingDoors.map(d => [d.id, d.openAngle]), ...hospital.hallDoors.map(d => [d.id, 1])]);
const space = fixture.createSpace(hospital, openings);
const navigator = enemy.createNavigator(hospital.navigation);

function walk(from, target, radius = 0.34) {
  let body = { ...from, y: fixture.floorY(from.floor) };
  const route = navigator.planFloorRoute({ from, target, fromFloor: from.floor, toFloor: target.floor, floorHeight: fixture.CONFIG.floorHeight });
  for (const waypoint of route) {
    let arrived = false;
    for (let i = 0; i < 2000; i++) {
      body = movement.stepToward(space, { radius, height: 1.78 }, body, waypoint,
        { speed: 4, delta: 1 / 30, arriveRadius: 0.03, guided: waypoint.guided });
      if (body.arrived) { arrived = true; break; }
      if (body.blocked) break;
    }
    assert.ok(arrived, `from ${from.roomNumber || 'spawn'} to ${target.roomNumber}: blocked at ${body.x},${body.y},${body.z} aiming for ${waypoint.x},${waypoint.y},${waypoint.z}`);
  }
  assert.ok(Math.hypot(body.x - target.x, body.z - target.z) < 0.05);
  assert.ok(Math.abs(body.y - fixture.floorY(target.floor)) < 0.05);
}

test('Mercy is a pure two-floor building with the reference departments and its own staff', () => {
  assert.equal(maps.playableMapId(fixture.MAP_ID), fixture.MAP_ID);
  assert.equal(maps.floorCountFor(fixture.MAP_ID), 2);
  assert.deepEqual(maps.demonRosterFor(fixture.MAP_ID).map(d => d.name), ['The Surgeon', 'The Matron', 'The Orderly']);
  assert.equal(hospital.roomCenters.length, 14);
  assert.deepEqual(preview.createMapPreview(hospital).map(p => p.floor), [1, 2]);
  const source = fs.readFileSync(path.join(__dirname, '../hospital-plan.js'), 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\b(THREE|document|Mesh)\b/);
  const visit = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(hospital);
});

test('every player/demon spawn and department target has clear footing', () => {
  assert.ok(hospital.spawns.hiders.length >= 8);
  for (const point of [hospital.spawns.seeker, ...hospital.spawns.hiders, ...hospital.navigation.spawnNodes, ...hospital.roomCenters]) {
    const y = fixture.floorY(point.floor);
    assert.equal(space.groundAt(point.x, point.z, y), y, `no floor at ${point.x},${point.z}`);
    assert.equal(space.blocked(point.x, point.z, y), false, `blocked target ${point.roomNumber || ''} at ${point.x},${point.z}`);
  }
});

test('hospital demons never open on a player spawn, including the solo hider seat', () => {
  for (const demon of hospital.navigation.spawnNodes) for (const player of [hospital.spawns.seeker, ...hospital.spawns.hiders]) {
    if (demon.floor === player.floor) assert.ok(Math.hypot(demon.x - player.x, demon.z - player.z) >= 12, `demon opens on player at ${player.x},${player.z}`);
  }
});

test('map boot places the actual camera and feet at an authored spawn, not the hotel wall coordinate', async () => {
  const { placeAtMapSpawn } = await import('../modules/map-session.js');
  const camera = { position: { x: 0, y: 1.62, z: 32, set(x,y,z) { Object.assign(this,{x,y,z}); } }, rotation: { x: 0, y: 0 } };
  const world = { state: {} };
  placeAtMapSpawn({ camera, world, spawn: hospital.spawns.seeker, eyeHeight: 1.62 });
  assert.equal(camera.position.x, hospital.spawns.seeker.x);
  assert.equal(camera.position.z, hospital.spawns.seeker.z);
  assert.equal(world.state.playerFeetY, hospital.spawns.seeker.y);
  assert.equal(world.state.playerFloor, 1);
  assert.equal(space.blocked(camera.position.x, camera.position.z, world.state.playerFeetY), false);
});

test('the entire navigation graph is connected per floor and every edge is physically clear', () => {
  const nodes = new Map(hospital.navigation.nodes.map(n => [n.id, n]));
  const links = new Map([...nodes.keys()].map(id => [id, []]));
  for (const [a, b] of hospital.navigation.edges) {
    const from = nodes.get(a), to = nodes.get(b);
    assert.ok(from && to);
    assert.equal(from.floor, to.floor);
    links.get(a).push(b); links.get(b).push(a);
    const count = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.2);
    for (let i = 0; i <= count; i++) {
      const t = count ? i / count : 0, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      const y = fixture.floorY(from.floor);
      assert.equal(space.blocked(x, z, y), false, `${a} -> ${b} obstructed at ${x},${z}`);
      assert.equal(space.groundAt(x, z, y), y, `${a} -> ${b} crosses a void`);
    }
  }
  for (const floor of [1, 2]) {
    const ids = [...nodes.values()].filter(n => n.floor === floor).map(n => n.id);
    const seen = new Set(), queue = [ids[0]];
    while (queue.length) { const id = queue.pop(); if (seen.has(id)) continue; seen.add(id); queue.push(...links.get(id)); }
    assert.equal(seen.size, ids.length);
  }
});

test('CPUs can walk into and out of all departments and between floors', () => {
  for (const from of [hospital.spawns.seeker, ...hospital.roomCenters]) {
    for (const target of hospital.roomCenters) walk(from, target);
  }
});

test('stairs are continuous walk surfaces in both directions, with clear thresholds', () => {
  const connector = hospital.navigation.connectors[0];
  for (const [fromFloor, toFloor] of [[1, 2], [2, 1]]) {
    const route = enemy.createStairRoute({ fromFloor, toFloor, floorHeight: fixture.CONFIG.floorHeight, stairLayout: connector.layout, approach: connector.approach });
    let feet = fixture.floorY(fromFloor);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.08);
      for (let j = 0; j <= count; j++) {
        const t = count ? j / count : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const y = space.groundAt(x, z, feet);
        assert.notEqual(y, null, `stair gap at ${x},${z},${feet}`);
        assert.equal(space.blocked(x, z, y), false);
        feet = y;
      }
    }
    assert.ok(Math.abs(feet - fixture.floorY(toFloor)) < 0.05);
  }
});

test('department bounds fill heat inside the actual room, not the corridors', () => {
  const heat = require('../heat-logic.js');
  const zones = hospital.roomCenters.map(r => ({ ...r, id: r.roomNumber, kind: 'room' }));
  assert.equal(heat.locateZone(zones, { floor: 1, x: -40, z: -29 }).id, '101');
  assert.equal(heat.locateZone(zones, { floor: 1, x: -25, z: -18 }).kind, 'hallway');
});

test('lift calls, hall doors, upper shaft void and inspection spawns are usable', () => {
  assert.equal(hospital.spawns.seeker.x, hospital.elevator.centerX);
  assert.ok(Math.abs(hospital.spawns.seeker.z - hospital.elevator.centerZ) < 1);
  assert.equal(hospital.boxes.filter(b => b.kind === 'call-button').length, 2);
  assert.equal(hospital.hallDoors.length, 4);
  const liftSpace = fixture.createSpace(hospital, { ...openings, ...Object.fromEntries(hospital.hallDoors.map(d => [d.id, 1])) });
  liftSpace.setDynamicHeight('elevator-car', 0);
  assert.equal(liftSpace.groundAt(35.5, 27.5, fixture.floorY(2)), null);
  for (let z = 24.8; z <= 27.5; z += 0.1) {
    assert.equal(liftSpace.groundAt(35.5, z, 0), 0);
    assert.equal(liftSpace.blocked(35.5, z, 0), false);
  }
  assert.ok(hospital.inspectionViews?.lobby);
  for (const p of Object.values(hospital.inspectionViews)) {
    assert.equal(space.blocked(p.x, p.z, p.y - 1.62), false);
    assert.equal(space.groundAt(p.x, p.z, p.y - 1.62), p.y - 1.62);
  }
});

test('the hospital boots in the browser and is included in the authority mirror', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /src="hospital-plan\.js/);
  const { MIRRORED_FILES } = await import('../tools/mirror-sim.mjs');
  assert.ok(MIRRORED_FILES.includes('hospital-plan.js'));
});
