const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const plan = require('../hotel-plan.js');
const collision = require('../collision-logic.js');
const layout = require('../layout.js');

const projectRoot = path.resolve(__dirname, '..');

// The tuning the browser passes in. Restated here rather than imported because game-config.js is an
// ES module and the pure layer is deliberately loadable by `node --test` with no build step.
const CONFIG = {
  floorHeight: 4.6,
  playerRadius: 0.34,
  bodyHeight: 1.78,
  groundSnap: 0.62,
  doorOpenAngle: Math.PI / 2,
  elevatorCenterX: 2.5,
  elevatorCenterZ: 57.45,
  elevatorFrontZ: 55.88,
};
const floorY = (id) => (id - 1) * CONFIG.floorHeight;
const keyIdForFloor = (id) => `floor-${id}-master`;
const keyLabelForFloor = (id) => `Floor ${id} Master Key`;
const FLOOR_DEFS = [
  { id: 1, name: 'Lobby Floor', openRooms: ['105', '111'], lockedRooms: ['107', '113'], roomVariants: { 111: 'suite', 113: 'maintenance' }, keyPlacements: { 105: keyIdForFloor(1) }, secretRooms: ['105', '107'], secretLinks: [['105', '107']] },
  { id: 2, name: 'Lounge Floor', openRooms: ['202', '208', '213'], lockedRooms: ['204', '210'], roomVariants: { 202: 'suite', 204: 'maintenance', 213: 'suite' }, keyPlacements: { 204: keyIdForFloor(2) }, secretRooms: ['202', '204'], secretLinks: [['202', '204']] },
  { id: 3, name: 'Quiet Floor', openRooms: ['305', '312'], lockedRooms: ['302', '307', '308', '314'], roomVariants: { 305: 'suite', 314: 'maintenance' }, keyPlacements: { 305: keyIdForFloor(3) }, secretRooms: ['305', '307'], secretLinks: [['305', '307']] },
  { id: 4, name: 'Renovation Floor', openRooms: ['405', '412'], lockedRooms: ['402', '407', '408', '414'], roomVariants: { 407: 'maintenance', 414: 'maintenance' }, keyPlacements: { 407: keyIdForFloor(4) }, secretRooms: ['405', '407'], secretLinks: [['405', '407']] },
];

function build() {
  return plan.createHotelPlan({ config: CONFIG, floorDefs: FLOOR_DEFS, layout, floorY, keyIdForFloor, keyLabelForFloor });
}

function stand(hotel, x, z, feetY, openings) {
  return collision.collidesAt(plan.resolveColliders(hotel, openings), {
    x, z, feetY, bodyHeight: CONFIG.bodyHeight, radius: CONFIG.playerRadius,
  });
}

function ground(hotel, x, z, feetY) {
  return plan.walkHeightAt(hotel.surfaces, x, z, feetY, CONFIG.groundSnap);
}

