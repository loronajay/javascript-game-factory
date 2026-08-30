const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { element, environment } = require('./helpers/menu-environment.js');
const logic = require('../online-logic.js');
const menuLogic = require('../menu-logic.js');
const maps = require('../map-catalog.js');
const spectatorLogic = require('../spectator-logic.js');
const roundLogic = require('../round-logic.js');
const fixture = require('./helpers/hotel-fixture.js');
const load = name => import(pathToFileURL(path.resolve(__dirname, '../modules', name)));

async function client(id = 'me', mapId = 'grand-hotel') {
  const env = environment();
  const sockets = [];
  env.window.WebSocket = class {
    constructor() { Object.assign(this, element()); this.readyState = 1; this.sent = []; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.fire('close'); }
    receive(event) { this.fire('message', { data: JSON.stringify(event) }); }
  };
  const world = { state: { yaw: 0, gameOver: false }, notify() {}, updateInventoryHud() {}, emit(name, detail) { env.window.fire(`hotel:${name}`, { detail }); } };
  const camera = { position: { x: 0, y: 1.7, z: 0, set(x, y, z) { Object.assign(this, { x, y, z }); } }, rotation: {} };
  const visibility = new Map();
  const avatars = { spawn() {}, setVisible: (id, value) => visibility.set(id, value), setPose() {}, remove() {}, setHeadHidden() {} };
  const player = { getInput: () => ({ forward: 1 }), getEyeHeight: () => 1.7, setFlashlight() {}, applyRemoteFlashlight() {} };
  const { createSpectator } = await load('spectator.js');
  const spectator = createSpectator({ logic: spectatorLogic, world, camera, avatars, config: {}, ...env });

  const { createMapSession } = await load('map-session.js');
  const mapSession = createMapSession({ maps, window: env.window });
  let online;
  const { createMenu } = await load('menu.js');
  const menu = createMenu({ logic: menuLogic, ...env, maps, mapSession, onPlay() {}, canPause: () => !online?.isActive(),
  });
  const { createOnline } = await load('online.js');
  online = createOnline({ logic, avatars, avatarLogic: { ROLES: { SEEKER: 'seeker', HIDER: 'hider' } }, camera, world, player, menu, spectator, config: {}, ...env, maps, mapId });
  menu.dispatch(menuLogic.ACTIONS.ONLINE);
  assert.equal(sockets.length, 0);
  menu.dispatch(menuLogic.ACTIONS.JOIN_ONLINE);
  // Socket lifecycle is tested separately; these clients exercise snapshot presentation.
  online.connect();
  const socket = sockets.at(-1);
  socket.receive({ event: 'connected', clientId: id, sessionToken: 'test-token' });
  socket.receive({ event: 'lobby_joined', clientId: id, roomCode: 'TEST', ownerId: 'seeker', members: ['seeker', 'me', 'other'] });
  return { ...env, online, menu, socket, sockets, world, camera, spectator, visibility, mapSession };
}
function snapshot({ dead = [], over = false, tick = 1, mapId = 'grand-hotel' } = {}) {
  return { mapId, tick, seekerId: 'seeker',
    players: ['seeker', 'me', 'other'].map((id, index) => ({ id, name: id, role: id === 'seeker' ? 'seeker' : 'hider', alive: !dead.includes(id), x: index * 10, y: 0, z: 0, yaw: 0, floor: 1, flashlight: { on: false, charge: 1 } })),
    round: { phase: over ? 'over' : 'hiding', over, outcome: over ? 'hiders' : null, hidersRemaining: 2 - dead.filter(id => id !== 'seeker').length, hidersTotal: 2, clock: '0:45' },
  };
}
function start(env, view = snapshot()) { env.socket.receive({ event: 'lobby_started', matchState: JSON.stringify(view) }); }
function deliver(env, view) { env.socket.receive({ event: 'message', messageType: 'hide_and_seek_snapshot', value: JSON.stringify(view) }); env.online.update(1 / 60); }

