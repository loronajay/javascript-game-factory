const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

const logic = require('../round-logic.js');

const CONFIG = {
  durationSeconds: 60,
  hideSeconds: 45,
  tagDistance: 1.9,
  tagHeightTolerance: 1.4,
  demonCatchDistance: 1.2,
};

function element() {
  return {
    textContent: '',
    dataset: {},
    classList: { added: new Set(), add(name) { this.added.add(name); }, remove(name) { this.added.delete(name); }, contains(name) { return this.added.has(name); } },
    querySelector() { return element(); },
  };
}

// The round module reaches for the built world, the demon and the HUD. None of those need WebGL to
// answer the questions catch resolution asks, so they are stood up as plain objects here — which is
// the same thing a headless server will be doing.
function harness({ hiders = [], demon = { x: 90, y: 0, z: 90, floor: 1 }, seeker = { x: 0, y: 0, z: 0 } } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const events = [];
  const alive = new Map(hiders.map((hider) => [hider.id, { ...hider }]));
  const document = {
    body: { classList: element().classList },
    pointerLockElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  };
  const state = { playerFloor: 1, gameOver: false, isLocked: true, seekerHeld: false };
  const elevatorCalls = [];
  return {
    elements, events, alive, state, elevatorCalls,
    fire(name, detail) { for (const handler of listeners.get(name) || []) handler({ detail }); },
    deps: {
      camera: { position: { ...seeker, y: seeker.y + 1.7 } },
      player: { getEyeHeight: () => 1.7 },
      elevator: {
        holdSeeker: () => elevatorCalls.push('hold'),
        releaseSeeker: () => elevatorCalls.push('release'),
      },
      world: {
        state,
        collidesAt: () => false,
        emit: (name, detail) => events.push({ name, detail }),
        notify: () => {},
      },
      hiders: {
        ids: () => [...alive.keys()],
        list: () => [...alive.values()],
        eliminate: (id) => alive.delete(id),
        update: () => {},
      },
      monster: { getState: () => ({ position: { x: demon.x, y: demon.y, z: demon.z }, floor: demon.floor }) },
      logic,
      config: CONFIG,
      document,
      window: { addEventListener: (name, handler) => { listeners.set(name, [...(listeners.get(name) || []), handler]); } },
    },
  };
}

async function createRound(setup) {
  const { createRound: factory } = await import(url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'round.js')).href);
  return factory(setup.deps);
}

const FAR = { id: 'hider-2', x: 40, y: 0, z: 40, floor: 1 };

test('the seeker is shut in the elevator for at least forty-five seconds and released when seeking starts', async () => {
  const setup = harness({ hiders: [FAR] });
  const round = await createRound(setup);

  assert.deepEqual(setup.elevatorCalls, ['hold']);
  round.update(44);
  assert.equal(setup.state.seekerHeld, true);
  assert.equal(round.getState().phase, logic.PHASES.HIDING);
  assert.deepEqual(setup.elevatorCalls, ['hold']);

  round.update(1);
  assert.equal(setup.state.seekerHeld, false);
  assert.equal(round.getState().phase, logic.PHASES.SEEKING);
  assert.deepEqual(setup.elevatorCalls, ['hold', 'release']);
});

test('a hider inside reach is tagged, but not before the head start ends', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 1, y: 0, z: 0, floor: 1 }, FAR] });
  const round = await createRound(setup);

  round.update(1);
  assert.equal(round.getState().hidersRemaining, 2, 'nobody is tagged while the guests are still hiding');

  round.update(43);
  assert.equal(round.getState().hidersRemaining, 2);
  round.update(1);
  assert.equal(round.getState().hidersRemaining, 1);
  assert.ok(!setup.alive.has('hider-1'), 'a tagged hider leaves the world, not just the tally');
});

test('a wall between them is not a tag', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 1, y: 0, z: 0, floor: 1 }, FAR] });
  setup.deps.world.collidesAt = () => true;
  const round = await createRound(setup);

  round.update(45);
  assert.equal(round.getState().hidersRemaining, 2);
});

test('the demon takes a hider it walks into, and that still counts for the seeker', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 40, y: 0, z: 40, floor: 1 }], demon: { x: 40.5, y: 0, z: 40, floor: 1 } });
  const round = await createRound(setup);

  round.update(45);
  const view = round.getState();
  assert.equal(view.over, true);
  assert.equal(view.outcome, logic.OUTCOMES.SEEKER, 'the condition is that every hider is out, not that every hider was tagged');
  assert.deepEqual(view.caught, [{ id: 'hider-1', by: logic.CAUGHT_BY.DEMON }]);
});

test('clearing the hotel ends the round on the win screen', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 1, y: 0, z: 0, floor: 1 }] });
  const round = await createRound(setup);

  round.update(45);
  assert.equal(round.getState().outcome, logic.OUTCOMES.SEEKER);
  assert.equal(setup.state.gameOver, true);
  assert.ok(setup.elements.get('caughtOverlay').classList.contains('visible'));
  assert.ok(setup.events.some((entry) => entry.name === 'round-over' && entry.detail.outcome === logic.OUTCOMES.SEEKER));
  // Both endings land on the menu's one caught screen rather than a second overlay.
  assert.ok(setup.events.some((entry) => entry.name === 'caught'));
});

test('the demon taking the seeker hands the round to the hiders', async () => {
  const setup = harness({ hiders: [FAR] });
  const round = await createRound(setup);
  round.update(45);

  // This is the monster's own catch, which fires the event the game has always fired.
  setup.fire('hotel:caught', {});
  const view = round.getState();

  assert.equal(view.over, true);
  assert.equal(view.outcome, logic.OUTCOMES.HIDERS);
  assert.equal(view.cause, logic.CAUSES.SEEKER_LOST);
  assert.equal(view.hidersRemaining, 1, 'the survivor is not retroactively caught');
});

test("the round's own ending does not recurse through the caught event", async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 1, y: 0, z: 0, floor: 1 }] });
  const round = await createRound(setup);
  round.update(45);

  const before = round.getState().outcome;
  setup.fire('hotel:caught', { outcome: before });

  assert.equal(round.getState().outcome, before, 'a win must not be overwritten by its own ending event');
});

test('running the clock out with guests left is a hider win', async () => {
  const setup = harness({ hiders: [FAR] });
  const round = await createRound(setup);

  round.update(45);
  for (let tick = 0; tick < 60; tick += 1) round.update(1);
  const view = round.getState();

  assert.equal(view.over, true);
  assert.equal(view.outcome, logic.OUTCOMES.HIDERS);
  assert.equal(view.cause, logic.CAUSES.TIMEOUT);
  assert.equal(view.clock, '0:00');
});

test('the HUD shows the clock and the tally without leaking where anyone is', async () => {
  const setup = harness({ hiders: [FAR, { id: 'hider-3', x: 41, y: 0, z: 41, floor: 2 }] });
  const round = await createRound(setup);
  round.update(45);

  const printed = [...setup.elements.values()].map((el) => String(el.textContent)).join(' | ');
  assert.match(printed, /2 \/ 2/);
  assert.match(printed, /1:00/);
  assert.ok(!printed.includes('40'), 'positions never reach the HUD');
});
