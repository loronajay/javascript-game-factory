const test = require('node:test');
const assert = require('node:assert/strict');

const sim = require('../sim-logic.js');
const movement = require('../movement-logic.js');
const round = require('../round-logic.js');
const stamina = require('../stamina-logic.js');
const flashlight = require('../flashlight-logic.js');
const sanity = require('../sanity-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

const TICK = 1 / 60;
const PLAYER = {
  walkSpeed: 3.1, sprintSpeed: 5.4, crouchSpeed: 1.9,
  bodyHeight: fixture.CONFIG.bodyHeight, playerRadius: fixture.CONFIG.playerRadius,
};
const ROUND_CONFIG = { durationSeconds: 300, hideSeconds: 45, tagDistance: 1.35, tagHeightTolerance: 1.2 };

function createSim(hotel, space) {
  return sim.createSimulation({
    movement, round, stamina, flashlight, sanity,
    space,
    zones: [],
    config: { player: PLAYER, round: ROUND_CONFIG, flashlight: { drainSeconds: 120 } },
  });
}

function seats(hotel) {
  const spawns = hotel.spawns.hiders.slice(0, 3);
  return [
    { id: 'seeker', spawn: { x: spawns[0].x, y: spawns[0].y, z: spawns[0].z - 4 } },
    ...spawns.map((spawn, index) => ({ id: `hider-${index}`, spawn: { x: spawn.x, y: spawn.y, z: spawn.z } })),
  ];
}

function idle() { return { forward: 0, strafe: 0, yaw: 0, crouch: false, sprint: false, light: false }; }

function run(engine, state, inputsFor, seconds) {
  let next = state;
  for (let tick = 0; tick < Math.round(seconds / TICK); tick += 1) next = engine.tick(next, TICK, inputsFor(next));
  return next;
}

test('the simulation seats every player, names one seeker and starts them held', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  const state = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  const snapshot = engine.snapshot(state);

  assert.equal(snapshot.players.length, 4);
  assert.equal(snapshot.players.find((entry) => entry.id === 'seeker').role, round.ROLES.SEEKER);
  assert.equal(snapshot.round.phase, round.PHASES.HIDING);
  assert.equal(snapshot.players.every((entry) => entry.alive), true);
});

test('a held seeker cannot walk during the head start but the hiders can', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  const start = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  const walkNorth = { ...idle(), forward: 1, yaw: Math.PI };

  const state = run(engine, start, () => ({ seeker: walkNorth, 'hider-0': walkNorth }), 2);
  const before = engine.snapshot(start);
  const after = engine.snapshot(state);
  const moved = (id) => Math.hypot(
    after.players.find((entry) => entry.id === id).x - before.players.find((entry) => entry.id === id).x,
    after.players.find((entry) => entry.id === id).z - before.players.find((entry) => entry.id === id).z,
  );

  assert.equal(moved('seeker'), 0);
  assert.ok(moved('hider-0') > 4, `a hider should cover ground in the head start; moved ${moved('hider-0')}`);
});

test('the simulation resolves a tag from positions rather than from a claim', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  let state = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  state = engine.tick(state, ROUND_CONFIG.hideSeconds, {});
  assert.equal(engine.snapshot(state).round.phase, round.PHASES.SEEKING);

  // The seeker walks the corridor onto hider-0, who is standing four metres away and does nothing.
  state = run(engine, state, () => ({ seeker: { ...idle(), forward: 1, yaw: Math.PI } }), 3);
  const snapshot = engine.snapshot(state);

  assert.equal(snapshot.players.find((entry) => entry.id === 'hider-0').alive, false);
  assert.equal(snapshot.round.hidersRemaining, 2);
});

test('sprinting drains the meter and an emptied one drops the runner back to a walk', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  let state = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  const sprint = { ...idle(), forward: 1, yaw: 0, sprint: true };

  state = run(engine, state, () => ({ 'hider-2': sprint }), 8);
  const runner = engine.snapshot(state).players.find((entry) => entry.id === 'hider-2');

  assert.equal(runner.stamina.exhausted, true);
  assert.equal(runner.stamina.sprinting, false);
});

