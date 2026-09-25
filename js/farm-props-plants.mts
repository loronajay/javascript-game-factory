// The farm's plants: trees, bushes, beds and crops, from the room's decor
// primitives. A tree's canopy is a cluster of shaded spheres — dark
// underneath, lit on top, offset by the row's seed so no two trees are twins
// — and a crop is a seeded scatter over a plot, so a patch reads as grown
// rather than stamped.
//
// Every builder centres its model on its footprint with its base on the
// ground; `farm-props.mts` indexes them by the catalog's `model` name.
//
// Trunks are bark and canopies are leaf: the farm's material library
// (`farm-materials.mts`) wraps every trunk in a fissured bark tile and every
// canopy blob in a leaf-cluster tile, so a tree reads as a tree up close and
// not as a lollipop of spheres. Soil is turned earth, straw is straw.

import { box, cylinder, sphere, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, scaleUvs, tbox, tcylinder, tsphere } from "./farm-materials.mjs";

/** A leaf material in the canopy's own three greens. */
function foliage(THREE: ThreeNamespace, colors: readonly [string, string, string], metresPerTile = 1): any {
  return farmMaterial(THREE, "foliage", { colors: [colors[0], colors[2], colors[1]], metresPerTile });
}

/** Bark in the trunk's own colour. */
function bark(THREE: ThreeNamespace, color = WOOD_DARK, metresPerTile = 0.9): any {
  return farmMaterial(THREE, "bark", { colors: [color, "#2a180a", "#8a6240"], metresPerTile });
}

const SOIL = (THREE: ThreeNamespace): any => farmMaterial(THREE, "soil");

const WOOD_DARK = "#5d3a1f";
const LEAF = "#3f7f34";
const LEAF_LIGHT = "#5ca34a";
const LEAF_DEEP = "#2f6428";

/** Testable silhouette targets used by the procedural builders below. */
export const TREE_ARCHETYPES = Object.freeze({
  oak: Object.freeze({ branchCount: 10, crownWidth: 4.2, crownHeight: 3.0 }),
  birch: Object.freeze({ trunkCount: 3, branchCount: 12, crownWidth: 2.5, crownHeight: 3.4 }),
  apple: Object.freeze({ branchCount: 8, fruitCount: 20, crownWidth: 3.3, crownHeight: 2.5 }),
  willow: Object.freeze({ branchCount: 12, drapeCount: 48, crownWidth: 5.4, crownHeight: 3.2 }),
  pine: Object.freeze({ tierCount: 6, crownWidth: 3.7, crownHeight: 5.1 }),
});

function branchBetween(THREE: ThreeNamespace, group: any, from: readonly [number, number, number], to: readonly [number, number, number], radius: number, material: any, radialSegments = 7): any {
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const direction = end.clone().sub(start);
  const limb = tcylinder(THREE, group, radius * 0.68, radius, direction.length(), [0, 0, 0], material, radialSegments);
  limb.position.copy(start).add(end).multiplyScalar(0.5);
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return limb;
}

/** Canonical empty farmland. Crop GLBs are layered over this plot by the crop view. */
export function createSoilPatch(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  const earth = farmMaterial(THREE, "soil", { colors: ["#624027", "#342014", "#95683f"], metresPerTile: 0.55 });
  const ridge = farmMaterial(THREE, "soil", { colors: ["#745033", "#422819", "#a9784b"], metresPerTile: 0.45 });
  const edge = farmMaterial(THREE, "wood", { colors: ["#8b673f", "#3d2717", "#b48a58"], metresPerTile: 0.7 });
  tbox(THREE, group, [3, 0.08, 2], [0, 0.04, 0], earth, false);
  for (const z of [-0.58, 0, 0.58]) {
    const furrow = tcylinder(THREE, group, 0.13, 0.13, 2.78, [0, 0.1, z], ridge, 8, false);
    furrow.rotation.z = Math.PI / 2;
  }
  for (const z of [-1.02, 1.02]) tbox(THREE, group, [3.12, 0.12, 0.09], [0, 0.08, z], edge, false);
  for (const x of [-1.52, 1.52]) tbox(THREE, group, [0.09, 0.12, 2.12], [x, 0.08, 0], edge, false);
  return group;
}

