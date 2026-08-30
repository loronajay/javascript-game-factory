// Keys are a map's contract, not the hotel's habit.
//
// A locked door is only a puzzle if the key that opens it is somewhere a player can walk to. The
// hotel and the mall both hide a master key per level in a drawer; the hospital shipped with every
// department unlocked, so the whole key/drawer loop was dead on it. These tests iterate the registry
// rather than naming a building, so a map that registers locked doors without findable keys — or no
// locked doors at all — fails here rather than in a round.
const test = require('node:test');
const assert = require('node:assert/strict');
const maps = require('../map-catalog.js');
const { buildPlan } = require('./helpers/map-fixture.js');

const PLAYABLE = maps.playableMaps();

function keyDrawers(plan) {
  return plan.furnishings.filter((placement) => placement.type === 'dresser' && placement.keyId);
}

function lockedDoors(plan) {
  return plan.roomDoors.filter((door) => door.locked);
}

function roomContaining(plan, placement) {
  return plan.roomCenters.find((room) => room.floor === placement.floor
    && placement.x >= room.minX && placement.x <= room.maxX
    && placement.z >= room.minZ && placement.z <= room.maxZ);
}

test('every playable map has locked rooms', () => {
  for (const map of PLAYABLE) {
    const plan = buildPlan(map.id);
    assert.ok(lockedDoors(plan).length > 0, `${map.id} has no locked room to need a key`);
  }
});

test('every locked door names a key that a drawer actually holds, on its own floor', () => {
  for (const map of PLAYABLE) {
    const plan = buildPlan(map.id);
    const drawers = keyDrawers(plan);
    for (const door of lockedDoors(plan)) {
      assert.ok(door.requiredKey, `${map.id} door ${door.id} is locked with no required key`);
      const holders = drawers.filter((placement) => placement.keyId === door.requiredKey);
      assert.ok(holders.length > 0, `${map.id}: nothing holds ${door.requiredKey} for door ${door.id}`);
      assert.ok(holders.some((placement) => placement.floor === door.floor),
        `${map.id}: ${door.requiredKey} is not findable on floor ${door.floor}`);
    }
  }
});

test('a key is never locked behind a door', () => {
  for (const map of PLAYABLE) {
    const plan = buildPlan(map.id);
    const locked = new Set(lockedDoors(plan).map((door) => door.roomNumber));
    for (const placement of keyDrawers(plan)) {
      const room = roomContaining(plan, placement);
      if (!room) continue;
      assert.ok(!locked.has(room.roomNumber),
        `${map.id}: ${placement.keyId} sits in locked room ${room.roomNumber}`);
    }
  }
});

test('every floor of every playable map has a locked room and its key', () => {
  for (const map of PLAYABLE) {
    const plan = buildPlan(map.id);
    const drawers = keyDrawers(plan);
    for (let floor = 1; floor <= maps.floorCountFor(map.id); floor += 1) {
      assert.ok(lockedDoors(plan).some((door) => door.floor === floor),
        `${map.id} floor ${floor} has nothing locked`);
      assert.ok(drawers.some((placement) => placement.floor === floor),
        `${map.id} floor ${floor} hides no key`);
    }
  }
});

test('a key drawer stands clear of its own room doorway', () => {
  for (const map of PLAYABLE) {
    const plan = buildPlan(map.id);
    for (const placement of keyDrawers(plan)) {
      const room = roomContaining(plan, placement);
      if (!room) continue;
      const target = plan.roomCenters.find((entry) => entry.roomNumber === room.roomNumber);
      assert.ok(Math.hypot(placement.x - target.x, placement.z - target.z) > 0.9,
        `${map.id}: ${placement.keyId} drawer blocks the ${room.roomNumber} entry aisle`);
    }
  }
});
