const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('../fixtures-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

// Doors, drawers, keys and the lift used to live in the renderer, which is why online play had a
// hotel where a door you opened was still shut for the seeker chasing you. These are the rules that
// make all of it answerable by the authority instead.

function catalogFor(hotel = fixture.buildHotel()) {
  return fixtures.createFixtureCatalog(hotel, { floorY: fixture.floorY, config: fixture.CONFIG });
}

function facingFrom(from, to) {
  // The camera's forward is -Z rotated by yaw, so this is the yaw that looks at `to`.
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

test('the catalog covers every operable thing in the hotel and nothing else', () => {
  const hotel = fixture.buildHotel();
  const catalog = catalogFor(hotel);
  const countOf = (kind) => catalog.filter((item) => item.kind === kind).length;

  assert.equal(countOf(fixtures.FIXTURE_KINDS.DOOR), hotel.roomDoors.length);
  assert.equal(countOf(fixtures.FIXTURE_KINDS.PANEL), hotel.secretPanels.length);
  assert.equal(countOf(fixtures.FIXTURE_KINDS.DRAWER), hotel.furnishings.filter((entry) => entry.type === 'dresser').length);
  assert.equal(countOf(fixtures.FIXTURE_KINDS.ELEVATOR_CALL), 4);
  assert.equal(countOf(fixtures.FIXTURE_KINDS.ELEVATOR_BUTTON), 4);
  assert.ok(catalog.every((item) => item.id), 'every fixture must be addressable without a mesh');
  assert.equal(new Set(catalog.map((item) => item.id)).size, catalog.length, 'fixture ids must be unique');
});

test('a fixture is reached by distance, height and facing rather than by a raycast', () => {
  const catalog = catalogFor();
  const door = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.DOOR);
  const standing = { x: door.x - 1.2, y: door.y, z: door.z };

  const facing = fixtures.selectInteractable(catalog, { ...standing, yaw: facingFrom(standing, door) });
  const turnedAway = fixtures.selectInteractable(catalog, { ...standing, yaw: facingFrom(standing, door) + Math.PI });
  const aFloorBelow = fixtures.selectInteractable(catalog, { ...standing, y: door.y - fixture.CONFIG.floorHeight, yaw: facingFrom(standing, door) });
  const tooFar = fixtures.selectInteractable(catalog, { x: door.x - 9, y: door.y, z: door.z, yaw: facingFrom({ x: door.x - 9, z: door.z }, door) });

  assert.equal(facing?.id, door.id);
  assert.equal(turnedAway, null, 'a fixture behind you is not in reach');
  assert.equal(aFloorBelow, null, 'a fixture through the ceiling is not in reach');
  assert.equal(tooFar, null);
});

test('a locked door needs its key, and the key comes out of a drawer exactly once', () => {
  const hotel = fixture.buildHotel();
  const catalog = catalogFor(hotel);
  const locked = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.DOOR && item.locked);
  const drawer = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.DRAWER && item.keyId === locked.requiredKey);
  let state = fixtures.createFixtureState(catalog);

  const refused = fixtures.applyInteraction(state, locked, 'ana');
  assert.equal(refused.event.type, 'door-locked');
  assert.equal(refused.state.doors[locked.id].locked, true);

  state = fixtures.applyInteraction(state, drawer, 'ana').state;
  const found = fixtures.applyInteraction(state, drawer, 'ana');
  assert.equal(found.event.type, 'key-found');
  assert.deepEqual(fixtures.keysOf(found.state, 'ana'), [locked.requiredKey]);
  state = found.state;

  // The drawer is a contested object: whoever searches it second finds it empty. That decision is
  // the whole reason it belongs to the authority rather than to each client's own copy.
  // Ben closes it, reopens it and looks for himself: the drawer works, the key is gone.
  let bens = fixtures.applyInteraction(state, drawer, 'ben').state;
  bens = fixtures.applyInteraction(bens, drawer, 'ben').state;
  const second = fixtures.applyInteraction(bens, drawer, 'ben');
  assert.equal(second.event.type, 'drawer-empty');
  assert.deepEqual(fixtures.keysOf(second.state, 'ben'), []);

  const unlocked = fixtures.applyInteraction(state, locked, 'ana');
  assert.equal(unlocked.event.type, 'door-unlocked');
  assert.equal(unlocked.state.doors[locked.id].locked, false);
  assert.equal(unlocked.state.doors[locked.id].open, true);
});

test('a secret panel is discovered before it is a door', () => {
  const catalog = catalogFor();
  const panel = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.PANEL);
  let state = fixtures.createFixtureState(catalog);
  assert.equal(state.doors[panel.id].discovered, false);

  const first = fixtures.applyInteraction(state, panel, 'ana');
  assert.equal(first.event.type, 'secret-discovered');
  assert.equal(first.state.doors[panel.id].open, true);

  const second = fixtures.applyInteraction(first.state, panel, 'ana');
  assert.equal(second.event.type, 'secret-closed');
  assert.equal(second.state.doors[panel.id].open, false);
});

