import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineClient, resolveWebSocketUrl } from '../scripts/online/client.js';
import { PROTOCOL_VERSION } from '../scripts/online/protocol.js';

class Socket {
    static OPEN = 1;
    static instances = [];
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.listeners = {}; Socket.instances.push(this); }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    emit(type, value = {}) { this.listeners[type]?.(value); }
    message(data) { this.emit('message', { data: JSON.stringify(data) }); }
    open() { this.readyState = 1; this.emit('open'); this.message({ event: 'connected', clientId: 'c_me' }); }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    close() { this.readyState = 3; this.emit('close'); }
}
const identity = { playerId: 'account-1', displayName: 'FactoryOne' };
const lobby = (patch = {}) => ({ event: 'lobby_joined', gameId: 'puckd-up', roomCode: 'ABCDE', ownerId: 'c_me', members: ['c_me'], players: [{ id: 'c_me', name: 'FactoryOne' }], isPrivate: false, ...patch });
function setup(resolveIdentity = async () => identity) {
    const client = createOnlineClient({ WebSocketCtor: Socket, resolveIdentity, requestTimeoutMs: 100 });
    return { client, socket: () => Socket.instances.at(-1) };
}

test('URLs target the existing server, including valid local IPv6', () => {
    assert.equal(resolveWebSocketUrl({ hostname: 'localhost', protocol: 'http:' }), 'ws://localhost:3000');
    assert.equal(resolveWebSocketUrl({ hostname: '[::1]', protocol: 'http:' }), 'ws://[::1]:3000');
    assert.equal(resolveWebSocketUrl({ hostname: 'playerfactory.com' }), 'wss://factory-network-server-production.up.railway.app');
});

test('quick search waits for identity and handshake and sends exact two-seat settings', async () => {
    const { client, socket } = setup();
    await client.findQuickMatch();
    assert.equal(socket().sent.length, 0);
    socket().open();
    assert.deepEqual(socket().sent, [{ type: 'find_lobby', gameId: 'puckd-up', minPlayers: 2, maxPlayers: 2, settings: { protocolVersion: PROTOCOL_VERSION, targetScore: 7 }, identity }]);
    socket().message(lobby());
    assert.equal(client.getSnapshot().status, 'lobby');
    client.dispose();
});

test('private creation, case-normalized joining, full-room errors, and retry', async () => {
    const { client, socket } = setup();
    await client.createPrivateRoom(); socket().open();
    assert.equal(socket().sent[0].private, true);
    socket().message({ event: 'error', code: 'LOBBY_FULL', message: 'Lobby is full' });
    assert.equal(client.getSnapshot().status, 'idle');
    await client.joinPrivateRoom(' abcde ');
    socket().open();
    assert.deepEqual(socket().sent.at(-1), { type: 'join_lobby', gameId: 'puckd-up', roomCode: 'ABCDE', identity });
    client.dispose();
});

test('invalid codes and failed auth never open a socket', async () => {
    let before = Socket.instances.length;
    const { client } = setup();
    assert.equal(await client.joinPrivateRoom('bad!'), false);
    assert.equal(Socket.instances.length, before);
    client.dispose();
    const denied = setup(async () => { throw new Error('Sign in required'); }).client;
    assert.equal(await denied.findQuickMatch(), false);
    assert.equal(Socket.instances.length, before);
    denied.dispose();
});

test('cancel during authentication or connection cannot later create a ghost lobby', async () => {
    let resolve;
    const { client } = setup(() => new Promise(r => { resolve = r; }));
    const request = client.findQuickMatch();
    const before = Socket.instances.length;
    client.leave(); resolve(identity); await request;
    assert.equal(Socket.instances.length, before);
    const next = setup(); await next.client.findQuickMatch();
    const oldSocket = next.socket(); next.client.leave(); oldSocket.open(); oldSocket.message(lobby());
    assert.equal(oldSocket.sent.length, 0);
    assert.equal(next.client.getSnapshot().lobby, null);
    client.dispose(); next.client.dispose();
});

test('duplicate requests cannot overwrite the active search', async () => {
    const { client, socket } = setup();
    await client.findQuickMatch();
    assert.equal(await client.createPrivateRoom(), false);
    socket().open();
    assert.equal(socket().sent.length, 1);
    assert.equal(socket().sent[0].type, 'find_lobby');
    client.dispose();
});

