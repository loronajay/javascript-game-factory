const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { environment } = require('./helpers/menu-environment.js');
const logic = require('../menu-logic.js');
const maps = require('../map-catalog.js');
const load = name => import(pathToFileURL(path.resolve(__dirname, '../modules', name)));

async function setup({ blockedStorage = false, onPrepareMap = () => {}, onStartSingle = () => {}, onScreen } = {}) {
  const env = environment();
  if (blockedStorage) Object.defineProperty(env.window, 'localStorage', { get() { throw new Error('blocked'); } });
  const { createMapSession } = await load('map-session.js');
  const { createMenu } = await load('menu.js');
  const session = createMapSession({ maps, window: env.window });
  const menu = createMenu({ logic, maps, mapSession: session, ...env, onPlay() {}, onPrepareMap, onStartSingle, onScreen });
  const select = (prefix, value) => env.elements.get(`${prefix}MapCards`).fire('change', { target: { name: `${prefix}MapChoice`, value } });
  return { ...env, session, menu, select };
}

for (const blockedStorage of [false, true]) {
  test(`browsing online maps stays in setup without navigation (storage blocked: ${blockedStorage})`, async () => {
    const prepared = [];
    const env = await setup({ blockedStorage, onPrepareMap: id => prepared.push(id) });
    const href = env.window.location.href;
    env.menu.dispatch(logic.ACTIONS.ONLINE);
    const cards = env.elements.get('onlineMapCards');
    assert.deepEqual(cards.children.map(card => card.dataset.mapId), maps.listMaps().map(map => map.id));
    for (const map of maps.playableMaps()) {
      env.select('online', map.id);
      assert.equal(env.menu.getScreen(), logic.SCREENS.ONLINE_SETUP);
      assert.equal(env.window.location.href, href);
      assert.equal(env.elements.get('onlineMapReadout').textContent, map.name.toUpperCase());
      assert.equal(env.elements.get('lobbyMapName').textContent, map.name.toUpperCase());
      assert.equal(env.elements.get('lobbyDemonCount').textContent, String(maps.demonCountFor(map.id)));
    }
    assert.deepEqual(prepared, [], 'browsing must not rebuild the world');
    assert.equal(env.session.activeMapId(), 'grand-hotel');
  });

  test(`solo map browsing keeps role, guests, timing and screen (storage blocked: ${blockedStorage})`, async () => {
    const events = [];
    const env = await setup({ blockedStorage, onPrepareMap: id => events.push(['prepare', id]), onStartSingle: config => events.push(['start', config]) });
    env.menu.dispatch(logic.ACTIONS.SINGLE_PLAYER);
    env.elements.get('soloRole').value = 'hider';
    env.elements.get('soloHiderCount').value = '5';
    env.elements.get('soloHideSeconds').value = '90';
    for (const map of maps.playableMaps()) env.select('solo', map.id);
    assert.equal(env.menu.getScreen(), logic.SCREENS.SOLO_SETUP);
    assert.equal(env.window.location.href, 'http://localhost/games/hide-and-seek/');
    assert.deepEqual(events, []);
    const config = env.menu.getMatchConfig();
    assert.equal(config.role, 'hider'); assert.equal(config.hiderCount, 5); assert.equal(config.hideSeconds, 90);
    assert.match(env.elements.get('soloLead').textContent, /Crowne Point Cinema/);
    env.menu.dispatch(logic.ACTIONS.PLAY);
    assert.deepEqual(events, [['prepare', config.mapId], ['start', config]]);
    assert.equal(env.session.activeMapId(), config.mapId);
    assert.equal(env.menu.getScreen(), logic.SCREENS.PLAYING);
    env.menu.dispatch(logic.ACTIONS.PAUSE); env.menu.dispatch(logic.ACTIONS.RESUME);
    assert.equal(events.length, 2, 'resuming must not rebuild or restart');
  });
}

test('each setup commits its own selection before entering matchmaking or play', async () => {
  const events = [];
  const env = await setup({ onPrepareMap: id => events.push(['prepare', id]), onScreen: screen => {
    if (screen === logic.SCREENS.ONLINE) events.push(['connect', env.session.activeMapId()]);
  } });
  env.menu.dispatch(logic.ACTIONS.SINGLE_PLAYER); env.select('solo', 'mercy-hospital');
  env.menu.dispatch(logic.ACTIONS.BACK); env.menu.dispatch(logic.ACTIONS.ONLINE);
  env.select('online', 'cinder-mall'); env.menu.dispatch(logic.ACTIONS.JOIN_ONLINE);
  assert.deepEqual(events, [['prepare', 'cinder-mall'], ['connect', 'cinder-mall']]);
  env.menu.dispatch(logic.ACTIONS.BACK); env.menu.dispatch(logic.ACTIONS.BACK);
  env.menu.dispatch(logic.ACTIONS.SINGLE_PLAYER); env.menu.dispatch(logic.ACTIONS.PLAY);
  assert.equal(env.session.activeMapId(), 'mercy-hospital');
  assert.equal(env.window.location.href, 'http://localhost/games/hide-and-seek/');
});

test('a failed map preparation leaves the setup usable and the active map unchanged', async () => {
  let starts = 0;
  const env = await setup({ onPrepareMap: () => false, onStartSingle: () => starts++ });
  env.menu.dispatch(logic.ACTIONS.SINGLE_PLAYER); env.select('solo', 'cinder-mall');
  env.menu.dispatch(logic.ACTIONS.PLAY);
  assert.equal(env.menu.getScreen(), logic.SCREENS.SOLO_SETUP);
  assert.equal(env.session.activeMapId(), 'grand-hotel');
  assert.equal(starts, 0);
});

