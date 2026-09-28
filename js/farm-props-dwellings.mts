// Species dwellings: one procedural, placeable visual for every non-dog pet.
// The doghouse predates this module and stays in farm-props; everything else
// lives here so the general prop registry remains composition rather than art.
// All entrances face +z, matching the farm building convention and the
// dimensions recorded on the catalog row. The three swimmers' homes are built
// to stand on a pond bed, under water: the world sets them down at the bed.

import { box, cylinder, sphere, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder } from "./farm-materials.mjs";
import type { FarmDecorDefinition } from "./farm-catalog/decor.mjs";
import { aquaticArchStones, lagoonRimStones } from "./farm-prop-geometry.mjs";

type DwellingBuilder = (THREE: ThreeNamespace, definition: FarmDecorDefinition) => any;

const timber = (THREE: ThreeNamespace, color = "#8a5a34"): any => farmMaterial(THREE, "wood", { colors: [color, "#3e2615", "#b88450"], metresPerTile: 0.7 });
const stone = (THREE: ThreeNamespace, colors: readonly string[] = ["#72777a", "#4f5558", "#9aa0a2"]): any => farmMaterial(THREE, "fieldstone", { colors, metresPerTile: 0.65, bumpScale: 0.04 });
const straw = (THREE: ThreeNamespace): any => farmMaterial(THREE, "straw", { colors: ["#d7b65e", "#9b772f", "#efd988"], metresPerTile: 0.55 });
const dark = (THREE: ThreeNamespace): any => standard(THREE, "#161a1c", 1, 0);

function framedHut(THREE: ThreeNamespace, definition: FarmDecorDefinition, colors: readonly [string, string], raised = 0): any {
  const group = new THREE.Group();
  const entrance = definition.dwelling!.entrance;
  const width = definition.footprint.width;
  const depth = definition.footprint.depth;
  const wallHeight = Math.max(entrance.height + 0.3, width * 0.72);
  const wall = timber(THREE, colors[0]);
  const trim = timber(THREE, colors[1]);
  const base = raised;
  if (raised > 0) {
    for (const x of [-width * 0.36, width * 0.36]) for (const z of [-depth * 0.34, depth * 0.34]) {
      tbox(THREE, group, [0.1, raised, 0.1], [x, raised / 2, z], trim);
    }
    tbox(THREE, group, [width * 0.9, 0.1, depth * 0.9], [0, raised, 0], trim);
  }
  tbox(THREE, group, [width, wallHeight, 0.12], [0, base + wallHeight / 2, -depth / 2 + 0.06], wall);
  tbox(THREE, group, [0.12, wallHeight, depth], [-width / 2 + 0.06, base + wallHeight / 2, 0], wall);
  tbox(THREE, group, [0.12, wallHeight, depth], [width / 2 - 0.06, base + wallHeight / 2, 0], wall);
  const sideWidth = (width - entrance.width) / 2;
  for (const side of [-1, 1]) tbox(THREE, group, [sideWidth, wallHeight, 0.12], [side * (entrance.width / 2 + sideWidth / 2), base + wallHeight / 2, depth / 2 - 0.06], wall);
  tbox(THREE, group, [entrance.width, wallHeight - entrance.height, 0.12], [0, base + entrance.height + (wallHeight - entrance.height) / 2, depth / 2 - 0.06], wall);
  box(THREE, group, [entrance.width * 0.86, entrance.height * 0.86, 0.02], [0, base + entrance.height * 0.43, depth / 2 + 0.01], dark(THREE), false);
  for (const x of [-entrance.width / 2 - 0.035, entrance.width / 2 + 0.035]) {
    tbox(THREE, group, [0.07, entrance.height + 0.08, 0.075], [x, base + entrance.height / 2, depth / 2 + 0.035], trim, false);
  }
  tbox(THREE, group, [entrance.width + 0.14, 0.08, 0.075], [0, base + entrance.height + 0.02, depth / 2 + 0.035], trim, false);
  const roof = tbox(THREE, group, [width + 0.3, 0.13, depth * 0.72], [0, base + wallHeight + 0.17, -depth * 0.18], trim);
  roof.rotation.x = -0.34;
  const roofFront = tbox(THREE, group, [width + 0.3, 0.13, depth * 0.72], [0, base + wallHeight + 0.17, depth * 0.18], trim);
  roofFront.rotation.x = 0.34;
  tbox(THREE, group, [width + 0.38, 0.09, 0.09], [0, base + wallHeight + 0.3, 0], trim);
  for (const x of [-width / 2 + 0.07, width / 2 - 0.07]) for (const z of [-depth / 2 + 0.07, depth / 2 - 0.07]) {
    tbox(THREE, group, [0.075, wallHeight, 0.075], [x, base + wallHeight / 2, z], trim, false);
  }
  tbox(THREE, group, [entrance.width + 0.16, 0.07, 0.24], [0, base + 0.035, depth / 2 + 0.08], trim, false);
  return group;
}

