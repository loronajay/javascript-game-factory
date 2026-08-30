const test = require('node:test');
const assert = require('node:assert/strict');

const enemy = require('../enemy-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

// Where a demon may walk, as data the building owns.
//
// This used to be constants inside `demon-logic.js`: a corridor spine at x=0, a list of patrol Z
// values, and a dogleg to |x|=3.75. All three are one hotel's floorplan, so a second building could
// not be navigated without a per-map branch in the AI. A plan emits a waypoint graph instead, and
// these are the rules that graph has to obey for any map.

const hotel = fixture.buildHotel();
const nav = hotel.navigation;

test('routes use the actual walk height of tiered seating, including the final target', () => {
  const navigation = { nodes: [{ id: 'tier', floor: 1, x: 2, z: 0 }], edges: [], connectors: [] };
  const navigator = enemy.createNavigator(navigation, { space: { groundAt: () => 0.55 } });
  const route = navigator.planFloorRoute({ from: { x: 0, z: 0 }, target: { x: 3, z: 0 }, fromFloor: 1, toFloor: 1 });
  assert.ok(route.every(p => p.y === 0.55), 'floor datum is not the top of a raised seating tier');
});

test('the plan carries its own navigation graph', () => {
  assert.ok(nav, 'a plan must describe how to get around itself');
  assert.ok(nav.nodes.length > 0);
  assert.ok(nav.edges.length > 0);
  assert.equal(nav.connectors.length, 1, 'the hotel has exactly one vertical connector: the stairwell');
  assert.equal(nav.connectors[0].kind, 'stair');
});

test('every edge names nodes that exist, and never joins two floors', () => {
  const byId = new Map(nav.nodes.map((node) => [node.id, node]));
  for (const [a, b] of nav.edges) {
    const from = byId.get(a);
    const to = byId.get(b);
    assert.ok(from && to, `edge ${a}->${b} names a node that does not exist`);
    // A floor change is a connector, never a walk edge. A demon that could stroll between floors
    // along the graph would walk up through a ceiling.
    assert.equal(from.floor, to.floor, `edge ${a}->${b} crosses floors without a connector`);
  }
});

test('a same-floor route walks the graph instead of cutting through walls', () => {
  const navigator = enemy.createNavigator(nav);
  const route = navigator.walkRoute({ x: 0, z: -50, floor: 1 }, { x: 0, z: 34, floor: 1 });
  assert.ok(route.length >= 2, 'crossing the building must pass through waypoints');
  const zs = route.map((point) => point.z);
  // Monotonic along the spine: the route may not double back on itself.
  for (let i = 1; i < zs.length; i += 1) assert.ok(zs[i] >= zs[i - 1] - 1e-6, 'route doubles back');
});

test('a target off the spine is reached through its own doorway, not diagonally through a wall', () => {
  const navigator = enemy.createNavigator(nav);
  const room = hotel.roomCenters.find((entry) => entry.floor === 2 && entry.side === 'right');
  const door = hotel.roomDoors.find((entry) => entry.roomNumber === room.roomNumber);
  const route = navigator.walkRoute({ x: 0, z: -52, floor: 2 }, room);
  const doorwayIndex = route.findIndex(point => Math.abs(point.x - 3.4) < 1e-6 && Math.abs(point.z - door.z) < 1e-6);
  assert.ok(doorwayIndex >= 0, 'the room is entered through its own doorway');
  // The final waypoint before the room is the mouth of that room's own door, on the room's side of
  // the corridor. It used to be the hall stop at the room's Z, which left the last leg to cross the
  // corridor wall wherever the door did not line up with a hall stop.
  assert.ok(route.slice(doorwayIndex).every(point => Math.abs(point.z - door.z) < 1e-6), 'the room entry stays square to the doorway');
  // And the spine is still walked to get there: crossing the building is never one straight line.
  assert.ok(route.length >= 3, 'the route must cross the building along the corridor');
  assert.ok(route.slice(0, doorwayIndex).every((point) => Math.abs(point.x) < 0.001), 'the approach runs down the spine');
});

test('a connector is chosen for the floors it actually serves', () => {
  const navigator = enemy.createNavigator(nav);
  const connector = navigator.connectorBetween(1, 4, { x: 0, z: 0 });
  assert.ok(connector, 'the stairwell serves every floor of the hotel');
  assert.equal(connector.id, 'stairwell');
  assert.equal(navigator.connectorBetween(1, 9, { x: 0, z: 0 }), null, 'no connector reaches a floor that does not exist');
});

test('the graph answers for a building with no waypoints at all', () => {
  const navigator = enemy.createNavigator({ nodes: [], edges: [], connectors: [] });
  // An empty graph is a legitimate answer for a single open room. Routing must degrade to "walk
  // straight at it" rather than throwing inside a tick.
  assert.deepEqual(navigator.walkRoute({ x: 0, z: 0, floor: 1 }, { x: 5, z: 5, floor: 1 }), []);
  assert.equal(navigator.connectorBetween(1, 2, { x: 0, z: 0 }), null);
});

test('replanning halfway up stairs exits along the flight, even when the target is on the rounded floor', () => {
  const space = fixture.createSpace(hotel, Object.fromEntries(hotel.swingDoors.map(d => [d.id, d.openAngle])));
  const navigator = enemy.createNavigator(nav, { space });
  const flight = nav.connectors[0].layout.flights[0];
  const from = { x: flight.startX, z: (flight.startZ + flight.endZ) / 2, y: (flight.startY + flight.endY) / 2 };
  const route = navigator.planFloorRoute({ from, target: { x: 0, z: 30 }, fromFloor: 1, toFloor: 1, floorHeight: 4.6 });
  assert.ok(route.some(p => p.stair), 'a floor label cannot erase the remaining stair traversal');
  let body = from;
  for (const target of route) {
    let arrived = false;
    for (let tick = 0; tick < 4000; tick++) {
      const next = require('../movement-logic.js').stepToward(space, { height: 2.05, radius: .46 }, body, target, { speed: 3, delta: 1 / 60, guided: target.guided });
      assert.equal(space.blocked(next.x, next.z, next.y, 2.05, .46), false, 'the body intersects the stair shell');
      assert.equal(next.blocked, false, 'the route stalls in the stairwell');
      body = next;
      if (next.arrived) { arrived = true; break; }
    }
    assert.ok(arrived, 'a mid-flight replan must reach every waypoint');
  }
  assert.ok(Math.hypot(body.x, body.y, body.z - 30) < .25);
});

test('a floor route cannot invent a crossing when no connector serves the destination', () => {
  const navigator = enemy.createNavigator({ nodes: [], edges: [], connectors: [] });
  assert.deepEqual(navigator.planFloorRoute({ from: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 4.6, z: 0 }, fromFloor: 1, toFloor: 2 }), []);
});

