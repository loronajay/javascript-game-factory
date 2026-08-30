const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { environment } = require('./helpers/menu-environment.js');
const logic = require('../menu-logic.js');
const maps = require('../map-catalog.js');
const load = name => import(pathToFileURL(path.resolve(__dirname, '../modules', name)));

test('online stage cards use the catalog and changing stage returns to online setup', async () => {
  const env = environment();
  const { createMapSession } = await load('map-session.js');
  const { createMenu } = await load('menu.js');
  const session = createMapSession({ maps, window: env.window });
  const menu = createMenu({ logic, maps, mapSession: session, ...env, onPlay() {} });
  menu.dispatch(logic.ACTIONS.ONLINE);
  const cards = env.elements.get('onlineMapCards');
  assert.deepEqual(cards.children.map(card => card.dataset.mapId), maps.listMaps().map(map => map.id));
  cards.fire('change', { target: { name: 'onlineMapChoice', value: 'cinder-mall' } });
  assert.match(env.window.location.href, /map=cinder-mall/);
  const pending = JSON.parse(env.window.localStorage.getItem(session.SETUP_KEY));
  assert.equal(pending.mode, 'online');
  env.window.location.search = '?map=cinder-mall';
  const reentered = environment();
  reentered.window.localStorage = env.window.localStorage;
  reentered.window.location = env.window.location;
  const nextSession = createMapSession({ maps, window: reentered.window });
  const nextMenu = createMenu({ logic, maps, mapSession: nextSession, ...reentered, onPlay() {} });
  assert.equal(nextMenu.getScreen(), logic.SCREENS.ONLINE_SETUP);
  assert.equal(nextSession.activeMapId(), 'cinder-mall');
  assert.equal(reentered.elements.get('onlineMapReadout').textContent, 'CINDER MALL');
  assert.equal(reentered.elements.get('lobbyDemonCount').textContent, '3');
  assert.equal(nextSession.takePendingSetup(), null);
});

test('solo stage selection still preserves solo role and timing', async () => {
  const env = environment();
  const { createMapSession } = await load('map-session.js');
  const { createMenu } = await load('menu.js');
  const session = createMapSession({ maps, window: env.window });
  const menu = createMenu({ logic, maps, mapSession: session, ...env, onPlay() {} });
  menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
  env.elements.get('soloRole').value = 'hider';
  env.elements.get('soloHideSeconds').value = '90';
  env.elements.get('soloMapCards').fire('change', { target: { name: 'soloMapChoice', value: 'cinder-mall' } });
  const pending = JSON.parse(env.window.localStorage.getItem(session.SETUP_KEY));
  assert.equal(pending.role, 'hider'); assert.equal(pending.hideSeconds, 90);
  assert.notEqual(pending.mode, 'online');
});