test('a swinging door reaches the space, and only when its angle actually changed', () => {
  const hotel = fixture.buildHotel();
  const catalog = catalogFor(hotel);
  const door = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.DOOR && !item.locked && !item.openInitially);
  const opened = [];
  const space = { setOpening: (id, angle) => { opened.push([id, angle]); return true; }, setDynamicHeight() {}, setDynamicBoxes() {} };
  let state = fixtures.applyInteraction(fixtures.createFixtureState(catalog), door, 'ana').state;

  for (let tick = 0; tick < 60; tick += 1) state = fixtures.tickFixtures(state, 1 / 60, { config: fixture.CONFIG, space });
  const afterSwing = opened.length;
  assert.ok(Math.abs(state.doors[door.id].angle - door.openAngle) < 1e-6, 'the leaf should reach its target');
  assert.ok(opened.some(([id]) => id === door.id));

  for (let tick = 0; tick < 60; tick += 1) state = fixtures.tickFixtures(state, 1 / 60, { config: fixture.CONFIG, space });
  assert.equal(opened.length, afterSwing, 'a door that has finished swinging must not re-publish');
});

test('the cabin is held shut for the head start and only a release opens it', () => {
  const catalog = catalogFor();
  let state = fixtures.holdElevator(fixtures.createFixtureState(catalog));
  assert.equal(state.elevator.doorAmount, 0);

  const button = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.ELEVATOR_BUTTON && item.callFloor === 3);
  const call = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.ELEVATOR_CALL && item.callFloor === 2);
  assert.equal(fixtures.applyInteraction(state, button, 'seeker').state.elevator.state, fixtures.ELEVATOR_STATES.HELD);
  assert.equal(fixtures.applyInteraction(state, call, 'ana').event.type, 'elevator-held');

  for (let tick = 0; tick < 300; tick += 1) state = fixtures.tickFixtures(state, 1 / 60, { config: fixture.CONFIG });
  assert.equal(state.elevator.doorAmount, 0, 'a held cabin does not open on its own');

  state = fixtures.releaseElevator(state);
  for (let tick = 0; tick < 120; tick += 1) state = fixtures.tickFixtures(state, 1 / 60, { config: fixture.CONFIG });
  assert.equal(state.elevator.state, fixtures.ELEVATOR_STATES.OPEN);
  assert.equal(state.elevator.doorAmount, 1);
});

test('the cabin carries its own colliders up the shaft and opens the hall doors it is standing at', () => {
  const catalog = catalogFor();
  const openings = {};
  const boxes = { current: [] };
  const space = {
    setOpening: (id, value) => { openings[id] = value; return true; },
    setDynamicHeight() {},
    setDynamicBoxes: (next) => { boxes.current = next; },
  };
  let state = fixtures.createFixtureState(catalog);
  const button = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.ELEVATOR_BUTTON && item.callFloor === 3);
  state = fixtures.applyInteraction(state, button, 'ana').state;

  for (let tick = 0; tick < 60 * 20; tick += 1) {
    state = fixtures.tickFixtures(state, 1 / 60, { config: fixture.CONFIG, space });
    if (state.elevator.state === fixtures.ELEVATOR_STATES.OPEN && state.elevator.floor === 3) break;
  }

  assert.equal(state.elevator.floor, 3);
  assert.ok(Math.abs(state.elevator.y - fixture.floorY(3)) < 0.01);
  assert.ok(boxes.current.every((box) => box.minY >= fixture.floorY(3) - 0.01), 'the cabin walls ride the car');
  assert.equal(openings['hall-door-3-left'], 1);
  assert.equal(openings['hall-door-1-left'], 0, 'a floor the cabin has left must not stay open onto the shaft');
});

test('what goes on the wire is only what a client has to draw', () => {
  const catalog = catalogFor();
  const door = catalog.find((item) => item.kind === fixtures.FIXTURE_KINDS.DOOR && !item.locked && !item.openInitially);
  const untouched = catalog.filter((item) => item.kind === fixtures.FIXTURE_KINDS.PANEL);
  let state = fixtures.applyInteraction(fixtures.createFixtureState(catalog), door, 'ana').state;
  state = fixtures.tickFixtures(state, 1 / 60, { config: fixture.CONFIG });

  const wire = fixtures.describeFixtures(state);
  assert.ok(Math.abs(wire.doors[door.id]) > 0, 'a door mid-swing has to be published so a client can draw it');
  for (const panel of untouched) {
    assert.equal(panel.id in wire.doors, false, 'an undiscovered panel must not be published — that is a wallhack');
  }
  assert.equal(typeof wire.elevator.y, 'number');
  assert.equal('keys' in wire, false, 'another player\'s key ring is not a client\'s business');
});