/** A tiny deterministic generator so a scatter is the same on every load for the same seed. */
function seeded(seed: number): () => number {
  let n = (seed * 9301 + 49297) % 233280;
  return () => {
    n = (n * 9301 + 49297) % 233280;
    return n / 233280;
  };
}

/**
 * A canopy: a big shaded core with lit blobs on top and darker ones tucked
 * under, spun by the seed. `radius` is the core; the rest scales with it.
 */
function canopy(THREE: ThreeNamespace, group: any, radius: number, y: number, seed: number, colors: readonly [string, string, string] = [LEAF, LEAF_LIGHT, LEAF_DEEP]): void {
  const core = foliage(THREE, colors);
  const light = foliage(THREE, [colors[1], colors[1], colors[0]]);
  const deep = foliage(THREE, [colors[2], colors[0], colors[2]]);
  const random = seeded(seed * 13 + 5);
  const main = tsphere(THREE, group, radius, [0, y, 0], core);
  main.scale.y = 0.88;
  const blobs = 6;
  for (let index = 0; index < blobs; index += 1) {
    const angle = (index / blobs) * Math.PI * 2 + random() * 0.8;
    const spread = radius * (0.55 + random() * 0.3);
    const size = radius * (0.55 + random() * 0.25);
    const lift = radius * (random() * 0.5 - 0.05);
    tsphere(THREE, group, size, [Math.cos(angle) * spread, y + lift, Math.sin(angle) * spread], index % 3 === 0 ? light : core);
  }
  // Three lit crowns on top and two deep shadows underneath.
  for (let index = 0; index < 3; index += 1) {
    const angle = random() * Math.PI * 2;
    tsphere(THREE, group, radius * 0.5, [Math.cos(angle) * radius * 0.4, y + radius * 0.65, Math.sin(angle) * radius * 0.4], light);
  }
  for (let index = 0; index < 2; index += 1) {
    const angle = random() * Math.PI * 2;
    tsphere(THREE, group, radius * 0.6, [Math.cos(angle) * radius * 0.5, y - radius * 0.45, Math.sin(angle) * radius * 0.5], deep);
  }
}

/** An oak: a thick trunk that forks, and a broad canopy. */
export function createTree(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const trunk = bark(THREE);
  tcylinder(THREE, group, 0.24, 0.4, 2.6, [0, 1.3, 0], trunk, 10);
  // Root flare, buttress roots, and two limbs.
  tcylinder(THREE, group, 0.4, 0.55, 0.3, [0, 0.15, 0], trunk, 10);
  for (let index = 0; index < 5; index += 1) {
    const angle = index * 1.26 + seed;
    const root = tcylinder(THREE, group, 0.08, 0.14, 0.7, [Math.cos(angle) * 0.5, 0.1, Math.sin(angle) * 0.5], trunk, 7);
    root.rotation.z = -Math.cos(angle) * 1.3;
    root.rotation.x = Math.sin(angle) * 1.3;
  }
  const random = seeded(seed * 17 + 2);
  for (let index = 0; index < TREE_ARCHETYPES.oak.branchCount; index += 1) {
    const angle = index / TREE_ARCHETYPES.oak.branchCount * Math.PI * 2 + seed * 0.7;
    const fromY = 1.65 + (index % 4) * 0.28;
    const reach = 0.85 + random() * 0.75;
    const tip: [number, number, number] = [Math.cos(angle) * reach, 2.75 + random() * 0.75, Math.sin(angle) * reach];
    branchBetween(THREE, group, [0, fromY, 0], tip, 0.14 - (index % 3) * 0.018, trunk, 8);
    tsphere(THREE, group, 0.66 + random() * 0.22, [tip[0], tip[1] + 0.42, tip[2]], index % 3 === 0 ? foliage(THREE, [LEAF_LIGHT, "#75b85b", LEAF]) : foliage(THREE, [LEAF, LEAF_LIGHT, LEAF_DEEP]));
  }
  canopy(THREE, group, 1.35, 3.55, seed);
  return group;
}

