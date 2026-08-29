const test = require('node:test');
const assert = require('node:assert/strict');

const movement = require('../movement-logic.js');
const round = require('../round-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

// The gate for networking: a whole round — the building, the bodies walking it, line of sight and
// both endings — ticked at 60hz with no renderer in the process. If this file ever needs Three.js,
// the simulation seam has leaked back into the runtime modules.
const TICK = 1 / 60;
const BODY = { height: fixture.CONFIG.bodyHeight, radius: fixture.CONFIG.playerRadius };
const ROUND_CONFIG = { durationSeconds: 300, hideSeconds: 45, tagDistance: 1.35, tagHeightTolerance: 1.2 };

function walkTowards(space, body, from, target, speed, seconds) {
  let position = { ...from };
  for (let tick = 0; tick < Math.round(seconds / TICK); tick += 1) {
    const dx = target.x - position.x; const dz = target.z - position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.05) break;
    const amount = Math.min(distance, speed * TICK);
    const step = movement.stepAxes(space, body, position, (dx / distance) * amount, (dz / distance) * amount);
    position = { x: step.x, y: step.y, z: step.z };
  }
  return position;
}

test('a body walks the real corridor at 60hz without leaving the floor or crossing a wall', () => {
  const hotel = fixture.buildHotel();
  const space = fixture.createSpace(hotel);
  const start = { x: 0, y: fixture.floorY(1), z: -34 };

  const arrived = walkTowards(space, BODY, start, { x: 0, z: -12 }, 3.1, 12);

  assert.ok(Math.abs(arrived.z + 12) < 0.6, `expected to reach the corridor target; stopped at z=${arrived.z}`);
  assert.equal(space.blocked(arrived.x, arrived.z, arrived.y), false);
  assert.equal(arrived.y, fixture.floorY(1));
});

test('a shut room door stops a body that a walked route would otherwise pass through', () => {
  const hotel = fixture.buildHotel();
  const doorway = hotel.roomDoors[0];
  const room = hotel.roomCenters.find((entry) => entry.roomNumber === doorway.roomNumber);
  const shut = fixture.createSpace(hotel, {});
  const open = fixture.createSpace(hotel, { [doorway.id]: fixture.CONFIG.doorOpenAngle });
  const corridor = { x: 0, y: fixture.floorY(room.floor), z: room.z };
  const target = { x: room.x, z: room.z };

  const stopped = walkTowards(shut, BODY, corridor, target, 3.1, 8);
  const entered = walkTowards(open, BODY, corridor, target, 3.1, 8);

  assert.ok(Math.abs(stopped.x - room.x) > Math.abs(entered.x - room.x), 'the shut door should not be walked through');
  assert.ok(Math.abs(entered.x - room.x) < 1.2, 'the open door should be walked through');
});

test('a whole round ticks headlessly from the head start to a seeker win', () => {
  const hotel = fixture.buildHotel();
  const space = fixture.createSpace(hotel);
  const hiders = new Map(hotel.spawns.hiders.slice(0, 3).map((spawn, index) => [
    `hider-${index}`, { x: spawn.x, y: spawn.y, z: spawn.z },
  ]));
  let state = round.createRound({ players: ['local', ...hiders.keys()], seekerId: 'local', config: ROUND_CONFIG });
  let seeker = null;

  // The head start is a rule about walking: the seeker is held until the phase flips, and the round
  // clock does not start until it does.
  let heldTicks = 0;
  while (state.phase === round.PHASES.HIDING && heldTicks < 60 * 60) {
    state = round.tickRound(state, TICK, ROUND_CONFIG);
    heldTicks += 1;
  }
  assert.equal(state.phase, round.PHASES.SEEKING);
  assert.ok(heldTicks >= ROUND_CONFIG.hideSeconds * 60, `the head start must last at least ${ROUND_CONFIG.hideSeconds}s`);
  assert.ok(ROUND_CONFIG.durationSeconds - state.remaining < 0.05, 'the round clock must not run during the head start');

  // The seeker walks the last stretch of corridor to each guest under real collision. Crossing the
  // hotel needs the route planner the demon uses; what is being proved here is that the walk, the
  // sight line and the tag all resolve from positions with no renderer present.
  for (const [id, hider] of hiders) {
    seeker = walkTowards(space, BODY, { x: hider.x, y: hider.y, z: hider.z - 6 }, hider, 5.4, 20);
    const occluded = space.sightBlocked(
      { x: seeker.x, y: seeker.y + 1.55, z: seeker.z },
      { x: hider.x, y: hider.y + 1.55, z: hider.z },
    );
    assert.equal(round.canTag({ seeker, hider, occluded }, ROUND_CONFIG), true, `${id} should be taggable once reached`);
    state = round.resolveTag(state, { seekerId: 'local', hiderId: id });
  }

  assert.equal(state.status, round.ROUND_STATES.ENDED);
  assert.equal(state.outcome, round.OUTCOMES.SEEKER);
});

test('a demon taking the seeker ends the same headless round for the hiders', () => {
  let state = round.createRound({ players: ['local', 'hider-0', 'hider-1'], seekerId: 'local', config: ROUND_CONFIG });
  state = round.tickRound(state, ROUND_CONFIG.hideSeconds, ROUND_CONFIG);
  state = round.resolveDemonCatch(state, 'hider-0');
  assert.equal(state.status, round.ROUND_STATES.ACTIVE);

  state = round.resolveDemonCatch(state, 'local');

  assert.equal(state.outcome, round.OUTCOMES.HIDERS);
  assert.equal(round.describeRound(state).hidersRemaining, 1);
});