export function createDuckCoop(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = framedHut(THREE, definition, ["#d6a35d", "#5d3a1f"], 0.35);
  const ramp = tbox(THREE, group, [definition.dwelling!.entrance.width, 0.07, 0.9], [0, 0.2, definition.footprint.depth / 2 + 0.38], timber(THREE, "#b98447"));
  ramp.rotation.x = 0.35;
  for (const z of [0.62, 0.82, 1.02]) tbox(THREE, group, [0.65, 0.035, 0.045], [0, 0.2 - (z - 0.82) * 0.35, z], timber(THREE, "#6b4528"), false);
  return group;
}

export function createTreetopDen(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = new THREE.Group();
  const bark = farmMaterial(THREE, "bark", { metresPerTile: 0.7 });
  const wall = timber(THREE, "#8a5a34");
  const green = timber(THREE, "#5f8f48");
  const ladder = timber(THREE, "#6d492b");
  const deckY = 1.08;
  tcylinder(THREE, group, 0.28, 0.38, 1.35, [-0.18, 0.675, -0.28], bark, 10);
  for (const [x, z, turn] of [[-0.55, -0.25, -0.55], [0.35, -0.32, 0.72], [-0.1, 0.25, 0.2]] as const) {
    const root = tcylinder(THREE, group, 0.07, 0.14, 1.25, [x, 0.92, z], bark, 8);
    root.rotation.z = turn;
  }
  tbox(THREE, group, [2.05, 0.1, 1.48], [0, deckY, 0.08], ladder);

  // The cabin is deliberately smaller than its deck, reading as a perched
  // lookout rather than a full-size shed lifted onto poles.
  const bodyWidth = 1.58;
  const bodyDepth = 1.08;
  const bodyHeight = 0.94;
  const bodyY = deckY + bodyHeight / 2 + 0.08;
  tbox(THREE, group, [bodyWidth, bodyHeight, bodyDepth], [0, bodyY, -0.2], wall);
  const entrance = definition.dwelling!.entrance;
  box(THREE, group, [entrance.width * 0.82, entrance.height * 0.82, 0.025], [0, deckY + entrance.height * 0.41 + 0.09, 0.35], dark(THREE), false);
  for (const x of [-entrance.width * 0.46, entrance.width * 0.46]) tbox(THREE, group, [0.065, entrance.height + 0.1, 0.065], [x, deckY + entrance.height / 2 + 0.08, 0.37], green, false);
  tbox(THREE, group, [entrance.width + 0.12, 0.07, 0.065], [0, deckY + entrance.height + 0.08, 0.37], green, false);
  for (const x of [-bodyWidth / 2 + 0.06, bodyWidth / 2 - 0.06]) for (const z of [-0.69, 0.29]) tbox(THREE, group, [0.07, bodyHeight, 0.07], [x, bodyY, z], green, false);
  for (const side of [-1, 1] as const) {
    const roof = tbox(THREE, group, [bodyWidth + 0.26, 0.11, bodyDepth * 0.66], [0, deckY + bodyHeight + 0.27, -0.2 + side * bodyDepth * 0.2], green);
    roof.rotation.x = side * 0.38;
  }
  tbox(THREE, group, [bodyWidth + 0.32, 0.08, 0.08], [0, deckY + bodyHeight + 0.39, -0.2], green);

  // Balcony, rails and a side ladder leave the front door unobstructed.
  const railZ = 0.76;
  for (const x of [-0.9, -0.58, 0.58, 0.9]) tbox(THREE, group, [0.045, 0.45, 0.045], [x, deckY + 0.24, railZ], ladder, false);
  for (const [x, width] of [[-0.74, 0.36], [0.74, 0.36]] as const) tbox(THREE, group, [width, 0.045, 0.045], [x, deckY + 0.43, railZ], ladder, false);
  const ladderX = -0.72;
  for (const x of [ladderX - 0.24, ladderX + 0.24]) tbox(THREE, group, [0.055, 1.2, 0.055], [x, 0.6, 0.82], ladder);
  for (let y = 0.16; y < 1.16; y += 0.2) tbox(THREE, group, [0.54, 0.04, 0.05], [ladderX, y, 0.82], ladder, false);

  const leafMaterials = ["#315c2f", "#4f7f3e", "#79a653"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true }));
  for (const [index, x, y, z, r, sx] of [[0, -0.92, 1.82, -0.65, 0.48, 1.25], [1, 0.9, 1.74, -0.72, 0.5, 1.2], [2, -0.55, 2.25, -0.62, 0.42, 1.3], [0, 0.55, 2.22, -0.66, 0.44, 1.25]] as const) {
    const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), leafMaterials[index]);
    crown.position.set(x, y, z);
    crown.scale.set(sx, 0.82, 1);
    crown.rotation.y = x;
    crown.castShadow = true;
    group.add(crown);
  }
  return group;
}