test('the flashlight is spent by the simulation, so a client cannot assert its own charge', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  let state = engine.createState({ players: seats(hotel), seekerId: 'seeker' });

  state = run(engine, state, () => ({ 'hider-1': { ...idle(), light: true } }), 6);
  const lit = engine.snapshot(state).players.find((entry) => entry.id === 'hider-1');

  assert.equal(lit.flashlight.on, true);
  assert.ok(lit.flashlight.charge < 1 && lit.flashlight.charge > 0.9, `expected a partly spent battery, got ${lit.flashlight.charge}`);
  // An input claiming a full battery changes nothing: only the tick spends or fills one.
  const spoofed = engine.tick(state, TICK, { 'hider-1': { ...idle(), light: true, flashlightCharge: 1, alive: true } });
  assert.ok(engine.snapshot(spoofed).players.find((entry) => entry.id === 'hider-1').flashlight.charge < lit.flashlight.charge);
});

test('a demon catch and the clock both end the round through the same settle', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  let state = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  state = engine.tick(state, ROUND_CONFIG.hideSeconds, {});

  const eaten = engine.resolveDemonCatch(state, 'seeker');
  assert.equal(engine.snapshot(eaten).round.over, true);
  assert.equal(engine.snapshot(eaten).round.outcome, round.OUTCOMES.HIDERS);

  const expired = engine.tick(state, ROUND_CONFIG.durationSeconds, {});
  assert.equal(engine.snapshot(expired).round.outcome, round.OUTCOMES.HIDERS);
  assert.equal(engine.snapshot(expired).round.cause, round.CAUSES.TIMEOUT);
});

test('the same inputs produce the same state, because a mirrored server has to agree', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  const start = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  const script = (state) => ({
    'hider-0': { ...idle(), forward: 1, yaw: state.tick % 120 < 60 ? 0 : Math.PI, sprint: state.tick % 40 < 20 },
    'hider-1': { ...idle(), strafe: 1, yaw: 0.7, crouch: true },
  });

  const left = engine.snapshot(run(engine, start, script, 6));
  const right = engine.snapshot(run(engine, start, script, 6));

  assert.deepEqual(left, right);
});

test('a tick never mutates the state it was handed', () => {
  const hotel = fixture.buildHotel();
  const engine = createSim(hotel, fixture.createSpace(hotel));
  const start = engine.createState({ players: seats(hotel), seekerId: 'seeker' });
  const before = JSON.stringify(engine.snapshot(start));

  engine.tick(start, TICK, { 'hider-0': { ...idle(), forward: 1 } });

  assert.equal(JSON.stringify(engine.snapshot(start)), before);
});

test('the plan space answers ground, collision and sight without a renderer', () => {
  const hotel = fixture.buildHotel();
  const space = sim.createPlanSpace({ plan: require('../hotel-plan.js'), collision: require('../collision-logic.js'), hotel, config: fixture.CONFIG });
  const door = hotel.roomDoors[0];
  const room = hotel.roomCenters.find((entry) => entry.roomNumber === door.roomNumber);
  const feet = fixture.floorY(room.floor);

  assert.equal(space.groundAt(0, room.z, feet), feet);
  // A shut door is a box in the doorway; an open one has swung out of it. The cached collider set
  // has to notice, or the server would keep walking bodies through a door the client can see.
  const shutHotel = JSON.stringify(space.colliders());
  space.setOpening(door.id, fixture.CONFIG.doorOpenAngle);
  assert.notEqual(JSON.stringify(space.colliders()), shutHotel, 'opening a door must change the resolved boxes');
  assert.equal(space.sightBlocked({ x: 0, y: feet + 1.5, z: room.z }, { x: 0, y: feet + 1.5, z: room.z + 0.4 }), false);
});

test('the plan space rebuilds its colliders only when a door actually moves', () => {
  const hotel = fixture.buildHotel();
  const space = sim.createPlanSpace({ plan: require('../hotel-plan.js'), collision: require('../collision-logic.js'), hotel, config: fixture.CONFIG });
  const door = hotel.roomDoors[0];

  space.colliders();
  const first = space.rebuilds();
  for (let i = 0; i < 50; i += 1) space.colliders();
  assert.equal(space.rebuilds(), first, 'a query with nothing changed must not rebuild the hotel');

  space.setOpening(door.id, 1.2);
  space.colliders();
  assert.equal(space.rebuilds(), first + 1);
  space.setOpening(door.id, 1.2);
  space.colliders();
  assert.equal(space.rebuilds(), first + 1, 'setting a door to the angle it already has is not a change');
});
