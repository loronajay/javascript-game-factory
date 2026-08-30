const test = require('node:test');
const assert = require('node:assert/strict');

const demonLogic = require('../demon-logic.js');
const enemy = require('../enemy-logic.js');
const movement = require('../movement-logic.js');
const heat = require('../heat-logic.js');
const roundLogic = require('../round-logic.js');
const fixture = require('./helpers/hotel-fixture.js');

// The head start is the hiders' phase, and until now it was the *demons'* too. A round with one or
// two hiders could be decided before the seeker's cabin ever opened: the hider walks into a demon
// while looking for a spot, the round settles, and the seeker spends forty-five seconds shut in a
// box for a match that is already over. A hider has no information yet during the head start, so
// dying to it is not a mistake they could have avoided.
//
// So a demon is dormant while the phase is HIDING: it walks its patrol, it is visible, it is worth
// avoiding — but it does not look, does not hunt a full heat meter, and cannot catch. It wakes with
// the seeker, wherever it has wandered to by then.

const TICK = 1 / 60;

function stubbedContext({ dormant = false, candidates = [] } = {}) {
  const space = { groundAt: () => 0, blocked: () => true, sightBlocked: () => false };
  return {
    space, movement, enemy, heat, dormant,
    candidates,
    huntCandidates: candidates.map((entry) => ({ ...entry, zone: '105', kind: heat.ZONE_KINDS.ROOM, full: true })),
    rooms: [],
    config: { floorHeight: fixture.CONFIG.floorHeight },
    random: fixture.seededRandom(3),
    isRoomLocked: () => false,
    openDoor: () => {},
    setHunted: () => {},
    emit: () => {},
  };
}

function watchedDemon() {
  // Facing +Z by default, so a candidate at +Z is squarely in the detection cone.
  return demonLogic.createDemon({ id: 'bellhop', name: 'The Bellhop', spawn: { x: 0, y: 0, z: 0, floor: 1 }, hunts: true });
}

const VISIBLE = [{ id: 'hider-0', x: 0, y: 0, z: 3, floor: 1, crouching: false }];

test('an awake demon that can plainly see a hider stops roaming', () => {
  const ctx = stubbedContext({ dormant: false, candidates: VISIBLE });
  let demon = watchedDemon();
  for (let tick = 0; tick < 30; tick += 1) demon = demonLogic.tickDemon(demon, TICK, ctx);
  assert.notEqual(demon.awareness.state, enemy.ENEMY_STATES.ROAM, 'the control case: this demon has seen someone');
});

test('a dormant demon looks at the same hider and stays roaming', () => {
  const ctx = stubbedContext({ dormant: true, candidates: VISIBLE });
  let demon = watchedDemon();
  for (let tick = 0; tick < 30; tick += 1) demon = demonLogic.tickDemon(demon, TICK, ctx);
  assert.equal(demon.awareness.state, enemy.ENEMY_STATES.ROAM);
  assert.equal(demon.detectedTargetId, null, 'a dormant demon has not seen anybody');
  assert.notEqual(demon.routePurpose, 'chase');
});

test('a dormant demon does not hunt a full heat meter', () => {
  const ctx = stubbedContext({ dormant: true, candidates: VISIBLE });
  const hunted = [];
  ctx.setHunted = (target) => hunted.push(target);
  ctx.rooms = [{ roomNumber: '105', floor: 1, x: 0, z: 3 }];
  let demon = watchedDemon();
  for (let tick = 0; tick < 30; tick += 1) demon = demonLogic.tickDemon(demon, TICK, ctx);
  assert.equal(demon.huntZone, null);
  assert.equal(demon.routePurpose === 'hunt', false);
  assert.deepEqual(hunted.filter(Boolean), [], 'nobody is told they are being hunted during the head start');
});