export function createBurrowLodge(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = new THREE.Group();
  const soil = farmMaterial(THREE, "soil", { colors: ["#6d4b2f", "#4a321f", "#8f7047"], metresPerTile: 0.6 });
  const grass = farmMaterial(THREE, "foliage", { colors: ["#6f8f4e", "#456633", "#91ad64"], metresPerTile: 0.6 });
  const entrance = definition.dwelling!.entrance;
  const front = definition.footprint.depth / 2;
  const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 2), soil);
  mound.position.set(0, 0.47, -0.13);
  mound.scale.set(definition.footprint.width * 0.5, 0.64, definition.footprint.depth * 0.53);
  mound.castShadow = true;
  mound.receiveShadow = true;
  group.add(mound);
  const turf = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), grass);
  turf.position.set(0, 0.42, -0.14);
  turf.scale.set(definition.footprint.width * 0.52, 0.72, definition.footprint.depth * 0.55);
  turf.castShadow = true;
  group.add(turf);

  // A recessed round-topped mouth cut visually into the single grassy hill.
  const opening = dark(THREE);
  box(THREE, group, [entrance.width * 0.9, entrance.height * 0.58, 0.04], [0, entrance.height * 0.29, front - 0.075], opening, false);
  const openingTop = cylinder(THREE, group, entrance.width * 0.45, entrance.width * 0.45, 0.04, [0, entrance.height * 0.58, front - 0.075], opening, 18, false);
  openingTop.rotation.x = Math.PI / 2;
  const frame = timber(THREE, "#76502e");
  for (const x of [-entrance.width * 0.48, entrance.width * 0.48]) tcylinder(THREE, group, 0.045, 0.06, entrance.height * 0.62, [x, entrance.height * 0.31, front], frame, 7);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(entrance.width * 0.48, 0.055, 7, 18, Math.PI), frame);
  arch.position.set(0, entrance.height * 0.59, front);
  group.add(arch);
  tbox(THREE, group, [entrance.width + 0.22, 0.055, 0.23], [0, 0.028, front + 0.07], frame, false);

  // Roots, a crooked chimney, field flowers, and stepping stones sell a lived-in bank.
  for (const [x, z, turn] of [[-0.55, 0.48, -0.4], [0.54, 0.45, 0.35], [-0.72, -0.25, 0.7]] as const) {
    const root = tcylinder(THREE, group, 0.035, 0.055, 0.55, [x, 0.1, z], frame, 7);
    root.rotation.x = Math.PI / 2;
    root.rotation.z = turn;
  }
  const chimney = tcylinder(THREE, group, 0.09, 0.13, 0.42, [0.48, 1.02, -0.32], frame, 8);
  chimney.rotation.z = -0.08;
  tcylinder(THREE, group, 0.12, 0.11, 0.06, [0.46, 1.24, -0.32], dark(THREE), 8, false);
  for (const [x, z, scale] of [[-0.18, 0.92, 1], [0.18, 1.13, 0.78], [-0.08, 1.3, 0.62]] as const) {
    const step = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), stone(THREE));
    step.position.set(x, 0.055, z);
    step.scale.set(scale, 0.3, 0.7);
    step.rotation.y = z * 0.8;
    step.receiveShadow = true;
    group.add(step);
  }
  const flowerColors = ["#f0b84d", "#d7789b", "#e7e3d4"] as const;
  for (const [index, x] of [-0.7, -0.58, 0.66, 0.78].entries()) {
    const stem = cylinder(THREE, group, 0.008, 0.012, 0.22 + (index % 2) * 0.05, [x, 0.12, 0.25 - (index % 2) * 0.14], standard(THREE, "#47713b", 0.9, 0), 5, false);
    sphere(THREE, group, 0.035, [x, 0.25 + (index % 2) * 0.05, 0.25 - (index % 2) * 0.14], standard(THREE, flowerColors[index % flowerColors.length], 0.8, 0));
  }
  return group;
}

