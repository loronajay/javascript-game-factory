const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const logic = require('../enemy-logic.js');

function createClassList() {
  const active = new Set();
  return {
    active,
    toggle(name, enabled) { if (enabled) active.add(name); else active.delete(name); },
  };
}

async function loadCreateDemons() {
  const moduleUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'demons.js')).href;
  return (await import(moduleUrl)).createDemons;
}

test('replacing a map stops every outgoing demon body', async () => {
  const createDemons = await loadCreateDemons();
  const disposed = [];
  const demons = createDemons({
    createMonster: ({ name }) => ({ getState: () => ({}), dispose: () => disposed.push(name) }),
    common: { document: null },
  });
  demons.dispose();
  assert.deepEqual(disposed, ['The Bellhop', 'The Housekeeper']);
});

test('the shared threat event separately reports whether a demon sees the local player', async () => {
  const createDemons = await loadCreateDemons();
  const events = [];
  const states = [
    { state: logic.ENEMY_STATES.CHASE, detectedTargetId: 'hider-1' },
    { state: logic.ENEMY_STATES.ROAM, detectedTargetId: null },
  ];
  let created = 0;
  const demons = createDemons({
    createMonster() {
      const index = created;
      created += 1;
      return { update() {}, setPlayers() {}, getState: () => states[index] };
    },
    common: {
      logic,
      document: { body: { classList: createClassList() } },
      world: { emit: (name, detail) => events.push({ name, detail }) },
    },
  });

  demons.update(0.1, 0.1);
  assert.deepEqual(events.at(-1), {
    name: 'monster-state',
    detail: { state: logic.ENEMY_STATES.CHASE, localChase: false },
  });

  states[1] = { state: logic.ENEMY_STATES.CHASE, detectedTargetId: 'local' };
  demons.update(0.1, 0.2);
  assert.deepEqual(events.at(-1), {
    name: 'monster-state',
    detail: { state: logic.ENEMY_STATES.CHASE, localChase: true },
  });
});

test('the viewport vignette is transparent unless the local player is actively chased', async () => {
  const createDemons = await loadCreateDemons();
  const bodyClassList = createClassList();
  const states = [
    { state: logic.ENEMY_STATES.CHASE, detectedTargetId: 'hider-1' },
    { state: logic.ENEMY_STATES.ROAM, detectedTargetId: null },
  ];
  let created = 0;
  const demons = createDemons({
    createMonster() {
      const index = created++;
      return { update() {}, setPlayers() {}, getState: () => states[index] };
    },
    common: {
      logic,
      document: { body: { classList: bodyClassList } },
      world: { emit() {} },
    },
  });

  demons.update(0.1, 0.1);
  assert.equal(bodyClassList.active.has('monster-chase'), false, 'another player being chased must not obscure this viewport');

  states[1] = { state: logic.ENEMY_STATES.CHASE, detectedTargetId: 'local' };
  demons.update(0.1, 0.2);
  assert.equal(bodyClassList.active.has('monster-chase'), true);

  // The vignette must be transparent on its own and only ever lit by a `.monster-*` class, so a
  // threat that ends takes its glow with it. Each selector is declared exactly once: a second copy
  // of any of them is how the glow used to survive the chase that caused it.
  const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
  const base = '#threatVignette{position:fixed;inset:0;z-index:7;box-shadow:inset 0 0 120px 25px transparent';
  assert.equal(css.split(base).length - 1, 1, 'the base vignette rule must be declared exactly once');
  for (const state of ['search', 'hunt', 'chase']) {
    const rule = `.monster-${state} #threatVignette{`;
    assert.equal(css.split(rule).length - 1, 1, `.monster-${state} must light the vignette exactly once`);
    assert.ok(css.indexOf(rule) > css.indexOf(base), `.monster-${state} must override the transparent base`);
  }
  assert.ok(!css.includes('.monster-chase #staminaMeter'), 'a threat state must not reposition the meter rail');
});

