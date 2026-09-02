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

/** How long the camera stays on the aim shot after the strike. */
export const STRIKE_HOLD_SECONDS = 0.24;

/** Below this canvas width the phone composition is used. */
const NARROW_WIDTH = 650;

export function createCameraRig(THREE) {
  const camera = new THREE.PerspectiveCamera(48, 1, 0.02, 20);
  const target = new THREE.Vector3(0, 0.2, 0);
  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();

  let hold = 0;

  return {
    camera,
    target,

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
      if (!cue) return;
      hold = Math.max(0, hold - dt);

      const narrow = width < NARROW_WIDTH;
      const dx = Math.cos(angle);
      const dz = Math.sin(angle);
      const chasing = moving && hold <= 0;

      if (mode === "over") {
        // Straight down. The read here is the whole table at once, so the FOV is
        // tight — a wide lens from above bends the rails and lies about angles.
        desiredPosition.set(0, narrow ? 3.12 : 3.0, 0.02);
        desiredTarget.set(0, 0.12, 0);
        camera.fov = narrow ? 45 : 41;
      } else if (chasing) {
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
