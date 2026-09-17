import { FIXED_DT, CONTACT_R, PLAYER_TRACK_TIME } from '../config.js';
import { updatePlayer } from '../input/player-motion.js';
import { hardContainPuck, sweptMalletContact, goalCrossing, capPuck } from '../physics/collisions.js';
import { clampTarget } from './protocol.js';

// Presentation-only dead reckoning for the online puck. The server alone
// scores and settles contacts; this carries the newest authoritative sample
// forward by the ticks the local paddle is already ahead of it, using the same
// planar helpers the authority runs after each Cannon step, so a strike shows
// on the striker's screen now instead of a round trip later. Every snapshot
// overwrites it. Nothing here is sent, and nothing here decides a goal.

// Cannon applies linearDamping as v *= (1 - damping) ^ dt per step.
const DAMPING = Math.pow(1 - .055, FIXED_DT);
// Mirrors the simulation's strike boost (isPlayer || humanOpponent coefficient).
const STRIKE_COEFFICIENT = .42, STRIKE_MIN_SPEED = 2;

const mallet = (at, previous) => ({ body: { position: { x: at.x, z: at.z }, velocity: { x: at.vx, z: at.vz } }, previous });

// Cannon resolves a puck that starts a step already inside a mallet; the swept
// helper deliberately defers to it. Without Cannon, push out along the normal.
function resolveOverlap(puck, m) {
    const nx0 = puck.position.x - m.body.position.x, nz0 = puck.position.z - m.body.position.z;
    const dist = Math.hypot(nx0, nz0);
    if (dist >= CONTACT_R || dist < 1e-7) return false;
    const nx = nx0 / dist, nz = nz0 / dist;
    puck.position.x = m.body.position.x + nx * (CONTACT_R + .012);
    puck.position.z = m.body.position.z + nz * (CONTACT_R + .012);
    const vn = (puck.velocity.x - m.body.velocity.x) * nx + (puck.velocity.z - m.body.velocity.z) * nz;
    if (vn < 0) { puck.velocity.x -= nx * vn * 1.94; puck.velocity.z -= nz * vn * 1.94; }
    return true;
}

function strike(puck, m) {
    const mv = m.body.velocity;
    if (Math.hypot(mv.x, mv.z) < STRIKE_MIN_SPEED) return;
    puck.velocity.x += mv.x * STRIKE_COEFFICIENT;
    puck.velocity.z += mv.z * STRIKE_COEFFICIENT;
    capPuck(puck);
}

/**
 * Carry a puck sample `steps` fixed ticks forward against two mallet paths.
 * `malletAt(j)` returns `[local, remote]` `{ x, z, vx, vz }` at path index j,
 * j = 0 being the tick the sample was taken; step i moves from j = i to j = i + 1.
 */
export function predictPuck(sample, steps, malletAt) {
    const puck = { position: { x: sample.x, y: .2, z: sample.z }, velocity: { x: sample.vx, y: 0, z: sample.vz } };
    for (let i = 0; i < steps; i++) {
        const before = malletAt(i), after = malletAt(i + 1);
        const p0x = puck.position.x, p0z = puck.position.z;
        puck.velocity.x *= DAMPING; puck.velocity.z *= DAMPING;
        puck.position.x += puck.velocity.x * FIXED_DT;
        puck.position.z += puck.velocity.z * FIXED_DT;
        hardContainPuck(puck);
        for (let k = 0; k < 2; k++) {
            const m = mallet(after[k], before[k]);
            if (!sweptMalletContact(puck, m, p0x, p0z, m.previous.x, m.previous.z, () => strike(puck, m))) resolveOverlap(puck, m);
        }
        hardContainPuck(puck);
        if (goalCrossing(puck, p0z)) { puck.velocity.x = puck.velocity.z = 0; break; }
    }
    return { x: puck.position.x, z: puck.position.z, vx: puck.velocity.x, vz: puck.velocity.z };
}

/**
 * Where a paddle sample was heading. The human motion model closes on its
 * target over PLAYER_TRACK_TIME, so the velocity in a sample names the target
 * the server already held; running the same model toward it for a few ticks
 * moves the remote paddle to where the server has it now without inventing
 * intent the opponent never sent. `mirror` maps the remote seat's coordinates
 * into the local frame's clamp and back.
 */
export function paddlePath(sample, steps, mirror = false) {
    const sign = mirror ? -1 : 1;
    const target = clampTarget({ x: (sample.x + sample.vx * PLAYER_TRACK_TIME) * sign, z: (sample.z + sample.vz * PLAYER_TRACK_TIME) * sign });
    const paddle = { target: { x: target.x * sign, z: target.z * sign },
        body: { position: { x: sample.x, z: sample.z }, velocity: { x: sample.vx, z: sample.vz, set(x, _y, z) { this.x = x; this.z = z; } } } };
    const path = [{ x: sample.x, z: sample.z, vx: sample.vx, vz: sample.vz }];
    for (let i = 0; i < steps; i++) {
        updatePlayer(paddle, new Set(), FIXED_DT);
        paddle.body.position.x += paddle.body.velocity.x * FIXED_DT;
        paddle.body.position.z += paddle.body.velocity.z * FIXED_DT;
        path.push({ x: paddle.body.position.x, z: paddle.body.position.z, vx: paddle.body.velocity.x, vz: paddle.body.velocity.z });
    }
    return path;
}
