const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { element, environment } = require('./helpers/menu-environment.js');
const logic = require('../online-logic.js');
const menuLogic = require('../menu-logic.js');
const maps = require('../map-catalog.js');
const fixtures = [require('./helpers/hotel-fixture.js'), require('./helpers/mall-fixture.js'), require('./helpers/hospital-fixture.js')];
const load = name => import(pathToFileURL(path.resolve(__dirname, '../modules', name)));

async function client(id, mapId) {
  const env = environment();
  let socket;
  env.window.WebSocket = class {
    constructor() { Object.assign(this, element()); this.readyState = 1; this.sent = []; socket = this; }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.fire('close'); }
    receive(payload) { this.fire('message', { data: JSON.stringify(payload) }); }
  };
  const roles = new Map(); const doorSnapshots = [];
  const world = { state: { yaw: 0 }, notify() {}, updateInventoryHud() {}, emit(name, detail) { env.window.fire(`hotel:${name}`, { detail }); } };
  const camera = { position: { x: 0, y: 1.7, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } } };
  const player = { getInput: () => ({}), getEyeHeight: () => 1.7, setFlashlight() {}, applyRemoteFlashlight() {} };
  const avatars = { spawn: (id, options) => roles.set(id, options.role), setVisible() {}, setPose() {}, remove() {} };
  const { createMenu } = await load('menu.js');
  const { createSessionMenuHandler } = await load('online-session-menu.js');
  const { createOnline } = await load('online.js');
  let online;
  let readyAtPlay;
  const menu = createMenu({ logic: menuLogic, ...env, canPause: () => !online?.isActive(),
    onPlay() { readyAtPlay = { role: roles.get('local'), clock: env.elements.get('roundClock').textContent, held: !!world.state.seekerHeld, x: camera.position.x }; },
    onScreen: createSessionMenuHandler({ logic: menuLogic, account: { syncMenu() {}, requireAccount: () => true }, getOnline: () => online }),
  });
  online = createOnline({ logic, avatars, avatarLogic: { ROLES: { SEEKER: 'seeker', HIDER: 'hider' } }, world, camera, player, menu,
    hotel: { applyOpenings: view => doorSnapshots.push(view) }, config: {}, ...env, maps, mapId });
  menu.dispatch(menuLogic.ACTIONS.ONLINE); menu.dispatch(menuLogic.ACTIONS.JOIN_ONLINE);
  socket.receive({ event: 'connected', clientId: id, sessionToken: 'test-seat' });
  socket.receive({ event: 'lobby_joined', roomCode: 'TEST', ownerId: 'dad', members: ['dad', 'son'] });
  return { ...env, online, menu, socket, currentSocket: () => socket, roles, doorSnapshots, world, readyAtPlay: () => readyAtPlay };
}

test('a dropped connection keeps online ownership and can reclaim a seat after a long match', async () => {
  const env = await client('dad', 'grand-hotel');
  const { engine } = fixtures[0].createFullSim({ config: { demons: [] } });
  const state = engine.createState({ seekerId: 'dad', players: ['dad', 'son'].map(id => ({ id, spawn: { x: 0, y: 0, z: 0, floor: 1 } })) });
  env.socket.receive({ event: 'lobby_started', matchState: { ...engine.snapshot(state), mapId: 'grand-hotel', seekerId: 'dad' } });
  const saved = JSON.parse(env.window.sessionStorage.getItem('hide-and-seek.session'));
  env.window.sessionStorage.setItem('hide-and-seek.session', JSON.stringify({ ...saved, at: Date.now() - 120000 }));
  env.socket.close();
  assert.equal(env.online.isActive(), true);
  assert.equal(env.world.state.remoteFixtures, true);
  assert.equal(env.menu.dispatch(menuLogic.ACTIONS.PAUSE), false);
  assert.equal(env.timers.size, 1);
  assert.equal(env.online.getState().resumable, true);
  const reconnect = [...env.timers.values()][0];
  env.timers.clear(); reconnect();
  const replacement = env.currentSocket();
  replacement.receive({ event: 'connected', clientId: 'new-connection', sessionToken: 'new-token' });
  assert.equal(replacement.sent.at(-1).type, 'resume_lobby');
  assert.equal(replacement.sent.at(-1).clientId, 'dad');
  replacement.receive({ event: 'error', code: 'RESUME_REJECTED' });
  assert.equal(env.world.state.gameOver, true);
  assert.equal(env.world.state.remoteFixtures, true);
  assert.equal(env.menu.getScreen(), menuLogic.SCREENS.CAUGHT);
  assert.equal(replacement.sent.some(message => message.type === 'find_lobby'), false);
  env.online.disconnect();
  assert.equal(env.timers.size, 0);
  assert.equal(env.online.getState().status, logic.NET_STATES.OFFLINE);
});

