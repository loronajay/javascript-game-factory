const test = require('node:test');
const assert = require('node:assert/strict');

const demonLogic = require('../demon-logic.js');
const enemy = require('../enemy-logic.js');
const movement = require('../movement-logic.js');
const sanity = require('../sanity-logic.js');
const fixtures = require('../fixtures-logic.js');
const layout = require('../layout.js');
const fixture = require('./helpers/hotel-fixture.js');

// The demon's brain, with no renderer near it. Until V7.1 all of this lived inside
// `modules/monster.js` alongside the shroud rags and the fresnel shader, which is exactly why online
// rounds opened with an empty hotel.

const TICK = 1 / 60;
const CONFIG = { floorHeight: fixture.CONFIG.floorHeight };

function context(overrides = {}) {
  const hotel = overrides.hotel || fixture.buildHotel();
  const space = overrides.space || fixture.createSpace(hotel);
  const catalog = fixtures.createFixtureCatalog(hotel, { floorY: fixture.floorY, config: fixture.CONFIG });
  const doorByRoom = new Map(catalog.filter((item) => item.kind === 'door').map((item) => [item.roomNumber, item]));
  const opened = [];
  const emitted = [];
  const hunted = [];
  const state = { fixtures: fixtures.createFixtureState(catalog) };
  return {
    hotel, space, catalog, opened, emitted, hunted, state,
    ctx: {
      space, movement, enemy, sanity, layout,
      candidates: [], huntCandidates: [],
      rooms: hotel.roomCenters.map((room) => ({ roomNumber: room.roomNumber, floor: room.floor, x: room.x, z: room.z })),
      stairLayout: layout.createStairLayout({ floorCount: 4, floorHeight: fixture.CONFIG.floorHeight }),
      stairShell: layout.createStairwellShellLayout(),
      config: CONFIG,
      random: fixture.seededRandom(11),
      isRoomLocked: (roomNumber) => {
        const item = doorByRoom.get(roomNumber);
        return !item || !!state.fixtures.doors[item.id].locked;
      },
      openDoor: (roomNumber, options) => {
        const item = doorByRoom.get(roomNumber);
        if (!item) return;
        opened.push([roomNumber, !!(options && options.unlock)]);
        state.fixtures = fixtures.forceDoorOpen(state.fixtures, item, options);
      },
      setHunted: (target) => hunted.push(target ? target.id : null),
      emit: (event) => emitted.push(event),
      ...overrides.ctx,
    },
  };
}

test('a demon walks its patrol route through the real hotel without leaving the floor', () => {
  const harness = context();
  let demon = demonLogic.createDemon({ id: 'bellhop', name: 'The Bellhop', spawn: { x: 0, y: fixture.floorY(2), z: 0, floor: 2 }, hunts: true });
  const start = { x: demon.x, z: demon.z };

  for (let tick = 0; tick < 60 * 20; tick += 1) demon = demonLogic.tickDemon(demon, TICK, harness.ctx);

  assert.ok(Math.hypot(demon.x - start.x, demon.z - start.z) > 3, 'a roaming demon should actually get somewhere');
  assert.equal(harness.space.blocked(demon.x, demon.z, demon.y, 2.25, 0.32), false, 'it must never end a tick inside a wall');
  assert.ok(Number.isFinite(demon.y));
});

test('a demon that can see a player chases, and loses the trail behind a wall', () => {
  const harness = context();
  const spot = { x: 0, y: fixture.floorY(1), z: -20 };
  let demon = demonLogic.createDemon({ id: 'bellhop', spawn: { x: 0, y: fixture.floorY(1), z: -12, floor: 1 } });
  // Facing down the corridor at the player standing 8m away, in plain sight.
  demon = { ...demon, facingX: 0, facingZ: -1 };
  harness.ctx.candidates = [{ id: 'ana', x: spot.x, y: spot.y, z: spot.z, floor: 1, crouching: false }];

  for (let tick = 0; tick < 12; tick += 1) demon = demonLogic.tickDemon(demon, TICK, harness.ctx);
  assert.equal(demon.awareness.state, enemy.ENEMY_STATES.CHASE);
  assert.equal(demon.detectedTargetId, 'ana');
  assert.ok(harness.emitted.some((event) => event.type === 'demon-state' && event.state === 'chase'));

  const closed = Math.hypot(demon.x - spot.x, demon.z - spot.z);
  for (let tick = 0; tick < 60; tick += 1) demon = demonLogic.tickDemon(demon, TICK, harness.ctx);
  assert.ok(Math.hypot(demon.x - spot.x, demon.z - spot.z) < closed, 'a chasing demon closes the distance');

  // The player is gone. Awareness decays to a search and then back to roaming; it does not keep a
  // lock on someone it can no longer see.
  harness.ctx.candidates = [];
  for (let tick = 0; tick < 60 * 20; tick += 1) demon = demonLogic.tickDemon(demon, TICK, harness.ctx);
  assert.equal(demon.awareness.state, enemy.ENEMY_STATES.ROAM);
  assert.equal(demon.awareness.targetId, null);
});