/** A birch: a slim pale trunk with dark bands and a small light canopy. */
export function createBirch(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const paper = farmMaterial(THREE, "bark", { colors: ["#e8e4d8", "#c9c4b4", "#ffffff"], metresPerTile: 0.6, bumpScale: 0.01 });
  const band = standard(THREE, "#3a3530", 0.95, 0);
  const random = seeded(seed * 7 + 3);
  for (let trunkIndex = 0; trunkIndex < TREE_ARCHETYPES.birch.trunkCount; trunkIndex += 1) {
    const baseX = (trunkIndex - 1) * 0.18;
    const tipX = baseX + (trunkIndex - 1) * 0.25;
    branchBetween(THREE, group, [baseX, 0, 0], [tipX, 4.35 - Math.abs(trunkIndex - 1) * 0.35, (trunkIndex - 1) * 0.12], 0.13 - Math.abs(trunkIndex - 1) * 0.015, paper, 9);
    for (let mark = 0; mark < 4; mark += 1) {
      const y = 0.7 + mark * 0.85 + trunkIndex * 0.08;
      const ring = cylinder(THREE, group, 0.135 - y * 0.012, 0.135 - y * 0.012, 0.055, [baseX + (tipX - baseX) * y / 4.35, y, 0], band, 9);
      ring.scale.x = 0.72 + random() * 0.35;
    }
  }
  for (let index = 0; index < TREE_ARCHETYPES.birch.branchCount; index += 1) {
    const angle = index * 2.399 + seed;
    const y = 2.1 + (index % 5) * 0.42;
    const reach = 0.65 + random() * 0.45;
    const tip: [number, number, number] = [Math.cos(angle) * reach, y + 0.18, Math.sin(angle) * reach];
    branchBetween(THREE, group, [0, y, 0], tip, 0.045, paper, 6);
    const spray = tsphere(THREE, group, 0.52 + random() * 0.18, [tip[0], tip[1] + 0.22, tip[2]], foliage(THREE, ["#7fb35a", "#b5dc83", "#5a8a3f"]));
    spray.scale.set(0.78, 1.25, 0.78);
  }
  return group;
}

/** An apple tree: a short gnarled trunk, a round canopy, and red apples in it. */
export function createAppleTree(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const trunk = bark(THREE, "#6a4a2a");
  tcylinder(THREE, group, 0.16, 0.26, 1.7, [0, 0.85, 0], trunk, 10);
  const spin = seed * 2.3;
  for (let index = 0; index < TREE_ARCHETYPES.apple.branchCount; index += 1) {
    const angle = spin + index * 2.1;
    branchBetween(THREE, group, [0, 1.25 + (index % 3) * 0.18, 0], [Math.cos(angle) * 1.05, 2.25 + (index % 2) * 0.35, Math.sin(angle) * 1.05], 0.085, trunk, 7);
  }
  canopy(THREE, group, 1.25, 2.9, seed, ["#4f9a3a", "#74b85a", "#3a7a2e"]);
  const apple = standard(THREE, "#d43a3a", 0.5, 0);
  const random = seeded(seed * 11 + 1);
  for (let index = 0; index < TREE_ARCHETYPES.apple.fruitCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const pitch = random() * Math.PI - Math.PI / 2;
    const r = 1.2 + random() * 0.25;
    sphere(THREE, group, 0.08, [Math.cos(angle) * Math.cos(pitch) * r, 2.9 + Math.sin(pitch) * r * 0.8, Math.sin(angle) * Math.cos(pitch) * r], apple);
  }
  return group;
}

