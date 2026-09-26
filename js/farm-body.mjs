// The player's body on the farm, above the walker: how high its feet are and
// what that means. The room's walker is flat — x, z and a yaw — and the room
// is flat, so it stays that way. The farm has a hay loft, a silo catwalk,
// ladders up to them and benches to sit on, so the body needs a height and
// three ways of being: WALKING (on the ground or on a platform, falling when
// nothing is underneath), CLIMBING (fixed to a ladder, W/S move it up and
// down) and SEATED (parked on a seat, facing where the seat faces).
//
// Pure: keys, a timestep and the world's solids in, the next pose and body
// out. Every solid on the farm carries a vertical span, and `bodyObstacles`
// keeps only the ones the body's own span crosses, which is the whole trick:
// the walker never learns about height, it is just handed the solids that
// matter at the height the body is at.
//
// THE GROUND IS NOT ALWAYS AT 0. A pond is dug into the field, so the world
// hands the body a `ground(point)` height (`farm-pond.mts`'s profile) and the
// body stands on it: down a bank, along the bed, up the far side. A body that
// was standing follows the ground DOWN as well as up — a slope is walked, not
// fallen down — while one that steps off a loft still falls. Below the
// water's surface the legs push through water, so the walk is slower.
import { stepWalker } from "./arcade-room-walker.mjs";
/** A body: what a low step clears, how tall it is, how it falls and climbs, where its eyes are. */
export const STEP_HEIGHT = 0.35;
export const BODY_HEIGHT = 1.8;
export const GRAVITY = 18;
export const CLIMB_SPEED = 1.5;
/** Eyes above the seat while sitting. */
export const SEATED_EYE = 0.85;
/** How close a body must be to a level to be AT it (the foot of a ladder, its top). */
export const LEVEL_TOLERANCE = 0.4;
/** A standing body follows the ground down by up to this much in a tick; any bigger drop is a fall. */
export const STEP_DOWN = 0.3;
/** How fast the legs go once the feet are this far under water, as a fraction of the dry walk. */
export const WADE_DEPTH = 0.3;
export const WADE_SPEED = 0.55;
export const GROUNDED_BODY = Object.freeze({ mode: "walking", y: 0, vy: 0, fixtureId: "", standAt: null });
export function createFarmBody() {
    return GROUNDED_BODY;
}
/** The solids whose vertical span crosses (`bottom`, `top`). */
export function obstaclesForSpan(obstacles, bottom, top) {
    return obstacles.filter((obstacle) => obstacle.top > bottom && obstacle.bottom < top);
}
/** The solids a body with its feet at `feetY` walks into: those crossing its span above the step it clears. */
export function bodyObstacles(obstacles, feetY) {
    return obstaclesForSpan(obstacles, feetY + STEP_HEIGHT, feetY + BODY_HEIGHT);
}
/** True when the point is over the platform's box. */
export function overPlatform(point, platform) {
    const dx = point.x - platform.x;
    const dz = point.z - platform.z;
    const cosine = Math.cos(platform.rotationY);
    const sine = Math.sin(platform.rotationY);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    return Math.abs(localX) <= platform.width / 2 && Math.abs(localZ) <= platform.depth / 2;
}
/** What is under a body at `point` with its feet at `feetY`: the highest platform top no higher than its feet, or the ground (`ground`, 0 when flat). */
export function supportHeight(point, platforms, feetY, ground = 0) {
    let support = ground;
    for (const platform of platforms) {
        if (platform.top > feetY + 1e-6 || platform.top <= support)
            continue;
        if (overPlatform(point, platform))
            support = platform.top;
    }
    return support;
}
const climbsUp = (keys) => keys.has("KeyW") || keys.has("ArrowUp");
const climbsDown = (keys) => keys.has("KeyS") || keys.has("ArrowDown");
/** True for any key that walks: the one thing that stands a seated body up. */
export function isMoveKey(code) {
    return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" || code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
}
/** One fixed-timestep step of the body. */
export function stepFarmBody(pose, body, keys, dt, world) {
    if (body.mode === "seated")
        return { pose, body, moved: false };
    if (body.mode === "climbing") {
        const ladder = world.ladders.find((entry) => entry.id === body.fixtureId);
        // A ladder that is gone (the building was moved under the climber) drops the body where it is.
        if (!ladder)
            return { pose, body: { ...body, mode: "walking", fixtureId: "" }, moved: false };
        let y = body.y;
        if (climbsUp(keys))
            y += CLIMB_SPEED * dt;
        if (climbsDown(keys))
            y -= CLIMB_SPEED * dt;
        if (y >= ladder.top) {
            return { pose: { ...pose, x: ladder.exit.x, z: ladder.exit.z }, body: { ...GROUNDED_BODY, y: ladder.top }, moved: true };
        }
        if (y <= ladder.bottom) {
            return { pose: { ...pose, x: ladder.foot.x, z: ladder.foot.z }, body: { ...GROUNDED_BODY, y: ladder.bottom }, moved: true };
        }
        return { pose: { ...pose, x: ladder.foot.x, z: ladder.foot.z }, body: { ...body, y }, moved: y !== body.y };
    }
    // Walking: the flat walker against the solids at this height, then gravity if nothing is underneath.
    // The keys still steer while falling, so a body never hangs in the air against a wall.
    const wading = (world.waterDepth?.(pose) ?? 0) > WADE_DEPTH && body.y < 0;
    const step = stepWalker(pose, keys, wading ? dt * WADE_SPEED : dt, world.bounds, bodyObstacles(world.obstacles, body.y));
    const support = supportHeight(step.pose, world.platforms, body.y, world.ground?.(step.pose) ?? 0);
    // Standing on a slope that falls away: the feet stay on it.
    if (body.vy === 0 && body.y > support && body.y - support <= STEP_DOWN) {
        return { pose: step.pose, body: { ...body, y: support }, moved: true };
    }
    if (body.y > support + 1e-6) {
        const vy = body.vy - GRAVITY * dt;
        const y = Math.max(support, body.y + vy * dt);
        const landed = y === support;
        return { pose: step.pose, body: { ...body, y, vy: landed ? 0 : vy }, moved: true };
    }
    if (body.y !== support || body.vy !== 0)
        return { pose: step.pose, body: { ...body, y: support, vy: 0 }, moved: true };
    return { pose: step.pose, body, moved: step.moved };
}
/** Take hold of a ladder: at its foot going up, or at its top going down. The body stands at the foot's spot while it climbs. */
export function grabLadder(pose, ladder, fromTop) {
    const y = fromTop ? ladder.top - 1e-3 : ladder.bottom + 1e-3;
    return { pose: { ...pose, x: ladder.foot.x, z: ladder.foot.z }, body: { mode: "climbing", y, vy: 0, fixtureId: ladder.id, standAt: null }, moved: true };
}
/** Let go of the ladder where the body is; gravity takes it from there. */
export function releaseLadder(pose, body) {
    if (body.mode !== "climbing")
        return { pose, body, moved: false };
    return { pose, body: { ...GROUNDED_BODY, y: body.y }, moved: true };
}
/** Sit down at `point` on the seat, facing where the seat faces, remembering where to stand back up. */
export function sitOn(pose, body, seat, point) {
    // The walker looks along (−sin yaw, −cos yaw); the seat faces its local +z, (sin r, cos r): half a turn apart.
    const yaw = seat.rotationY + Math.PI;
    return {
        pose: { ...pose, x: point.x, z: point.z, yaw },
        body: { mode: "seated", y: seat.top, vy: 0, fixtureId: seat.id, standAt: { ...pose, y: body.y } },
        moved: true,
    };
}
/** Stand up where the body sat down from. */
export function standUp(pose, body) {
    if (body.mode !== "seated" || !body.standAt)
        return { pose, body, moved: false };
    const { y, ...standPose } = body.standAt;
    return { pose: { ...standPose, pitch: pose.pitch }, body: { ...GROUNDED_BODY, y }, moved: true };
}
/** Where the eyes are above the field: standing eye height on the feet, or the seated eye above the seat. */
export function eyeHeight(body, standingEye) {
    return body.mode === "seated" ? body.y + SEATED_EYE : body.y + standingEye;
}
