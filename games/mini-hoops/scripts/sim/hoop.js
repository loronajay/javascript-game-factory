// The hoop: where it is, how it moves, and what the ball has to hit.
//
// Motion is authored in SCREEN space because that is how it reads to the player
// — "left/right" means left and right on the canvas, not along some world axis
// the perspective would skew. `hoopWorldState` is the seam that converts that
// screen path into the world-space position and velocity collisions need.
//
// `hoopAt` is a pure function of elapsed seconds. It deliberately does not read
// a clock: the run feeds it accumulated tick time, so the same run replayed
// tick-for-tick puts the hoop in exactly the same place.

import {
  BACKBOARD_HEIGHT,
  BACKBOARD_RISE,
  BACKBOARD_WIDTH,
  BOARD_Z,
  HOOP_BASE_RIM_Y,
  HOOP_BASE_X,
  RIM_CENTER_Z,
  RIM_SCREEN_HALF_WIDTH,
} from "./constants.js";
import { screenToWorldAtZ, screenVelocityToWorld } from "./projection.js";

const TAU = Math.PI * 2;

/**
 * The catalog the setup screen, the HUD, and the leaderboard keys are all built
 * from. `id` is persisted (it is half of a board key), so renaming one orphans
 * saved scores — add a mode rather than repurposing an id.
 *
 * `path` returns screen-space offsets from the base position, plus their exact
 * derivatives in pixels/second. The derivative is not decorative: the collision
 * solver resolves the ball against a *moving* ring, and a velocity that
 * disagrees with the path makes the rim behave like it is somewhere else.
 */
export const HOOP_MODES = Object.freeze([
  {
    id: "still",
    label: "Still",
    hudLabel: "STILL",
    blurb: "A fixed rim. Pure shooting form.",
    path: () => ({ dx: 0, dy: 0, vx: 0, vy: 0 }),
  },
  {
    id: "horizontal",
    label: "Left / Right",
    hudLabel: "LEFT / RIGHT",
    blurb: "The rim sweeps across. Lead it.",
    path: (seconds) => {
      const period = 3.6;
      const amplitude = 108;
      const omega = TAU / period;
      const angle = seconds * omega;
      return {
        dx: Math.sin(angle) * amplitude,
        dy: 0,
        vx: Math.cos(angle) * amplitude * omega,
        vy: 0,
      };
    },
  },
  {
    id: "vertical",
    label: "Up / Down",
    hudLabel: "UP / DOWN",
    blurb: "The rim rides up and down. Time the arc.",
    path: (seconds) => {
      const period = 3.2;
      const amplitude = 48;
      const omega = TAU / period;
      const angle = seconds * omega;
      return {
        dx: 0,
        dy: Math.sin(angle) * amplitude,
        vx: 0,
        vy: Math.cos(angle) * amplitude * omega,
      };
    },
  },
  {
    id: "circle",
    label: "Circle",
    hudLabel: "CIRCLE",
    blurb: "The rim orbits. Lead it and time it at once.",
    path: (seconds) => {
      const period = 4.2;
      const amplitudeX = 94;
      const amplitudeY = 40;
      const omega = TAU / period;
      const angle = seconds * omega;
      // Cosine on x and sine on y so the orbit *starts* at the base position
      // rather than off to one side — every run opens from the same rim.
      return {
        dx: (Math.cos(angle) - 1) * amplitudeX,
        dy: Math.sin(angle) * amplitudeY,
        vx: -Math.sin(angle) * amplitudeX * omega,
        vy: Math.cos(angle) * amplitudeY * omega,
      };
    },
  },
]);

export const DEFAULT_HOOP_MODE = "still";

export function hoopModeIds() {
  return HOOP_MODES.map((mode) => mode.id);
}

/** Resolve a mode id, falling back to the default rather than throwing. */
export function hoopModeById(id) {
  return HOOP_MODES.find((mode) => mode.id === id) || HOOP_MODES.find((mode) => mode.id === DEFAULT_HOOP_MODE);
}

/**
 * The complete screen-space hoop at a moment in the run.
 *
 * Everything downstream — rendering, collision, the made-basket test — reads
 * this snapshot rather than recomputing geometry, so there is exactly one
 * definition of where the rim and board are.
 */
export function hoopAt(modeId, elapsedSeconds) {
  const mode = hoopModeById(modeId);
  const seconds = Math.max(0, Number(elapsedSeconds) || 0);
  const { dx, dy, vx, vy } = mode.path(seconds);

  const cx = HOOP_BASE_X + dx;
  const rimY = HOOP_BASE_RIM_Y + dy;

  return {
    modeId: mode.id,
    cx,
    rimY,
    left: cx - RIM_SCREEN_HALF_WIDTH,
    right: cx + RIM_SCREEN_HALF_WIDTH,
    boardW: BACKBOARD_WIDTH,
    boardH: BACKBOARD_HEIGHT,
    boardX: cx - BACKBOARD_WIDTH / 2,
    boardY: rimY - BACKBOARD_RISE,
    vxScreen: vx,
    vyScreen: vy,
  };
}

/**
 * The hoop as the physics solver sees it: a ring centre on the rim plane, plus
 * the world-space velocity of the ring and of the backboard.
 *
 * The two velocities differ because they sit on different depth planes, and the
 * same screen-space speed is a different world speed at each.
 */
export function hoopWorldState(hoop) {
  const rim = screenToWorldAtZ(hoop.cx, hoop.rimY, RIM_CENTER_Z);
  const rimVelocity = screenVelocityToWorld(hoop.vxScreen, hoop.vyScreen, RIM_CENTER_Z);
  const boardVelocity = screenVelocityToWorld(hoop.vxScreen, hoop.vyScreen, BOARD_Z);

  return {
    rimX: rim.x,
    rimY: rim.y,
    rimZ: RIM_CENTER_Z,
    rimVx: rimVelocity.vx,
    rimVy: rimVelocity.vy,
    boardVx: boardVelocity.vx,
    boardVy: boardVelocity.vy,
  };
}

/** The backboard as an axis-aligned rectangle on the board plane, in world units. */
export function boardWorldBounds(hoop) {
  const topLeft = screenToWorldAtZ(hoop.boardX, hoop.boardY, BOARD_Z);
  const bottomRight = screenToWorldAtZ(hoop.boardX + hoop.boardW, hoop.boardY + hoop.boardH, BOARD_Z);
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y),
  };
}
