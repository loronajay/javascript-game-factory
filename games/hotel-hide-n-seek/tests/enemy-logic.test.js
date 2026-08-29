const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ENEMY_STATES,
  canDetectPlayer,
  chooseSpawn,
  createAwareness,
  projectToMinimap,
  updateAwareness,
} = require('../enemy-logic.js');

test('spawn selection keeps the demon away from the player when possible', () => {
  const spawns = [
    { x: 2, z: 3, floor: 1 },
    { x: 0, z: 28, floor: 1 },
    { x: -2, z: 3, floor: 3 },
  ];

  const picked = chooseSpawn(spawns, { x: 0, z: 0, floor: 1 }, () => 0, 20);
  assert.deepEqual(picked, spawns[1]);
});

test('detection requires range, field of view, same level, and a clear ray', () => {
  const enemy = { x: 0, y: 0, z: 0, facingX: 0, facingZ: 1 };
  const visible = { x: 0, y: 0, z: 10, crouching: false };

  assert.equal(canDetectPlayer({ enemy, player: visible, occluded: false }), true);
  assert.equal(canDetectPlayer({ enemy, player: { ...visible, z: -4 }, occluded: false }), false);
  assert.equal(canDetectPlayer({ enemy, player: { ...visible, y: 4.6 }, occluded: false }), false);
  assert.equal(canDetectPlayer({ enemy, player: visible, occluded: true }), false);
});

test('crouching substantially shortens long-range detection', () => {
  const enemy = { x: 0, y: 0, z: 0, facingX: 0, facingZ: 1 };
  const player = { x: 0, y: 0, z: 14, crouching: true };

  assert.equal(canDetectPlayer({ enemy, player, occluded: false }), false);
  assert.equal(canDetectPlayer({ enemy, player: { ...player, crouching: false }, occluded: false }), true);
});

test('a lock-on becomes a finite search after LOS breaks, then returns to roaming', () => {
  let awareness = createAwareness();
  awareness = updateAwareness(awareness, { seesPlayer: true, delta: 0.1, playerPosition: { x: 1, y: 0, z: 2 } });
  assert.equal(awareness.state, ENEMY_STATES.CHASE);
  assert.deepEqual(awareness.lastSeen, { x: 1, y: 0, z: 2 });

  awareness = updateAwareness(awareness, { seesPlayer: false, delta: 0.5 });
  assert.equal(awareness.state, ENEMY_STATES.SEARCH);
  assert.ok(awareness.searchRemaining > 0);

  awareness = updateAwareness(awareness, { seesPlayer: false, delta: 9 });
  assert.equal(awareness.state, ENEMY_STATES.ROAM);
  assert.equal(awareness.lastSeen, null);
});

test('the minimap projection deliberately ignores vertical floor position', () => {
  const bounds = { minX: -10, maxX: 10, minZ: -60, maxZ: 60 };
  const floorOne = projectToMinimap({ x: 3, y: 0, z: -12 }, bounds);
  const floorFour = projectToMinimap({ x: 3, y: 13.8, z: -12 }, bounds);

  assert.deepEqual(floorOne, floorFour);
  assert.ok(floorOne.left > 0 && floorOne.left < 100);
  assert.ok(floorOne.top > 0 && floorOne.top < 100);
});
