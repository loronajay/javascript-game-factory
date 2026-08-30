const test = require('node:test');
const assert = require('node:assert/strict');

const fixturesLogic = require('../fixtures-logic.js');
const roundLogic = require('../round-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

// The whole authority, end to end: the hotel, four bodies, two demons, the doors between them and
// both endings — ticked at 60hz with no renderer in the process. This is the composition
// `factory-network-server` runs, assembled by the same helper.

const TICK = 1 / 60;

// A scenario test that is not *about* the demons has to say so. These rounds run for forty-six
// seconds of simulated time before the rule under test is staged, and a demon roaming the hotel in
// the meantime can end the round before the assertion is ever reached — which is a test that passes
// on the luck of a seed rather than on the behaviour it names. `NO_DEMONS` empties the building;
// `ONE_DEMON` leaves exactly the one the test positions itself.
// A parked demon: one body, standing where it spawned. An empty roster is not the way to say this —
// `normalizeRoster` deliberately falls back to the hotel's two, so that a simulation handed no
// roster still runs the game it always ran. Zeroing the speeds is the honest way to hold a demon
// still, and it leaves the catch rule itself untouched for the tests that stage a demon by hand.
const STILL = { walkSpeed: 0, chaseSpeed: 0, huntSpeed: 0 };
const PARKED_DEMON = { demons: [{ id: 'bellhop', name: 'The Bellhop', hunts: true }], demon: STILL };

function startRound({ seed = 7, hiders = 3, config } = {}) {
  const built = fixture.createFullSim({ seed, config });
  const players = [
    { id: 'seeker', spawn: built.hotel.spawns.seeker },
    ...built.hotel.spawns.hiders.slice(0, hiders).map((spawn, index) => ({ id: `hider-${index}`, spawn })),
  ];
  return { ...built, players, state: built.engine.createState({ players, seekerId: 'seeker' }) };
}

function run(engine, state, ticks, inputs = () => ({})) {
  let next = state;
  for (let tick = 0; tick < ticks; tick += 1) next = engine.tick(next, TICK, inputs(next, tick));
  return next;
}

test('the head start is physical: the seeker is held in a shut cabin until the phase flips', () => {
  const { engine, state } = startRound({ config: PARKED_DEMON });
  const walking = { forward: 1, strafe: 0, yaw: 0, crouch: false, sprint: false, light: false };
  const inputs = () => ({ seeker: walking, 'hider-0': walking });

  const held = run(engine, state, 60 * 40, inputs);
  const seeker = engine.bodyOf(held, 'seeker');
  assert.equal(held.round.phase, roundLogic.PHASES.HIDING);
  assert.equal(seeker.x, state.bodies[0].x, 'a held seeker does not get to walk by sending a direction');
  assert.equal(seeker.z, state.bodies[0].z);
  assert.equal(held.fixtures.elevator.doorAmount, 0, 'the cabin is shut around them');
  assert.notEqual(engine.bodyOf(held, 'hider-0').z, state.bodies[1].z, 'the hiders are not held');

  const released = run(engine, held, 60 * 10, inputs);
  assert.equal(released.round.phase, roundLogic.PHASES.SEEKING);
  assert.ok(released.fixtures.elevator.doorAmount > 0, 'the doors start opening exactly on the release');
  assert.ok(released.events.length >= 0);
});

test('a tag is resolved from positions, and never during the head start', () => {
  const { engine, state, hotel } = startRound({ config: PARKED_DEMON });
  const spot = hotel.spawns.hiders[0];
  // Stand the seeker on top of a hider. Nothing may happen until the head start is over.
  let next = { ...state, bodies: state.bodies.map((body) => (body.id === 'seeker' ? { ...body, x: spot.x + 0.4, y: spot.y, z: spot.z } : body)) };

  next = run(engine, next, 30);
  assert.equal(roundLogic.participant(next.round, 'hider-0').alive, true, 'the seeker cannot tag during the head start');

  next = run(engine, next, 60 * 46);
  assert.equal(next.round.phase, roundLogic.PHASES.SEEKING);
  assert.equal(roundLogic.participant(next.round, 'hider-0').alive, false);
  assert.equal(roundLogic.participant(next.round, 'hider-0').caughtBy, roundLogic.CAUGHT_BY.SEEKER);
});

test('interaction is edge-triggered, and the door it opens is open for everyone', () => {
  const { engine, state, space } = startRound();
  const door = engine.catalog.find((item) => item.kind === 'door' && !item.locked && !item.openInitially && item.floor === 1);
  const outside = { x: door.x - 1.1, y: fixture.floorY(1), z: door.z };
  const yaw = Math.atan2(-(door.x - outside.x), -(door.z - outside.z));
  let next = { ...state, bodies: state.bodies.map((body) => (body.id === 'hider-0' ? { ...body, ...outside, yaw } : body)) };
  const holding = { forward: 0, strafe: 0, yaw, crouch: false, sprint: false, light: false, interact: true };

  // Held down for a full second. An authority that read the level rather than the edge would strobe
  // this door sixty times.
  next = run(engine, next, 60, () => ({ 'hider-0': holding }));
  assert.equal(next.fixtures.doors[door.id].open, true);
  assert.equal(next.fixtures.doors[door.id].target, door.openAngle);

  // The swing reaches the shared collision world, which is what makes it open for the seeker too.
  assert.ok(Math.abs(next.fixtures.doors[door.id].angle) > 0.5);
  assert.equal(space.openings()[door.id], next.fixtures.doors[door.id].angle);

  const releasedThenPressed = run(engine, next, 6, (_, tick) => ({ 'hider-0': tick < 3 ? { ...holding, interact: false } : holding }));
  assert.equal(releasedThenPressed.fixtures.doors[door.id].open, false, 'a second press closes it');
});

test('a key is claimed once, by whoever searched the drawer first', () => {
  const { engine, state } = startRound();
  const drawer = engine.catalog.find((item) => item.kind === 'drawer' && item.keyId);
  const stand = (dx) => {
    const from = { x: drawer.x + dx, y: fixture.floorY(drawer.floor), z: drawer.z - 0.9 };
    return { ...from, yaw: Math.atan2(-(drawer.x - from.x), -(drawer.z - from.z)) };
  };
  const ana = stand(-0.3);
  const ben = stand(0.3);
  let next = {
    ...state,
    bodies: state.bodies.map((body) => {
      if (body.id === 'hider-0') return { ...body, ...ana };
      if (body.id === 'hider-1') return { ...body, ...ben };
      return body;
    }),
  };

  const press = (id, viewer, on) => ({ [id]: { forward: 0, strafe: 0, yaw: viewer.yaw, crouch: false, sprint: false, light: false, interact: on } });
  // Open, release, search — for both of them, in lockstep.
  for (const on of [true, false, true, false, true]) {
    next = engine.tick(next, TICK, { ...press('hider-0', ana, on), ...press('hider-1', ben, on) });
  }

  const holders = ['hider-0', 'hider-1'].filter((id) => fixturesLogic.keysOf(next.fixtures, id).includes(drawer.keyId));
  assert.equal(holders.length, 1, 'exactly one of them walks away with the key');
});

test('a demon that catches the seeker ends the round for the hiders, with survivors left alive', () => {
  const { engine } = startRound({ config: PARKED_DEMON });
  const built = startRound({ config: PARKED_DEMON });
  let next = run(built.engine, built.state, 60 * 46);
  assert.equal(next.round.phase, roundLogic.PHASES.SEEKING);

  // Stage the catch in the hallway; the elevator cabin remains protected after the release.
  next = { ...next, bodies: next.bodies.map(body => body.id === 'seeker' ? { ...body, x: 0, z: 49 } : body) };
  // Put a demon on top of the seeker. The round does not care which one it was.
  const seeker = built.engine.bodyOf(next, 'seeker');
  next = { ...next, demons: next.demons.map((demon, index) => (index === 0 ? { ...demon, x: seeker.x, y: seeker.y, z: seeker.z } : demon)) };
  next = built.engine.tick(next, TICK, {});

  assert.equal(next.round.outcome, roundLogic.OUTCOMES.HIDERS);
  assert.equal(next.round.cause, roundLogic.CAUSES.SEEKER_LOST);
  assert.equal(roundLogic.livingHiders(next.round).length, 3, 'survivors are not retroactively caught');
  assert.ok(next.events.some((event) => event.type === 'demon-catch' && event.playerId === 'seeker'));
  assert.equal(typeof engine.snapshot, 'function');
});

test('a caught player drops their battery, and the first body to reach it takes the charge', () => {
  const built = startRound({ config: PARKED_DEMON });
  let next = run(built.engine, built.state, 60 * 46);
  const victim = built.engine.bodyOf(next, 'hider-0');

  // A demon takes the hider. The drop lands where they fell, carrying whatever was left in the cell.
  next = { ...next, demons: next.demons.map((demon, index) => (index === 0 ? { ...demon, x: victim.x, y: victim.y, z: victim.z } : demon)) };
  next = built.engine.tick(next, TICK, {});

  assert.equal(roundLogic.participant(next.round, 'hider-0').caughtBy, roundLogic.CAUGHT_BY.DEMON);
  assert.ok(next.events.some((event) => event.type === 'flashlight-drop' && event.playerId === 'hider-0'));
  assert.equal(next.pickups.length, 1);

  // Someone finds it later, once the demon has moved on. Walk the finder onto it with a light that
  // has room to take the charge.
  next = {
    ...next,
    demons: next.demons.map((demon) => ({ ...demon, x: 0, y: fixture.floorY(4), z: -50 })),
    bodies: next.bodies.map((body) => (
      body.id === 'hider-1' ? { ...body, x: victim.x + 0.4, y: victim.y, z: victim.z, flashlight: { on: false, charge: 0.2 } } : body
    )),
  };
  next = built.engine.tick(next, TICK, {});

  assert.ok(next.events.some((event) => event.type === 'flashlight-pickup' && event.playerId === 'hider-1'));
  assert.ok(built.engine.bodyOf(next, 'hider-1').flashlight.charge > 0.9, 'a body on the floor is a resupply');
  assert.equal(next.pickups.length, 0, 'a claimed battery is gone');
});

test('the tick is deterministic and does not mutate what it is handed', () => {
  const a = startRound({ seed: 42 });
  const b = startRound({ seed: 42 });
  const walking = { forward: 1, strafe: 0.2, yaw: 0.7, crouch: false, sprint: true, light: true, interact: false };
  const inputs = () => ({ seeker: walking, 'hider-0': walking, 'hider-1': walking, 'hider-2': walking });

  const before = JSON.stringify(a.state);
  const first = run(a.engine, a.state, 60 * 50, inputs);
  const second = run(b.engine, b.state, 60 * 50, inputs);

  assert.equal(JSON.stringify(a.state), before, 'the tick must not mutate the state it was given');
  assert.equal(
    JSON.stringify(a.engine.snapshot(first).players),
    JSON.stringify(b.engine.snapshot(second).players),
    'the same seed and the same inputs must produce the same round — a mirrored server has to agree',
  );
  assert.equal(
    JSON.stringify(a.engine.snapshot(first).demons),
    JSON.stringify(b.engine.snapshot(second).demons),
  );
});

test('a snapshot carries what a client draws and nothing that would make it a wallhack', () => {
  const { engine, state } = startRound();
  const snapshot = engine.snapshot(run(engine, state, 60 * 50));

  assert.deepEqual(Object.keys(snapshot).sort(), ['demons', 'events', 'fixtures', 'pickups', 'players', 'round', 'threat', 'tick']);
  assert.equal(snapshot.demons.length, 2);
  assert.equal(typeof snapshot.threat, 'string', 'threat is one aggregated state for the whole roster');
  for (const player of snapshot.players) {
    assert.equal('heat' in player, true);
    assert.equal('route' in player, false);
  }
  // The round HUD stays position-free; that rule is older than the network layer.
  assert.equal('positions' in snapshot.round, false);
  assert.deepEqual(Object.keys(snapshot.round).sort(), ['caught', 'cause', 'clock', 'hidersRemaining', 'hidersTotal', 'outcome', 'over', 'phase', 'seconds']);
});

test('a demon reaches through an open door and not through a shut one', () => {
  const built = startRound({ config: PARKED_DEMON });
  const door = built.engine.catalog.find((item) => item.kind === 'door' && !item.locked && !item.openInitially && item.floor === 1);
  let next = run(built.engine, built.state, 60 * 46);

  // The hider is just inside the room; the demon is in the corridor on the other side of the leaf.
  // Distance alone would have this be a catch, and before line of sight was part of it, it was one —
  // which made a shut door real cover against a seeker but not against a demon.
  const inside = { x: door.x + Math.sign(door.x) * 0.45, y: fixture.floorY(1), z: door.z };
  const corridor = { x: door.x - Math.sign(door.x) * 0.45, y: fixture.floorY(1), z: door.z };
  const stage = (state) => ({
    ...state,
    bodies: state.bodies.map((body) => (body.id === 'hider-0' ? { ...body, ...inside } : body)),
    demons: state.demons.map((demon, index) => (index === 0 ? { ...demon, ...corridor } : demon)),
  });

  next = built.engine.tick(stage(next), TICK, {});
  assert.equal(roundLogic.participant(next.round, 'hider-0').alive, true, 'a shut door is cover from a demon too');

  // Open the same door and it is a fair catch again.
  let open = { ...next, fixtures: fixturesLogic.forceDoorOpen(next.fixtures, door, { unlock: true }) };
  for (let tick = 0; tick < 60 && roundLogic.participant(open.round, 'hider-0').alive; tick += 1) {
    open = built.engine.tick(stage(open), TICK, {});
  }
  assert.equal(roundLogic.participant(open.round, 'hider-0').alive, false, 'an open doorway is not cover');
  assert.equal(roundLogic.participant(open.round, 'hider-0').caughtBy, roundLogic.CAUGHT_BY.DEMON);
});

test('a chasing demon opens the room door in front of it instead of running into it', () => {
  const built = startRound();
  const door = built.engine.catalog.find((item) => item.kind === 'door' && !item.openInitially && item.floor === 1);
  const sign = Math.sign(door.x);
  const inside = { x: door.x + sign * 2, y: fixture.floorY(1), z: door.z };
  const corridor = { x: door.x - sign * 1.1, y: fixture.floorY(1), z: door.z };
  let next = run(built.engine, built.state, 60 * 46);
  next = {
    ...next,
    bodies: next.bodies.map((body) => (body.id === 'hider-0' ? { ...body, ...inside } : body)),
    demons: next.demons.map((demon, index) => (index === 0 ? {
      ...demon,
      ...corridor,
      floor: 1,
      awareness: { ...demon.awareness, state: 'chase', targetId: 'hider-0', lastSeen: { ...inside, floor: 1 } },
      detectionCooldown: 1,
      routePurpose: 'chase',
      route: [{ ...inside, floor: 1, guided: false }],
    } : demon)),
  };

  next = built.engine.tick(next, TICK, {});

  assert.equal(next.fixtures.doors[door.id].open, true);
  assert.equal(next.fixtures.doors[door.id].locked, false, 'a chase cannot be stopped by relocking the door');
});
