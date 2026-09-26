// Species dwellings: one procedural, placeable visual for every non-dog pet.
// The doghouse predates this module and stays in farm-props; everything else
// lives here so the general prop registry remains composition rather than art.
// All entrances face +z, matching the farm building convention and the
// dimensions recorded on the catalog row. The three swimmers' homes are built
// to stand on a pond bed, under water: the world sets them down at the bed.

import { box, cylinder, sphere, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder } from "./farm-materials.mjs";
import type { FarmDecorDefinition } from "./farm-catalog/decor.mjs";

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
  const roof = tbox(THREE, group, [width + 0.3, 0.13, depth * 0.72], [0, base + wallHeight + 0.17, -depth * 0.18], trim);
  roof.rotation.x = -0.34;
  const roofFront = tbox(THREE, group, [width + 0.3, 0.13, depth * 0.72], [0, base + wallHeight + 0.17, depth * 0.18], trim);
  roofFront.rotation.x = 0.34;
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
  const group = framedHut(THREE, definition, ["#8a5a34", "#5f8f48"], 1.05);
  const bark = farmMaterial(THREE, "bark", { metresPerTile: 0.7 });
  tcylinder(THREE, group, 0.23, 0.34, 1.15, [0, 0.575, -0.25], bark, 9);
  const ladder = timber(THREE, "#6d492b");
  for (const x of [-0.28, 0.28]) tbox(THREE, group, [0.06, 1.25, 0.06], [x, 0.62, definition.footprint.depth / 2 + 0.18], ladder);
  for (let y = 0.18; y < 1.2; y += 0.22) tbox(THREE, group, [0.62, 0.045, 0.05], [0, y, definition.footprint.depth / 2 + 0.18], ladder, false);
  return group;
}

export function createBurrowLodge(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = new THREE.Group();
  const soil = farmMaterial(THREE, "soil", { colors: ["#6d4b2f", "#4a321f", "#8f7047"], metresPerTile: 0.6 });
  const grass = farmMaterial(THREE, "foliage", { colors: ["#6f8f4e", "#456633", "#91ad64"], metresPerTile: 0.6 });
  for (const [x, y, z, r] of [[-0.48, 0.45, -0.05, 0.72], [0.48, 0.42, -0.08, 0.68], [0, 0.7, -0.25, 0.75]]) sphere(THREE, group, r as number, [x as number, y as number, z as number], soil);
  for (const [x, z] of [[-0.45, -0.3], [0.35, -0.45], [0.7, 0.1]]) sphere(THREE, group, 0.24, [x, 0.75, z], grass);
  const entrance = definition.dwelling!.entrance;
  box(THREE, group, [entrance.width, entrance.height, 0.05], [0, entrance.height / 2, definition.footprint.depth / 2 - 0.04], dark(THREE), false);
  const frame = timber(THREE, "#76502e");
  for (const x of [-entrance.width / 2, entrance.width / 2]) tcylinder(THREE, group, 0.055, 0.065, entrance.height, [x, entrance.height / 2, definition.footprint.depth / 2], frame, 7);
  const lintel = tcylinder(THREE, group, 0.055, 0.065, entrance.width + 0.15, [0, entrance.height, definition.footprint.depth / 2], frame, 7);
  lintel.rotation.z = Math.PI / 2;
  return group;
}

