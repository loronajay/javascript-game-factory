// Where the player watches from.
//
// Three shots, and the rig chases each one with an exponential lerp rather than
// cutting: a pool camera that snapped to the new aim every frame would be
// unwatchable, and one that snapped between shots would lose the ball.
//
// THE PHONE GETS A DIFFERENT CAMERA, not a scaled one. On a narrow screen the
// behind-the-cue shot is raised and widened, because the cut angle is the whole
// read and a low camera on a small screen hides it behind the cue ball. That is
// a different composition, not a smaller one, which is why the numbers are
// paired rather than multiplied by a scale factor.
//
// THE HOLD AFTER A STRIKE is the one piece of timing here. For a fraction of a
// second after the ball is struck the camera stays where the player aimed from,
// so they see their own contact before it swings out to follow the table. Cut to
// the wide shot immediately and the shot the player just took is never seen.

import { HALF_LENGTH, HALF_WIDTH } from "../sim/constants.js";

/** How long the camera stays on the aim shot after the strike. */
export const STRIKE_HOLD_SECONDS = 0.24;

/** Below this canvas width the phone composition is used. */
const NARROW_WIDTH = 650;

/** Clearance kept outside the nose line in the overhead shot, so the rails are in frame. */
const OVERHEAD_MARGIN = 0.3;
/** How far up the overhead shot may go. Past this the fog starts eating the cloth. */
const OVERHEAD_MAX_Y = 4.6;
const OVERHEAD_MIN_Y = 2.2;
/** The overhead lens. Tight, because a wide one from above bends the rails and lies about angles. */
const OVERHEAD_FOV = 41;

/**
 * How high the camera has to be to hold the whole table at this aspect ratio.
 *
 * DERIVED, because a typed height is only correct at one window shape. The
 * overhead shot is the one view whose whole job is "the entire table at once",
 * and on a wide canvas a fixed 3.0 cut both ends off.
 */
export function overheadHeight(aspect, fovDegrees = OVERHEAD_FOV) {
  const half = Math.tan((fovDegrees * Math.PI) / 360);
  const across = HALF_LENGTH + OVERHEAD_MARGIN;
  const down = HALF_WIDTH + OVERHEAD_MARGIN;
  const needed = Math.max(across / (half * Math.max(0.2, aspect)), down / half);
  return Math.min(OVERHEAD_MAX_Y, Math.max(OVERHEAD_MIN_Y, needed));
}