test('line of sight is the hotel geometry, not a clear line between two points', () => {
  const harness = context();
  const room = harness.hotel.roomCenters.find((entry) => entry.floor === 1);
  let demon = demonLogic.createDemon({ id: 'bellhop', spawn: { x: 0, y: fixture.floorY(1), z: room.z, floor: 1 } });
  demon = { ...demon, facingX: Math.sign(room.x), facingZ: 0 };
  // Inside the room, behind its shut door — close enough to detect were the wall not there.
  harness.ctx.candidates = [{ id: 'ana', x: room.x, y: fixture.floorY(1), z: room.z, floor: 1, crouching: false }];

  for (let tick = 0; tick < 12; tick += 1) demon = demonLogic.tickDemon(demon, TICK, harness.ctx);

  assert.equal(demon.detectedTargetId, null, 'a wall has to occlude — this is the bug the AABB ray fixed');
});

test('only a hunting demon forces a lock, and only The Bellhop hunts at all', () => {
  const harness = context();
  const room = harness.hotel.roomCenters.find((entry) => entry.floor === 1);
  const camper = { id: 'ana', x: room.x, z: room.z, floor: 1, zone: room.roomNumber, kind: 'room', full: true };
  harness.ctx.huntCandidates = [camper];
  harness.ctx.sanityConfig = undefined;

  let housekeeper = demonLogic.createDemon({ id: 'housekeeper', name: 'The Housekeeper', spawn: { x: 0, y: fixture.floorY(1), z: 0, floor: 1 }, hunts: false });
  for (let tick = 0; tick < 30; tick += 1) housekeeper = demonLogic.tickDemon(housekeeper, TICK, harness.ctx);
  assert.equal(housekeeper.huntZone, null, 'two camper-hunters would read as a swarm');
  assert.equal(harness.hunted.length, 0);

  let bellhop = demonLogic.createDemon({ id: 'bellhop', name: 'The Bellhop', spawn: { x: 0, y: fixture.floorY(1), z: 0, floor: 1 }, hunts: true });
  for (let tick = 0; tick < 30; tick += 1) bellhop = demonLogic.tickDemon(bellhop, TICK, harness.ctx);
  assert.equal(bellhop.huntZone, room.roomNumber);
  assert.equal(bellhop.routePurpose, 'hunt');
  assert.deepEqual(harness.hunted.at(-1), 'ana');
  assert.ok(harness.opened.some(([roomNumber, unlock]) => roomNumber === room.roomNumber && unlock === true), 'the hunt unlocks the door it is walking through');
  assert.ok(harness.emitted.some((event) => event.type === 'sanity-hunt' && event.id === 'ana'));
});

test('a catch is resolved from positions and does not care which demon it was', () => {
  const demon = demonLogic.createDemon({ id: 'bellhop', spawn: { x: 0, y: 0, z: 0, floor: 1 } });
  const candidates = [
    { id: 'touching', x: 0.4, y: 0, z: 0.4 },
    { id: 'across-the-hall', x: 4, y: 0, z: 0 },
    { id: 'a-floor-up', x: 0.2, y: fixture.CONFIG.floorHeight, z: 0.2 },
  ];

  assert.deepEqual(demonLogic.caughtBy(demon, candidates), ['touching']);
});

test('what a client is told about a demon is a body, not an intention it can track', () => {
  const harness = context();
  let demon = demonLogic.createDemon({ id: 'bellhop', name: 'The Bellhop', spawn: { x: 1, y: 0, z: 2, floor: 1 }, hunts: true });
  demon = demonLogic.tickDemon(demon, TICK, harness.ctx);

  const wire = demonLogic.describeDemon(demon);

  assert.deepEqual(Object.keys(wire).sort(), ['id', 'moving', 'name', 'routePurpose', 'state', 'x', 'y', 'yaw', 'z']);
  assert.equal('route' in wire, false, 'a published route is a tracker minimap with extra steps');
  assert.equal('awareness' in wire, false);
  assert.equal('huntTargetId' in wire, false, 'who is being hunted is that player\'s business, not everyone\'s');
});

test('demons spawn apart and away from the player', () => {
  const player = { x: 0, z: 0, floor: 1 };
  const random = fixture.seededRandom(3);

  const first = demonLogic.chooseDemonSpawn({ enemy, player, random, config: CONFIG });
  const second = demonLogic.chooseDemonSpawn({ enemy, player, random, excludedFloors: [first.floor], config: CONFIG });

  assert.notEqual(first.floor, second.floor, 'a round must not open with both of them in one stairwell');
  assert.ok(first.floor !== player.floor || Math.hypot(first.x - player.x, first.z - player.z) >= 20);
});