test('a server-caught online hider follows living players without a solo loss screen', async () => {
  const env = await client();
  start(env);
  assert.equal(env.socket.readyState, 1);
  assert.equal(env.online.isActive(), true);
  assert.equal(env.world.state.remoteFixtures, true);
  deliver(env, snapshot({ dead: ['me'] }));
  assert.equal(env.spectator.isActive(), true);
  assert.equal(env.menu.getScreen(), menuLogic.SCREENS.PLAYING);
  assert.equal(env.world.state.gameOver, false);
  assert.equal(env.world.state.playerEliminated, true, 'a spectator must stop accruing local survival-meter effects');
  assert.equal(env.elements.get('caughtOverlay').classList.contains('visible'), false);
  assert.equal(env.visibility.get('local'), false);
  assert.equal(env.spectator.getTarget(), 'seeker');
  env.window.fire('keydown', { code: 'KeyE' });
  env.online.update(1 / 60);
  assert.equal(env.spectator.getTarget(), 'other');
  assert.equal(env.camera.position.x, 20);
  assert.equal(env.socket.sent.some(message => message.messageType === 'hide_and_seek_input'), false);
});

test('a local catch notification cannot take over the online menu', async () => {
  const env = await client(); start(env);
  env.world.emit('caught', { demon: 'The Bellhop' });
  assert.equal(env.menu.getScreen(), menuLogic.SCREENS.PLAYING);
  deliver(env, snapshot({ dead: ['me'] }));
  assert.equal(env.spectator.isActive(), true);
  assert.equal(env.menu.getScreen(), menuLogic.SCREENS.PLAYING);
});

test('only the authority ends the match and online results offer another online match', async () => {
  const env = await client(); start(env);
  deliver(env, snapshot({ dead: ['me'] }));
  deliver(env, snapshot({ dead: ['me', 'seeker'], over: true }));
  assert.equal(env.spectator.isActive(), false);
  assert.equal(env.menu.getScreen(), menuLogic.SCREENS.CAUGHT);
  assert.equal(env.elements.get('restartBtn').textContent, 'FIND ANOTHER MATCH');
  env.elements.get('restartBtn').fire('click');
  assert.equal(env.window.localStorage.getItem(env.mapSession.SETUP_KEY) && JSON.parse(env.window.localStorage.getItem(env.mapSession.SETUP_KEY)).mode, 'online');
});

test('each stage is sent to matchmaking as its own lobby setting', async () => {
  for (const mapId of maps.playableMaps().map(map => map.id)) {
    const env = await client('me', mapId);
    assert.deepEqual(env.socket.sent.find(message => message.type === 'find_lobby').settings, { mapId });
  }
});

for (const cause of ['tag', 'demon']) test(`three clients follow authoritative ${cause} captures with staggered snapshot delivery`, async () => {
  const { engine, hotel } = fixture.createFullSim({ config: { demon: { walkSpeed: 0, chaseSpeed: 0, huntSpeed: 0 } } });
  let state = engine.createState({ seekerId: 'seeker', players: [
    { id: 'seeker', spawn: hotel.spawns.seeker },
    { id: 'me', spawn: hotel.spawns.hiders[0] },
    { id: 'other', spawn: hotel.spawns.hiders[1] },
  ] });
  if (cause === 'tag') state = { ...state, round: { ...state.round, hideRemaining: 0, phase: roundLogic.PHASES.SEEKING } };
  const view = () => ({ ...engine.snapshot(state), seekerId: 'seeker', mapId: 'grand-hotel' });
  const clients = await Promise.all(['seeker', 'me', 'other'].map(id => client(id)));
  clients.forEach(env => start(env, view()));
  // Ordered transport, different latency per client, snapshots at 15 Hz, clients at 60 Hz.
  const schedule = [];
  for (let tick = 0; tick < 24; tick++) {
    if (tick === 8) {
      if (cause === 'demon') state = engine.resolveDemonCatch(state, 'me');
      else {
        const target = engine.bodyOf(state, 'me');
        state = { ...state, bodies: state.bodies.map(body => body.id === 'seeker' ? { ...body, x: target.x, y: target.y, z: target.z } : body) };
      }
    }
    state = engine.tick(state, 1 / 60, {});
    if (tick % 4 === 0) clients.forEach((env, index) => schedule.push({ at: tick + index * 2, env, view: view() }));
    for (const packet of schedule.filter(packet => packet.at === tick)) deliver(packet.env, packet.view);
    clients.forEach(env => env.online.update(1 / 60));
  }
  assert.deepEqual(clients.map(env => env.spectator.isActive()), [false, true, false]);
  assert.ok(clients.every(env => env.online.isActive() && !env.world.state.gameOver));
  state = engine.resolveDemonCatch(state, 'seeker');
  clients.forEach(env => deliver(env, view()));
  assert.ok(clients.every(env => env.world.state.gameOver && !env.spectator.isActive()));
});
