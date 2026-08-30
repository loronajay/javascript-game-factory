const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ENEMY_STATES,
  aggregateEnemyState,
  canDetectPlayer,
  chooseRoamTarget,
  createStairPursuitRoute,
  createStairRoute,
  chooseSpawn,
  createAwareness,
  prepareHuntDoor,
  prepareRoamDoor,
  selectDetectedTarget,
  updateAwareness,
} = require('../enemy-logic.js');
const { createStairLayout } = require('../layout.js');

test('detection considers every player and chooses the nearest visible target', () => {
  const enemy = { x: 0, y: 0, z: 0, facingX: 0, facingZ: 1 };
  const candidates = [
    { id: 'local', x: 0, y: 0, z: 12, crouching: false },
    { id: 'hider-1', x: 0, y: 0, z: 6, crouching: false },
    { id: 'hider-2', x: 0, y: 0, z: 4, crouching: false },
  ];

  const target = selectDetectedTarget(candidates, enemy, { isOccluded: (candidate) => candidate.id === 'hider-2' });

  assert.equal(target.id, 'hider-1');
});

test('multiple demons publish the most urgent shared threat state', () => {
  assert.equal(aggregateEnemyState([{ state: ENEMY_STATES.ROAM }, { state: ENEMY_STATES.CHASE }]), ENEMY_STATES.CHASE);
  assert.equal(aggregateEnemyState([{ state: ENEMY_STATES.ROAM }, { state: ENEMY_STATES.SEARCH }]), ENEMY_STATES.SEARCH);
  assert.equal(aggregateEnemyState([{ state: ENEMY_STATES.ROAM, routePurpose: 'hunt' }]), 'hunt');
  assert.equal(aggregateEnemyState([{ state: ENEMY_STATES.ROAM }]), ENEMY_STATES.ROAM);
});

test('spawn selection keeps the demon away from the player when possible', () => {
  const spawns = [
    { x: 2, z: 3, floor: 1 },
    { x: 0, z: 28, floor: 1 },
    { x: -2, z: 3, floor: 3 },
  ];

  const picked = chooseSpawn(spawns, { x: 0, z: 0, floor: 1 }, () => 0, 20);
  assert.deepEqual(picked, spawns[1]);
});

