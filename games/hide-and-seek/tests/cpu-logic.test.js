// CPU guests in an online round: bots at the keyboard of ordinary sim bodies.
//
// These run the shipped authority — `sim-logic.js` composed exactly as `factory-network-server`
// composes it — with `cpu-logic.js` pressing the keys for some of the seats. Nothing here reaches
// into a body: if a bot cannot get into a room by sending inputs, a human could not either, and that
// is the whole reason the seats are honest.
const test = require('node:test');
const assert = require('node:assert/strict');
const maps = require('../map-catalog.js');
const cpu = require('../cpu-logic.js');
const hiderLogic = require('../hider-logic.js');
const demonLogic = require('../demon-logic.js');
const enemyLogic = require('../enemy-logic.js');
const roundLogic = require('../round-logic.js');
const sim = require('../sim-logic.js');
const fixture = require('./helpers/hotel-fixture.js');
const { buildPlan } = require('./helpers/map-fixture.js');

const TICK = 1 / 60;
// The demons stand still: these tests are about hiding, and a roaming demon deciding a round before
// the assertion is reached is a test that passes on the luck of a seed.
const STILL = { walkSpeed: 0, chaseSpeed: 0, huntSpeed: 0 };
const STILL_INPUT = { forward: 0, strafe: 0, yaw: 0 };

function startRound(mapId, { cpuCount = 6, seed = 7 } = {}) {
  const hotel = buildPlan(mapId);
  const { engine, space } = fixture.createFullSim({
    hotel, seed,
    config: { demons: maps.demonRosterFor(mapId), demon: STILL, player: { ...fixture.SIM_CONFIG.player, floorCount: maps.floorCountFor(mapId) } },
  });
  const ids = cpu.cpuSeatIds(cpuCount, 1, 8);
  const players = [
    { id: 'seeker', spawn: hotel.spawns.seeker },
    ...ids.map((id, index) => ({ id, spawn: hotel.spawns.hiders[index % hotel.spawns.hiders.length] })),
  ];
  const ctx = cpu.createDriverContext({
    hotel, space, catalog: engine.catalog, enemy: enemyLogic, hiderLogic, demonLogic, roundLogic,
    config: fixture.CONFIG, random: fixture.seededRandom(seed + 1),
  });
  return { hotel, engine, space, ctx, ids, brains: ids.map(cpu.createHiderBrain), state: engine.createState({ players, seekerId: 'seeker' }) };
}

function run(round, seconds, seekerInput = STILL_INPUT) {
  const log = [];
  for (let tick = 0; tick < Math.round(seconds * 60); tick += 1) {
    const driven = cpu.driveHiders(round.brains, round.state, round.ctx, TICK);
    round.brains = driven.brains;
    round.state = round.engine.tick(round.state, TICK, { seeker: seekerInput, ...driven.inputs });
    log.push(...round.state.events);
  }
  return log;
}

function bodyOf(round, id) { return round.engine.bodyOf(round.state, id); }

test('CPU seats fill only the chairs nobody has claimed', () => {
  assert.deepEqual(cpu.cpuSeatIds(3, 2, 8), ['cpu-1', 'cpu-2', 'cpu-3']);
  assert.deepEqual(cpu.cpuSeatIds(6, 5, 8), ['cpu-1', 'cpu-2', 'cpu-3']);
  assert.deepEqual(cpu.cpuSeatIds(2, 8, 8), []);
  assert.deepEqual(cpu.cpuSeatIds('4', 3, 8), ['cpu-1', 'cpu-2', 'cpu-3', 'cpu-4']);
  assert.deepEqual(cpu.cpuSeatIds(-2, 2, 8), []);
  assert.deepEqual(cpu.cpuSeatIds(NaN, 2, 8), []);
  assert.equal(cpu.isCpuId('cpu-3'), true);
  assert.equal(cpu.isCpuId('socket-cpu-3'), false);
  assert.equal(cpu.cpuName('cpu-2'), 'CPU Guest 2');
});

test('a CPU guest only ever speaks in inputs the authority already accepts', () => {
  const round = startRound('grand-hotel', { cpuCount: 2 });
  const driven = cpu.driveHiders(round.brains, round.state, round.ctx, TICK);
  for (const input of Object.values(driven.inputs)) {
    assert.deepEqual(Object.keys(input).sort(), Object.keys(sim.NO_INPUT).sort(), 'a bot input has exactly the fields a human input has');
    assert.deepEqual(sim.readInput(input), input, 'nothing on a bot input is narrowed away by the authority');
  }
});

