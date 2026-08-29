const test = require('node:test');
const assert = require('node:assert/strict');
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