function openShade(THREE: ThreeNamespace, definition: FarmDecorDefinition, roofMaterial: any, postMaterial: any, mud = false): any {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const height = definition.dwelling!.entrance.height + 0.35;
  for (const x of [-width * 0.4, width * 0.4]) for (const z of [-depth * 0.36, depth * 0.36]) tbox(THREE, group, [0.14, height, 0.14], [x, height / 2, z], postMaterial);
  const roof = tbox(THREE, group, [width, 0.18, depth], [0, height, 0], roofMaterial);
  roof.rotation.z = -0.06;
  if (mud) {
    const pool = cylinder(THREE, group, width * 0.36, width * 0.4, 0.05, [0, 0.025, 0], standard(THREE, "#65462f", 1, 0), 20, false);
    pool.scale.z = depth / width * 0.8;
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
  const group = framedHut(THREE, definition, ["#5d3a1f", "#30263f"], 1.45);
  const post = timber(THREE, "#4a321f");
  tbox(THREE, group, [0.2, 1.55, 0.2], [0, 0.775, -0.2], post);
  tbox(THREE, group, [1.1, 0.12, 0.4], [0, 1.35, 0], post);
  return group;
}

function rockArch(THREE: ThreeNamespace, definition: FarmDecorDefinition, rock: any, glowColor?: string): any {
  const group = new THREE.Group();
  const entrance = definition.dwelling!.entrance;
  const front = definition.footprint.depth / 2 - 0.1;
  box(THREE, group, [entrance.width, entrance.height, 0.08], [0, entrance.height / 2, front], dark(THREE), false);
  for (const side of [-1, 1]) for (let tier = 0; tier < 3; tier += 1) {
    const radius = 0.38 + tier * 0.05;
    sphere(THREE, group, radius, [side * (entrance.width / 2 + radius * 0.55), radius + tier * 0.36, front - tier * 0.12], rock);
  }
  for (const x of [-0.55, 0, 0.55]) sphere(THREE, group, 0.5, [x * entrance.width, entrance.height + 0.25, front - 0.15], rock);
  for (const [x, z, r] of [[-0.9, -0.45, 0.45], [0.9, -0.35, 0.4], [-0.65, 0.25, 0.32], [0.7, 0.3, 0.36]]) sphere(THREE, group, r as number, [x as number, r as number * 0.65, z as number], rock);
  if (glowColor) {
    const glow = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 2.2, roughness: 0.45 });
    for (const [x, y, z] of [[-0.55, 0.7, front + 0.18], [0.62, 1.05, front + 0.12], [0.1, 1.45, front + 0.05]]) sphere(THREE, group, 0.055, [x, y, z], glow);
  }
  return group;
}

export function createReefGrotto(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = rockArch(THREE, definition, stone(THREE, ["#708594", "#4f6571", "#a3b3ba"]));
  const coral = standard(THREE, "#d77858", 0.9, 0);
  for (const x of [-1.2, 1.15]) {
    const stem = cylinder(THREE, group, 0.06, 0.1, 0.65, [x, 0.325, 0.2], coral, 7);
    stem.rotation.z = x < 0 ? -0.18 : 0.18;
    sphere(THREE, group, 0.12, [x + (x < 0 ? -0.08 : 0.08), 0.66, 0.2], coral);
  }
  return group;
}

export function createDarkwaterCave(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  return rockArch(THREE, definition, stone(THREE, ["#343247", "#252439", "#5f5b73"]), "#67d9d0");
}

export function createJellyfishLagoon(THREE: ThreeNamespace, definition: FarmDecorDefinition): any {
  const group = new THREE.Group();
  const radius = definition.footprint.width / 2;
  const rim = stone(THREE, ["#8fc1c9", "#5f8e98", "#c6e0df"]);
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    // Leave the +z entrance gap as wide as the data contract promises.
    if (Math.abs(Math.sin(angle) * radius) < definition.dwelling!.entrance.width / 2 && Math.cos(angle) > 0.7) continue;
    sphere(THREE, group, 0.24, [Math.sin(angle) * radius * 0.82, 0.18, Math.cos(angle) * radius * 0.82], rim);
  }
  // It stands on a pond bed: a ring of pale sand inside the rocks, not a second pool of water.
  const sand = cylinder(THREE, group, radius * 0.76, radius * 0.8, 0.08, [0, 0.04, 0], farmMaterial(THREE, "soil", { colors: ["#d9cfa8", "#b8ab80", "#efe6c4"], metresPerTile: 0.6 }), 24, false);
  sand.scale.z = 0.9;
  const glow = new THREE.MeshStandardMaterial({ color: "#d99ac6", emissive: "#9f5fa0", emissiveIntensity: 1.4, roughness: 0.5 });
  for (const [x, z] of [[-0.45, -0.2], [0.35, 0.15], [0.05, -0.55]]) sphere(THREE, group, 0.07, [x, 0.13, z], glow);
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
