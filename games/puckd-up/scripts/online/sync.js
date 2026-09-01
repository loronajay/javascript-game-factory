import { updatePlayer } from '../input/player-motion.js';
import { FIXED_DT } from '../config.js';
import { clampTarget, INPUT_HZ, toSeatSnapshot } from './protocol.js';

const vector = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x, y, z) { Object.assign(this, { x, y, z }); } });
const body = z => ({ position: vector(0, .25, z), velocity: vector(), quaternion: { x: 0, y: 0, z: 0, w: 1 } });
function write(b, value) { b.position.set(value.x, b.position.y, value.z); b.velocity.set(value.vx, 0, value.vz); }
function predict(player, dt) {
    updatePlayer(player, new Set(), dt);
    player.body.position.x += player.body.velocity.x * dt;
    player.body.position.z += player.body.velocity.z * dt;
}

// Presentation-only bodies: no client puck physics, score detection or CPU ticks.
// The local paddle replays unacknowledged intent; puck/opponent interpolate a
// bounded two-snapshot delay and freeze at the newest sample on a network stall.
export function createOnlineSync({ client, match, emit = () => {} }) {
    const player = { body: body(5.8), target: vector(0, .25, 5.8) };
    const bodies = { player, cpu: { body: body(-5.8) }, puckBody: body(1.15) };
    bodies.puckBody.position.y = .20;
    const metrics = { speed: 0, lastShot: 0, power: 0 };
    let current = null, transport = '', seat = 0, seq = 0, sendAge = 1 / INPUT_HZ, sampleAge = 0, eventId = 0;
    let history = [], samples = [];
    function receive(state) {
        transport = state.status;
        if (!state.match) {
            if (current && match.state.mode === 'online') match.returnOnline();
            current = null; history = []; samples = [];
            return;
        }
        seat = state.match.seats.indexOf(state.clientId);
        if (seat < 0) return;
        const s = toSeatSnapshot(state.match, seat), fresh = current?.matchId !== s.matchId;
        const transition = fresh || current.phase !== s.phase || s.disconnected.some(Boolean);
        if (fresh) {
            seq = eventId = 0; sendAge = 1 / INPUT_HZ; history = []; samples = []; metrics.lastShot = 0;
            match.beginOnline({ matchId: s.matchId, opponentName: state.lobby?.players.find(p => p.id !== state.clientId)?.name || 'Opponent', playerColors: s.colors });
        }
        current = s; sampleAge = 0;
        match.applyOnline(s);
        match.state.disconnected ||= transport === 'reconnecting';
        match.state.rematchPending = s.rematch?.[seat] === true;
        match.state.networkError = state.error || '';
        if (transition || s.phase !== 'live') { history = []; samples = []; }
        // 30 Hz authoritative samples acknowledge the last accepted command.
        history = history.filter(input => input.seq > s.ack[seat]);
        write(player.body, s.paddles[0]);
        for (const input of history) { Object.assign(player.target, input.target); predict(player, FIXED_DT); }
        if (transition) Object.assign(player.target, { x: player.body.position.x, z: player.body.position.z });
        if (!samples.length) { write(bodies.puckBody, s.puck); write(bodies.cpu.body, s.paddles[1]); }
        samples.push(s);
        if (samples.length > 12) samples.shift();
        for (const event of s.events || []) {
            if (!Number.isSafeInteger(event.id) || event.id <= eventId) continue;
            eventId = event.id;
            const mapped = { ...event };
            if (seat === 1) {
                if ('player' in mapped) mapped.player = !mapped.player;
                if ('playerScored' in mapped) mapped.playerScored = !mapped.playerScored;
                if ('servingPlayer' in mapped) mapped.servingPlayer = !mapped.servingPlayer;
            }
            emit(mapped);
        }
    }
    const unsubscribe = client.subscribe(receive);
    receive(client.getSnapshot());
    return {
        bodies, metrics,
        tick(dt, input) {
            if (!current || match.state.mode !== 'online') return;
            if (transport !== 'playing' || current.phase !== 'live' || current.disconnected.some(Boolean)) return;
            sendAge += dt; sampleAge += dt;
            if (input.target) Object.assign(player.target, clampTarget(input.target));
            Object.assign(player.target, clampTarget({ x: player.target.x + input.dx, z: player.target.z + input.dz }));
            metrics.power = updatePlayer(player, input.keys, dt);
            // Group four fixed ticks under one wire command; replay retains only
            // the unacknowledged groups and stays bounded during long stalls.
            const sending = sendAge >= 1 / INPUT_HZ - 1e-9;
            if (sending) { seq++; sendAge = 0; }
            predict(player, dt);
            history.push({ seq, target: { x: player.target.x, z: player.target.z } });
            if (history.length > 720) history.shift();
            if (sending) client.sendInput({ seq, x: player.target.x, z: player.target.z });
            const renderTick = current.tick + Math.min(sampleAge / FIXED_DT, 16) - 16;
            let left = samples[0], right = samples.at(-1);
            for (const sample of samples) {
                if (sample.tick <= renderTick) left = sample;
                if (sample.tick >= renderTick) { right = sample; break; }
            }
            const alpha = right.tick === left.tick ? 1 : Math.max(0, Math.min(1, (renderTick - left.tick) / (right.tick - left.tick)));
            const lerp = (a, b) => Object.fromEntries(['x', 'z', 'vx', 'vz'].map(key => [key, a[key] + (b[key] - a[key]) * alpha]));
            write(bodies.puckBody, lerp(left.puck, right.puck));
            write(bodies.cpu.body, lerp(left.paddles[1], right.paddles[1]));
            metrics.speed = Math.hypot(current.puck.vx, current.puck.vz);
            metrics.lastShot = Math.max(metrics.lastShot, metrics.speed);
        },
        dispose() { unsubscribe(); history = []; samples = []; },
    };
}
