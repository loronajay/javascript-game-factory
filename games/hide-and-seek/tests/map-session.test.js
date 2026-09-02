const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

test('the creature workbench can select one roster body without changing the active map', async () => {
  const { createMapSession } = await import(url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'map-session.js')).href);
  const roster = [{ id: 'surgeon' }, { id: 'matron' }, { id: 'orderly' }];
  const maps = {
    playableMapId: () => 'mercy-hospital',
    normalizeMapId: () => 'mercy-hospital',
    getMap: () => ({ id: 'mercy-hospital' }),
    demonRosterFor: () => roster.slice(),
  };
  const session = createMapSession({
    maps,
    storage: null,
    window: { location: { search: '?map=mercy-hospital&demon=matron', href: 'http://local/?map=mercy-hospital&demon=matron' } },
  });

  assert.equal(session.activeMapId(), 'mercy-hospital');
  assert.deepEqual(session.inspectionDemonRoster(), [{ id: 'matron' }]);
});