test('roster changes, wrong-game responses, disconnects and unexpected starts are safe', async () => {
    const { client, socket } = setup();
    await client.findQuickMatch(); socket().open(); socket().message(lobby());
    socket().message(lobby({ event: 'lobby_updated', members: ['c_me', 'c_two'], players: [{ id: 'c_me', name: 'FactoryOne' }, { id: 'c_two', name: 'Two' }] }));
    assert.equal(client.getSnapshot().lobby.players.length, 2);
    socket().message({ event: 'lobby_started', roomCode: 'ABCDE' });
    assert.equal(client.getSnapshot().lobby, null);
    assert.match(client.getSnapshot().error, /incompatible/i);
    await client.findQuickMatch(); socket().open(); socket().message(lobby({ gameId: 'mini-hoops' }));
    assert.equal(client.getSnapshot().lobby, null);
    assert.match(client.getSnapshot().error, /different game/i);
    await client.findQuickMatch(); socket().open(); socket().message(lobby()); socket().close();
    assert.equal(client.getSnapshot().lobby, null);
    assert.match(client.getSnapshot().error, /Connection lost/);
    client.dispose();
});

const snapshot = (patch = {}) => ({ protocolVersion: 2, matchId: 'm1', tick: 0, seats: ['c_me', 'c_two'], scores: [0, 0], ack: [0, 0],
    paddles: [{ x: 0, z: 5.8, vx: 0, vz: 0 }, { x: 0, z: -5.8, vx: 0, vz: 0 }], puck: { x: 0, z: 1.15, vx: 0, vz: 0 },
    phase: 'faceoff', remaining: .65, serving: 0, winner: null, disconnected: [false, false], ...patch });
test('ready, authoritative snapshots, input and rematch use the current match binding', async () => {
    const { client, socket } = setup();
    await client.findQuickMatch(); socket().open(); socket().message(lobby({ members: ['c_me', 'c_two'] }));
    client.setReady(true);
    assert.equal(socket().sent.at(-1).messageType, 'puck_ready');
    socket().message({ event: 'lobby_started', gameId: 'puckd-up', roomCode: 'ABCDE', authorityMode: 'server', matchState: snapshot() });
    assert.equal(client.getSnapshot().status, 'playing');
    client.sendInput({ seq: 1, x: 2, z: 4, scores: [7, 0] });
    assert.deepEqual(JSON.parse(socket().sent.at(-1).value), { matchId: 'm1', seq: 1, x: 2, z: 4 });
    socket().message({ event: 'puck_state', roomCode: 'ABCDE', snapshot: snapshot({ tick: 10, phase: 'live' }) });
    socket().message({ event: 'puck_state', roomCode: 'ABCDE', snapshot: snapshot({ tick: 5 }) });
    socket().message({ event: 'puck_state', roomCode: 'ABCDE', snapshot: snapshot({ matchId: 'old', tick: 99 }) });
    assert.equal(client.getSnapshot().match.tick, 10);
    socket().message({ event: 'puck_state', roomCode: 'ABCDE', snapshot: snapshot({ tick: 20, phase: 'finished', scores: [7, 0], winner: 0 }) });
    client.rematch(); assert.equal(socket().sent.at(-1).messageType, 'puck_rematch');
    client.dispose();
});
test('socket-session reconnect retains match binding and explicit leave cancels retries', async () => {
    const { client, socket } = setup();
    await client.findQuickMatch(); socket().open();
    socket().message({ event: 'connected', clientId: 'c_me', sessionToken: 'secret-session' });
    socket().message(lobby({ members: ['c_me', 'c_two'] }));
    socket().message({ event: 'lobby_started', gameId: 'puckd-up', roomCode: 'ABCDE', authorityMode: 'server', matchState: snapshot() });
    const old = socket(); old.close();
    assert.equal(client.getSnapshot().status, 'reconnecting');
    socket().open();
    assert.deepEqual(socket().sent.at(-1), { type: 'resume_lobby', clientId: 'c_me', sessionToken: 'secret-session' });
    assert.equal(JSON.stringify(client.getSnapshot()).includes('secret-session'), false);
    socket().message({ event: 'session_resumed', clientId: 'c_me', roomCode: 'ABCDE' });
    assert.equal(client.getSnapshot().status, 'playing');
    client.leave(); old.message({ event: 'puck_state', roomCode: 'ABCDE', snapshot: snapshot() });
    assert.equal(client.getSnapshot().match, null);
    client.dispose();
});

test('unanswered connection attempts time out instead of leaving controls busy', async () => {
    const { client } = setup();
    await client.findQuickMatch();
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(client.getSnapshot().status, 'idle');
    assert.match(client.getSnapshot().error, /timed out/i);
    client.dispose();
});