test('the hotel plan is pure data built without a renderer', () => {
  // Comments stripped: prose may name the renderer it is deliberately avoiding, code may not.
  const source = fs.readFileSync(path.join(projectRoot, 'hotel-plan.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  // The whole point of the seam: a server has to build this hotel with no WebGL in the process.
  assert.doesNotMatch(source, /THREE|new Mesh|Geometry|Material|document\.|window\./);

  const hotel = build();
  for (const key of ['boxes', 'surfaces', 'colliders', 'roomDoors', 'secretPanels', 'secretTunnels', 'roomCenters', 'furnishings', 'hallDoors']) {
    assert.ok(Array.isArray(hotel[key]), `plan.${key} should be an array`);
    assert.ok(hotel[key].length > 0, `plan.${key} should not be empty`);
  }
});

test('every number the plan publishes is finite', () => {
  const hotel = build();
  const walk = (value, trail) => {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${trail} is not finite`);
    else if (Array.isArray(value)) value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
    else if (value && typeof value === 'object') for (const [key, entry] of Object.entries(value)) walk(entry, `${trail}.${key}`);
  };
  walk(hotel, 'plan');
});

test('all four floors are physically present at their real height', () => {
  const hotel = build();

  for (const def of FLOOR_DEFS) {
    // The corridor down the middle of every floor is the spine of the building.
    assert.equal(ground(hotel, 0, 0, floorY(def.id)), floorY(def.id));
    assert.equal(stand(hotel, 0, 0, floorY(def.id)), false);
  }
});

test('corridor walls block sideways movement without sealing the corridor', () => {
  const hotel = build();

  assert.equal(stand(hotel, 0, -20, floorY(1)), false);
  // The corridor walls sit at x = +/-4.1; a body with a 0.34 radius cannot reach their face.
  assert.equal(stand(hotel, 4, -20, floorY(1)), true);
  assert.equal(stand(hotel, -4, -20, floorY(1)), true);
});

test('every authored room has a centre, a door, and the right lock', () => {
  const hotel = build();

  for (const def of FLOOR_DEFS) {
    for (const roomNumber of [...def.openRooms, ...def.lockedRooms]) {
      const centre = hotel.roomCenters.find((entry) => entry.roomNumber === roomNumber);
      const door = hotel.roomDoors.find((entry) => entry.roomNumber === roomNumber);
      assert.ok(centre, `${roomNumber} has no room centre`);
      assert.ok(door, `${roomNumber} has no door`);
      assert.equal(centre.floor, def.id);
      assert.equal(door.locked, def.lockedRooms.includes(roomNumber));
      assert.equal(door.openInitially, def.openRooms.includes(roomNumber));
      assert.equal(door.requiredKey, keyIdForFloor(def.id));
    }
  }
  // Seven rooms a side, four floors.
  assert.equal(hotel.roomCenters.length, 56);
  assert.equal(hotel.roomDoors.length, 56);
});

test('a closed door seals its doorway and an open one does not', () => {
  const hotel = build();
  const door = hotel.roomDoors.find((entry) => entry.roomNumber === '107');
  const feetY = floorY(1);

  assert.equal(stand(hotel, door.x, door.z, feetY, { [door.id]: 0 }), true);
  assert.equal(stand(hotel, door.x, door.z, feetY, { [door.id]: door.direction * CONFIG.doorOpenAngle }), false);
});

test('room interiors are standable and their beds are not', () => {
  const hotel = build();

  for (const roomNumber of ['105', '202']) {
    const centre = hotel.roomCenters.find((entry) => entry.roomNumber === roomNumber);
    const feetY = floorY(centre.floor);
    assert.equal(ground(hotel, centre.x, centre.z, feetY), feetY);
    assert.equal(stand(hotel, centre.x, centre.z, feetY), false);
  }
  // The furniture has to be solid or hiding behind it means nothing.
  const bed = hotel.furnishings.find((entry) => entry.type === 'bed');
  assert.equal(stand(hotel, bed.x, bed.z, floorY(bed.floor)), true);
});

test('secret rooms carry panels and their links carry a drainable tunnel', () => {
  const hotel = build();

  for (const def of FLOOR_DEFS) {
    for (const roomNumber of def.secretRooms) {
      assert.ok(hotel.secretPanels.some((entry) => entry.id === `${roomNumber}-secret`), `${roomNumber} has no secret panel`);
    }
    for (const [a, b] of def.secretLinks) {
      const tunnel = hotel.secretTunnels.find((entry) => entry.id === `${a}-${b}-tunnel`);
      assert.ok(tunnel, `${a}-${b} has no tunnel`);
      assert.equal(tunnel.kind, 'tunnel');
      assert.equal(tunnel.floor, def.id);
      assert.ok(tunnel.maxZ > tunnel.minZ && tunnel.maxX > tunnel.minX);
      // A tunnel you cannot stand in is scenery, not a route.
      const midZ = (tunnel.minZ + tunnel.maxZ) / 2;
      const x = (tunnel.minX + tunnel.maxX) / 2;
      assert.equal(ground(hotel, x, midZ, floorY(def.id)), floorY(def.id));
    }
  }
});

test('the stairwell is one continuous climb from floor one to floor four', () => {
  const hotel = build();
  const stairs = layout.createStairLayout({ floorCount: 4, floorHeight: CONFIG.floorHeight });

  for (const flight of stairs.flights) {
    const steps = 12;
    let previous = null;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const z = flight.startZ + (flight.endZ - flight.startZ) * t;
      const expected = flight.startY + (flight.endY - flight.startY) * t;
      const height = ground(hotel, flight.startX, z, expected);
      assert.ok(height !== null, `no tread under the ${flight.lane} flight of transition ${flight.transition} at t=${t}`);
      assert.ok(Math.abs(height - expected) < 0.2, `tread height drifted at t=${t}: ${height} vs ${expected}`);
      if (previous !== null) assert.ok(height >= previous - 1e-9, 'the climb must never step back down');
      previous = height;
    }
  }
  // No teleports: the top of the last flight is floor four's own height.
  const top = stairs.flights[stairs.flights.length - 1];
  assert.ok(Math.abs(top.endY - floorY(4)) < 1e-9);
});

test('the stair landing on each floor meets that floor', () => {
  const hotel = build();
  const stairs = layout.createStairLayout({ floorCount: 4, floorHeight: CONFIG.floorHeight });

  for (const landing of stairs.landings.filter((entry) => entry.kind === 'floor')) {
    assert.equal(ground(hotel, landing.x, landing.z, landing.y), landing.y);
  }
});

test('the elevator hall doors are dynamic and only block while nearly shut', () => {
  const hotel = build();
  const door = hotel.hallDoors.find((entry) => entry.floor === 1 && entry.side === 'left');
  const feetY = floorY(1);

  assert.equal(stand(hotel, door.x, door.z, feetY, { [door.id]: 0 }), true);
  assert.equal(stand(hotel, door.x, door.z, feetY, { [door.id]: 1 }), false);
});

test('the plan places the seeker cabin and reachable hider spawns', () => {
  const hotel = build();

  assert.equal(hotel.spawns.seeker.floor, 1);
  assert.ok(hotel.spawns.hiders.length >= 8);
  for (const spawn of hotel.spawns.hiders) {
    assert.equal(ground(hotel, spawn.x, spawn.z, floorY(spawn.floor)), floorY(spawn.floor));
    assert.equal(stand(hotel, spawn.x, spawn.z, floorY(spawn.floor)), false);
  }
});