function openShade(THREE: ThreeNamespace, definition: FarmDecorDefinition, roofMaterial: any, postMaterial: any, mud = false): any {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const height = definition.dwelling!.entrance.height + 0.35;
  for (const x of [-width * 0.4, width * 0.4]) for (const z of [-depth * 0.36, depth * 0.36]) tbox(THREE, group, [0.14, height, 0.14], [x, height / 2, z], postMaterial);
  if (mud) {
    for (const side of [-1, 1] as const) {
      const panel = tbox(THREE, group, [width * 0.58, 0.18, depth + 0.24], [side * width * 0.225, height + 0.12, 0], roofMaterial);
      panel.rotation.z = side * -0.2;
    }
    const ridge = tcylinder(THREE, group, 0.07, 0.08, depth + 0.3, [0, height + 0.27, 0], roofMaterial, 7);
    ridge.rotation.x = Math.PI / 2;
  } else {
    const roof = tbox(THREE, group, [width, 0.18, depth], [0, height, 0], roofMaterial);
    roof.rotation.z = -0.06;
  }
  for (const z of [-depth * 0.38, depth * 0.38]) {
    tbox(THREE, group, [width * 0.88, 0.1, 0.11], [0, height - 0.16, z], postMaterial);
    for (const x of [-width * 0.32, width * 0.32]) {
      const brace = tbox(THREE, group, [0.07, 0.48, 0.07], [x, height - 0.35, z], postMaterial, false);
      brace.rotation.z = x < 0 ? -0.55 : 0.55;
    }
  }
  if (mud) {
    const pool = cylinder(THREE, group, width * 0.36, width * 0.4, 0.05, [0, 0.025, 0], standard(THREE, "#65462f", 1, 0), 20, false);
    pool.scale.z = depth / width * 0.8;
    for (let index = 0; index < 9; index += 1) {
      const x = -width * 0.44 + index * width * 0.11;
      const fringe = tcylinder(THREE, group, 0.018, 0.025, 0.34 + (index % 3) * 0.08, [x, height - 0.05, depth * 0.49], roofMaterial, 5, false);
      fringe.rotation.x = 0.12;
    }
  }
  return group;
}

export function createMudWallow(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  return openShade(THREE, definition, straw(THREE), timber(THREE, "#6e5035"), true);
}

export function createRhinoShade(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = openShade(THREE, definition, farmMaterial(THREE, "corrugated", { colors: ["#d1ba83", "#8d7752", "#ead9ad"], metresPerTile: 0.8 }), timber(THREE, "#75634b"));
  tbox(THREE, group, [definition.footprint.width * 0.82, 0.22, 0.42], [0, 0.11, -definition.footprint.depth * 0.28], stone(THREE, ["#928671", "#6e6555", "#b5aa92"]));
  return group;
}