/** A willow: a leaning trunk and a canopy that hangs in long strands nearly to the ground. */
export function createWillow(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const trunk = bark(THREE);
  const random = seeded(seed * 5 + 9);
  branchBetween(THREE, group, [0, 0, 0], [0.22, 2.15, 0.04], 0.34, trunk, 11);
  branchBetween(THREE, group, [0.22, 1.75, 0.04], [-0.18, 3.25, 0.18], 0.23, trunk, 9);
  const leaf = foliage(THREE, ["#79a94d", "#aed176", "#426b2d"], 0.55);
  const lightLeaf = foliage(THREE, ["#94bd62", "#c2dc8b", "#5e873d"], 0.5);
  for (let index = 0; index < TREE_ARCHETYPES.willow.branchCount; index += 1) {
    const angle = index / TREE_ARCHETYPES.willow.branchCount * Math.PI * 2 + seed * 0.37;
    const reach = 1.45 + random() * 0.85;
    const shoulder: [number, number, number] = [0.05, 2.55 + (index % 3) * 0.18, 0.08];
    const tip: [number, number, number] = [Math.cos(angle) * reach, 3.45 + random() * 0.45, Math.sin(angle) * reach];
    branchBetween(THREE, group, shoulder, tip, 0.095 - (index % 3) * 0.012, trunk, 7);
    const crown = tsphere(THREE, group, 0.7 + random() * 0.16, [tip[0] * 0.75, tip[1] + 0.12, tip[2] * 0.75], index % 3 ? leaf : lightLeaf);
    crown.scale.set(1.35, 0.72, 1.1);
    for (let ribbon = 0; ribbon < TREE_ARCHETYPES.willow.drapeCount / TREE_ARCHETYPES.willow.branchCount; ribbon += 1) {
      const spread = (ribbon - 1.5) * 0.18;
      const anchorX = tip[0] + Math.cos(angle + Math.PI / 2) * spread;
      const anchorZ = tip[2] + Math.sin(angle + Math.PI / 2) * spread;
      const length = 1.55 + random() * 1.25;
      for (let segment = 0; segment < 3; segment += 1) {
        const t = (segment + 0.5) / 3;
        const frond = tsphere(THREE, group, 0.23 - segment * 0.035, [anchorX + Math.cos(angle) * 0.12 * t, tip[1] - length * t, anchorZ + Math.sin(angle) * 0.12 * t], (index + ribbon) % 3 ? leaf : lightLeaf, 8, 6);
        frond.scale.set(0.55, 1.65, 0.55);
      }
    }
  }
  return group;
}

/** A pine: a tall trunk and three stacked cones, each a touch lighter. */
export function createPine(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const trunk = bark(THREE, "#4a3220");
  const needles = farmMaterial(THREE, "foliage", { colors: ["#2f6b3a", "#1c4224", "#3f8a48"], metresPerTile: 0.7 });
  const light = farmMaterial(THREE, "foliage", { colors: ["#3f8a48", "#24522c", "#5aa85a"], metresPerTile: 0.7 });
  tcylinder(THREE, group, 0.16, 0.28, 2, [0, 1, 0], trunk, 10);
  const tiers: Array<[number, number, number]> = [[1.85, 1.55, 1.45], [1.62, 2.25, 1.45], [1.35, 2.95, 1.4], [1.05, 3.6, 1.3], [0.76, 4.2, 1.2], [0.46, 4.72, 1.0]];
  tiers.forEach(([radius, y, height], index) => {
    const cone = new THREE.Mesh(scaleUvs(new THREE.ConeGeometry(radius, height, 12), 0.7, Math.PI * 2 * radius, height), index % 2 ? light : needles);
    cone.position.set(0, y, 0);
    cone.rotation.y = seed * 0.4 + index;
    cone.castShadow = true;
    cone.receiveShadow = true;
    group.add(cone);
  });
  return group;
}

/** A hedge bush: a cluster of low spheres. */
export function createBush(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const leaves = foliage(THREE, ["#4f9a3a", "#74b85a", "#2f6b2a"], 0.6);
  const dark = foliage(THREE, ["#2f6b2a", "#4f9a3a", "#1f4a1c"], 0.6);
  const spin = seed * 1.3;
  tsphere(THREE, group, 0.5, [0, 0.45, 0], leaves);
  tsphere(THREE, group, 0.4, [Math.cos(spin) * 0.4, 0.38, Math.sin(spin) * 0.3], dark);
  tsphere(THREE, group, 0.38, [Math.cos(spin + 2.4) * 0.42, 0.36, Math.sin(spin + 2.4) * 0.3], leaves);
  tsphere(THREE, group, 0.32, [Math.cos(spin + 4.4) * 0.35, 0.55, Math.sin(spin + 4.4) * 0.25], dark);
  return group;
}

