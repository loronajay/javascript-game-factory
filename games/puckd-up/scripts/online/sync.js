import { updatePlayer } from '../input/player-motion.js';
import { FIXED_DT } from '../config.js';
import { clampTarget, INPUT_HZ, toSeatSnapshot } from './protocol.js';
import { paddlePath, predictPuck } from './puck-predictor.js';

const vector = (x = 0, y = 0, z = 0) => ({ x, y, z, set(x, y, z) { Object.assign(this, { x, y, z }); } });
const body = z => ({ position: vector(0, .25, z), velocity: vector(), quaternion: { x: 0, y: 0, z: 0, w: 1 } });
function write(b, value) { b.position.set(value.x, b.position.y, value.z); b.velocity.set(value.vx, 0, value.vz); }
const pack = b => ({ x: b.position.x, z: b.position.z, vx: b.velocity.x, vz: b.velocity.z });
function predict(paddle, target, dt) {
    Object.assign(paddle.target, target);
    updatePlayer(paddle, new Set(), dt);
    paddle.body.position.x += paddle.body.velocity.x * dt;
    paddle.body.position.z += paddle.body.velocity.z * dt;
}

const TICKS_PER_INPUT = 240 / INPUT_HZ;
// Round trip assumed until the first acknowledgement measures one (50 ms).
const DEFAULT_RTT_TICKS = 12;
// Beyond this the puck is frozen rather than guessed further ahead (150 ms).
const MAX_HORIZON_TICKS = 36;
// RTT samples older than this no longer describe the connection.
const RTT_WINDOW_TICKS = 720;
// Per-tick decay of the visual offset that hides a correction (≈40 ms to 1/e).
const SMOOTHING = .9;
// A correction larger than this is a real discontinuity (serve, goal) — snap.
const SNAP_DISTANCE = 2.5;