export function createRoostingBox(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = new THREE.Group();
  const post = timber(THREE, "#4a321f");
  const boxWood = timber(THREE, "#5d3a1f");
  const purple = timber(THREE, "#30263f");
  const entrance = definition.dwelling!.entrance;
  tbox(THREE, group, [0.2, 1.55, 0.2], [0, 0.775, -0.18], post);
  for (const x of [-0.42, 0.42]) {
    const brace = tbox(THREE, group, [0.075, 0.75, 0.075], [x / 2, 1.24, -0.12], post, false);
    brace.rotation.z = x < 0 ? -0.62 : 0.62;
  }
  const boxBase = 1.3;
  tbox(THREE, group, [1.08, 1.12, 0.58], [0, boxBase + 0.56, 0], boxWood);
  box(THREE, group, [entrance.width, entrance.height * 0.72, 0.025], [0, boxBase + entrance.height * 0.36, 0.302], dark(THREE), false);
  for (let slat = 0; slat < 4; slat += 1) {
    tbox(THREE, group, [entrance.width * 0.94, 0.075, 0.045], [0, boxBase + 0.11 + slat * 0.14, 0.326], slat % 2 ? purple : boxWood, false);
  }
  for (const x of [-0.46, 0.46]) tbox(THREE, group, [0.07, 1.03, 0.07], [x, boxBase + 0.53, 0.31], purple, false);
  tbox(THREE, group, [1.02, 0.07, 0.07], [0, boxBase + 1.03, 0.31], purple, false);
  // Grooved landing board beneath the opening: the familiar silhouette of a bat box.
  tbox(THREE, group, [0.86, 0.12, 0.22], [0, boxBase - 0.02, 0.38], purple);
  for (const x of [-0.32, -0.16, 0, 0.16, 0.32]) box(THREE, group, [0.018, 0.13, 0.225], [x, boxBase - 0.015, 0.385], dark(THREE), false);
  for (const side of [-1, 1] as const) {
    const roof = tbox(THREE, group, [0.72, 0.1, 0.76], [side * 0.28, boxBase + 1.2, 0], purple);
    roof.rotation.z = side * -0.38;
  }
  tbox(THREE, group, [0.1, 0.08, 0.8], [0, boxBase + 1.32, 0], purple);
  const bat = standard(THREE, "#9a82b8", 0.72, 0);
  sphere(THREE, group, 0.055, [0, boxBase + 0.82, 0.35], bat).scale.set(0.55, 1, 0.3);
  for (const side of [-1, 1] as const) {
    const wing = sphere(THREE, group, 0.11, [side * 0.1, boxBase + 0.83, 0.345], bat);
    wing.scale.set(1.25, 0.42, 0.18);
    wing.rotation.z = side * -0.35;
  }
  return group;
}

