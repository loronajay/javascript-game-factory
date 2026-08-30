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

test('a target off the spine is reached via the nearest waypoint, not diagonally through a wall', () => {
  const navigator = enemy.createNavigator(nav);
  const route = navigator.walkRoute({ x: 0, z: -52, floor: 2 }, { x: 8.4, z: -18, floor: 2 });
  const last = route.at(-1);
  assert.ok(last, 'a route to a room must exist');
  // The final waypoint before the room is the hall stop at the room's own Z.
  assert.ok(Math.abs(last.x) < 0.001, 'the demon must reach the corridor spine before stepping into the room');
  assert.ok(Math.abs(last.z - -18) < 1e-6);
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