test('a second demon excludes floors already occupied by another demon', () => {
  const spawns = [
    { x: 0, z: 28, floor: 1 },
    { x: 0, z: 28, floor: 2 },
    { x: 0, z: 28, floor: 3 },
  ];

  const picked = chooseSpawn(spawns, { x: 0, z: 0, floor: 1 }, () => 0, 20, [1]);
  assert.equal(picked.floor, 2);
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

test('a demon follows fresh pursuit clues briefly after sight is broken', () => {
  let awareness = createAwareness();
  awareness = updateAwareness(awareness, {
    seesPlayer: true,
    delta: 0.1,
    playerId: 'local',
    playerPosition: { x: 0, y: 0, z: 42, floor: 1, inStairwell: false },
  });

  awareness = updateAwareness(awareness, {
    seesPlayer: false,
    delta: 0.5,
    pursuitClue: { id: 'local', x: 5.65, y: 1.15, z: 48.25, floor: 1, inStairwell: true },
  });

  assert.equal(awareness.state, ENEMY_STATES.SEARCH);
  assert.equal(awareness.targetId, 'local');
  assert.equal(awareness.clueActive, true);
  assert.deepEqual(awareness.lastSeen, { x: 5.65, y: 1.15, z: 48.25, floor: 1, inStairwell: true });

  awareness = updateAwareness(awareness, {
    seesPlayer: false,
    delta: 6,
    pursuitClue: { id: 'local', x: 0, y: 4.6, z: 30, floor: 2, inStairwell: false },
  });
  assert.equal(awareness.clueActive, false, 'tracking must expire instead of becoming permanent omniscience');
  assert.notDeepEqual(awareness.lastSeen, { x: 0, y: 4.6, z: 30, floor: 2, inStairwell: false });
});

test('inter-floor routes follow the real switchback stairs without leaving between floors', () => {
  const stairLayout = createStairLayout({ floorCount: 4, floorHeight: 4.6 });
  const route = createStairRoute({ fromFloor: 1, toFloor: 3, floorHeight: 4.6, stairLayout });

  assert.deepEqual(route[0], { x: 0, y: 0, z: 42.8, floor: 1, guided: false });
  assert.deepEqual(route.at(-1), { x: 0, y: 9.2, z: 42.8, floor: 3, guided: false });
  assert.ok(route.filter((point) => point.stair).every((point) => point.guided));
  assert.ok(route.every((point, index) => index === 0 || point.y >= route[index - 1].y));
  assert.equal(route.filter((point) => point.x === 0).length, 2, 'route should not exit and re-enter at intermediate floors');
  assert.ok(route.some((point) => point.x === 5.65 && point.z === 51.8 && point.y === 2.3));
  assert.ok(route.some((point) => point.x === 7.85 && point.z === 44.7 && point.y === 9.2));
});

test('descending routes traverse the stair flights in reverse order', () => {
  const stairLayout = createStairLayout({ floorCount: 4, floorHeight: 4.6 });
  const route = createStairRoute({ fromFloor: 4, toFloor: 2, floorHeight: 4.6, stairLayout });

  assert.ok(route.every((point, index) => index === 0 || point.y <= route[index - 1].y));
  assert.deepEqual(route.at(-1), { x: 0, y: 4.6, z: 42.8, floor: 2, guided: false });
});

test('a same-floor pursuit enters the stairwell before following a player onto a flight', () => {
  const stairLayout = createStairLayout({ floorCount: 4, floorHeight: 4.6 });
  const route = createStairPursuitRoute({
    enemy: { x: 0, y: 0, z: 20, floor: 1, inStairwell: false },
    target: { x: 5.65, y: 1.15, z: 48.25, inStairwell: true },
    floorHeight: 4.6,
    stairLayout,
  });

  assert.deepEqual(route[0], { x: 0, y: 0, z: 44.15, floor: 1, guided: false });
  assert.deepEqual(route[1], { x: 5.35, y: 0, z: 44.15, floor: 1, guided: true, stair: true });
  assert.ok(route.some((point) => point.x === 5.65 && point.y === 0 && point.z === 44.7));
  assert.deepEqual(route.at(-1), { x: 5.65, y: 1.15, z: 48.25, floor: 1, guided: true, stair: true });
});

test('a demon already on the stairs follows the switchback instead of exiting through a wall', () => {
  const stairLayout = createStairLayout({ floorCount: 4, floorHeight: 4.6 });
  const route = createStairPursuitRoute({
    enemy: { x: 7.85, y: 3.45, z: 48.25, inStairwell: true },
    target: { x: 5.65, y: 1.15, z: 48.25, inStairwell: true },
    floorHeight: 4.6,
    stairLayout,
  });

  assert.ok(route.length > 2);
  assert.ok(route.every((point) => point.guided && point.stair));
  assert.ok(route.some((point) => point.x === 5.65 && point.z === 51.8), 'route should use the north switchback');
  assert.equal(route.some((point) => point.x === 0), false, 'an active stair pursuit must not leave the shaft');
  assert.deepEqual(route.at(-1), { x: 5.65, y: 1.15, z: 48.25, floor: 1, guided: true, stair: true });
});

test('roaming occasionally chooses an available room and otherwise stays in the halls', () => {
  const halls = [{ x: 0, z: -20, floor: 1 }, { x: 0, z: 20, floor: 2 }];
  const rooms = [{ id: '105', x: -8, z: 30, floor: 1 }];
  const roomVisit = chooseRoamTarget({ hallTargets: halls, roomTargets: rooms, roomChance: 0.25 }, sequenceRandom([0.1, 0.9]));
  const hallVisit = chooseRoamTarget({ hallTargets: halls, roomTargets: rooms, roomChance: 0.25 }, sequenceRandom([0.8, 0.75]));

  assert.deepEqual(roomVisit, { id: '105', x: -8, z: 30, floor: 1, room: true });
  assert.deepEqual(hallVisit, { x: 0, z: 20, floor: 2, room: false });
});

test('a heat hunt opens even a locked room door in the correct direction', () => {
  const leftDoor = { side: 'left', locked: true, open: false, target: 0 };
  const rightDoor = { side: 'right', locked: true, open: false, target: 0 };

  assert.equal(prepareHuntDoor(leftDoor, Math.PI / 2), true);
  assert.equal(prepareHuntDoor(rightDoor, Math.PI / 2), true);
  assert.deepEqual(leftDoor, { side: 'left', locked: false, open: true, target: -Math.PI / 2 });
  assert.deepEqual(rightDoor, { side: 'right', locked: false, open: true, target: Math.PI / 2 });
  assert.equal(prepareHuntDoor(null, Math.PI / 2), false);
});

test('AI door opening preserves an authored swing angle on either doorway axis', () => {
  const door = { side: 'left', openAngle: Math.PI / 2, locked: true };
  prepareHuntDoor(door);
  assert.equal(door.target, door.openAngle);
  door.openAngle = -Math.PI / 2;
  prepareRoamDoor(door);
  assert.equal(door.target, door.openAngle);
});

test('an ordinary room trudge opens unlocked doors but respects locked ones', () => {
  const unlocked = { side: 'right', locked: false, open: false, target: 0 };
  const locked = { side: 'left', locked: true, open: false, target: 0 };

  assert.equal(prepareRoamDoor(unlocked, Math.PI / 2), true);
  assert.deepEqual(unlocked, { side: 'right', locked: false, open: true, target: Math.PI / 2 });
  assert.equal(prepareRoamDoor(locked, Math.PI / 2), false);
  assert.deepEqual(locked, { side: 'left', locked: true, open: false, target: 0 });
});

function sequenceRandom(values) {
  let index = 0;
  return () => values[index++];
}