function facetedRock(THREE: ThreeNamespace, group: any, part: ReturnType<typeof aquaticArchStones>[number], material: any, sharpen = 1): any {
  const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(part.radius, 0), material);
  mesh.position.set(part.x, part.y, part.z);
  mesh.scale.set(part.scale[0] * sharpen, part.scale[1] / sharpen, part.scale[2]);
  mesh.rotation.set(part.turn * 0.35, part.turn, part.turn * 0.2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function rockArch(THREE: ThreeNamespace, definition: FarmDecorDefinition, colors: readonly string[], glowColor?: string): any {
  const group = new THREE.Group();
  const entrance = definition.dwelling!.entrance;
  const front = definition.footprint.depth / 2 - 0.1;
  const variant = glowColor ? "darkwater" : "reef";
  const rockMaterials = colors.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true }));
  const parts = aquaticArchStones(definition.footprint.width, definition.footprint.depth, entrance, variant);
  parts.forEach((part, index) => {
    facetedRock(THREE, group, part, rockMaterials[(index * 5 + (index > 12 ? 1 : 0)) % rockMaterials.length], variant === "darkwater" && index % 3 === 0 ? 1.16 : 1);
  });
  // A second, deeper shell gives the doorway an actual cave body. These sit
  // behind the clear entrance volume, joining the arch to broad shoulders.
  const shoulders = [
    [-0.98, 0.42, -0.42, 0.48, 1.15, 0.86, 1.1],
    [0.98, 0.4, -0.38, 0.5, 1.12, 0.82, 1.08],
    [-0.82, 0.96, -0.5, 0.47, 1.08, 0.9, 1.14],
    [0.8, 0.98, -0.48, 0.46, 1.16, 0.86, 1.12],
    [-0.42, 1.32, -0.58, 0.44, 1.12, 0.86, 1.1],
    [0.38, 1.34, -0.56, 0.46, 1.08, 0.82, 1.12],
    [-1.28, 0.34, -0.3, 0.38, 1.18, 0.76, 1.05],
    [1.28, 0.32, -0.28, 0.39, 1.16, 0.74, 1.08],
  ] as const;
  const bodyScale = Math.min(1, definition.footprint.width / 3);
  shoulders.forEach(([x, y, z, radius, sx, sy, sz], index) => {
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius * (0.72 + bodyScale * 0.28), 0), rockMaterials[(index + 2) % rockMaterials.length]);
    mesh.position.set(x * bodyScale, y * (0.78 + bodyScale * 0.22), z * bodyScale);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(index * 0.13, index * 0.37, -index * 0.07);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  // The darkness sits well behind the lip, with a lit floor leading into it,
  // so the mouth reads as a tunnel rather than a black polygon pasted on top.
  const backZ = front - definition.footprint.depth * 0.63;
  const interior = new THREE.MeshStandardMaterial({ color: variant === "reef" ? "#15282b" : "#11101d", roughness: 1 });
  box(THREE, group, [entrance.width * 0.9, entrance.height * 0.62, 0.06], [0, entrance.height * 0.31, backZ], interior, false);
  const backArch = cylinder(THREE, group, entrance.width * 0.45, entrance.width * 0.45, 0.06, [0, entrance.height * 0.62, backZ], interior, 18, false);
  backArch.rotation.x = Math.PI / 2;
  const floorMaterial = new THREE.MeshStandardMaterial({ color: variant === "reef" ? "#c8b983" : "#343247", roughness: 0.96, flatShading: true });
  for (let step = 0; step < 5; step += 1) {
    const floor = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + step * 0.018, 0), floorMaterial);
    floor.position.set((step % 2 ? 1 : -1) * 0.08, 0.045, front - 0.1 - step * 0.22);
    floor.scale.set(1.5, 0.24, 1.15);
    floor.rotation.y = step * 0.62;
    floor.receiveShadow = true;
    group.add(floor);
  }
  if (glowColor) {
    const glow = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2.2, roughness: 0.45 });
    for (const [x, y, z, r] of [[-0.62, 0.58, front + 0.12, 0.055], [0.66, 0.98, front + 0.08, 0.07], [0.22, 1.62, front, 0.05], [-0.92, 0.3, 0.12, 0.045]] as const) sphere(THREE, group, r, [x, y, z], glow);
  }
  return group;
}

export function createReefGrotto(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = rockArch(THREE, definition, ["#567783", "#78979a", "#94aaa2", "#405d68", "#b0b7a5"]);
  const coralColors = ["#e16f5b", "#efad45", "#b86fb0"] as const;
  for (const [cluster, x] of [-1.18, 1.14].entries()) {
    const coral = standard(THREE, coralColors[cluster], 0.86, 0);
    for (let branchIndex = 0; branchIndex < 5; branchIndex += 1) {
      const branch = cylinder(THREE, group, 0.035, 0.065, 0.42 + branchIndex * 0.055, [x + (branchIndex - 2) * 0.08, 0.22, 0.3 - Math.abs(branchIndex - 2) * 0.06], coral, 7);
      branch.rotation.z = (branchIndex - 2) * -0.18;
      sphere(THREE, group, 0.06, [x + (branchIndex - 2) * 0.12, 0.46 + branchIndex * 0.045, 0.3 - Math.abs(branchIndex - 2) * 0.06], coral);
    }
  }
  const fan = standard(THREE, "#cf5e8b", 0.82, 0);
  for (let branchIndex = 0; branchIndex < 7; branchIndex += 1) {
    const x = -0.92 + branchIndex * 0.075;
    const branch = cylinder(THREE, group, 0.018, 0.025, 0.52 + (branchIndex % 3) * 0.08, [x, 0.28, -0.42], fan, 6, false);
    branch.rotation.z = (branchIndex - 3) * -0.12;
  }
  for (const y of [0.18, 0.31, 0.44]) {
    const rib = cylinder(THREE, group, 0.012, 0.012, 0.48, [-0.7, y, -0.41], fan, 5, false);
    rib.rotation.z = Math.PI / 2;
  }
  const grassMaterials = [standard(THREE, "#2e8173", 0.86, 0), standard(THREE, "#65a85f", 0.9, 0)];
  for (const [index, x] of [-1.42, -1.3, 0.88, 1.02, 1.34].entries()) {
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.54 + (index % 3) * 0.11, 5), grassMaterials[index % 2]);
    blade.position.set(x, 0.3, -0.55 + (index % 2) * 0.16);
    blade.rotation.z = (index - 2) * 0.09;
    blade.castShadow = true;
    group.add(blade);
  }
  const anemone = standard(THREE, "#e28e45", 0.78, 0);
  sphere(THREE, group, 0.13, [0.8, 0.08, 0.72], anemone).scale.set(1.35, 0.55, 1.1);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const feeler = cylinder(THREE, group, 0.016, 0.027, 0.24 + (index % 2) * 0.06, [0.8 + Math.cos(angle) * 0.08, 0.2, 0.72 + Math.sin(angle) * 0.06], anemone, 6, false);
    feeler.rotation.z = Math.cos(angle) * 0.34;
    feeler.rotation.x = Math.sin(angle) * 0.34;
  }
  const shell = standard(THREE, "#f2d9a7", 0.82, 0.05);
  for (const [x, z, turn] of [[-0.42, 0.94, -0.4], [0.5, 0.83, 0.6], [0.86, -0.48, 0.2]] as const) {
    const clam = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 6), shell);
    clam.scale.set(1, 0.22, 0.75);
    clam.position.set(x, 0.06, z);
    clam.rotation.y = turn;
    clam.castShadow = true;
    group.add(clam);
  }
  return group;
}