test('a roster longer than the hotel\u2019s two composes that many bodies and builds their HUD rows', async () => {
  const createDemons = await loadCreateDemons();
  const created = [];
  const host = { id: 'demonStatuses', children: [], appendChild(node) { this.children.push(node); } };
  // A document with only the hotel's two authored rows in it. A third demon must not need markup
  // written for it — that would make adding one to a map a menu edit.
  const byId = new Map([['monsterStatus', {}], ['housekeeperStatus', {}], ['demonStatuses', host]]);
  const document = {
    body: { classList: createClassList() },
    getElementById: (id) => byId.get(id) || null,
    createElement: () => ({ dataset: {} }),
  };
  const demons = createDemons({
    createMonster(options) {
      const floor = created.push(options);
      return { update() {}, setPlayers() {}, setRemotePose() {}, getState: () => ({ state: logic.ENEMY_STATES.ROAM, floor, position: { x: floor * 10, y: 0, z: floor * 4 } }) };
    },
    roster: [
      { id: 'greeter', name: 'The Greeter', hunts: true },
      { id: 'custodian', name: 'The Custodian', hunts: false },
      { id: 'nightwatch', name: 'The Nightwatch', hunts: false },
    ],
    common: { logic, heat: { meter: true }, document, world: { emit() {} } },
  });

  assert.equal(demons.list.length, 3);
  assert.deepEqual(created.map((options) => options.name), ['The Greeter', 'The Custodian', 'The Nightwatch']);
  assert.deepEqual(created.map((options) => options.statusElementId),
    ['demonStatus-greeter', 'demonStatus-custodian', 'demonStatus-nightwatch']);
  assert.equal(host.children.length, 3, 'every demon without authored markup gets a status row');
  // Only the roster's hunter reads the heat meter, however many demons a map has.
  assert.deepEqual(created.map((options) => !!options.heat), [true, false, false]);
  // Each one is placed clear of the demons already standing. It used to be handed the floors that
  // were taken, which cannot spread three demons over Cinder Mall's two levels — so it is handed
  // where they actually are, and separation is a distance.
  assert.deepEqual(created.map((options) => options.takenSpawns.length), [0, 1, 2]);
  // Flattened to loose coordinates: `getState()` reports a vector, and a separation measured against
  // an undefined x would silently always pass and stack three demons in one spot.
  assert.deepEqual(created[2].takenSpawns[0], { x: 10, z: 4, floor: 1 });
});

// Online the demons are puppets: their brains stood down, so their local awareness is a permanent
// `roam`. `demons.update` still runs every tick to advance the mixers, and it used to repaint the
// threat readout from those stood-down states — overwriting the authority's twice per tick. The
// soundtrack restarts a track whenever the state changes, so the chase theme was torn down and
// restarted 120 times a second and never audibly played.
test('a snapshot owns the threat readout; the puppet bodies stop publishing one', async () => {
  const createDemons = await loadCreateDemons();
  const events = [];
  const bodyClassList = createClassList();
  const poses = [];
  const demons = createDemons({
    createMonster() {
      return {
        update() {},
        setPlayers() {},
        setRemotePose(view) { poses.push(view); },
        getState: () => ({ state: logic.ENEMY_STATES.ROAM, detectedTargetId: null }),
      };
    },
    common: {
      logic,
      document: { body: { classList: bodyClassList } },
      world: { emit: (name, detail) => events.push({ name, detail }) },
    },
    roster: [
      { id: 'bellhop', name: 'The Bellhop', hunts: true },
      { id: 'housekeeper', name: 'The Housekeeper', hunts: false },
    ],
  });

  demons.applySnapshot(
    [{ id: 'bellhop', state: logic.ENEMY_STATES.CHASE }, { id: 'housekeeper', state: logic.ENEMY_STATES.ROAM }],
    logic.ENEMY_STATES.CHASE,
    'client-1',
  );
  assert.equal(events.length, 1);
  assert.equal(events.at(-1).detail.state, logic.ENEMY_STATES.CHASE);
  assert.equal(bodyClassList.active.has('monster-chase'), true);

  for (let tick = 0; tick < 10; tick += 1) demons.update(1 / 60, tick / 60);
  assert.equal(events.length, 1, 'a stood-down demon must not publish a threat state of its own');
  assert.equal(bodyClassList.active.has('monster-chase'), true, 'the chase vignette must survive the puppet ticks');
  assert.equal(poses.length, 2);
});
