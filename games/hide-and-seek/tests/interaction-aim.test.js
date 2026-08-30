const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('../fixtures-logic.js');
const sim = require('../sim-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

// The client aims with a `THREE.Raycaster` against the meshes the player can actually see; the
// authority aims with distance, height and a facing cone against plain records. Those are two
// different questions and they do not always give the same answer — two fixtures inside the same
// cone, a drawer beside a door, and the server opens whichever is *nearer* rather than whichever is
// under the crosshair. To the player that reads as "I pressed E and the wrong thing opened".
//
// The fix is not to make the client re-derive the cone: the raycast is the better answer, because it
// knows about occlusion and about what is on screen. It is to let the press carry what it was aimed
// at. `interactId` is still only an *intent* — the authority re-tests reach, height and facing on
// that exact fixture and falls back to its own pick if the aim does not survive, so a client can no
// more open a door across the hotel than it could before.

const CONFIG = { ...fixture.CONFIG, reachDistance: 3, reachHeight: 2.4, facingDot: 0.35 };

// Two fixtures in front of the viewer at different ranges, both comfortably inside the cone.
const NEAR = { id: 'near-drawer', kind: 'drawer', floor: 1, x: 0, y: 0, z: -1 };
const FAR = { id: 'far-door', kind: 'door', floor: 1, roomNumber: '105', x: 0, y: 0, z: -2.4, openAngle: Math.PI / 2 };
const CATALOG = [NEAR, FAR];
// Facing -Z, which is what yaw 0 means everywhere in this game.
const VIEWER = { x: 0, y: 0, z: 0, yaw: 0 };

test('with no aim the authority still picks the nearest thing in the cone', () => {
  const picked = fixtures.selectInteractable(CATALOG, VIEWER, { config: CONFIG });
  assert.equal(picked.id, 'near-drawer');
});

test('an aim inside reach wins over the nearer fixture', () => {
  const picked = fixtures.selectInteractable(CATALOG, VIEWER, { config: CONFIG, preferId: 'far-door' });
  assert.equal(picked.id, 'far-door', 'the crosshair decides between two things the player can both reach');
});

test('an aim at something out of reach falls back to the authority pick', () => {
  const distant = { id: 'distant', kind: 'door', floor: 1, x: 0, y: 0, z: -40 };
  const picked = fixtures.selectInteractable([...CATALOG, distant], VIEWER, { config: CONFIG, preferId: 'distant' });
  assert.equal(picked.id, 'near-drawer', 'aim is an intent; reach is still the authority\'s to grant');
});

test('an aim behind the player is refused', () => {
  const behind = { id: 'behind', kind: 'door', floor: 1, x: 0, y: 0, z: 2 };
  const picked = fixtures.selectInteractable([...CATALOG, behind], VIEWER, { config: CONFIG, preferId: 'behind' });
  assert.equal(picked.id, 'near-drawer');
});

test('an aim at a fixture that is not in the catalog at all is ignored', () => {
  const picked = fixtures.selectInteractable(CATALOG, VIEWER, { config: CONFIG, preferId: 'door-that-never-existed' });
  assert.equal(picked.id, 'near-drawer');
});

test('an aim one floor up cannot be reached through the ceiling', () => {
  const above = { id: 'above', kind: 'door', floor: 2, x: 0, y: 4.6, z: -1.2 };
  const picked = fixtures.selectInteractable([...CATALOG, above], VIEWER, { config: CONFIG, preferId: 'above' });
  assert.equal(picked.id, 'near-drawer');
});

// --- the wire -----------------------------------------------------------------------------------

test('readInput carries an aim and refuses anything that is not an id', () => {
  assert.equal(sim.readInput({ interact: true, interactId: 'door-105' }).interactId, 'door-105');
  assert.equal(sim.readInput({ interact: true }).interactId, null);
  assert.equal(sim.readInput({ interact: true, interactId: 42 }).interactId, null);
  assert.equal(sim.readInput({ interact: true, interactId: { id: 'x' } }).interactId, null);
  assert.equal(sim.readInput({ interact: true, interactId: 'x'.repeat(400) }).interactId, null, 'an unbounded string is not an id');
  assert.equal(sim.NO_INPUT.interactId, null);
});

// --- end to end ---------------------------------------------------------------------------------

const TICK = 1 / 60;

test('the authority opens the fixture the player aimed at, not the one that happened to be closer', () => {
  const built = fixture.createFullSim({ seed: 7, config: { demons: [{ id: 'bellhop', name: 'The Bellhop', hunts: true }], demon: { walkSpeed: 0, chaseSpeed: 0, huntSpeed: 0 } } });
  const players = [
    { id: 'seeker', spawn: built.hotel.spawns.seeker },
    { id: 'hider-0', spawn: built.hotel.spawns.hiders[0] },
    { id: 'hider-1', spawn: built.hotel.spawns.hiders[1] },
  ];
  let state = built.engine.createState({ players, seekerId: 'seeker' });

  // A real pair out of the hotel's own catalog: a room door and a dresser close enough together to
  // share one cone. Whichever the authority calls nearest, the aim has to be able to name the other.
  const drawers = built.engine.catalog.filter((item) => item.kind === 'drawer');
  const doors = built.engine.catalog.filter((item) => item.kind === 'door');
  let pair = null;
  for (const drawer of drawers) {
    for (const door of doors) {
      if (door.floor !== drawer.floor) continue;
      if (Math.abs(door.y - drawer.y) > 1) continue;
      const gap = Math.hypot(door.x - drawer.x, door.z - drawer.z);
      if (gap > 0.8 && gap < 4) { pair = { drawer, door, gap }; break; }
    }
    if (pair) break;
  }
  assert.ok(pair, 'the hotel has a dresser within one cone of its room door');

  // Stand back off the line between them and look at the midpoint, so both sit inside the cone and
  // inside reach — the exact situation nearest-wins gets wrong.
  const midX = (pair.drawer.x + pair.door.x) / 2;
  const midZ = (pair.drawer.z + pair.door.z) / 2;
  const perpX = -(pair.door.z - pair.drawer.z) / pair.gap;
  const perpZ = (pair.door.x - pair.drawer.x) / pair.gap;
  const standX = midX + perpX * 1.5;
  const standZ = midZ + perpZ * 1.5;
  // Yaw is measured so that forward is (-sin yaw, -cos yaw); aim it at the midpoint.
  const yaw = Math.atan2(-(midX - standX), -(midZ - standZ));
  const viewer = { x: standX, y: pair.door.y, z: standZ, yaw };

  const nearest = fixtures.selectInteractable(built.engine.catalog, viewer, { config: fixture.CONFIG, elevatorY: 0 });
  assert.ok(nearest, 'something is in reach from here');
  const other = nearest.id === pair.door.id ? pair.drawer : pair.door;
  assert.notEqual(nearest.id, other.id);
  assert.equal(
    fixtures.selectInteractable([other], viewer, { config: fixture.CONFIG, elevatorY: 0 })?.id,
    other.id,
    'and the other one is reachable too — this is a cone with two things in it',
  );

  // Teleport a hider onto the spot; only the authority's own tick decides what the press opens.
  state = { ...state, bodies: state.bodies.map((entry) => (entry.id === 'hider-0'
    ? { ...entry, x: standX, y: pair.door.y, z: standZ, yaw, floor: pair.door.floor }
    : entry)) };

  const press = { forward: 0, strafe: 0, yaw, crouch: false, sprint: false, light: false, interact: true };
  const blind = built.engine.tick(state, TICK, { 'hider-0': press });
  assert.equal(blind.events.find((event) => event.playerId === 'hider-0')?.id, nearest.id, 'without an aim it is still nearest-wins');

  const aimed = built.engine.tick(state, TICK, { 'hider-0': { ...press, interactId: other.id } });
  const touched = aimed.events.filter((event) => event.playerId === 'hider-0');
  assert.ok(touched.length, 'the press resolved to something');
  assert.equal(touched[0].id, other.id, 'and it resolved to what the crosshair was on');
});