test('backing out of a lobby closes it without scheduling a reconnect', async () => {
  const env = await client('dad', 'grand-hotel');
  env.menu.dispatch(menuLogic.ACTIONS.BACK);
  assert.equal(env.socket.readyState, 3);
  assert.equal(env.timers.size, 0);
  assert.equal(env.online.getState().status, logic.NET_STATES.OFFLINE);
});

test('an incompatible or incomplete start packet never opens a playable local world', async () => {
  const { engine } = fixtures[0].createFullSim({ config: { demons: [] } });
  const state = engine.createState({ seekerId: 'dad', players: ['dad', 'son'].map(id => ({ id, spawn: { x: 0, y: 0, z: 0, floor: 1 } })) });
  const valid = { ...engine.snapshot(state), mapId: 'grand-hotel', seekerId: 'dad' };
  for (const view of [null, { ...valid, mapId: 'cinder-mall' }, { ...valid, players: valid.players.map(player => ({ ...player, role: 'hider' })) }]) {
    const env = await client('dad', 'grand-hotel');
    env.socket.receive({ event: 'lobby_started', matchState: view });
    assert.equal(env.readyAtPlay(), undefined);
    assert.equal(env.world.state.remoteFixtures, true);
    assert.equal(env.world.state.gameOver, true);
    assert.equal(env.menu.getScreen(), menuLogic.SCREENS.CAUGHT);
    assert.equal(env.socket.readyState, 3);
  }
});

for (const [index, mapId] of ['grand-hotel', 'cinder-mall', 'mercy-hospital'].entries()) {
  test(`${mapId}: two clients receive their roles, countdown and fixtures before play, even if the next packet is delayed`, async () => {
    const { engine } = fixtures[index].createFullSim({ config: { demons: [] } });
    let state = engine.createState({ seekerId: 'dad', players: [
      { id: 'dad', spawn: { x: 1, y: 0, z: 1, floor: 1 } },
      { id: 'son', spawn: { x: 3, y: 0, z: 1, floor: 1 } },
    ] });
    const view = () => ({ ...engine.snapshot(state), mapId, seekerId: 'dad' });
    const clients = await Promise.all(['dad', 'son'].map(id => client(id, mapId)));
    for (const env of clients) env.socket.receive({ event: 'lobby_started', matchState: view() });
    assert.deepEqual(clients.map(env => env.readyAtPlay()), [
      { role: 'seeker', clock: '0:45', held: true, x: 1 },
      { role: 'hider', clock: '0:45', held: false, x: 3 },
    ]);
    for (const env of clients) {
      assert.equal(env.online.isActive(), true);
      assert.equal(env.socket.readyState, 1);
      assert.equal(env.menu.dispatch(menuLogic.ACTIONS.PAUSE), false);
      assert.equal(env.menu.getScreen(), menuLogic.SCREENS.PLAYING);
      assert.deepEqual(env.doorSnapshots.at(-1), view().fixtures.doors);
    }
    // Different delivery latency; the authority advances independently of both clients.
    for (let tick = 1; tick <= 72; tick++) {
      state = engine.tick(state, 1 / 60, {});
      clients.forEach((env, seat) => {
        if (tick % 4 === seat * 2) env.socket.receive({ event: 'message', messageType: 'hide_and_seek_snapshot', value: view() });
        env.online.update(1 / 60);
      });
    }
    assert.deepEqual(clients.map(env => env.elements.get('roundClock').textContent), ['0:44', '0:44']);
    assert.deepEqual(clients.map(env => env.roles.get('local')), ['seeker', 'hider']);
  });
}