test('a dormant demon still walks, so the building is not frozen while the hiders hide', () => {
  const hotel = fixture.buildHotel();
  const space = fixture.createSpace(hotel);
  const ctx = { ...stubbedContext({ dormant: true }), space, rooms: hotel.roomCenters.map((room) => ({ roomNumber: room.roomNumber, floor: room.floor, x: room.x, z: room.z })) };
  let demon = demonLogic.createDemon({ id: 'bellhop', name: 'The Bellhop', spawn: { x: 0, y: fixture.floorY(2), z: 0, floor: 2 }, hunts: true });
  const start = { x: demon.x, z: demon.z };
  for (let tick = 0; tick < 60 * 8; tick += 1) demon = demonLogic.tickDemon(demon, TICK, ctx);
  assert.ok(Math.hypot(demon.x - start.x, demon.z - start.z) > 2, 'it patrols; it just is not hunting');
});

// --- the whole authority ------------------------------------------------------------------------

const STILL = { walkSpeed: 0, chaseSpeed: 0, huntSpeed: 0 };
const PARKED_DEMON = { demons: [{ id: 'bellhop', name: 'The Bellhop', hunts: true }], demon: STILL };

function roundWithDemonOnTopOfAHider() {
  const built = fixture.createFullSim({ seed: 7, config: PARKED_DEMON });
  const players = [
    { id: 'seeker', spawn: built.hotel.spawns.seeker },
    { id: 'hider-0', spawn: built.hotel.spawns.hiders[0] },
  ];
  const state = built.engine.createState({ players, seekerId: 'seeker' });
  const hider = state.bodies.find((entry) => entry.id === 'hider-0');
  // Stood right on them, which is well inside `catchDistance`. A parked demon stays put, so the
  // only thing that changes across the release is whether it is allowed to take them.
  const demons = state.demons.map((entry) => ({ ...entry, x: hider.x, y: hider.y, z: hider.z, floor: hider.floor }));
  return { ...built, state: { ...state, demons } };
}

function run(engine, state, ticks) {
  let next = state;
  for (let tick = 0; tick < ticks; tick += 1) next = engine.tick(next, TICK, {});
  return next;
}

test('a demon standing on a hider takes nobody during the head start, and takes them the moment it ends', () => {
  const { engine, state } = roundWithDemonOnTopOfAHider();

  const held = run(engine, state, 60 * 40);
  assert.equal(held.round.phase, roundLogic.PHASES.HIDING);
  assert.equal(roundLogic.participant(held.round, 'hider-0').alive, true, 'the head start is not a death sentence');
  assert.equal(held.round.status, roundLogic.ROUND_STATES.ACTIVE);

  const released = run(engine, held, 60 * 10);
  assert.equal(roundLogic.participant(released.round, 'hider-0').alive, false, 'the grace ends with the head start');
  assert.equal(released.round.outcome, roundLogic.OUTCOMES.SEEKER);
});

test('the snapshot reports a calm building during the head start', () => {
  const { engine, state } = roundWithDemonOnTopOfAHider();
  const held = run(engine, state, 60 * 5);
  const snapshot = engine.snapshot(held);
  assert.equal(snapshot.threat, 'roam');
  assert.deepEqual(snapshot.players.filter((entry) => entry.hunted), []);
});

// --- the solo round -----------------------------------------------------------------------------

// The solo round does not run `sim-logic.js`: `modules/round.js` resolves its own catches and
// `modules/monster.js` carries its own copy of the brain. So the rule has to be stated twice, and
// the thing that keeps the two copies honest is one published flag. `tests/round.test.js` covers the
// offline catch gate behaviourally; this pins the flag itself, because a rename on either side would
// silently hand the head start back to the demons in single player only.
const fs = require('node:fs');
const path = require('node:path');
const modules = (name) => fs.readFileSync(path.join(__dirname, '..', 'modules', name), 'utf8');

test('the solo round publishes the head start and the solo brain reads it', () => {
  const round = modules('round.js');
  assert.match(round, /world\.state\.headStart = state\.phase === logic\.PHASES\.HIDING/);
  assert.match(round, /if \(!world\.state\.headStart\) resolveDemonCatches\(\)/);

  const monster = modules('monster.js');
  assert.match(monster, /const dormant = !!world\.state\.headStart/);
  // Dormant means all three: no looking, no heat hunt, no catch.
  assert.match(monster, /if \(dormant\) \{/);
  assert.match(monster, /if \(!dormant && !world\.state\.playerEliminated/);
});
