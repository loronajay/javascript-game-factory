const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = require('./helpers/hotel-fixture.js');
const maps = require('../map-catalog.js');
require('../cinema-plan.js');
const { buildPlan, createSpace } = require('./helpers/map-fixture.js');
const enemy = require('../enemy-logic.js');
const movement = require('../movement-logic.js');
const preview = require('../map-preview.js');
const plan = buildPlan('crowne-point-cinema');
const space = createSpace(plan);
const navigator = enemy.createNavigator(plan.navigation, { space });
const feet = p => space.groundAt(p.x, p.z, base.floorY(p.floor));

function walk(from, target, radius = 0.46) {
  let body = { ...from, y: feet(from) };
  const route = navigator.planFloorRoute({ from: body, target, fromFloor: from.floor, toFloor: target.floor });
  for (const point of route) {
    let arrived = false;
    for (let tick = 0; tick < 4000; tick++) {
      body = movement.stepToward(space, { radius, height: 2.05 }, body, point,
        { speed: 4, delta: 1 / 30, arriveRadius: 0.03, guided: point.guided });
      if (body.arrived) { arrived = true; break; }
      if (body.blocked) break;
    }
    assert.ok(arrived, `${from.roomNumber || 'spawn'} -> ${target.roomNumber}: stuck ${body.x},${body.y},${body.z}, aiming ${point.x},${point.y},${point.z}`);
  }
  assert.ok(Math.hypot(body.x - target.x, body.z - target.z) < 0.05);
  assert.ok(Math.abs(body.y - feet(target)) < 0.05);
}

test('Crowne Point preserves six screens and booths, with two demons and two floor previews', () => {
  assert.equal(maps.playableMapId('crowne-point-cinema'), 'crowne-point-cinema');
  assert.deepEqual(maps.demonRosterFor('crowne-point-cinema').map(d => [d.name, d.hunts]),
    [['The Usher', true], ['The Projectionist', false]]);
  assert.equal(plan.qa.auditoriums.length, 6);
  assert.equal(plan.qa.booths.length, 6);
  assert.equal(plan.boxes.filter(b => b.id?.startsWith('screen-')).length, 6);
  assert.deepEqual(preview.createMapPreview(plan).map(p => p.floor), [1, 2]);
  assert.equal(plan.navigation.connectors.length, 2);
  assert.deepEqual(plan.elevator.floors, [1, 2]);
  assert.equal(plan.hallDoors.length, 4);
  assert.equal(plan.boxes.filter(b => b.kind === 'call-button').length, 2);
  const visit = value => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(plan);
});

test('every seat, room and demon start has clear footing and safe opening separation', () => {
  assert.equal(plan.spawns.hiders.length, 8);
  for (const p of [plan.spawns.seeker, ...plan.spawns.hiders, ...plan.navigation.spawnNodes, ...plan.roomCenters]) {
    assert.notEqual(feet(p), null, `no floor ${JSON.stringify(p)}`);
    assert.equal(space.blocked(p.x, p.z, feet(p), 2.05, 0.46), false, `blocked ${JSON.stringify(p)}`);
  }
  for (const demon of plan.navigation.spawnNodes) for (const player of [plan.spawns.seeker, ...plan.spawns.hiders]) {
    if (demon.floor === player.floor) assert.ok(Math.hypot(demon.x - player.x, demon.z - player.z) >= 12);
  }
});

test('navigation links are connected, collision-clear and remain on their own floor', () => {
  const nodes = new Map(plan.navigation.nodes.map(n => [n.id, n]));
  const links = new Map([...nodes.keys()].map(id => [id, []]));
  for (const [a, b] of plan.navigation.edges) {
    const from = nodes.get(a), to = nodes.get(b);
    assert.ok(from && to);
    assert.equal(from.floor, to.floor);
    links.get(a).push(b); links.get(b).push(a);
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.15);
    let y = feet(from);
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0, x = from.x + (to.x - from.x) * t, z = from.z + (to.z - from.z) * t;
      y = space.groundAt(x, z, y);
      assert.notEqual(y, null, `${a} -> ${b} crosses a void`);
      assert.equal(space.blocked(x, z, y, 2.05, 0.46), false, `${a} -> ${b} blocked at ${x},${y},${z}`);
    }
  }
  for (const floor of [1, 2]) {
    const ids = [...nodes.values()].filter(n => n.floor === floor).map(n => n.id);
    const seen = new Set(), queue = [ids[0]];
    while (queue.length) { const id = queue.pop(); if (seen.has(id)) continue; seen.add(id); queue.push(...links.get(id)); }
    assert.equal(seen.size, ids.length);
  }
});

test('all room pairs and all eight hider seats are physically routable', () => {
  for (const from of [plan.spawns.seeker, ...plan.spawns.hiders, ...plan.roomCenters]) {
    for (const target of plan.roomCenters) walk(from, target);
  }
});

