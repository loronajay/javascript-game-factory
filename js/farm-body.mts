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

import { stepWalker, type WalkerBounds, type WalkerPose } from "./arcade-room-walker.mjs";
import type { FloorObstacle } from "./arcade-room-layout.mjs";

/** A solid on the field with the heights it spans. `top` is `Infinity` for a wall. */
export type FarmObstacle = FloorObstacle & Readonly<{ bottom: number; top: number }>;

/** A floor the body can stand on, at `top`, on the field. */
export type FarmPlatform = Readonly<{ id: string; x: number; z: number; rotationY: number; width: number; depth: number; top: number }>;

/** A ladder on the field: the climb runs from `bottom` at `foot` to `top` at `exit`. */
export type FarmLadder = Readonly<{
  id: string;
  x: number;
  z: number;
  bottom: number;
  top: number;
  foot: Readonly<{ x: number; z: number }>;
  exit: Readonly<{ x: number; z: number }>;
}>;

/** A seat on the field: a box whose `top` is the seat and whose local +z is where a sitter faces. `bottom` is the floor it stands on. */
export type FarmSeat = Readonly<{ id: string; x: number; z: number; rotationY: number; width: number; depth: number; bottom: number; top: number }>;

export type FarmBodyMode = "walking" | "climbing" | "seated";

export type FarmBody = Readonly<{
  mode: FarmBodyMode;
  /** Feet height above the field. */
  y: number;
  /** Vertical speed while airborne; 0 on the ground, on a platform, on a ladder or on a seat. */
  vy: number;
  /** The ladder being climbed or the seat sat on; "" while walking. */
  fixtureId: string;
  /** Where the body stands back up after sitting. */
  standAt: (WalkerPose & Readonly<{ y: number }>) | null;
}>;

/** A body: what a low step clears, how tall it is, how it falls and climbs, where its eyes are. */
export const STEP_HEIGHT = 0.35;
export const BODY_HEIGHT = 1.8;
export const GRAVITY = 18;
export const CLIMB_SPEED = 1.5;
/** Eyes above the seat while sitting. */
export const SEATED_EYE = 0.85;
/** How close a body must be to a level to be AT it (the foot of a ladder, its top). */
export const LEVEL_TOLERANCE = 0.4;

export const GROUNDED_BODY: FarmBody = Object.freeze({ mode: "walking", y: 0, vy: 0, fixtureId: "", standAt: null });

export function createFarmBody(): FarmBody {
  return GROUNDED_BODY;
}

/** The solids whose vertical span crosses (`bottom`, `top`). */
export function obstaclesForSpan(obstacles: readonly FarmObstacle[], bottom: number, top: number): FarmObstacle[] {
  return obstacles.filter((obstacle) => obstacle.top > bottom && obstacle.bottom < top);
}

/** The solids a body with its feet at `feetY` walks into: those crossing its span above the step it clears. */
export function bodyObstacles(obstacles: readonly FarmObstacle[], feetY: number): FarmObstacle[] {
  return obstaclesForSpan(obstacles, feetY + STEP_HEIGHT, feetY + BODY_HEIGHT);
}

/** True when the point is over the platform's box. */
export function overPlatform(point: Readonly<{ x: number; z: number }>, platform: FarmPlatform): boolean {
  const dx = point.x - platform.x;
  const dz = point.z - platform.z;
  const cosine = Math.cos(platform.rotationY);
  const sine = Math.sin(platform.rotationY);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  return Math.abs(localX) <= platform.width / 2 && Math.abs(localZ) <= platform.depth / 2;
}

/** What is under a body at `point` with its feet at `feetY`: the highest platform top no higher than its feet, or the ground. */
export function supportHeight(point: Readonly<{ x: number; z: number }>, platforms: readonly FarmPlatform[], feetY: number): number {
  let support = 0;
  for (const platform of platforms) {
    if (platform.top > feetY + 1e-6 || platform.top <= support) continue;
    if (overPlatform(point, platform)) support = platform.top;
  }
  return support;
}

export type FarmBodyWorld = Readonly<{
  bounds: WalkerBounds;
  obstacles: readonly FarmObstacle[];
  platforms: readonly FarmPlatform[];
  ladders: readonly FarmLadder[];
}>;

