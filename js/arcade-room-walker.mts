// The first-person walker: keys + look deltas + a fixed timestep → the next pose.
//
// Pure on purpose. The room and the farm both walk the same way (WASD/arrows,
// Shift to sprint, mouse to look, a margin off the edge, solid things block),
// so the rule lives here once with bounds and obstacles injected, and the
// composition roots only decide WHEN a tick may move the player (not while a
// cabinet is open, not under the chat box, not in build mode).

import type { FloorObstacle } from "./arcade-room-layout.mjs";

export type WalkerPose = Readonly<{ x: number; z: number; yaw: number; pitch: number }>;

/** Half extents of the walkable rectangle and how far in from its edge the walker must stay. */
export type WalkerBounds = Readonly<{ halfWidth: number; halfDepth: number; margin: number }>;

export type WalkerStep = Readonly<{ pose: WalkerPose; moved: boolean }>;

export const WALK_SPEED = 2.65;
export const SPRINT_SPEED = 4.3;
/** Metres of breathing room kept between the walker and a solid footprint. */
export const OBSTACLE_PADDING = 0.18;
export const LOOK_SENSITIVITY = Object.freeze({ yaw: 0.0022, pitch: 0.0018 });
export const PITCH_LIMITS = Object.freeze({ min: -1.1, max: 1.05 });

/** The horizontal unit vector a yaw looks along (yaw 0 = down -z). */
export function forwardOf(yaw: number): Readonly<{ x: number; z: number }> {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** True when the point lands inside the obstacle's rotated footprint grown by `padding` on every side. */
export function obstacleBlocks(point: Readonly<{ x: number; z: number }>, obstacle: FloorObstacle, padding = OBSTACLE_PADDING): boolean {
  const dx = point.x - obstacle.x;
  const dz = point.z - obstacle.z;
  const cosine = Math.cos(obstacle.rotationY);
  const sine = Math.sin(obstacle.rotationY);
  const localX = dx * cosine - dz * sine;
  const localZ = dx * sine + dz * cosine;
  return Math.abs(localX) < obstacle.footprint.width / 2 + padding
    && Math.abs(localZ) < obstacle.footprint.depth / 2 + padding;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** One fixed-timestep step. A blocked step returns the same pose with `moved: false`. */
export function stepWalker(
  pose: WalkerPose,
  keys: ReadonlySet<string>,
  dt: number,
  bounds: WalkerBounds,
  obstacles: readonly FloorObstacle[],
): WalkerStep {
  const forward = forwardOf(pose.yaw);
  const right = { x: -forward.z, z: forward.x };
  let moveX = 0;
  let moveZ = 0;
  if (keys.has("KeyW") || keys.has("ArrowUp")) { moveX += forward.x; moveZ += forward.z; }
  if (keys.has("KeyS") || keys.has("ArrowDown")) { moveX -= forward.x; moveZ -= forward.z; }
  if (keys.has("KeyD") || keys.has("ArrowRight")) { moveX += right.x; moveZ += right.z; }
  if (keys.has("KeyA") || keys.has("ArrowLeft")) { moveX -= right.x; moveZ -= right.z; }
  const length = Math.hypot(moveX, moveZ);
  if (length < 1e-9) return { pose, moved: false };
  const speed = keys.has("ShiftLeft") || keys.has("ShiftRight") ? SPRINT_SPEED : WALK_SPEED;
  const nextX = clamp(pose.x + (moveX / length) * speed * dt, -bounds.halfWidth + bounds.margin, bounds.halfWidth - bounds.margin);
  const nextZ = clamp(pose.z + (moveZ / length) * speed * dt, -bounds.halfDepth + bounds.margin, bounds.halfDepth - bounds.margin);
  const next = { x: nextX, z: nextZ };
  if (obstacles.some((obstacle) => obstacleBlocks(next, obstacle))) return { pose, moved: false };
  const moved = nextX !== pose.x || nextZ !== pose.z;
  return moved ? { pose: { ...pose, x: nextX, z: nextZ }, moved } : { pose, moved };
}

/** Apply a mouse delta: horizontal turns, vertical tilts within the pitch limits. */
export function lookWalker(pose: WalkerPose, movementX: number, movementY: number): WalkerPose {
  return {
    ...pose,
    yaw: pose.yaw - movementX * LOOK_SENSITIVITY.yaw,
    pitch: clamp(pose.pitch - movementY * LOOK_SENSITIVITY.pitch, PITCH_LIMITS.min, PITCH_LIMITS.max),
  };
}
