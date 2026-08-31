// Cross-repo integration: run explicitly with factory-network-server alongside
// javascript-games. Uses real sockets plus delayed delivery, no live accounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFactoryNetworkServer } from '../../../../factory-network-server/src/server-runtime.mjs';
import { createOnlineClient } from '../scripts/online/client.js';
import { createMatch } from '../scripts/core/match.js';
import { createFixedStep } from '../scripts/core/fixed-step.js';
import { createOnlineSync } from '../scripts/online/sync.js';
import { lobbies } from '../../../../factory-network-server/src/state.mjs';
import { lobbyGame } from '../../../../factory-network-server/games/registry.mjs';

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
function until(client, predicate, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        if (predicate(client.getSnapshot())) return resolve(client.getSnapshot());
        const timeout = setTimeout(() => { unsubscribe(); reject(new Error(JSON.stringify(client.getSnapshot()))); }, timeoutMs);
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

// Real WebSocket + real server Cannon. Add jitter, snapshot loss and input
// reordering, while independently driving the two cabinet adapters at different
// render rates. Browser clients never get access to the test's server fixture.
function impairedSocket(delay) {
    return class {
        static OPEN = 1;
        static instances = [];
        constructor(url) { this.socket = new WebSocket(url); this.received = 0; this.sent = 0; this.constructor.instances.push(this); }
        get readyState() { return this.socket.readyState; }
        addEventListener(type, listener) {
            this.socket.addEventListener(type, event => {
                const packet = type === 'message' ? JSON.parse(event.data) : null;
                // Lose transient snapshots; reliable result/readiness messages
                // retain WebSocket delivery semantics.
                if (packet?.event === 'puck_state' && ++this.received % 5 === 0 && packet.snapshot.phase !== 'finished') return;
                const jitter = packet?.event === 'puck_state' ? (this.received % 3) * 7 : 0;
                setTimeout(() => listener(event), delay + jitter);
            });
        }
        send(raw) {
            const jitter = JSON.parse(raw).messageType === 'puck_input' ? (++this.sent % 3) * 5 : 0;
            setTimeout(() => { if (this.socket.readyState === 1) this.socket.send(raw); }, delay + jitter);
        }
        close() { setTimeout(() => this.socket.close(), delay + 20); }
    };
}
for (const [delay, rateA, rateB] of [[0, 30, 144], [40, 60, 120], [100, 144, 30]]) {
    test(`authoritative play, result, rematch and reconnect: ${delay * 2}ms RTT + jitter/loss, ${rateA}/${rateB}Hz`, async () => {
        const runtime = createFactoryNetworkServer({ port: 0, startBridges: false, heartbeatIntervalMs: 0 });
        await runtime.start();
        const wsUrl = `ws://127.0.0.1:${runtime.server.address().port}`;
        const SocketA = impairedSocket(delay), SocketB = impairedSocket(delay);
        const a = createOnlineClient({ wsUrl, WebSocketCtor: SocketA, resolveIdentity: async () => ({ playerId: 'test-a', displayName: 'Alice' }) });
        const b = createOnlineClient({ wsUrl, WebSocketCtor: SocketB, resolveIdentity: async () => ({ playerId: 'test-b', displayName: 'Bob' }) });
        const matches = [createMatch(), createMatch()];
        const syncs = [a, b].map((client, i) => createOnlineSync({ client, match: matches[i] }));
        const intervals = [];
        try {
            await Promise.all([a.findQuickMatch(), b.findQuickMatch()]);
            await Promise.all([a, b].map(c => until(c, s => s.lobby?.players.length === 2)));
            b.setReady(true);
            await until(a, s => s.lobby?.players.some(p => p.ready));
            assert.equal(a.getSnapshot().match, null);
            a.setReady(true);
            await Promise.all([a, b].map(c => until(c, s => s.match?.phase === 'live')));
            const originalId = a.getSnapshot().match.matchId;
            assert.equal(originalId, b.getSnapshot().match.matchId);
            assert.equal(matches[1].state.opponentName, 'Alice');
            for (const [i, rate] of [rateA, rateB].entries()) {
                const clock = createFixedStep(dt => syncs[i].tick(dt, { dx: 0, dz: 0, keys: new Set(), target: i ? { x: 4.1, z: 5.8 } : { x: 0, z: .8 } }));
                intervals.push(setInterval(() => clock.advance(1 / rate), 1000 / rate));
            }
            await Promise.all([a, b].map(c => until(c, s => s.match?.scores[0] >= 1)));
            for (const timer of intervals) clearInterval(timer);
            assert.equal(matches[0].state.playerScore, matches[1].state.cpuScore);
            assert.equal(matches[0].state.cpuScore, matches[1].state.playerScore);
            assert.ok(Number.isFinite(syncs[1].bodies.puckBody.position.z));

            // Deterministically accelerate the remainder using server-only goal
            // fixtures; goals/results still pass through real physics and sockets.
            const lobby = lobbies.get(a.getSnapshot().lobby.roomCode), engine = lobby.puck;
            while (engine.snapshot().scores[0] < 7) {
                while (engine.snapshot().phase !== 'live') engine.tick(1 / 240);
                engine.simulation.bodies.puckBody.position.set(0, .2, -8.05);
                engine.simulation.bodies.puckBody.velocity.set(0, 0, -29);
                engine.tick(1 / 240);
            }
            lobbyGame('puckd-up').broadcastAfterLeave(lobby);
            await Promise.all([a, b].map(c => until(c, s => s.status === 'result')));
            assert.deepEqual(a.getSnapshot().match.scores, b.getSnapshot().match.scores);
            assert.equal(matches[0].state.winner, 0); assert.equal(matches[1].state.winner, 1);
            a.rematch();
            await until(b, s => s.match?.rematch?.[0] === true);
            assert.equal(b.getSnapshot().match.matchId, originalId);
            b.rematch();
            await Promise.all([a, b].map(c => until(c, s => s.match?.matchId !== originalId && s.match?.phase === 'live')));
            assert.deepEqual(a.getSnapshot().match.scores, [0, 0]);
            const resumedId = a.getSnapshot().match.matchId, seatId = a.getSnapshot().clientId;
            SocketA.instances.at(-1).socket.close();
            await until(a, s => s.status === 'reconnecting');
            await until(a, s => s.status === 'playing');
            assert.equal(a.getSnapshot().clientId, seatId);
            assert.equal(a.getSnapshot().match.matchId, resumedId);
            b.leave();
            await until(a, s => s.match?.reason === 'forfeit');
            assert.equal(a.getSnapshot().match.winner, 0);
            assert.equal(lobby.puckTimer, null);
            a.leave();
        } finally {
            for (const timer of intervals) clearInterval(timer);
            for (const sync of syncs) sync.dispose();
            a.dispose(); b.dispose(); await runtime.stop({ notifyClients: false });
        }
    });
}
