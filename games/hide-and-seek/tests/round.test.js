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
function harness({ hiders = [], demon = { x: 90, y: 0, z: 90, floor: 1 }, demons = null, seeker = { x: 0, y: 0, z: 0 }, aiSeeker = null, localRole = logic.ROLES.SEEKER } = {}) {
  const elements = new Map();
  const listeners = new Map();
  const events = [];
  const drops = [];
  const alive = new Map(hiders.map((hider) => [hider.id, { ...hider }]));
  const document = {
    body: { classList: element().classList },
    pointerLockElement: null,
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  };
  const state = { playerFloor: 1, gameOver: false, isLocked: true, seekerHeld: false };
  const elevatorCalls = [];
  const spectatorStarts = [];
  return {
    elements, events, alive, state, elevatorCalls, spectatorStarts, drops,
    fire(name, detail) { for (const handler of listeners.get(name) || []) handler({ detail }); },
    deps: {
      camera: { position: { ...seeker, y: seeker.y + 1.7 } },
      player: { getEyeHeight: () => 1.7, getState: () => ({ flashlightOn: false, flashlightCharge: 0.65 }), setFlashlight: () => {} },
      elevator: {
        holdSeeker: (options) => elevatorCalls.push(['hold', options]),
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
      seeker: aiSeeker ? {
        id: 'solo-seeker',
        update: () => {},
        setHeld: () => {},
        eliminate: () => {},
        getState: () => ({ id: 'solo-seeker', name: 'The Seeker', role: 'seeker', alive: true, x: aiSeeker.x, y: aiSeeker.y, z: aiSeeker.z, floor: aiSeeker.floor || 1, yaw: 0, crouching: false }),
      } : null,
      spectator: { start: (provider) => spectatorStarts.push(provider), stop: () => {} },
      avatars: { setVisible: () => {} },
      localRole,
      flashlightDrops: { drop: (entry) => drops.push(entry) },
      monster: { getState: () => ({ name: 'The Bellhop', position: { x: demon.x, y: demon.y, z: demon.z }, floor: demon.floor }) },
      monsters: demons ? demons.map((entry) => ({ getState: () => ({ name: entry.name, position: { x: entry.x, y: entry.y, z: entry.z }, floor: entry.floor }) })) : null,
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

test('solo demon catches respect an open elevator and walls for both CPU roles', async () => {
  for (const localRole of ['seeker', 'hider']) {
    const target = { id: 'hider-1', x: 0, y: 0, z: 0, floor: 1 };
    // The AI seeker stands well clear: this is about what stops a *demon*, and now that the tag and
    // the catch are both live from the same tick, a seeker parked on the target would decide it.
    const setup = harness({ localRole, hiders: [target, FAR], aiSeeker: localRole === 'hider' ? { x: -80, y: 0, z: -80, floor: 1 } : null,
      demon: { ...target, z: -0.6 }, seeker: { x: 100, y: 0, z: 100 } });
    setup.deps.world.getPlan = () => ({ elevator: { centerX: 0, centerZ: 1, frontZ: -.2 } });
    const round = await createRound(setup);
    // Past the head start, during which no demon catches anybody at all — otherwise this asserts
    // against the grace rather than against the cabin and the wall.
    round.update(45);
    assert.equal(round.getState().phase, logic.PHASES.SEEKING);
    assert.equal(round.getState().over, false);
    assert.equal(setup.alive.has('hider-1'), true, 'the cabin is cover against a demon');
    setup.deps.world.getPlan = () => ({ elevator: null });
    setup.deps.world.sightBlocked = () => true;
    round.update(1 / 60);
    assert.equal(setup.alive.has('hider-1'), true, 'a wall blocks a demon catch');
  }
});

test('hospital round copy names the hospital staff without losing their catch bodies', async () => {
  const setup = harness({ hiders: [FAR] });
  const notices = [];
  const ending = element();
  setup.deps.world.notify = text => notices.push(text);
  setup.elements.set('caughtOverlay', { ...element(), querySelector: () => ({ querySelector: () => ending }) });
  setup.deps.staff = { hunterName: () => 'The Surgeon', rosterText: () => 'The Surgeon, The Matron and The Orderly' };
  const round = await createRound(setup);
  round.update(45);
  assert.ok(notices.some(text => text.includes('THE SURGEON')));
  setup.alive.set(FAR.id, { ...FAR, x: 0, z: 0 });
  round.update(0.1);
  assert.match(ending.textContent, /The Surgeon, The Matron and The Orderly/);
});

test('the seeker is shut in the elevator for at least forty-five seconds and released when seeking starts', async () => {
  const setup = harness({ hiders: [FAR] });
  const round = await createRound(setup);

  assert.deepEqual(setup.elevatorCalls, [['hold', undefined]]);
  round.update(44);
  assert.equal(setup.state.seekerHeld, true);
  assert.equal(round.getState().phase, logic.PHASES.HIDING);
  assert.deepEqual(setup.elevatorCalls, [['hold', undefined]]);

  round.update(1);
  assert.equal(setup.state.seekerHeld, false);
  assert.equal(round.getState().phase, logic.PHASES.SEEKING);
  assert.deepEqual(setup.elevatorCalls, [['hold', undefined], 'release']);
});

test('a solo hider gets the head start while the AI seeker is held', async () => {
  const setup = harness({ hiders: [FAR], aiSeeker: { x: 40, y: 0, z: 40 }, localRole: logic.ROLES.HIDER });
  const round = await createRound(setup);

  assert.deepEqual(setup.elevatorCalls, [['hold', { moveCamera: false }]], 'the cabin closes without moving the hider camera');
  assert.equal(round.getState().hidersTotal, 2, 'the local player is part of the hider tally');
  round.update(45);
  assert.deepEqual(setup.elevatorCalls, [['hold', { moveCamera: false }], 'release']);
});

test('a caught solo hider spectates while other hiders keep the round alive', async () => {
  const setup = harness({ hiders: [FAR], aiSeeker: { x: 1, y: 0, z: 0 }, localRole: logic.ROLES.HIDER });
  const round = await createRound(setup);

  round.update(45);

  assert.equal(round.getState().hidersRemaining, 1);
  assert.equal(round.getState().over, false);
  assert.equal(setup.state.playerEliminated, true);
  assert.equal(setup.state.gameOver, false);
  assert.equal(setup.spectatorStarts.length, 1);
  assert.ok(setup.spectatorStarts[0]().some((entry) => entry.id === 'hider-2'));
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

// This used to assert the opposite, and it was the single worst thing about a small round: a guest
// still looking for somewhere to hide could be taken before the seeker's cabin ever opened, and with
// one hider that ended the match while the seeker was still shut in a box. The demons walk during
// the head start; they do not hunt. See `tests/head-start-grace.test.js` for the authority's half.
test('a demon standing on a hider takes nobody during the head start, and takes them the moment it ends', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 20, y: 0, z: 20, floor: 1 }, FAR], demon: { x: 20.5, y: 0, z: 20, floor: 1 } });
  const round = await createRound(setup);

  round.update(1);

  assert.equal(round.getState().phase, logic.PHASES.HIDING);
  assert.equal(setup.state.headStart, true);
  assert.equal(round.getState().hidersRemaining, 2, 'the head start is not a death sentence');
  assert.ok(setup.alive.has('hider-1'));

  round.update(45);

  assert.equal(round.getState().phase, logic.PHASES.SEEKING);
  assert.equal(setup.state.headStart, false);
  assert.equal(round.getState().hidersRemaining, 1);
  assert.ok(!setup.alive.has('hider-1'));
  assert.deepEqual(round.getState().caught, [{ id: 'hider-1', by: logic.CAUGHT_BY.DEMON }]);
});

test('either named demon can take a hider', async () => {
  const setup = harness({
    hiders: [{ id: 'hider-1', x: 20, y: 4.6, z: 20, floor: 2 }, FAR],
    demons: [
      { name: 'The Bellhop', x: -40, y: 0, z: -40, floor: 1 },
      { name: 'The Housekeeper', x: 20.4, y: 4.6, z: 20, floor: 2 },
    ],
  });
  const round = await createRound(setup);

  round.update(45);

  assert.equal(round.getState().hidersRemaining, 1);
  assert.ok(setup.events.some((entry) => entry.name === 'demon-catch' && entry.detail.demon === 'The Housekeeper'));
});

test('a caught player leaves their remaining flashlight charge at the catch position', async () => {
  const hider = { id: 'hider-1', x: 20, y: 4.6, z: 20, floor: 2, flashlightCharge: 0.4 };
  const setup = harness({ hiders: [hider, FAR], demon: { x: 20.4, y: 4.6, z: 20, floor: 2 } });
  const round = await createRound(setup);

  round.update(45);

  assert.deepEqual(setup.drops, [{ playerId: 'hider-1', x: 20, y: 4.6, z: 20, floor: 2, charge: 0.4 }]);
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
  assert.deepEqual(setup.drops, [{ playerId: 'local', x: 0, y: 0, z: 0, floor: 1, charge: 0.65 }]);
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

// A win and a loss share one overlay, which is what stopped a second ending screen from growing.
// That is a layout decision, not a tone decision: the panel has to say which of the two happened,
// or a hider whose seeker was dragged off reads their own victory as the blood-red screen that has
// meant "you died" all game.
test('the ending marks itself a win for the side that won', async () => {
  // The demon standing on the CPU seeker is the hiders' win condition.
  const setup = harness({ hiders: [FAR], aiSeeker: { x: 40, y: 0, z: 40 }, demon: { x: 40, y: 0, z: 40, floor: 1 }, localRole: logic.ROLES.HIDER });
  const round = await createRound(setup);
  round.update(45);

  const overlay = setup.elements.get('caughtOverlay');
  assert.equal(round.getState().outcome, logic.OUTCOMES.HIDERS);
  assert.equal(overlay.dataset.result, 'win');
  assert.equal(setup.elements.get('restartBtn').textContent, 'PLAY AGAIN');
});

test('the ending marks itself a loss for the side that lost', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 1, y: 0, z: 0, floor: 1 }], aiSeeker: { x: 1, y: 0, z: 0 }, localRole: logic.ROLES.HIDER });
  const round = await createRound(setup);
  round.update(45);

  assert.equal(round.getState().outcome, logic.OUTCOMES.SEEKER);
  assert.equal(setup.elements.get('caughtOverlay').dataset.result, 'loss');
  assert.equal(setup.elements.get('restartBtn').textContent, 'TRY AGAIN');
});

test('a seeker who clears the building gets the win treatment too', async () => {
  const setup = harness({ hiders: [{ id: 'hider-1', x: 1, y: 0, z: 0, floor: 1 }] });
  const round = await createRound(setup);
  round.update(45);

  assert.equal(setup.elements.get('caughtOverlay').dataset.result, 'win');
});