/** A tree stump: a cut trunk with rings on top, an axe in it, and a root flare. */
export function createStump(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  const skin = bark(THREE);
  const cut = farmMaterial(THREE, "wood", { colors: ["#c9a06a", "#8a6a3a", "#e0c090"], metresPerTile: 0.4 });
  tcylinder(THREE, group, 0.3, 0.36, 0.5, [0, 0.25, 0], skin, 12);
  tcylinder(THREE, group, 0.28, 0.28, 0.02, [0, 0.51, 0], cut, 12);
  for (const r of [0.24, 0.18, 0.12, 0.06]) cylinder(THREE, group, r, r, 0.005, [0, 0.522, 0], standard(THREE, r === 0.18 || r === 0.06 ? "#a8824a" : "#d8b888", 0.9, 0), 16, false);
  for (let index = 0; index < 4; index += 1) {
    const angle = index * Math.PI / 2 + 0.5;
    const root = tbox(THREE, group, [0.3, 0.14, 0.14], [Math.cos(angle) * 0.4, 0.07, Math.sin(angle) * 0.4], skin, false);
    root.rotation.y = -angle;
  }
  const handle = cylinder(THREE, group, 0.02, 0.025, 0.7, [0.15, 0.75, 0.1], standard(THREE, "#c9b99c", 0.9, 0), 6);
  handle.rotation.z = -0.5;
  box(THREE, group, [0.16, 0.12, 0.03], [0.02, 0.56, 0.1], standard(THREE, "#5a6068", 0.4, 0.7));
  return group;
}

/** A flower bed: a dirt plot with a border and a scatter of coloured heads. */
export function createFlowerBed(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const soil = SOIL(THREE);
  const border = farmMaterial(THREE, "brick", { colors: ["#a86a4a", "#7a4a32", "#c9885f", "#c9bfae"], metresPerTile: 0.5 });
  const stem = standard(THREE, "#4f9a3a", 0.9, 0);
  tbox(THREE, group, [2, 0.12, 1], [0, 0.06, 0], soil);
  tbox(THREE, group, [2.1, 0.18, 0.1], [0, 0.09, 0.5], border, false);
  tbox(THREE, group, [2.1, 0.18, 0.1], [0, 0.09, -0.5], border, false);
  tbox(THREE, group, [0.1, 0.18, 1.1], [1, 0.09, 0], border, false);
  tbox(THREE, group, [0.1, 0.18, 1.1], [-1, 0.09, 0], border, false);
  const colours = ["#ff6f91", "#ffd33d", "#ff9a3c", "#c084fc", "#ffffff"];
  const random = seeded(seed * 7);
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const jitter = random();
      const x = -0.8 + column * 0.32 + (jitter - 0.5) * 0.12;
      const z = -0.3 + row * 0.3 + (jitter - 0.5) * 0.1;
      const height = 0.28 + jitter * 0.14;
      cylinder(THREE, group, 0.015, 0.015, height, [x, 0.12 + height / 2, z], stem, 6);
      const head = standard(THREE, colours[(row * 6 + column + seed) % colours.length]!, 0.7, 0);
      for (let petal = 0; petal < 5; petal += 1) {
        const angle = (petal / 5) * Math.PI * 2;
        sphere(THREE, group, 0.035, [x + Math.cos(angle) * 0.05, 0.12 + height + 0.03, z + Math.sin(angle) * 0.05], head).castShadow = false;
      }
      sphere(THREE, group, 0.028, [x, 0.12 + height + 0.045, z], standard(THREE, "#ffd33d", 0.7, 0)).castShadow = false;
      const leaf = box(THREE, group, [0.1, 0.01, 0.05], [x + 0.06, 0.12 + height * 0.5, z], stem, false);
      leaf.rotation.z = 0.4;
    }
  }
  return group;
}