test('CPU hiders on every map walk to a room through the real doors and settle hidden inside it', () => {
  for (const map of maps.playableMaps()) {
    const round = startRound(map.id);
    run(round, 100);
    for (const brain of round.brains) {
      const body = bodyOf(round, brain.id);
      const spot = brain.ai.spot;
      assert.equal(brain.ai.state, hiderLogic.HIDER_STATES.HIDDEN, `${map.id}: ${brain.id} never reached cover`);
      assert.ok(spot, `${map.id}: ${brain.id} has no room`);
      assert.equal(body.floor, spot.floor, `${map.id}: ${brain.id} is on the wrong floor`);
      assert.ok(Math.hypot(body.x - spot.x, body.z - spot.z) < cpu.CPU_DEFAULTS.spotRadius, `${map.id}: ${brain.id} is not in room ${spot.id}`);
      assert.equal(body.crouching, true, `${map.id}: ${brain.id} is hidden but standing`);
      assert.equal(body.flashlight.on, false, `${map.id}: ${brain.id} is hidden with its light on`);
      assert.equal(round.space.blocked(body.x, body.z, body.y), false, `${map.id}: ${brain.id} settled inside geometry`);
    }
    const rooms = new Set(round.brains.map((brain) => brain.ai.spot.id));
    assert.ok(rooms.size >= Math.min(round.brains.length, 3), `${map.id}: the guests piled into ${rooms.size} room(s)`);
  }
});

test('a CPU guest carries a light while it is still looking for a spot, like everyone else', () => {
  const round = startRound('grand-hotel', { cpuCount: 1 });
  const driven = cpu.driveHiders(round.brains, round.state, round.ctx, TICK);
  assert.equal(driven.inputs['cpu-1'].light, true);
  run(round, 3);
  assert.equal(bodyOf(round, 'cpu-1').flashlight.on, true);
  assert.ok(bodyOf(round, 'cpu-1').flashlight.charge < 1, 'the battery is spent through the authority, not pretended');
});

test('a hidden CPU guest bolts when the seeker walks in, and sprints doing it', () => {
  const round = startRound('grand-hotel', { cpuCount: 1 });
  run(round, 100);
  const hidden = bodyOf(round, 'cpu-1');
  assert.equal(round.brains[0].ai.state, hiderLogic.HIDER_STATES.HIDDEN);
  assert.equal(round.state.round.phase, roundLogic.PHASES.SEEKING);
  // Stage the seeker six metres away — inside panic range, outside arm's reach. Positions are
  // authoritative state, and a test is the one place allowed to write them.
  round.state = {
    ...round.state,
    bodies: round.state.bodies.map((body) => (body.id === 'seeker' ? { ...body, x: hidden.x + 6, y: hidden.y, z: hidden.z, floor: hidden.floor } : body)),
  };
  const driven = cpu.driveHiders(round.brains, round.state, round.ctx, TICK);
  assert.equal(driven.brains[0].ai.state, hiderLogic.HIDER_STATES.FLEEING);
  const before = { x: hidden.x, z: hidden.z };
  const target = driven.brains[0].target;
  round.brains = driven.brains;
  run(round, 0.5);
  assert.equal(round.brains[0].target, target, 'a frightened guest keeps running for the same door rather than dithering every tick');
  run(round, 1.5);
  const fled = bodyOf(round, 'cpu-1');
  assert.ok(Math.hypot(fled.x - before.x, fled.z - before.z) > 1.5, 'the guest ran');
  assert.ok(fled.stamina.value < 1, 'the run was a sprint, paid for through the stamina meter');
});

test('a CPU guest opens a shut door the way a player does: by pressing E on it', () => {
  const round = startRound('grand-hotel', { cpuCount: 3 });
  // Shut every door in the hotel. Getting into any room now takes a handle.
  const doors = Object.fromEntries(Object.entries(round.state.fixtures.doors).map(([id, door]) => [id, { ...door, open: false, angle: 0, target: 0 }]));
  round.state = { ...round.state, fixtures: { ...round.state.fixtures, doors } };
  const log = run(round, 100);
  const opened = log.filter((event) => event.type === 'door-opened' && cpu.isCpuId(event.playerId));
  assert.ok(opened.length >= 1, 'no CPU guest opened a door');
  assert.ok(round.brains.every((brain) => brain.ai.state === hiderLogic.HIDER_STATES.HIDDEN), 'every guest still found a room');
  for (const brain of round.brains) {
    const door = round.state.fixtures.doors[round.ctx.doorByRoom.get(brain.ai.spot.id).id];
    assert.equal(door.open, true, `${brain.id} is in a room whose door is still shut`);
  }
});

test('a caught CPU guest presses nothing', () => {
  const round = startRound('grand-hotel', { cpuCount: 2 });
  run(round, 2);
  round.state = round.engine.resolveDemonCatch(round.state, 'cpu-1');
  const driven = cpu.driveHiders(round.brains, round.state, round.ctx, TICK);
  assert.deepEqual(driven.inputs['cpu-1'], cpu.NO_INPUT);
  assert.equal(driven.inputs['cpu-2'].forward, 1);
});

test('CPU guests are deterministic from the seed, so a round with bots still replays', () => {
  const a = startRound('cinder-mall', { cpuCount: 4, seed: 11 });
  const b = startRound('cinder-mall', { cpuCount: 4, seed: 11 });
  run(a, 30); run(b, 30);
  assert.deepEqual(a.engine.snapshot(a.state), b.engine.snapshot(b.state));
  assert.deepEqual(a.brains.map((brain) => brain.ai.spot.id), b.brains.map((brain) => brain.ai.spot.id));
});