export function createCameraRig(THREE) {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.02, 20);
  const target = new THREE.Vector3(0, 0.2, 0);
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();

  let hold = 0;
  /**
   * The editor's orbit.
   *
   * A THIRD SHOT, not a mode of the aiming one. The table editor is the only
   * place the player drives the camera themselves, so the rig holds the yaw,
   * pitch and distance it is given and composes from those instead of from the
   * cue ball. It goes through the same lerp as every other shot, which is what
   * makes entering and leaving the editor a move rather than a cut.
   */
  const orbit = { yaw: 0.72, pitch: 0.62, distance: 3.4 };

  return {
    camera,
    target,

    /** Point the editor's orbit. Clamped here so no caller can put the camera under the floor. */
    setOrbit({ yaw, pitch, distance } = {}) {
      if (Number.isFinite(yaw)) orbit.yaw = yaw;
      // The top of the range stops short of straight down on purpose: the
      // pendant hangs between the camera and the cloth, and past about 66
      // degrees the shades fill the frame. The overhead SHOT solves that by
      // hiding the fixture; the editor cannot, because the fixture is one of
      // the things being edited.
      if (Number.isFinite(pitch)) orbit.pitch = Math.max(0.1, Math.min(1.15, pitch));
      if (Number.isFinite(distance)) orbit.distance = Math.max(1.5, Math.min(6.5, distance));
      return { ...orbit };
    },

    /** The orbit as it stands, so the editor can nudge it rather than track it twice. */
    getOrbit: () => ({ ...orbit }),

    /** Begin the post-strike hold. */
    holdOnStrike() {
      hold = STRIKE_HOLD_SECONDS;
    },

    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },

    /** Drop the camera straight onto its mark, for a fresh rack or a mode change. */
    snap(position, look) {
      camera.position.copy(position);
      target.copy(look);
      camera.lookAt(target);
    },

    /**
     * @param mode   "aim" | "over"
     * @param cue    the cue ball
     * @param balls  the whole table, for framing the live ones during a shot
     * @param angle  aim, radians
     * @param moving whether the table is in motion
     * @param width  canvas width, which chooses the composition
     */
    update(dt, { mode, cue, balls, angle, moving, width }) {
      // The editor shot is the one that does not need a cue ball: it frames the
      // table itself, and the editor can be open over an empty table.
      if (!cue && mode !== "editor") return;
      hold = Math.max(0, hold - dt);

      const narrow = width < NARROW_WIDTH;
      const dx = Math.cos(angle || 0);
      const dz = Math.sin(angle || 0);
      const chasing = moving && hold <= 0;

      if (mode === "editor") {
        // The table, from wherever the player has dragged to. The look-at is the
        // table centre rather than the cue ball: in the editor the table is the
        // subject, and there may not be a rack on it at all.
        camera.up.set(0, 1, 0);
        camera.fov = narrow ? 52 : 44;
        const flat = Math.cos(orbit.pitch) * orbit.distance;
        desiredPosition.set(Math.cos(orbit.yaw) * flat, 0.35 + Math.sin(orbit.pitch) * orbit.distance, Math.sin(orbit.yaw) * flat);
        desiredTarget.set(0, 0.18, 0);
      } else if (mode === "over") {
        // Straight down, and TWO things have to be right or the top view is
        // useless: which way is up, and how high.
        //
        // WHICH WAY IS UP. Looking straight down is the degenerate case for
        // `lookAt`: the default up vector (0,1,0) is parallel to the view
        // direction, so the roll of the shot fell out of a 2cm fudge in z — and
        // it landed with the table's LONG axis running down the screen, which is
        // the one orientation it does not fit in. Set explicitly, +x always runs
        // across the frame.
        //
        // HOW HIGH. Derived from the aspect, not typed: see `overheadHeight`.
        camera.up.set(0, 0, -1);
        camera.fov = OVERHEAD_FOV;
        desiredPosition.set(0, overheadHeight(camera.aspect), 0);
        desiredTarget.set(0, 0.12, 0);
      } else if (chasing) {
        camera.up.set(0, 1, 0);
        // Follow the centroid of everything still rolling, not the cue ball: on a
        // break the cue ball is the least interesting thing on the table.
        const live = balls.filter((ball) => !ball.pocketed && Math.hypot(ball.vx, ball.vz) > 0.035);
        let cx = cue.x;
        let cz = cue.z;
        if (live.length) {
          cx = live.reduce((sum, ball) => sum + ball.x, 0) / live.length;
          cz = live.reduce((sum, ball) => sum + ball.z, 0) / live.length;
        }
        desiredPosition.set(cx - (narrow ? 0.3 : 0.55), narrow ? 1.48 : 1.16, cz + (narrow ? 1.5 : 1.42));
        desiredTarget.set(cx, 0.22, cz);
        camera.fov = narrow ? 55 : 47;
      } else {
        camera.up.set(0, 1, 0);
        // Behind the cue, slightly off the line so the stick does not fill the
        // middle of the screen.
        const back = narrow ? 0.92 : 1.03;
        const side = narrow ? 0.055 : 0.085;
        desiredPosition.set(cue.x - dx * back - dz * side, narrow ? 0.91 : 0.6, cue.z - dz * back + dx * side);
        const reach = narrow ? 0.82 : 0.78;
        desiredTarget.set(cue.x + dx * reach, 0.215, cue.z + dz * reach);
        camera.fov = narrow ? 54 : 46;
      }

      // Frame-rate independent smoothing. Slower while chasing a shot, because
      // the target is jittering around a centroid and a stiff follow reads as
      // camera shake.
      const k = 1 - Math.exp(-dt * (chasing ? 3.4 : 9.2));
      camera.position.lerp(desiredPosition, k);
      target.lerp(desiredTarget, k);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
    },
  };
}