/** A row of tall sunflowers. */
export function createSunflowers(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const stem = standard(THREE, "#4f9a3a", 0.9, 0);
  const petal = standard(THREE, "#ffd33d", 0.7, 0);
  const heart = standard(THREE, "#4a2a12", 0.95, 0);
  const leaf = standard(THREE, "#3f8a48", 0.9, 0);
  for (let index = 0; index < 5; index += 1) {
    const x = -0.8 + index * 0.4;
    const height = 1.5 + ((index * 7 + seed) % 3) * 0.15;
    cylinder(THREE, group, 0.025, 0.03, height, [x, height / 2, 0], stem, 6);
    const head = new THREE.Group();
    head.position.set(x, height, 0);
    head.rotation.x = 0.35;
    // A ring of petals round a domed seed head, and a calyx behind.
    for (let petalIndex = 0; petalIndex < 14; petalIndex += 1) {
      const angle = (petalIndex / 14) * Math.PI * 2;
      const p = sphere(THREE, head, 0.06, [Math.cos(angle) * 0.17, Math.sin(angle) * 0.17, 0], petal);
      p.scale.set(1.6, 0.6, 0.3);
      p.rotation.z = angle;
      p.castShadow = false;
    }
    const seeds = sphere(THREE, head, 0.12, [0, 0, 0.01], heart);
    seeds.scale.z = 0.4;
    cylinder(THREE, head, 0.13, 0.1, 0.05, [0, 0, -0.03], leaf, 12).rotation.x = Math.PI / 2;
    group.add(head);
    const blade = box(THREE, group, [0.28, 0.02, 0.12], [x + 0.14, height * 0.45, 0], leaf, false);
    blade.rotation.z = 0.5;
  }
  return group;
}

/** A pumpkin patch: vines on the ground and a handful of squashed orange spheres. */
export function createPumpkinPatch(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const vine = standard(THREE, "#4f9a3a", 0.9, 0);
  const orange = standard(THREE, "#e8792b", 0.75, 0);
  const stalk = standard(THREE, "#5a7a34", 0.9, 0);
  tbox(THREE, group, [2.4, 0.03, 1.6], [0, 0.015, 0], SOIL(THREE), false);
  for (let index = 0; index < 4; index += 1) {
    const vineRun = box(THREE, group, [1.2, 0.03, 0.05], [-0.4 + index * 0.3, 0.04, -0.5 + index * 0.35], vine, false);
    vineRun.rotation.y = 0.3 * index + seed * 0.2;
  }
  const spots: Array<[number, number, number]> = [[-0.8, -0.45, 0.28], [0.1, 0.2, 0.34], [0.8, -0.3, 0.24], [-0.2, 0.55, 0.22], [0.75, 0.5, 0.3]];
  for (const [x, z, radius] of spots) {
    const pumpkin = sphere(THREE, group, radius, [x, radius * 0.8, z], orange);
    pumpkin.scale.y = 0.75;
    // Ribs: a few slightly narrower slices turned round the pumpkin.
    for (let rib = 0; rib < 4; rib += 1) {
      const slice = sphere(THREE, group, radius * 0.98, [x, radius * 0.8, z], standard(THREE, "#c9621f", 0.8, 0));
      slice.scale.set(0.16, 0.76, 1.0);
      slice.rotation.y = rib * Math.PI / 4;
      slice.castShadow = false;
    }
    const leaf = box(THREE, group, [0.3, 0.01, 0.22], [x + radius * 0.9, 0.06, z + 0.1], vine, false);
    leaf.rotation.y = x;
    cylinder(THREE, group, 0.03, 0.04, 0.12, [x, radius * 0.8 * 0.75 + radius * 0.75 + 0.05, z], stalk, 6);
  }
  return group;
}