export type FarmBodyStep = Readonly<{ pose: WalkerPose; body: FarmBody; moved: boolean }>;

const climbsUp = (keys: ReadonlySet<string>): boolean => keys.has("KeyW") || keys.has("ArrowUp");
const climbsDown = (keys: ReadonlySet<string>): boolean => keys.has("KeyS") || keys.has("ArrowDown");

/** True for any key that walks: the one thing that stands a seated body up. */
export function isMoveKey(code: string): boolean {
  return code === "KeyW" || code === "KeyA" || code === "KeyS" || code === "KeyD" || code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
}

/** One fixed-timestep step of the body. */
export function stepFarmBody(pose: WalkerPose, body: FarmBody, keys: ReadonlySet<string>, dt: number, world: FarmBodyWorld): FarmBodyStep {
  if (body.mode === "seated") return { pose, body, moved: false };
  if (body.mode === "climbing") {
    const ladder = world.ladders.find((entry) => entry.id === body.fixtureId);
    // A ladder that is gone (the building was moved under the climber) drops the body where it is.
    if (!ladder) return { pose, body: { ...body, mode: "walking", fixtureId: "" }, moved: false };
    let y = body.y;
    if (climbsUp(keys)) y += CLIMB_SPEED * dt;
    if (climbsDown(keys)) y -= CLIMB_SPEED * dt;
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
  const step = stepWalker(pose, keys, dt, world.bounds, bodyObstacles(world.obstacles, body.y));
  const support = supportHeight(step.pose, world.platforms, body.y);
  if (body.y > support + 1e-6) {
    const vy = body.vy - GRAVITY * dt;
    const y = Math.max(support, body.y + vy * dt);
    const landed = y === support;
    return { pose: step.pose, body: { ...body, y, vy: landed ? 0 : vy }, moved: true };
  }
  if (body.y !== support || body.vy !== 0) return { pose: step.pose, body: { ...body, y: support, vy: 0 }, moved: true };
  return { pose: step.pose, body, moved: step.moved };
}

/** Take hold of a ladder: at its foot going up, or at its top going down. The body stands at the foot's spot while it climbs. */
export function grabLadder(pose: WalkerPose, ladder: FarmLadder, fromTop: boolean): FarmBodyStep {
  const y = fromTop ? ladder.top - 1e-3 : ladder.bottom + 1e-3;
  return { pose: { ...pose, x: ladder.foot.x, z: ladder.foot.z }, body: { mode: "climbing", y, vy: 0, fixtureId: ladder.id, standAt: null }, moved: true };
}

/** Let go of the ladder where the body is; gravity takes it from there. */
export function releaseLadder(pose: WalkerPose, body: FarmBody): FarmBodyStep {
  if (body.mode !== "climbing") return { pose, body, moved: false };
  return { pose, body: { ...GROUNDED_BODY, y: body.y }, moved: true };
}

/** Sit down at `point` on the seat, facing where the seat faces, remembering where to stand back up. */
export function sitOn(pose: WalkerPose, body: FarmBody, seat: FarmSeat, point: Readonly<{ x: number; z: number }>): FarmBodyStep {
  // The walker looks along (−sin yaw, −cos yaw); the seat faces its local +z, (sin r, cos r): half a turn apart.
  const yaw = seat.rotationY + Math.PI;
  return {
    pose: { ...pose, x: point.x, z: point.z, yaw },
    body: { mode: "seated", y: seat.top, vy: 0, fixtureId: seat.id, standAt: { ...pose, y: body.y } },
    moved: true,
  };
}

/** Stand up where the body sat down from. */
export function standUp(pose: WalkerPose, body: FarmBody): FarmBodyStep {
  if (body.mode !== "seated" || !body.standAt) return { pose, body, moved: false };
  const { y, ...standPose } = body.standAt;
  return { pose: { ...standPose, pitch: pose.pitch }, body: { ...GROUNDED_BODY, y }, moved: true };
}

/** Where the eyes are above the field: standing eye height on the feet, or the seated eye above the seat. */
export function eyeHeight(body: FarmBody, standingEye: number): number {
  return body.mode === "seated" ? body.y + SEATED_EYE : body.y + standingEye;
}