test('both stairs have continuous ground and head clearance in both directions', () => {
  for (const c of plan.navigation.connectors) for (const [fromFloor, toFloor] of [[1, 2], [2, 1]]) {
    const route = enemy.createStairRoute({ fromFloor, toFloor, stairLayout: c.layout, approach: c.approach, approaches: c.approaches });
    let y = base.floorY(fromFloor);
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i];
      const count = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.08);
      for (let j = 0; j <= count; j++) {
        const t = count ? j / count : 0, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        y = space.groundAt(x, z, y);
        assert.notEqual(y, null);
        assert.equal(space.blocked(x, z, y, 2.05, 0.46), false, `${c.id}: blocked ${x},${y},${z}`);
      }
    }
    assert.ok(Math.abs(y - base.floorY(toFloor)) < 0.05);
  }
});

test('cinema is loaded by the browser and included in the pure server mirror', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  assert.match(html, /src="cinema-plan\.js/);
  const { MIRRORED_FILES } = await import('../tools/mirror-sim.mjs');
  assert.ok(MIRRORED_FILES.includes('cinema-plan.js'));
});

test('inspection cameras stand at eye height on real walk surfaces', () => {
  for (const p of Object.values(plan.inspectionViews)) {
    assert.ok(Math.abs(space.groundAt(p.x, p.z, p.y - 1.7) - (p.y - 1.7)) < 0.001);
    assert.equal(space.blocked(p.x, p.z, p.y - 1.7), false);
  }
});

test('the lift has a real upper shaft void and clear exits on both floors', () => {
  assert.equal(plan.spawns.seeker.x, plan.elevator.centerX);
  assert.equal(space.groundAt(plan.elevator.centerX, plan.elevator.centerZ, 4.6), null);
  for (const floor of [1, 2]) {
    space.setDynamicHeight('elevator-car', base.floorY(floor));
    for (let z = plan.elevator.centerZ; z >= plan.elevator.frontZ - 2; z -= 0.1) {
      assert.equal(space.groundAt(plan.elevator.centerX, z, base.floorY(floor)), base.floorY(floor));
      assert.equal(space.blocked(plan.elevator.centerX, z, base.floorY(floor), 2.05, 0.46), false);
    }
  }
  space.setDynamicHeight('elevator-car', 0);
});

test('both cinema elevator entrances identify the elevator', () => {
  for (const floor of plan.elevator.floors) {
    const signs = plan.signs.filter(sign => sign.floor === floor
      && sign.x === plan.elevator.centerX && Math.abs(sign.z - plan.elevator.frontZ) < 0.2);
    assert.equal(signs.length, 1);
    assert.equal(signs[0].text, 'ELEVATOR');
  }
});

test('the CPU seeker sweeps every unlocked cinema room on both floors', async () => {
  const { mapRuntime } = require('./helpers/map-fixture.js');
  const context = await mapRuntime('crowne-point-cinema');
  const logic = require('../seeker-logic.js');
  const { createSeeker } = await import('../modules/seeker.js');
  const seeker = createSeeker({ ...context, logic, tuning: logic.SEEKER_DEFAULTS });
  seeker.setHeld(false);
  const wanted = plan.roomCenters.filter(r => !context.world.collections.roomDoors.get(r.roomNumber).locked);
  const visited = new Set();
  for (let tick = 0; tick < 1500 * 60 && visited.size < wanted.length; tick++) {
    seeker.update(1 / 60, []);
    const p = seeker.getState();
    for (const r of wanted) if (r.floor === p.floor && Math.hypot(r.x - p.x, r.z - p.z) < 0.6) visited.add(r.roomNumber);
  }
  assert.deepEqual(wanted.filter(r => !visited.has(r.roomNumber)).map(r => r.roomNumber), []);
});

test('a cinema authority seats eight players, keeps two demons and releases its held seeker', () => {
  const { engine } = base.createFullSim({ hotel: plan, config: { ...base.SIM_CONFIG,
    player: { ...base.SIM_CONFIG.player, floorCount: 2 }, demons: maps.demonRosterFor('crowne-point-cinema') } });
  let state = engine.createState({ seekerId: 'seeker', players: [
    { id: 'seeker', spawn: plan.spawns.seeker }, ...plan.spawns.hiders.slice(0, 7).map((spawn, i) => ({ id: `h${i}`, spawn }))
  ] });
  assert.equal(state.bodies.length, 8);
  assert.deepEqual(state.demons.map(d => d.id), ['usher', 'projectionist']);
  // Isolate the cabin timing from catches. Demon movement is covered by the registry CPU tests.
  state = { ...state, demons: [] };
  const start = state.bodies.find(b => b.id === 'seeker');
  for (let tick = 0; tick < 44 * 60; tick++) state = engine.tick(state, 1 / 60, { seeker: { forward: 1, yaw: 0 } });
  assert.equal(state.bodies.find(b => b.id === 'seeker').z, start.z);
  for (let tick = 0; tick < 6 * 60; tick++) state = engine.tick(state, 1 / 60, { seeker: { forward: 1, yaw: 0 } });
  assert.ok(state.bodies.find(b => b.id === 'seeker').z < plan.elevator.frontZ - 1);
});