export function createDarkwaterCave(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = rockArch(THREE, definition, ["#262538", "#343247", "#48435e", "#1d2132", "#5d526c"], "#67d9d0");
  const crystal = new THREE.MeshStandardMaterial({ color: "#5ad8d4", emissive: "#2d9da8", emissiveIntensity: 1.7, roughness: 0.34, transparent: true, opacity: 0.88 });
  for (const [x, y, z, height, turn] of [[-0.72, 0.18, 0.42, 0.45, -0.22], [-0.48, 0.12, 0.55, 0.3, 0.18], [0.78, 0.16, 0.28, 0.38, 0.2], [0.96, 0.1, -0.22, 0.26, -0.18]] as const) {
    const shard = new THREE.Mesh(new THREE.ConeGeometry(0.09, height, 5), crystal);
    shard.position.set(x, y + height / 2, z);
    shard.rotation.z = turn;
    shard.castShadow = true;
    group.add(shard);
  }
  const stemMaterial = standard(THREE, "#40515a", 0.8, 0.1);
  const lowerStem = cylinder(THREE, group, 0.014, 0.025, 0.34, [0.45, 1.29, 0.62], stemMaterial, 6, false);
  lowerStem.rotation.z = -0.32;
  const middleStem = cylinder(THREE, group, 0.012, 0.018, 0.28, [0.55, 1.55, 0.64], stemMaterial, 6, false);
  middleStem.rotation.z = -0.48;
  const tipStem = cylinder(THREE, group, 0.01, 0.014, 0.2, [0.68, 1.72, 0.68], stemMaterial, 6, false);
  tipStem.rotation.z = -0.78;
  const lure = new THREE.MeshStandardMaterial({ color: "#b9fff1", emissive: "#67d9d0", emissiveIntensity: 3.2, roughness: 0.2 });
  sphere(THREE, group, 0.095, [0.76, 1.79, 0.68], lure);
  for (const [x, y, z, size] of [[-0.28, 1.12, 0.52, 0.26], [0.18, 1.26, 0.48, 0.2], [0.52, 1.02, 0.5, 0.22]] as const) {
    const tooth = new THREE.Mesh(new THREE.ConeGeometry(size * 0.38, size, 5), new THREE.MeshStandardMaterial({ color: "#27263a", roughness: 0.96, flatShading: true }));
    tooth.position.set(x, y, z);
    tooth.rotation.z = Math.PI;
    group.add(tooth);
  }
  for (const [x, z, color] of [[-0.72, 0.72, "#68d6cb"], [0.54, 0.82, "#8d77d8"], [0.86, 0.42, "#68d6cb"]] as const) {
    const stalk = cylinder(THREE, group, 0.018, 0.026, 0.18, [x, 0.11, z], stemMaterial, 6, false);
    const cap = sphere(THREE, group, 0.09, [x, 0.22, z], new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5, roughness: 0.5 }));
    cap.scale.set(1.15, 0.42, 1.15);
  }
  return group;
}