test('every map can reroute a demon from mid-flight to either landing without crossing solids', async () => {
  const { mapRuntime } = require('./helpers/map-fixture.js');
  const movement = require('../movement-logic.js');
  for (const map of require('../map-catalog.js').playableMaps()) {
    const context = await mapRuntime(map.id);
    const navigator = enemy.createNavigator(context.plan.navigation, { space: context.space });
    for (const connector of context.plan.navigation.connectors) {
      for (const flight of connector.layout.flights) {
        const from = { x: (flight.startX + flight.endX) / 2, y: (flight.startY + flight.endY) / 2, z: (flight.startZ + flight.endZ) / 2 };
        for (const toFloor of [flight.transition, flight.transition + 1]) {
          const target = connector.approaches?.[toFloor] || connector.approach;
          const fromFloor = Math.round(from.y / 4.6) + 1;
          const route = navigator.planFloorRoute({ from, target, fromFloor, toFloor, floorHeight: 4.6 });
          const label = `${map.id}/${connector.id}/${flight.lane} to ${toFloor}`;
          let body = from;
          for (const waypoint of route) {
            let arrived = false;
            for (let tick = 0; tick < 3000; tick++) {
              body = movement.stepToward(context.space, { height: 2.05, radius: .46 }, body, waypoint,
                { speed: 3, delta: 1 / 60, guided: waypoint.guided });
              assert.equal(context.space.blocked(body.x, body.z, body.y, 2.05, .46), false, `${label}: inside geometry`);
              assert.equal(body.blocked, false, `${label}: stalled on flight`);
              if (body.arrived) { arrived = true; break; }
            }
            assert.ok(arrived, `${label}: waypoint never reached`);
          }
          assert.ok(Math.hypot(body.x - target.x, body.y - (toFloor - 1) * 4.6, body.z - target.z) < .25, label);
        }
      }
    }
  }
});
