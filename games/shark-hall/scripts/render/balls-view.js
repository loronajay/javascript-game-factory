// Sixteen meshes that mirror sixteen plain objects.
//
// THIS IS THE ONLY FILE THAT KNOWS A BALL HAS A MESH. In the demo the mesh was a
// field on the ball itself, which welded the physics to a GPU; here the sim owns
// nine numbers and this owns a `Map` from ball number to mesh, and the join
// happens once per frame in `sync`.
//
// ROTATION IS INTEGRATED, NOT DERIVED. A ball's orientation is not a function of
// its position — a ball that rolls out and back does not return to the
// orientation it left with — so the mesh is spun by its angular velocity each
// frame and its numbers end up wherever the shot actually left them. That is
// also why the sim carries wx/wy/wz at all rather than just speed.

import { BALL_RADIUS } from "../sim/constants.js";
import { CLASSIC } from "../cosmetics/ball-sets.js";
import { ballTexture } from "./textures.js";
import { BALL_Y } from "./table-view.js";

/**
 * How far the whole set of balls is lifted above the table's own origin.
 *
 * Exported because the pointer plane in `scene.js` has to sit at exactly the
 * height the ball centres ride, and every centre is coplanar there — which is
 * what makes picking a ball off a plane exact rather than approximate.
 */
export const BALLS_GROUP_Y = 0.15;

export function createBallsView(THREE, scene, { anisotropy = 1, set = CLASSIC } = {}) {
  const group = new THREE.Group();
  group.position.y = BALLS_GROUP_Y;
  scene.add(group);

  // One geometry for all sixteen. They are identical spheres and there is no
  // reason to hold sixteen copies of the same vertex buffer.
  const geometry = new THREE.SphereGeometry(BALL_RADIUS, 32, 20);
  /** @type {Map<number, THREE.Mesh>} */
  const meshes = new Map();
  const axis = new THREE.Vector3();

  /**
   * The equipped ball set.
   *
   * A BALL SET IS A SKIN AND NOTHING ELSE. It changes the map on sixteen
   * materials; it does not touch the geometry (one shared sphere at
   * `BALL_RADIUS`), the sim's ball objects, or anything a shot is computed
   * from. That is why `setBallSet` can be called mid-preview with a rack on the
   * table and nothing about the rack changes but its paint.
   */
  let ballSet = set;

  function meshFor(n) {
    let mesh = meshes.get(n);
    if (mesh) return mesh;
    mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshPhysicalMaterial({
        map: ballTexture(THREE, n, ballSet, anisotropy),
        roughness: 0.12,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    meshes.set(n, mesh);
    return mesh;
  }

  return {
    group,

    /**
     * Repaint the sixteen balls.
     *
     * The meshes, the geometry and every position stay exactly as they are —
     * only the sixteen maps are replaced, and the old ones disposed. Called on
     * every ball-set preview, including with balls in motion.
     */
    setBallSet(next) {
      if (!next || next === ballSet) return;
      ballSet = next;
      for (const [n, mesh] of meshes) {
        mesh.material.map?.dispose();
        mesh.material.map = ballTexture(THREE, n, ballSet, anisotropy);
        mesh.material.needsUpdate = true;
      }
    },

    /** The set currently painted on, so the hover readout can name the right colour. */
    get ballSet() {
      return ballSet;
    },

    /**
     * Build the meshes for a rack.
     *
     * Meshes are REUSED across racks rather than disposed and rebuilt: the balls
     * are always the same sixteen, and tearing down sixteen textures every rack
     * was a visible hitch in the demo. Orientation is reset so a new rack does
     * not inherit the last one's spin.
     */
    reset(balls) {
      for (const ball of balls) {
        const mesh = meshFor(ball.n);
        mesh.visible = true;
        mesh.rotation.set(0, 0, 0);
        mesh.quaternion.identity();
      }
    },

    /**
     * Mirror the sim onto the meshes.
     *
     * @param dt frame time. Pass 0 to place without spinning — used when the
     *   table is static, so a paused rack does not keep rolling in place.
     */
    sync(balls, dt = 0) {
      for (const ball of balls) {
        const mesh = meshFor(ball.n);
        if (ball.pocketed) {
          mesh.visible = false;
          continue;
        }
        mesh.visible = true;
        mesh.position.set(ball.x, BALL_Y, ball.z);
        if (dt <= 0) continue;

        axis.set(ball.wx, ball.wy, ball.wz);
        const rate = axis.length();
        if (rate > 0.001) {
          axis.normalize();
          mesh.rotateOnWorldAxis(axis, rate * dt);
        }
      }
    },

    dispose() {
      for (const mesh of meshes.values()) {
        mesh.material.map?.dispose();
        mesh.material.dispose();
        group.remove(mesh);
      }
      meshes.clear();
      geometry.dispose();
    },
  };
}