// Presentation-only bodies: no client scoring, no CPU ticks, and nothing the
// server did not sample is ever sent back. The local paddle replays its
// unacknowledged intent. The puck and the remote paddle are carried forward
// from the newest snapshot by the ticks the local paddle already leads the
// server — one round trip — so a strike lands on the striker's screen at the
// moment it lands on the server, and every correction the next snapshot brings
// is slid in over a few frames rather than popped. On a network stall the
// puck freezes at its horizon instead of guessing.
export function createOnlineSync({ client, match, emit = () => {} }) {
    const predicted = { body: body(5.8), target: vector(0, .25, 5.8) };
    const player = { body: body(5.8), target: vector(0, .25, 5.8) };
    const bodies = { player, cpu: { body: body(-5.8) }, puckBody: body(1.15) };
    bodies.puckBody.position.y = .20;
    const metrics = { speed: 0, lastShot: 0, power: 0 };
    const offset = { puck: { x: 0, z: 0 }, player: { x: 0, z: 0 }, cpu: { x: 0, z: 0 } };
    let current = null, transport = '', seat = 0, seq = 0, sendAge = 1 / INPUT_HZ, eventId = 0;
    let localTick = 0, sinceReceive = 0, rttTicks = DEFAULT_RTT_TICKS;
    let history = [], trail = [], sent = [], rttSamples = [];
    const held = { x: 0, z: 5.8 };
    function settle() { for (const key of Object.keys(offset)) offset[key].x = offset[key].z = 0; }
    function shown(name, base) {
        const target = name === 'puck' ? bodies.puckBody : bodies[name].body;
        write(target, { ...base, x: base.x + offset[name].x, z: base.z + offset[name].z });
    }
    function present() {
        const live = current.phase === 'live';
        const horizon = live ? Math.min(MAX_HORIZON_TICKS, Math.round(sinceReceive) + rttTicks) : 0;
        // The server has the local paddle where this client predicted it one
        // round trip ago; index 0 is the sample tick, the last entry is now.
        const at = k => trail[Math.max(0, trail.length - 1 - k)] || pack(predicted.body);
        const remote = paddlePath(current.paddles[1], horizon, true);
        const puck = live ? predictPuck(current.puck, horizon, j => [at(horizon - j), remote[j]]) : current.puck;
        // The remote paddle is only known up to the server's present, half a
        // round trip behind the local one.
        const cpu = remote[Math.min(horizon, Math.round(sinceReceive) + Math.ceil(rttTicks / 2))];
        return { puck, cpu, player: pack(predicted.body) };
    }
    function show(view) { shown('puck', view.puck); shown('cpu', view.cpu); shown('player', view.player); }
    function receive(state) {
        transport = state.status;
        if (!state.match) {
            if (current && match.state.mode === 'online') match.returnOnline();
            current = null; history = []; trail = []; sent = [];
            return;
        }
        seat = state.match.seats.indexOf(state.clientId);
        if (seat < 0) return;
        const s = toSeatSnapshot(state.match, seat), fresh = current?.matchId !== s.matchId;
        const transition = fresh || current.phase !== s.phase || s.disconnected.some(Boolean);
        if (fresh) {
            seq = eventId = 0; sendAge = 1 / INPUT_HZ; history = []; trail = []; sent = []; rttSamples = []; rttTicks = DEFAULT_RTT_TICKS; metrics.lastShot = 0;
            match.beginOnline({ matchId: s.matchId, opponentName: state.lobby?.players.find(p => p.id !== state.clientId)?.name || 'Opponent', playerColors: s.colors });
        }
        const before = current && !transition ? present() : null;
        current = s; sinceReceive = 0;
        match.applyOnline(s);
        match.state.disconnected ||= transport === 'reconnecting';
        match.state.rematchPending = s.rematch?.[seat] === true;
        match.state.networkError = state.error || '';
        if (transition || s.phase !== 'live') { history = []; trail = []; sent = []; }
        // An acknowledged command measures the round trip; the window's minimum
        // is the connection, anything above it is jitter.
        while (sent.length && sent[0].seq <= s.ack[seat]) rttSamples.push({ at: localTick, rtt: localTick - sent.shift().at });
        rttSamples = rttSamples.filter(sample => localTick - sample.at <= RTT_WINDOW_TICKS);
        if (rttSamples.length) rttTicks = Math.min(MAX_HORIZON_TICKS, Math.max(0, Math.min(...rttSamples.map(sample => sample.rtt))));
        // Authoritative samples acknowledge the last accepted command; replay
        // the rest exactly as the server will, one held target per command.
        history = history.filter(input => input.seq > s.ack[seat]);
        write(predicted.body, s.paddles[0]);
        for (const input of history) predict(predicted, input.target, FIXED_DT);
        if (transition) { Object.assign(player.target, { x: predicted.body.position.x, z: predicted.body.position.z }); Object.assign(held, player.target); }
        const after = present();
        if (before) for (const name of Object.keys(offset)) {
            offset[name].x += before[name].x - after[name].x;
            offset[name].z += before[name].z - after[name].z;
            if (Math.hypot(offset[name].x, offset[name].z) > SNAP_DISTANCE) offset[name].x = offset[name].z = 0;
        } else settle();
        show(after);
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
            localTick++; sinceReceive++; sendAge += dt;
            if (input.target) Object.assign(player.target, clampTarget(input.target));
            Object.assign(player.target, clampTarget({ x: player.target.x + input.dx, z: player.target.z + input.dz }));
            metrics.power = updatePlayer(player, input.keys, dt);
            // Four fixed ticks share one wire command, and the paddle is predicted
            // with the target the server will hold for them — not the fresher
            // per-tick intent — so the replay matches the authority to the tick.
            const sending = sendAge >= 1 / INPUT_HZ - 1e-9;
            if (sending) { seq++; sendAge = 0; Object.assign(held, { x: player.target.x, z: player.target.z }); }
            predict(predicted, held, dt);
            history.push({ seq, target: { ...held } });
            if (history.length > 720) history.shift();
            trail.push(pack(predicted.body));
            if (trail.length > MAX_HORIZON_TICKS + TICKS_PER_INPUT + 1) trail.shift();
            if (sending) {
                sent.push({ seq, at: localTick });
                if (sent.length > RTT_WINDOW_TICKS / TICKS_PER_INPUT) sent.shift();
                client.sendInput({ seq, x: held.x, z: held.z });
            }
            for (const key of Object.keys(offset)) { offset[key].x *= SMOOTHING; offset[key].z *= SMOOTHING; }
            const view = present();
            show(view);
            metrics.speed = Math.hypot(view.puck.vx, view.puck.vz);
            metrics.lastShot = Math.max(metrics.lastShot, Math.hypot(current.puck.vx, current.puck.vz));
        },
        dispose() { unsubscribe(); history = []; trail = []; sent = []; },
    };
}
