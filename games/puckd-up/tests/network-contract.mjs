// Cross-repo integration: run explicitly with factory-network-server alongside
// javascript-games. Uses real sockets plus delayed delivery, no live accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryNetworkServer } from '../../../../factory-network-server/src/server-runtime.mjs';
import { createOnlineClient } from '../scripts/online/client.js';

function delayedSocket(delay) {
    return class {
        static OPEN = 1;
        constructor(url) { this.socket = new WebSocket(url); }
        get readyState() { return this.socket.readyState; }
        addEventListener(type, listener) {
            this.socket.addEventListener(type, event => setTimeout(() => listener(event), delay));
        }
        send(raw) { setTimeout(() => { if (this.socket.readyState === 1) this.socket.send(raw); }, delay); }
        close() { this.socket.close(); }
    };
}
function until(client, predicate) {
    return new Promise((resolve, reject) => {
        if (predicate(client.getSnapshot())) return resolve(client.getSnapshot());
        const timeout = setTimeout(() => { unsubscribe(); reject(new Error(JSON.stringify(client.getSnapshot()))); }, 3000);
        const unsubscribe = client.subscribe(state => {
            if (!predicate(state)) return;
            clearTimeout(timeout); unsubscribe(); resolve(state);
        });
    });
}

for (const delay of [0, 40, 100]) test(`real two-client lobbies with ${delay * 2}ms added round-trip latency`, async () => {
    const runtime = createFactoryNetworkServer({ port: 0, startBridges: false, heartbeatIntervalMs: 0 });
    await runtime.start();
    const wsUrl = `ws://127.0.0.1:${runtime.server.address().port}`;
    const makeClient = name => createOnlineClient({ wsUrl, WebSocketCtor: delayedSocket(delay), resolveIdentity: async () => ({ playerId: `test-${name}`, displayName: name }) });
    const a = makeClient('Alice'), b = makeClient('Bob');
    try {
        await Promise.all([a.findQuickMatch(), b.findQuickMatch()]);
        const both = state => state.lobby?.players.length === 2;
        const [first, second] = await Promise.all([until(a, both), until(b, both)]);
        assert.equal(first.lobby.roomCode, second.lobby.roomCode);
        assert.deepEqual(first.lobby.players, second.lobby.players);
        assert.deepEqual(first.lobby.players.map(p => p.name).sort(), ['Alice', 'Bob']);
        a.leave();
        const remaining = await until(b, state => state.lobby?.players.length === 1);
        assert.equal(remaining.lobby.ownerId, remaining.clientId);
        b.leave();
        await a.createPrivateRoom();
        const privateRoom = await until(a, state => state.lobby?.isPrivate);
        await b.joinPrivateRoom(privateRoom.lobby.roomCode.toLowerCase());
        await Promise.all([until(a, both), until(b, both)]);
        assert.equal(b.getSnapshot().lobby.roomCode, privateRoom.lobby.roomCode);
        a.leave(); b.leave();
    } finally { a.dispose(); b.dispose(); await runtime.stop({ notifyClients: false }); }
});
