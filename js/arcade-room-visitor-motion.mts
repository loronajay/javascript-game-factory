// How a remote body moves between the poses it is told about.
//
// Poses arrive about ten times a second and each one is where the sender WAS
// when it left. A body dragged straight onto each pose stutters, and a body
// that only eases toward the latest pose slows down between packets and lurches
// on each new one. This module keeps a velocity estimate from consecutive
// samples and offers a target that runs the last pose forward by the time
// since it was taken (capped, so a lost packet never sends a body through a
// wall), which the renderer then eases toward. It also decides the gait from
// the sender's real speed, with hysteresis, so the walk and run clips do not
// flicker as the gap between body and target breathes.
//
// Pure: no THREE, no DOM, no clock. Time comes in with every call.

export type MotionPose = Readonly<{ x: number; z: number; moving: boolean }>;

export type Gait = "idle" | "walk" | "run";

export type RemoteMotionOptions = Readonly<{
  /** Poses further apart than this are a teleport (a rejoin, a respawn): snap, do not slide. */
  snapDistance?: number;
  /** Never run a pose forward by more than this; a dropped packet is a pause, not a lunge. */
  maxExtrapolationMs?: number;
  /** Above this speed the body runs ... */
  runSpeed?: number;
  /** ... and below this it walks again. The gap in between is the hysteresis. */
  walkSpeed?: number;
}>;

export type RemoteMotion = Readonly<{
  /** Hand it the roster's latest pose and when it was taken; safe to call every frame with the same sample. */
  observe: (pose: MotionPose, at: number) => void;
  /** Where the body should be heading right now. */
  target: (now: number) => Readonly<{ x: number; z: number }>;
  /** The sender's estimated speed in metres per second. */
  speed: () => number;
  gait: () => Gait;
  /** True when the body standing at `from` is too far from the pose to have walked there. */
  shouldSnap: (from: Readonly<{ x: number; z: number }>) => boolean;
}>;

export const DEFAULT_SNAP_DISTANCE = 3;
export const DEFAULT_MAX_EXTRAPOLATION_MS = 150;
/** The room walks at 2.65 m/s and runs at 4.3 m/s; the thresholds sit between them. */
export const DEFAULT_RUN_SPEED = 3.5;
export const DEFAULT_WALK_SPEED = 3.0;
const MIN_SAMPLE_GAP_MS = 20;
const MAX_SAMPLE_GAP_MS = 1000;

export function createRemoteMotion(options: RemoteMotionOptions = {}): RemoteMotion {
  const snapDistance = options.snapDistance ?? DEFAULT_SNAP_DISTANCE;
  const maxExtrapolationMs = options.maxExtrapolationMs ?? DEFAULT_MAX_EXTRAPOLATION_MS;
  const runSpeed = options.runSpeed ?? DEFAULT_RUN_SPEED;
  const walkSpeed = options.walkSpeed ?? DEFAULT_WALK_SPEED;

  let pose: MotionPose | null = null;
  let poseAt = 0;
  let velocityX = 0;
  let velocityZ = 0;
  let speed = 0;
  let gait: Gait = "idle";

  function observe(next: MotionPose, at: number): void {
    if (pose && at === poseAt && next.x === pose.x && next.z === pose.z && next.moving === pose.moving) return;
    if (pose && at > poseAt) {
      const gapMs = Math.min(MAX_SAMPLE_GAP_MS, Math.max(MIN_SAMPLE_GAP_MS, at - poseAt));
      const dx = next.x - pose.x;
      const dz = next.z - pose.z;
      const distance = Math.hypot(dx, dz);
      if (distance > snapDistance || !next.moving) {
        velocityX = 0;
        velocityZ = 0;
        speed = 0;
      } else {
        const seconds = gapMs / 1000;
        velocityX = dx / seconds;
        velocityZ = dz / seconds;
        // Half old, half new: one late packet does not read as a sprint.
        speed = speed * 0.5 + (distance / seconds) * 0.5;
      }
    } else if (!next.moving) {
      velocityX = 0;
      velocityZ = 0;
      speed = 0;
    }
    pose = next;
    poseAt = at;
    if (!next.moving) gait = "idle";
    else if (speed >= runSpeed) gait = "run";
    else if (speed <= walkSpeed || gait === "idle") gait = "walk";
  }

  function target(now: number): Readonly<{ x: number; z: number }> {
    if (!pose) return { x: 0, z: 0 };
    if (!pose.moving) return { x: pose.x, z: pose.z };
    const ahead = Math.min(maxExtrapolationMs, Math.max(0, now - poseAt)) / 1000;
    return { x: pose.x + velocityX * ahead, z: pose.z + velocityZ * ahead };
  }

  return Object.freeze({
    observe,
    target,
    speed: () => speed,
    gait: () => gait,
    shouldSnap: (from) => Boolean(pose) && Math.hypot(pose!.x - from.x, pose!.z - from.z) > snapDistance,
  });
}
