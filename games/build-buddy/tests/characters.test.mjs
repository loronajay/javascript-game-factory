import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppShellState, selectCharacter, selectCharacterCosmetic, startLocalRun, startOnlineSearch, applyOnlineClientSnapshot, startOnlineRunFromLobby } from '../js/app-shell.js';
import { normalizeCharacterId, normalizeCharacterCosmetics, runnerAppearance, runnerCharacterId } from '../js/characters.js';
import { createOnlineClient } from '../js/online-client.js';

const storage = () => { const data = new Map(); return { getItem: k => data.get(k), setItem: (k,v) => data.set(k,v) }; };
test('separate local choices persist and follow the runner role across stages', () => {
  const store = storage();
  let state = createAppShellState({ storage: store });
  state = selectCharacter(state, 0, 'rabbit');
  state = selectCharacter(state, 1, 'bear');
  state = startLocalRun(createAppShellState({ storage: store }));
  assert.equal(runnerCharacterId(state), 'rabbit');
  state = { ...state, session: { ...state.session, stageIndex: 1 } };
  assert.equal(runnerCharacterId(state), 'bear');
  assert.equal(normalizeCharacterId('../../bad.png'), 'fox');
});
test('blocked or damaged browser storage does not prevent choosing a character', () => {
  const store = { getItem() { return '{broken'; }, setItem() { throw Error('blocked'); } };
  const state = selectCharacter(createAppShellState({ storage: store }), 0, 'raccoon');
  assert.equal(state.players[0].characterId, 'raccoon');
  assert.equal(selectCharacter(state, 99, 'bear'), state);
});
test('players save independent scarf, shoe, and fur choices', () => {
  const store = storage();
  let state = createAppShellState({ storage: store });
  state = selectCharacterCosmetic(state, 0, 'scarfColor', 'coral');
  state = selectCharacterCosmetic(state, 0, 'shoeColor', 'gold');
  state = selectCharacterCosmetic(state, 0, 'furColor', 'midnight');
  state = selectCharacterCosmetic(state, 1, 'scarfColor', 'violet');
  const restored = createAppShellState({ storage: store });
  assert.deepEqual(restored.players[0].cosmetics, { scarfColor: 'coral', shoeColor: 'gold', furColor: 'midnight' });
  assert.deepEqual(restored.players[1].cosmetics, { scarfColor: 'violet', shoeColor: 'teal', furColor: 'classic' });
  assert.deepEqual(normalizeCharacterCosmetics({ scarfColor: 'javascript:bad', shoeColor: 'sky', furColor: '../../bad' }), {
    scarfColor: 'teal', shoeColor: 'sky', furColor: 'classic',
  });
});
test('cosmetics accept safe custom colors from the color picker', () => {
  const store = storage();
  let state = createAppShellState({ storage: store });
  state = selectCharacterCosmetic(state, 0, 'scarfColor', '#12A4ef');
  state = selectCharacterCosmetic(state, 0, 'shoeColor', '#ff8800');
  state = selectCharacterCosmetic(state, 0, 'furColor', '#7351b9');
  const restored = createAppShellState({ storage: store });
  assert.deepEqual(restored.players[0].cosmetics, {
    scarfColor: '#12a4ef', shoeColor: '#ff8800', furColor: '#7351b9',
  });
  assert.deepEqual(normalizeCharacterCosmetics({ scarfColor: '#12345', shoeColor: 'red', furColor: '#abcdex' }), {
    scarfColor: 'teal', shoeColor: 'teal', furColor: 'classic',
  });
});
test('runner appearance follows the active role, including online cosmetics', () => {
  const local = startLocalRun(createAppShellState({
    storage: storage(),
    players: [
      { id: 'a', displayName: 'A', characterId: 'fox', cosmetics: { scarfColor: 'coral' } },
      { id: 'b', displayName: 'B', characterId: 'bear', cosmetics: { shoeColor: 'gold', furColor: 'snow' } },
    ],
  }));
  assert.equal(runnerAppearance(local).cosmetics.scarfColor, 'coral');
  local.session.stageIndex = 1;
  assert.deepEqual(runnerAppearance(local), {
    characterId: 'bear', cosmetics: { scarfColor: 'teal', shoeColor: 'gold', furColor: 'snow' },
  });
  assert.deepEqual(runnerAppearance({
    online: {
      serverMatchState: { stage: { roles: { runnerPlayerId: 'socket-b' } } },
      profiles: { 'socket-b': { characterId: 'rabbit', cosmetics: { scarfColor: 'violet', shoeColor: 'sky' } } },
    },
  }), { characterId: 'rabbit', cosmetics: { scarfColor: 'violet', shoeColor: 'sky', furColor: 'classic' } });
});
test('server roles resolve cosmetics by network id, independently of profile ids', () => {
  let state = startOnlineSearch(createAppShellState({ storage: storage() }), { playerId: 'account-a', displayName: 'A', characterId: 'rabbit' });
  state = applyOnlineClientSnapshot(state, {
    status: 'started', clientId: 'socket-a',
    lobby: { members: ['socket-a', 'socket-b'], ownerId: 'socket-a' },
    profiles: { 'socket-a': { playerId: 'account-a', characterId: 'rabbit' }, 'socket-b': { playerId: 'account-b', characterId: 'bear' } },
    onlineGameplay: { lastMatchState: { value: { network: { authorityMode: 'server' }, players: [{ clientId: 'socket-a' }, { clientId: 'socket-b' }], stage: { stageId: 'pack_01_stage_01', stageIndex: 0, roles: { runnerPlayerId: 'socket-a', builderPlayerId: 'socket-b' } } } } },
  });
  state = startOnlineRunFromLobby(state);
  assert.equal(runnerCharacterId(state), 'rabbit');
  state.online.serverMatchState.stage.roles.runnerPlayerId = 'socket-b';
  assert.equal(runnerCharacterId(state), 'bear');
});
test('two clients retain character choices through delayed profile relay and role swaps', () => {
  class Socket {
    static OPEN = 1;
    static all = [];
    constructor() { this.readyState = 1; this.sent = []; Socket.all.push(this); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(data) { this.onmessage({ data: JSON.stringify(data) }); }
  }
  const clients = ['rabbit', 'raccoon'].map((characterId, i) => {
    const client = createOnlineClient({ WebSocketCtor: Socket });
    client.setIdentity({ playerId: `account-${i}`, characterId });
    client.connect();
    Socket.all[i].receive({ event: 'connected', clientId: `socket-${i}` });
    Socket.all[i].receive({ event: 'lobby_joined', members: ['socket-0', 'socket-1'] });
    return client;
  });
  const wire = Socket.all.flatMap((socket, i) => socket.sent.filter(p => p.messageType === 'profile').map(packet => ({ at: 5 + i * 7, from: i, packet })));
  assert.equal(wire.length, 2, 'both clients announce their character when joining');
  for (let tick = 0; tick < 20; tick++) for (const item of wire.filter(p => p.at === tick)) {
    Socket.all[1 - item.from].receive({ event: 'message', scope: 'lobby', senderId: `socket-${item.from}`, ...item.packet });
  }
  for (const client of clients) {
    const profiles = client.getSnapshot().profiles;
    for (const [id, expected] of [['socket-0', 'rabbit'], ['socket-1', 'raccoon']]) {
      assert.equal(runnerCharacterId({ online: { profiles, serverMatchState: { stage: { roles: { runnerPlayerId: id } } } } }), expected);
    }
  }
});
