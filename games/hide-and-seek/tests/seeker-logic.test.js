const test = require('node:test');
const assert = require('node:assert/strict');

const seeker = require('../seeker-logic.js');

const CONFIG = { visionDistance: 15, fieldOfView: Math.PI * 0.8, memorySeconds: 3 };

test('the solo seeker only acquires living hiders it can see', () => {
  const hunter = { x: 0, y: 0, z: 0, yaw: 0 };
  const players = [
    { id: 'dead', role: 'hider', alive: false, x: 0, y: 0, z: 4 },
    { id: 'behind', role: 'hider', alive: true, x: 0, y: 0, z: -4 },
    { id: 'seen', role: 'hider', alive: true, x: 1, y: 0, z: 5 },
  ];

  assert.equal(seeker.selectVisibleHider(players, hunter, { config: CONFIG, isOccluded: () => false }).id, 'seen');
  assert.equal(seeker.selectVisibleHider(players, hunter, { config: CONFIG, isOccluded: (entry) => entry.id === 'seen' }), null);
});

test('the seeker remembers a sighting briefly, then resumes searching', () => {
  let state = seeker.createSeekerState();
  const target = { id: 'hider', x: 2, y: 0, z: 8, floor: 1 };

  state = seeker.updateSeeker(state, { delta: 0.1, visible: target, config: CONFIG });
  assert.equal(state.mode, seeker.SEEKER_STATES.CHASING);
  assert.equal(state.targetId, 'hider');

  state = seeker.updateSeeker(state, { delta: 2, visible: null, config: CONFIG });
  assert.equal(state.mode, seeker.SEEKER_STATES.SEARCHING);
  assert.equal(state.targetId, 'hider');

  state = seeker.updateSeeker(state, { delta: 2, visible: null, config: CONFIG });
  assert.equal(state.mode, seeker.SEEKER_STATES.PATROLLING);
  assert.equal(state.targetId, null);
});

test('a room-to-room sweep exits the current room before crossing the hall', () => {
  const route = seeker.createSweepRoute({
    hunter: { x: -8, y: 0, z: 10, floor: 1 },
    target: { x: 8, y: 0, z: 30, floor: 1 },
  });

  assert.deepEqual(route, [
    { x: -3.75, y: 0, z: 10, floor: 1, guided: false },
    { x: 0, y: 0, z: 10, floor: 1, guided: false },
    { x: 0, y: 0, z: 30, floor: 1, guided: false },
    { x: 3.75, y: 0, z: 30, floor: 1, guided: false },
    { x: 8, y: 0, z: 30, floor: 1, guided: false },
  ]);
});

test('a seeker chasing a visible hider in the same bedroom does not repeatedly exit the room', async () => {
  const { mapRuntime } = require('./helpers/map-fixture.js');
  const context = await mapRuntime('grand-hotel');
  const { createSeeker } = await import('../modules/seeker.js');
  context.plan.spawns.seeker = { x: -8, y: 0, z: 30, floor: 1 };
  const target = { id: 'guest', role: 'hider', alive: true, x: -8, y: 0, z: 32, floor: 1 };
  assert.equal(context.world.sightBlocked({ x: -8, y: 1.55, z: 30 }, { ...target, y: 1.55 }), false);
  const hunter = createSeeker({ ...context, logic: seeker, tuning: seeker.SEEKER_DEFAULTS });
  hunter.setHeld(false);
  let nearest = Infinity;
  for (let tick = 0; tick < 120; tick++) {
    hunter.update(1 / 60, [target]);
    const body = hunter.getState();
    nearest = Math.min(nearest, Math.hypot(body.x - target.x, body.z - target.z));
  }
  assert.ok(nearest < .3, `seeker never closed on the visible hider: ${nearest}`);
});

test('seeker route recovery keeps its retry budget and never skips a blocked stair approach', async () => {
  const context = await require('./helpers/map-fixture.js').mapRuntime('grand-hotel');
  const { createSeeker } = await import('../modules/seeker.js');
  let plans = 0;
  const attempts = [];
  context.enemyLogic = { ...context.enemyLogic, createNavigator: () => ({
    planFloorRoute: () => { plans++; return [{ x: 0, y: 0, z: 40 }, { x: 5, y: 2, z: 48, guided: true, stair: true }]; },
  }) };
  context.movement = { stepToward(space, body, from, target) {
    attempts.push(target);
    return { ...from, moved: false, arrived: false, blocked: true, dirX: 0, dirZ: 0 };
  } };
  const hunter = createSeeker({ ...context, logic: seeker, tuning: seeker.SEEKER_DEFAULTS });
  hunter.setHeld(false);
  for (let tick = 0; tick < 4; tick++) hunter.update(1 / 60, []);
  assert.equal(plans, 4, 'initial plan plus at most three retries');
  assert.ok(attempts.every(p => !p.guided), 'failed entry cannot expose the guided stair leg');
});

test('CPU bodies retain their obstacle-avoidance direction between movement ticks', async () => {
  const { createSeeker } = await import('../modules/seeker.js');
  const { createHiders } = await import('../modules/hiders.js');
  for (const kind of ['seeker', 'hider']) {
    const context = await require('./helpers/map-fixture.js').mapRuntime('grand-hotel');
    const received = [];
    context.movement = { stepToward(space, body, from, target, options) {
      received.push(options.avoidance);
      return { ...from, z: from.z + .01, moved: true, arrived: false, blocked: false, dirX: 0, dirZ: 1, avoidance: { x: 0, z: 1 } };
    } };
    const cpu = kind === 'seeker'
      ? createSeeker({ ...context, logic: seeker, tuning: seeker.SEEKER_DEFAULTS })
      : createHiders({ ...context, logic: require('../hider-logic.js'), count: 1 });
    cpu.setHeld?.(false);
    cpu.update(1 / 60, []);
    cpu.update(1 / 60, []);
    assert.deepEqual(received[1], { x: 0, z: 1 }, `${kind} must not reverse its wall slide every tick`);
  }
});

test('a hider does not promote a guided stair waypoint after its entrance is blocked', async () => {
  const context = await require('./helpers/map-fixture.js').mapRuntime('grand-hotel');
  const { createHiders } = await import('../modules/hiders.js');
  const attempts = [];
  context.enemyLogic = { ...context.enemyLogic, createNavigator: () => ({ planFloorRoute: () => [
    { x: 0, y: 0, z: 40 }, { x: 5, y: 2, z: 48, guided: true, stair: true },
  ] }) };
  context.movement = { stepToward(space, body, from, target) {
    attempts.push(target);
    return { ...from, moved: false, arrived: false, blocked: true, dirX: 0, dirZ: 0 };
  } };
  const hiders = createHiders({ ...context, logic: require('../hider-logic.js'), count: 1 });
  for (let tick = 0; tick < 3; tick++) hiders.update(1 / 60, []);
  assert.ok(attempts.length >= 2);
  assert.ok(attempts.every(p => !p.guided));
});
