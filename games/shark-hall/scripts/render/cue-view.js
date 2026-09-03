// The cue stick, and the one animation it has.
//
// Four cylinders — butt, shaft, ferrule, tip — laid along +x and rotated by the
// aim angle, so the group's own rotation is the whole of the aiming maths.
//
// THE PULL-BACK IS THE POWER METER. While the shot button is held the cue draws
// back proportionally, and on release it snaps forward and the kick decays. That
// is the only feedback on the table itself for how hard the shot will be, and it
// is what lets a player charge a shot while looking at the balls rather than at
// the meter in the control deck.

import { BALLS_GROUP_Y } from "./balls-view.js";
import { BALL_Y } from "./table-view.js";

/**
 * The height a level cue rides at: dead through the centre of the cue ball.
 *
 * DERIVED, like the pointer plane in `scene.js`, and for the same reason. It was
 * typed as 0.15 — the height of the table GROUP, not of the bed on top of it —
 * which put the whole stick 14cm under the cloth, inside the cabinet, where the
 * player could not see the pull-back that is the only on-table power feedback.
 * The cue view is added to the scene rather than to the table, so this is the
 * world height and both terms belong in it.
 */
export const CUE_Y = BALLS_GROUP_Y + BALL_Y;

export function createCueView(THREE, scene) {
  const group = new THREE.Group();
  group.position.y = CUE_Y;
  scene.add(group);

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.007, 0.01, 0.98, 20),
    new THREE.MeshPhysicalMaterial({ color: 0xd9b071, roughness: 0.36, clearcoat: 0.35 }),
  );
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = -0.49;
  shaft.castShadow = true;
  group.add(shaft);

  const butt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.011, 0.018, 0.42, 20),
    new THREE.MeshPhysicalMaterial({ color: 0x2f1310, roughness: 0.28, clearcoat: 0.75, clearcoatRoughness: 0.18 }),
  );
  butt.rotation.z = Math.PI / 2;
  butt.position.x = -1.18;
  butt.castShadow = true;
  group.add(butt);

  const ferrule = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.055, 16),
    new THREE.MeshStandardMaterial({ color: 0xf1eee6, roughness: 0.32 }),
  );
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.x = 0.03;
  group.add(ferrule);

  const tip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.008, 0.008, 0.02, 16),
    new THREE.MeshStandardMaterial({ color: 0x28555a, roughness: 0.78 }),
  );
  tip.rotation.z = Math.PI / 2;
  tip.position.x = 0.068;
  group.add(tip);

  /** How much of the follow-through is left, 1 down to 0. */
  let kick = 0;

  return {
    group,

    /** Start the follow-through. Called the instant the ball is struck. */
    strike() {
      kick = 1;
    },

    /** Decay the kick. Fast — a cue strike is over well inside a fifth of a second. */
    update(dt) {
      kick = Math.max(0, kick - dt * 8.5);
    },

    /**
     * Place the cue behind the cue ball.
     *
     * @param cue    the cue ball, or null to hide the stick
     * @param angle  aim, radians
     * @param charge 0..1, how far into the stroke the player has held
     * @param moving whether balls are rolling — the cue is only drawn during the
     *   follow-through then, and hidden once the kick has decayed
     */
    place(cue, angle, charge = 0, moving = false) {
      if (!cue || cue.pocketed) {
        group.visible = false;
        return;
      }

      if (moving) {
        group.visible = kick > 0.08;
        if (!group.visible) return;
        const forward = 0.06 * kick;
        group.position.set(cue.x - Math.cos(angle) * (0.03 - forward), CUE_Y, cue.z - Math.sin(angle) * (0.03 - forward));
        group.rotation.y = -angle;
        return;
      }

      group.visible = true;
      const pull = 0.08 + Math.min(1, Math.max(0, charge)) * 0.18;
      group.position.set(cue.x - Math.cos(angle) * pull, CUE_Y, cue.z - Math.sin(angle) * pull);
      group.rotation.y = -angle;
    },
  };
}
