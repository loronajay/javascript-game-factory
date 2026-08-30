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

  const css = fs.readFileSync(path.resolve(__dirname, '..', 'styles.css'), 'utf8');
  const neutralRule = '#threatVignette{box-shadow:inset 0 0 120px 25px transparent;animation:none}';
  const chaseRule = '.monster-chase #threatVignette{box-shadow:inset 0 0 150px 38px rgba(105,0,0,.48);animation:threatBeat .68s infinite}';
  assert.ok(css.lastIndexOf(neutralRule) > css.lastIndexOf('rgba(90,0,0,.3)'), 'the final base vignette rule must clear old threat glows');
  assert.ok(css.lastIndexOf(chaseRule) > css.lastIndexOf(neutralRule), 'only the chase override should restore the red glow');
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
    common: { logic, sanity: { meter: true }, document, world: { emit() {} } },
  });

  assert.equal(demons.list.length, 3);
  assert.deepEqual(created.map((options) => options.name), ['The Greeter', 'The Custodian', 'The Nightwatch']);
  assert.deepEqual(created.map((options) => options.statusElementId),
    ['demonStatus-greeter', 'demonStatus-custodian', 'demonStatus-nightwatch']);
  assert.equal(host.children.length, 3, 'every demon without authored markup gets a status row');
  // Only the roster's hunter reads the sanity meter, however many demons a map has.
  assert.deepEqual(created.map((options) => !!options.sanity), [true, false, false]);
  // Each one is placed clear of the demons already standing. It used to be handed the floors that
  // were taken, which cannot spread three demons over Cinder Mall's two levels — so it is handed
  // where they actually are, and separation is a distance.
  assert.deepEqual(created.map((options) => options.takenSpawns.length), [0, 1, 2]);
  // Flattened to loose coordinates: `getState()` reports a vector, and a separation measured against
  // an undefined x would silently always pass and stack three demons in one spot.
  assert.deepEqual(created[2].takenSpawns[0], { x: 10, z: 4, floor: 1 });
});