/** A wheat patch: a dense seeded stand of golden stalks with heavy heads, over a dirt plot. */
export function createWheat(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  tbox(THREE, group, [3, 0.04, 2], [0, 0.02, 0], farmMaterial(THREE, "soil", { colors: ["#8a6a3a", "#5a4020", "#b09060"] }), false);
  const stalk = standard(THREE, "#d8b24a", 0.9, 0);
  const stalkLight = standard(THREE, "#e8c860", 0.9, 0);
  const head = standard(THREE, "#c9a03a", 0.9, 0);
  const random = seeded(seed * 3 + 7);
  for (let index = 0; index < 110; index += 1) {
    const x = -1.4 + random() * 2.8;
    const z = -0.9 + random() * 1.8;
    const height = 0.6 + random() * 0.3;
    const stem = cylinder(THREE, group, 0.005, 0.007, height, [x, height / 2, z], index % 3 ? stalk : stalkLight, 4);
    stem.rotation.z = (random() - 0.5) * 0.2;
    stem.rotation.x = (random() - 0.5) * 0.2;
    stem.castShadow = false;
    const ear = cylinder(THREE, group, 0.018, 0.012, 0.12, [x + stem.rotation.z * -height * 0.5, height + 0.04, z + stem.rotation.x * height * 0.5], head, 5);
    ear.castShadow = false;
  }
  return group;
}

/** Vegetable rows: three ridged furrows of leafy greens with a couple of stakes. */
export function createVegRows(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const soil = SOIL(THREE);
  const ridge = farmMaterial(THREE, "soil", { colors: ["#6b4b2c", "#3a2414", "#9a7a50"], metresPerTile: 0.6 });
  const greens = [foliage(THREE, ["#4f9a3a", "#74b85a", "#2f6b2a"], 0.4), foliage(THREE, ["#6fb56c", "#9ad890", "#3f8a48"], 0.4), foliage(THREE, ["#2f6b2a", "#4f9a3a", "#1f4a1c"], 0.4)];
  tbox(THREE, group, [3, 0.06, 2], [0, 0.03, 0], soil, false);
  const random = seeded(seed * 17 + 2);
  for (let row = 0; row < 3; row += 1) {
    const z = -0.6 + row * 0.6;
    const furrow = tcylinder(THREE, group, 0.14, 0.14, 2.8, [0, 0.06, z], ridge, 8);
    furrow.rotation.z = Math.PI / 2;
    furrow.castShadow = false;
    for (let column = 0; column < 8; column += 1) {
      const x = -1.25 + column * 0.36;
      const size = 0.12 + random() * 0.08;
      const plant = tsphere(THREE, group, size, [x + (random() - 0.5) * 0.08, 0.16 + size * 0.6, z + (random() - 0.5) * 0.06], greens[(row + column) % 3]!, 10, 8);
      plant.scale.y = 0.75;
    }
  }
  const stake = standard(THREE, "#c9b99c", 0.9, 0);
  for (const x of [-1.42, 1.42]) box(THREE, group, [0.04, 0.6, 0.04], [x, 0.3, 0.6], stake, false);
  return group;
}

/** Lavender: a low row of grey-green mounds topped with purple spikes. */
export function createLavender(THREE: ThreeNamespace, seed = 1): any {
  const group = new THREE.Group();
  const mound = foliage(THREE, ["#6f8f5a", "#8fa878", "#4f6f3e"], 0.4);
  const bloom = standard(THREE, "#9a7fd6", 0.8, 0);
  const bloomDeep = standard(THREE, "#7a5fb6", 0.8, 0);
  const random = seeded(seed * 19 + 4);
  for (let index = 0; index < 5; index += 1) {
    const x = -0.8 + index * 0.4;
    const bush = tsphere(THREE, group, 0.28, [x, 0.22, 0], mound, 12, 10);
    bush.scale.y = 0.7;
    for (let spike = 0; spike < 9; spike += 1) {
      const angle = random() * Math.PI * 2;
      const r = random() * 0.22;
      const height = 0.25 + random() * 0.15;
      const sx = x + Math.cos(angle) * r;
      const sz = Math.sin(angle) * r;
      const stem = cylinder(THREE, group, 0.008, 0.008, height, [sx, 0.35 + height / 2, sz], mound, 4);
      stem.castShadow = false;
      const tip = cylinder(THREE, group, 0.03, 0.02, 0.12, [sx, 0.35 + height + 0.05, sz], spike % 2 ? bloom : bloomDeep, 5);
      tip.castShadow = false;
    }
  }
  return group;
}