export function createJellyfishLagoon(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = new THREE.Group();
  const radius = definition.footprint.width / 2;
  const rimMaterials = ["#7faeb2", "#a9cbc5", "#5d8e98", "#cadbd0"].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true }));
  lagoonRimStones(radius, definition.dwelling!.entrance.width).forEach((part, index) => facetedRock(THREE, group, part, rimMaterials[(index * 3) % rimMaterials.length]));
  // It stands on a pond bed: a ring of pale sand inside the rocks, not a second pool of water.
  const sand = cylinder(THREE, group, radius * 0.76, radius * 0.8, 0.08, [0, 0.04, 0], farmMaterial(THREE, "soil", { colors: ["#d9cfa8", "#b8ab80", "#efe6c4"], metresPerTile: 0.6 }), 24, false);
  sand.scale.z = 0.9;
  const glow = new THREE.MeshStandardMaterial({ color: "#d99ac6", emissive: "#9f5fa0", emissiveIntensity: 1.4, roughness: 0.5 });
  for (const [x, z] of [[-0.62, -0.25], [0.58, 0.1], [0.08, -0.72], [-0.82, 0.25]]) sphere(THREE, group, 0.07, [x, 0.13, z], glow);

  // A luminous bell and trailing tentacle curtain make this a home, not just a rock circle.
  const bellMaterial = new THREE.MeshStandardMaterial({ color: "#8fd9dc", emissive: "#6bb7c5", emissiveIntensity: 0.9, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.58, side: THREE.DoubleSide });
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.78, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bellMaterial);
  bell.position.set(0, 1.02, -0.18);
  bell.scale.set(1, 0.7, 0.88);
  bell.castShadow = true;
  group.add(bell);
  const innerBell = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#d6a9d9", emissive: "#a266b1", emissiveIntensity: 1.2, transparent: true, opacity: 0.34, side: THREE.DoubleSide }));
  innerBell.position.set(0, 1.03, -0.18);
  innerBell.scale.y = 0.76;
  group.add(innerBell);
  const bellRim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.045, 7, 24), glow);
  bellRim.position.set(0, 1.01, -0.18);
  bellRim.rotation.x = Math.PI / 2;
  group.add(bellRim);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    sphere(THREE, group, 0.075, [Math.cos(angle) * 0.69, 1.01, -0.18 + Math.sin(angle) * 0.69 * 0.88], index % 2 ? glow : bellMaterial).scale.set(1.2, 0.65, 0.9);
  }
  for (const [x, z, height, lean] of [[-0.5, -0.2, 0.68, -0.12], [-0.25, -0.38, 0.82, 0.08], [0, -0.46, 0.66, -0.06], [0.26, -0.37, 0.78, 0.12], [0.5, -0.2, 0.68, -0.1]] as const) {
    const upper = cylinder(THREE, group, 0.022, 0.042, height * 0.58, [x, 0.98 - height * 0.29, z], glow, 7, false);
    upper.rotation.z = lean;
    const lower = cylinder(THREE, group, 0.018, 0.026, height * 0.48, [x + lean * 0.65, 0.98 - height * 0.77, z + 0.035], glow, 7, false);
    lower.rotation.z = -lean * 1.8;
    sphere(THREE, group, 0.032, [x + lean * 0.28, 0.98 - height * 0.56, z + 0.018], glow);
  }
  return group;
}

export const FARM_DWELLING_BUILDERS: Readonly<Record<string, DwellingBuilder>> = Object.freeze({
  "dwelling-duck-coop": createDuckCoop,
  "dwelling-treetop-den": createTreetopDen,
  "dwelling-burrow-lodge": createBurrowLodge,
  "dwelling-mud-wallow": createMudWallow,
  "dwelling-rhino-shade": createRhinoShade,
  "dwelling-roosting-box": createRoostingBox,
  "dwelling-reef-grotto": createReefGrotto,
  "dwelling-darkwater-cave": createDarkwaterCave,
  "dwelling-jellyfish-lagoon": createJellyfishLagoon,
});
