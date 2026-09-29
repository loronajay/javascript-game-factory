// Riding props on the farm catalog (planning-docs/FARM_RIDING_PLAN.md): the
// hitching rail a rider ties their horse to in the Market Square and the Cove
// (and can put up on their own farm). Procedural like every farm prop, in the
// farm's own grained wood; stands on its footprint centre at y = 0, the rail
// running along its local x.

import { cylinder, sphere, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder } from "./farm-materials.mjs";

type RidingPropBuilder = (THREE: ThreeNamespace) => any;

const timber = (THREE: ThreeNamespace, color = "#7a5534"): any => farmMaterial(THREE, "wood", { colors: [color, "#3e2615", "#b88450"], metresPerTile: 0.6 });

/** Two posts, a rail between them worn smooth where the reins go, and iron tie rings. */
export function createHitchingRail(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  const wood = timber(THREE);
  for (const x of [-1.1, 1.1]) {
    tbox(THREE, group, [0.14, 1.15, 0.14], [x, 0.575, 0], wood);
    tbox(THREE, group, [0.18, 0.05, 0.18], [x, 1.17, 0], wood);
  }
  const rail = tcylinder(THREE, group, 0.055, 0.055, 2.36, [0, 1.02, 0], timber(THREE, "#8a6440"), 12);
  rail.rotation.z = Math.PI / 2;
  const iron = standard(THREE, "#3b3b3b", 0.45, 0.7);
  for (const x of [-0.55, 0.55]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), iron);
    ring.position.set(x, 0.94, 0.07);
    ring.castShadow = true;
    group.add(ring);
    sphere(THREE, group, 0.02, [x, 1.0, 0.06], iron);
  }
  // A water bucket at one end.
  cylinder(THREE, group, 0.16, 0.13, 0.3, [0.8, 0.15, 0.32], standard(THREE, "#6d7a82", 0.5, 0.4), 14);
  cylinder(THREE, group, 0.145, 0.145, 0.01, [0.8, 0.27, 0.32], standard(THREE, "#5c8fb0", 0.1, 0), 14, false);
  return group;
}

export const FARM_RIDING_PROP_BUILDERS: Readonly<Record<string, RidingPropBuilder>> = Object.freeze({
  "hitching-rail": createHitchingRail,
});
