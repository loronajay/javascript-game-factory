// The farm's buildings — every one a shell the player walks into.
//
// A building is drawn from the same `shellWalls` list the walker collides
// with (`farm-scene.mts`), so the doorway the eye sees is the doorway the body
// fits through: `drawShell` lays the walls, `createDoorLeaves` hangs one or
// two leaves on the jambs and returns the `BuildingDoors` the world animates,
// and each builder adds only what makes it THAT building — a gambrel roof and
// a hay hood, a row of stalls under a porch roof, a glass frame, a conical
// cap. Every interior is dressed and lit, because a building you can enter
// must be worth entering.
//
// WHAT STANDS INSIDE IS DRAWN FROM `farm-fixtures.mts`. A builder never
// invents a bench's position: it asks `fixtureNamed` for the box the walker
// collides with and draws the bench in that box (`drawFixtureBox`,
// `drawLadder`, `drawPlatform`, `drawSeat`), so a loft is where the body can
// stand, a ladder is where it can climb, and a workbench is never something
// it walks through. A door fixture (a stall's half-door) is drawn as a leaf
// on a hinge group (`drawFixtureDoor`) that swings to the fixture's own open
// pose, and the builder hands it back in `fixtureDoors` by name, so the world
// can work it like the building's own doors. A test builds every building
// with a stub THREE and checks that every fixture got a mesh.
//
// NOTHING HERE IS A FLAT COLOUR. Walls, roofs, doors and floors are drawn in
// `farm-materials.mts` — board-and-batten, shingles, clay tile, fieldstone,
// corrugated iron — with their UVs in metres, so a barn wall has boards the
// width of real boards and a roof has rows of real shingles. Trim, glass and
// iron stay plain because paint, glass and iron ARE plain. No art assets:
// boxes, cylinders, spheres and extruded shapes, centred on the footprint
// with the base on the ground.

import { box, cylinder, sphere, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, metricUvs, tbox, tcylinder, tmesh, tsphere } from "./farm-materials.mjs";
import { roundFace, shellWalls } from "./farm-shell.mjs";
import { farmFixtures, fixtureDoorHinge, fixtureNamed, type FarmFixture } from "./farm-fixtures.mjs";
import type { FarmDecorDefinition } from "./farm-catalog/decor.mjs";
import { gazeboCanopy, gableRoofHeightAt, gambrelRoofHeightAt, hangingLightChain } from "./farm-building-geometry.mjs";

const WOOD = "#8a5a34";
const WOOD_DARK = "#5d3a1f";
const TRIM = "#f1e6d2";
const IRON = "#2b2b2b";
const GLASS = "#bfe6ee";

/** The door leaves, animated by the world each frame. `setOpen` starts the swing; `update(dt)` eases it. */
export type BuildingDoors = Readonly<{
  setOpen: (open: boolean) => void;
  isOpen: () => boolean;
  /** True while a leaf is still swinging. */
  update: (dt: number) => boolean;
}>;
/** The barn's name for the same thing, kept for the world and the tests that grew up with it. */
export type BarnDoors = BuildingDoors;

/** A built building: the model, its doors if it has any, the doors of its door fixtures by fixture name, and a per-frame animation if it moves (a windmill). */
export type BuildingModel = Readonly<{ group: any; doors: BuildingDoors | null; fixtureDoors: Readonly<Record<string, BuildingDoors>>; animate: ((dt: number) => void) | null }>;

const DOOR_SWING = 1.85;
const DOOR_SWING_SPEED = 3.2;

/**
 * The swing every door shares: `setOpen` picks the target, `update(dt)` eases
 * the hinges toward it at `DOOR_SWING_SPEED` radians a second, and each hinge
 * turns by its own full angle (a building's leaves fan wide, a stall door
 * stops square against its partition).
 */
function createSwing(hinges: ReadonlyArray<Readonly<{ node: any; angle: number }>>): BuildingDoors {
  const longest = Math.max(...hinges.map((hinge) => Math.abs(hinge.angle)));
  let open = false;
  let swing = 0;
  return Object.freeze({
    setOpen(next: boolean) { open = next; },
    isOpen: () => open,
    update(dt: number) {
      const target = open ? 1 : 0;
      if (swing === target) return false;
      swing = target > swing ? Math.min(target, swing + dt * DOOR_SWING_SPEED / longest) : Math.max(target, swing - dt * DOOR_SWING_SPEED / longest);
      const eased = swing * swing * (3 - 2 * swing);
      for (const hinge of hinges) hinge.node.rotation.y = hinge.node.userData.restY + hinge.angle * eased;
      return swing !== target;
    },
  });
}

// ---------------------------------------------------------------------------
// Materials the buildings share. Painted trim is plain paint; everything with
// a grain, a course or a rib comes from the farm's material library.

function paint(THREE: ThreeNamespace, color: string, roughness = 0.75): any {
  return standard(THREE, color, roughness, 0);
}

function timber(THREE: ThreeNamespace, color = WOOD_DARK): any {
  return farmMaterial(THREE, "wood", { colors: [color, "#2f1c0c", "#8a6240"], metresPerTile: 1.2 });
}

function paintedWood(THREE: ThreeNamespace, color: string): any {
  return farmMaterial(THREE, "wood", { colors: [color, "#8a8070", "#ffffff"], metresPerTile: 1.2, bumpScale: 0.006 });
}

function iron(THREE: ThreeNamespace): any {
  return standard(THREE, IRON, 0.45, 0.6);
}

function stone(THREE: ThreeNamespace): any {
  return farmMaterial(THREE, "fieldstone");
}

function glassMaterial(THREE: ThreeNamespace, opacity = 0.42): any {
  return new THREE.MeshStandardMaterial({ color: GLASS, roughness: 0.08, metalness: 0.2, transparent: true, opacity, side: THREE.DoubleSide });
}

/** A window pane: tinted glass that catches the sky a little, so it reads as glass from outside and inside alike. */
function paneGlass(THREE: ThreeNamespace): any {
  return new THREE.MeshStandardMaterial({ color: "#9fd4ff", roughness: 0.12, metalness: 0.3, emissive: "#3a5a7a", emissiveIntensity: 0.3 });
}

type Materials = Readonly<{ wall: any; inside?: any; trim?: any }>;

// ---------------------------------------------------------------------------
// Fixtures: what stands inside, drawn where the walker meets it.

/** A mesh drawn for a fixture is tagged with the fixture's name, which is what the fixture test looks for. */
export function tagFixture(mesh: any, entry: FarmFixture): any {
  mesh.userData.fixture = entry.name;
  return mesh;
}

/** The fixture's whole box, as one mesh: a hay pile, a stall wall, a hearth. `bottom`/`top` trim it (a tabletop over legs). */
export function drawFixtureBox(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any, options: Readonly<{ bottom?: number; top?: number; inset?: number; shadow?: boolean }> = {}): any {
  const bottom = options.bottom ?? entry.bottom;
  const top = options.top ?? entry.top;
  const inset = options.inset ?? 0;
  const mesh = tbox(THREE, group, [entry.width - inset * 2, top - bottom, entry.depth - inset * 2], [entry.x, (bottom + top) / 2, entry.z], material, options.shadow ?? true);
  mesh.rotation.y = entry.rotationY;
  return tagFixture(mesh, entry);
}

/** A floor the body stands on: the platform's box, a hand thick, at its top, with a joist under its front edge. */
export function drawPlatform(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any): any {
  const mesh = drawFixtureBox(THREE, group, entry, material);
  const edge = entry.depth / 2 - 0.06;
  const joist = tbox(THREE, group, [entry.width, 0.16, 0.12], [entry.x + Math.sin(entry.rotationY) * edge, entry.bottom - 0.08, entry.z + Math.cos(entry.rotationY) * edge], timber(THREE), false);
  joist.rotation.y = entry.rotationY;
  return mesh;
}

/**
 * A door fixture: a hinge group at the fixture's hinge, tagged with its name,
 * with the leaf drawn by `draw` in the hinge's frame — the leaf's box runs
 * from the hinge to `-hinge * width` along x, `bottom` to `top`, `depth`
 * thick about z — and the swing that turns the hinge by the fixture's own
 * `door.swing`, so the leaf the eye sees standing open is the box the body
 * meets. The plain leaf is drawn here; `draw` adds the rails and braces.
 */
export function drawFixtureDoor(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any, draw?: (leaf: any, box: Readonly<{ centreX: number; width: number; height: number; depth: number }>) => void): BuildingDoors {
  const door = entry.door!;
  const at = fixtureDoorHinge(entry);
  const hinge = new THREE.Group();
  hinge.position.set(at.x, entry.bottom, at.z);
  hinge.rotation.y = entry.rotationY;
  hinge.userData.restY = entry.rotationY;
  tagFixture(hinge, entry);
  const height = entry.top - entry.bottom;
  const centreX = -door.hinge * entry.width / 2;
  tbox(THREE, hinge, [entry.width - 0.02, height - 0.02, entry.depth], [centreX, height / 2, 0], material);
  draw?.(hinge, { centreX, width: entry.width, height, depth: entry.depth });
  group.add(hinge);
  return createSwing([{ node: hinge, angle: door.swing }]);
}

/**
 * A ladder in the fixture's box: two rails and rungs up its climbing face,
 * from its bottom to a hand-hold above its top, so the rails show over the
 * platform's edge the way a real ladder's do.
 */
export function drawLadder(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any): any {
  const ladder = new THREE.Group();
  ladder.position.set(entry.x, 0, entry.z);
  ladder.rotation.y = entry.rotationY;
  const visualTop = entry.top + 0.5;
  const railX = entry.width / 2 - 0.03;
  for (const x of [-railX, railX]) tbox(THREE, ladder, [0.06, visualTop - entry.bottom, 0.06], [x, (entry.bottom + visualTop) / 2, 0], material, false);
  for (let y = entry.bottom + 0.32; y < entry.top + 0.2; y += 0.32) cylinder(THREE, ladder, 0.022, 0.022, entry.width - 0.06, [0, y, 0], material, 8).rotation.z = Math.PI / 2;
  group.add(ladder);
  return tagFixture(ladder, entry);
}

/** A seat: a slatted slab at the seat's top over legs at its corners, with a stretcher between them. */
export function drawSeat(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any): any {
  const seat = new THREE.Group();
  seat.position.set(entry.x, 0, entry.z);
  seat.rotation.y = entry.rotationY;
  const slats = Math.max(2, Math.round(entry.depth / 0.12));
  const slatDepth = entry.depth / slats;
  for (let index = 0; index < slats; index += 1) tbox(THREE, seat, [entry.width, 0.05, slatDepth - 0.015], [0, entry.top - 0.025, -entry.depth / 2 + slatDepth * (index + 0.5)], material);
  const legX = Math.max(0.05, entry.width / 2 - 0.15);
  const legZ = Math.max(0.05, entry.depth / 2 - 0.08);
  for (const x of [-legX, legX]) for (const z of [-legZ, legZ]) tbox(THREE, seat, [0.06, entry.top - 0.05, 0.06], [x, (entry.top - 0.05) / 2, z], material, false);
  tbox(THREE, seat, [entry.width - 0.3, 0.05, 0.05], [0, entry.top * 0.4, 0], material, false);
  group.add(seat);
  return tagFixture(seat, entry);
}

/** A round seat: a stool on three splayed legs. */
function drawStool(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any): any {
  const stool = new THREE.Group();
  stool.position.set(entry.x, 0, entry.z);
  tcylinder(THREE, stool, entry.width / 2, entry.width / 2 - 0.02, 0.05, [0, entry.top - 0.025, 0], material, 12);
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2;
    const leg = cylinder(THREE, stool, 0.02, 0.025, entry.top - 0.05, [Math.cos(angle) * entry.width * 0.3, (entry.top - 0.05) / 2, Math.sin(angle) * entry.width * 0.3], material, 6);
    leg.rotation.z = -Math.cos(angle) * 0.12;
    leg.rotation.x = Math.sin(angle) * 0.12;
  }
  group.add(stool);
  return tagFixture(stool, entry);
}

/** A workbench in its box: a thick top over two trestle ends, with a shelf between them. */
function drawWorkbench(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any): any {
  const bench = new THREE.Group();
  bench.position.set(entry.x, 0, entry.z);
  bench.rotation.y = entry.rotationY;
  tbox(THREE, bench, [entry.width, 0.08, entry.depth], [0, entry.top - 0.04, 0], material);
  const legHeight = entry.top - 0.08;
  for (const z of [-entry.depth / 2 + 0.06, entry.depth / 2 - 0.06]) tbox(THREE, bench, [entry.width - 0.1, legHeight, 0.08], [0, legHeight / 2, z], material, false);
  tbox(THREE, bench, [entry.width - 0.14, 0.04, entry.depth - 0.2], [0, legHeight * 0.35, 0], material, false);
  group.add(bench);
  return tagFixture(bench, entry);
}

/** A railing in its box: a moulded top rail, a bottom rail, turned balusters between. */
function drawRailing(THREE: ThreeNamespace, group: any, entry: FarmFixture, material: any): any {
  const rail = new THREE.Group();
  rail.position.set(entry.x, 0, entry.z);
  rail.rotation.y = entry.rotationY;
  tbox(THREE, rail, [entry.width, 0.06, entry.depth], [0, entry.top - 0.03, 0], material);
  tbox(THREE, rail, [entry.width, 0.05, entry.depth * 0.8], [0, entry.bottom + 0.05, 0], material, false);
  const balusters = Math.max(2, Math.round(entry.width / 0.22));
  for (let index = 1; index < balusters; index += 1) {
    const offset = -entry.width / 2 + index * (entry.width / balusters);
    const h = entry.top - entry.bottom - 0.06;
    cylinder(THREE, rail, 0.018, 0.018, h, [offset, (entry.top + entry.bottom) / 2, 0], material, 8);
    cylinder(THREE, rail, 0.03, 0.03, h * 0.18, [offset, entry.bottom + 0.05 + h * 0.5, 0], material, 8);
  }
  group.add(rail);
  return tagFixture(rail, entry);
}

// ---------------------------------------------------------------------------
// Shared parts: shell, foundation, doors, roofs, windows, lanterns.

/** Where the door face's centre is in the building's frame (its wall centreline). */
function doorLocal(definition: FarmDecorDefinition): Readonly<{ x: number; z: number }> {
  const shell = definition.shell!;
  const outer = shell.kind === "round" ? roundFace(shell, definition.footprint, 0).apothem : definition.footprint.depth / 2;
  return { x: 0, z: outer - shell.wallThickness / 2 };
}

/**
 * The walls, drawn from the same list the walker collides with (with the door
 * open, so the shut door is never a wall here — the leaves are the door). A
 * lintel closes the gap above the doorway and a trim frame surrounds the
 * opening; corner boards in trim mark the edges when asked. Returns the wall
 * meshes for anyone who wants to add to them.
 */
function drawShell(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, materials: Materials, options: Readonly<{ cornerBoards?: boolean; lintel?: boolean; frame?: boolean }> = {}): any[] {
  const shell = definition.shell!;
  const meshes: any[] = [];
  for (const wall of shellWalls(definition, true)) {
    const mesh = tbox(THREE, group, [wall.length, shell.wallHeight, wall.thickness], [wall.x, shell.wallHeight / 2, wall.z], materials.wall);
    mesh.rotation.y = wall.rotationY;
    meshes.push(mesh);
  }
  if (shell.door && options.lintel !== false) {
    const door = shell.door;
    const at = doorLocal(definition);
    const lintelHeight = shell.wallHeight - door.height;
    if (lintelHeight > 0.02) tbox(THREE, group, [door.width, lintelHeight, shell.wallThickness], [at.x, door.height + lintelHeight / 2, at.z], materials.wall);
    if (options.frame !== false) {
      const trim = materials.trim ?? materials.wall;
      tbox(THREE, group, [door.width + 0.28, 0.16, shell.wallThickness + 0.08], [at.x, door.height + 0.08, at.z], trim, false);
      tbox(THREE, group, [0.14, door.height + 0.16, shell.wallThickness + 0.08], [at.x - door.width / 2 - 0.07, (door.height + 0.16) / 2, at.z], trim, false);
      tbox(THREE, group, [0.14, door.height + 0.16, shell.wallThickness + 0.08], [at.x + door.width / 2 + 0.07, (door.height + 0.16) / 2, at.z], trim, false);
    }
  }
  if (options.cornerBoards && shell.kind === "walls" && materials.trim) {
    const { width, depth } = definition.footprint;
    for (const x of [-width / 2, width / 2]) for (const z of [-depth / 2, depth / 2]) tbox(THREE, group, [0.16, shell.wallHeight, 0.16], [x, shell.wallHeight / 2, z], materials.trim, false);
  }
  return meshes;
}

/**
 * A stone plinth under the walls, a little proud of them, so the building sits
 * on the ground instead of floating on it. It is a RING following the walls
 * (the floor inside stays the floor), with a low threshold across the doorway.
 */
function foundation(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, height = 0.35, proud = 0.08): void {
  const shell = definition.shell!;
  const material = stone(THREE);
  for (const wall of shellWalls(definition, true)) {
    // A jamb's plinth reaches past its outer corner only, so the plinth never pokes into the doorway.
    const jamb = wall.name.includes("jamb");
    const along = { x: Math.cos(wall.rotationY), z: -Math.sin(wall.rotationY) };
    const shift = jamb ? Math.sign(wall.x * along.x + wall.z * along.z) * proud / 2 : 0;
    const mesh = tbox(THREE, group, [wall.length + (jamb ? proud : proud * 2), height, wall.thickness + proud * 2], [wall.x + along.x * shift, height / 2, wall.z + along.z * shift], material);
    mesh.rotation.y = wall.rotationY;
  }
  if (shell.door) {
    const at = doorLocal(definition);
    tbox(THREE, group, [shell.door.width + 0.1, 0.08, shell.wallThickness + proud * 2 + 0.3], [at.x, 0.04, at.z + 0.1], material);
  }
}

/**
 * A horizontal band round the shell — a half-timber rail, a sill plate, a
 * silo hoop, a windmill ring — that NEVER crosses the doorway. Below the door's
 * head the band follows `shellWalls` and so stops at the jambs; above it the
 * band runs the whole face. It is a set of boxes, one per wall, not a slab or
 * a disc: a band that filled the footprint would be a floor the eye sees
 * through the middle of the room. `offset` is the band's centre from the
 * wall's centreline along its outward normal (default: just proud of the
 * outer face); 0 caps the wall itself.
 */
function wallBands(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, material: any, band: Readonly<{ y: number; height: number; thickness: number; offset?: number; shadow?: boolean }>): void {
  const shell = definition.shell!;
  const offset = band.offset ?? shell.wallThickness / 2 + band.thickness / 2 + 0.01;
  const clearsDoor = !shell.door || band.y - band.height / 2 >= shell.door.height;
  const walls = clearsDoor ? shellWalls({ footprint: definition.footprint, shell: { ...shell, door: null } }, true) : shellWalls(definition, true);
  const overlap = Math.abs(offset) + band.thickness / 2;
  for (const wall of walls) {
    const along = { x: Math.cos(wall.rotationY), z: -Math.sin(wall.rotationY) };
    let normal = { x: Math.sin(wall.rotationY), z: Math.cos(wall.rotationY) };
    if (wall.x * normal.x + wall.z * normal.z < 0) normal = { x: -normal.x, z: -normal.z };
    // Full walls reach past both corners so neighbours meet; a jamb reaches past its outer corner only.
    const jamb = wall.name.includes("jamb");
    const length = wall.length + (jamb ? overlap : overlap * 2);
    const shift = jamb ? Math.sign(wall.x * along.x + wall.z * along.z) * overlap / 2 : 0;
    const mesh = tbox(THREE, group, [length, band.height, band.thickness], [wall.x + normal.x * offset + along.x * shift, band.y, wall.z + normal.z * offset + along.z * shift], material, band.shadow ?? false);
    mesh.rotation.y = wall.rotationY;
  }
}

type LeafStyle = "barn" | "plank" | "glass" | "panel" | "dutch";

/** Iron strap hinges and a handle on a leaf: `x` runs from the hinge toward the latch. */
function ironmongery(THREE: ThreeNamespace, leaf: any, side: -1 | 1, leafWidth: number, height: number, z: number): void {
  const metal = iron(THREE);
  for (const y of [height * 0.18, height * 0.82]) {
    box(THREE, leaf, [leafWidth * 0.55, 0.05, 0.015], [-side * leafWidth * 0.3, y, z], metal, false);
    for (let index = 0; index < 3; index += 1) sphere(THREE, leaf, 0.012, [-side * (0.08 + index * leafWidth * 0.18), y, z + 0.01], metal);
  }
  // The handle near the latch edge.
  const handle = cylinder(THREE, leaf, 0.014, 0.014, 0.16, [-side * (leafWidth - 0.14), height * 0.48, z + 0.03], metal, 8);
  handle.rotation.x = Math.PI / 2;
  cylinder(THREE, leaf, 0.012, 0.012, 0.05, [-side * (leafWidth - 0.14), height * 0.48 + 0.07, z + 0.015], metal, 8).rotation.x = Math.PI / 2;
  cylinder(THREE, leaf, 0.012, 0.012, 0.05, [-side * (leafWidth - 0.14), height * 0.48 - 0.07, z + 0.015], metal, 8).rotation.x = Math.PI / 2;
}

/** One leaf's face, in the leaf's frame: `x` runs from the hinge toward the latch. */
function drawLeaf(THREE: ThreeNamespace, leaf: any, style: LeafStyle, side: -1 | 1, leafWidth: number, height: number, materials: Readonly<{ leaf: any; trim: any }>): void {
  const centreX = -side * leafWidth / 2;
  if (style === "glass") {
    box(THREE, leaf, [leafWidth, height - 0.04, 0.03], [centreX, height / 2, 0], glassMaterial(THREE), false);
    box(THREE, leaf, [leafWidth, 0.1, 0.06], [centreX, height - 0.07, 0], materials.trim, false);
    box(THREE, leaf, [leafWidth, 0.3, 0.06], [centreX, 0.15, 0], materials.trim, false);
    box(THREE, leaf, [0.07, height, 0.06], [-side * (leafWidth - 0.035), height / 2, 0], materials.trim, false);
    box(THREE, leaf, [0.07, height, 0.06], [-side * 0.035, height / 2, 0], materials.trim, false);
    box(THREE, leaf, [leafWidth, 0.04, 0.05], [centreX, height * 0.55, 0], materials.trim, false);
    cylinder(THREE, leaf, 0.012, 0.012, 0.2, [-side * (leafWidth - 0.12), height * 0.5, 0.05], iron(THREE), 8);
    return;
  }
  tbox(THREE, leaf, [leafWidth, height - 0.04, 0.09], [centreX, height / 2, 0], materials.leaf);
  if (style === "barn") {
    // Vertical boards, a rail top and bottom, and two crossed braces in trim — the classic barn X.
    const boards = Math.max(3, Math.round(leafWidth / 0.2));
    const boardWidth = leafWidth / boards;
    for (let index = 0; index < boards; index += 1) {
      box(THREE, leaf, [0.012, height - 0.06, 0.02], [-side * (index * boardWidth), height / 2, 0.05], standard(THREE, "#3a1410", 1, 0), false);
    }
    for (const sign of [1, -1] as const) {
      const brace = tbox(THREE, leaf, [0.14, Math.hypot(leafWidth, height * 0.62) - 0.2, 0.04], [centreX, height / 2, 0.07], materials.trim, false);
      brace.rotation.z = sign * side * Math.atan2(leafWidth, height * 0.62);
    }
    tbox(THREE, leaf, [leafWidth - 0.06, 0.14, 0.05], [centreX, height - 0.2, 0.07], materials.trim, false);
    tbox(THREE, leaf, [leafWidth - 0.06, 0.14, 0.05], [centreX, 0.2, 0.07], materials.trim, false);
    tbox(THREE, leaf, [0.14, height - 0.4, 0.05], [-side * 0.09, height / 2, 0.07], materials.trim, false);
    tbox(THREE, leaf, [0.14, height - 0.4, 0.05], [-side * (leafWidth - 0.09), height / 2, 0.07], materials.trim, false);
    ironmongery(THREE, leaf, side, leafWidth, height, 0.1);
  } else if (style === "plank" || style === "dutch") {
    // Vertical planks with a Z-brace; a dutch door has a ledge splitting it into an upper and lower half.
    const planks = Math.max(2, Math.round(leafWidth / 0.18));
    const plankWidth = leafWidth / planks;
    for (let index = 0; index < planks; index += 1) {
      box(THREE, leaf, [0.012, height - 0.06, 0.02], [-side * (index * plankWidth + plankWidth), height / 2, 0.05], standard(THREE, "#2b1d14", 1, 0), false);
    }
    tbox(THREE, leaf, [leafWidth - 0.06, 0.12, 0.04], [centreX, height - 0.16, 0.065], materials.trim, false);
    tbox(THREE, leaf, [leafWidth - 0.06, 0.12, 0.04], [centreX, 0.16, 0.065], materials.trim, false);
    if (style === "dutch") {
      tbox(THREE, leaf, [leafWidth - 0.06, 0.12, 0.04], [centreX, height * 0.52, 0.065], materials.trim, false);
      box(THREE, leaf, [leafWidth, 0.02, 0.12], [centreX, height * 0.52 + 0.07, 0.03], materials.trim, false);
      const brace = tbox(THREE, leaf, [0.1, Math.hypot(leafWidth, height * 0.4) - 0.16, 0.03], [centreX, height * 0.26, 0.08], materials.trim, false);
      brace.rotation.z = side * Math.atan2(leafWidth, height * 0.4);
    } else {
      const brace = tbox(THREE, leaf, [0.1, Math.hypot(leafWidth, height * 0.62) - 0.2, 0.03], [centreX, height / 2, 0.08], materials.trim, false);
      brace.rotation.z = side * Math.atan2(leafWidth, height * 0.62);
    }
    ironmongery(THREE, leaf, side, leafWidth, height, 0.09);
  } else {
    // A panelled house door: four raised panels, a brass knob and a knocker.
    for (const [y, h] of [[0.72, 0.36], [0.28, 0.3]] as const) {
      for (const dx of [-0.25, 0.25]) {
        tbox(THREE, leaf, [leafWidth * 0.36, height * h, 0.025], [centreX + dx * leafWidth, height * y, 0.055], materials.trim, false);
        box(THREE, leaf, [leafWidth * 0.3, height * h - 0.06, 0.012], [centreX + dx * leafWidth, height * y, 0.07], materials.leaf, false);
      }
    }
    const brass = standard(THREE, "#d8c060", 0.35, 0.8);
    sphere(THREE, leaf, 0.035, [-side * (leafWidth - 0.14), height * 0.47, 0.08], brass);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 8, 18), brass);
    ring.position.set(centreX, height * 0.62, 0.075);
    leaf.add(ring);
  }
}

/**
 * The door leaves: one on each jamb for a double door, one on the −x jamb for
 * a single, hinged on the outer edge and swinging outward (+z). The swing is
 * eased by `update(dt)` each frame and the world asks `isOpen()` to know
 * which way the next E goes.
 */
function createDoorLeaves(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, style: LeafStyle, materials: Readonly<{ leaf: any; trim: any }>): BuildingDoors {
  const shell = definition.shell!;
  const door = shell.door!;
  const at = doorLocal(definition);
  const sides: ReadonlyArray<-1 | 1> = door.leaves === 2 ? [-1, 1] : [-1];
  const leafWidth = door.leaves === 2 ? door.width / 2 - 0.02 : door.width - 0.03;
  const hinges: Array<{ node: any; angle: number }> = [];
  for (const side of sides) {
    const hinge = new THREE.Group();
    hinge.position.set(at.x + side * door.width / 2, 0, at.z);
    hinge.userData.restY = 0;
    hinge.userData.doorLeaf = true;
    const leaf = new THREE.Group();
    drawLeaf(THREE, leaf, style, side, leafWidth, door.height, materials);
    hinge.add(leaf);
    group.add(hinge);
    // A leaf on the −x jamb extends toward +x; three's y-rotation maps (x, z) → (x cos θ + z sin θ, −x sin θ + z cos θ),
    // so a NEGATIVE angle carries that edge to +z — out of the building. The +x jamb's leaf mirrors it.
    hinges.push({ node: hinge, angle: side * DOOR_SWING });
  }
  return createSwing(hinges);
}

type RoofMaterials = Readonly<{ roof: any; gable: any; fascia: any }>;

/**
 * A pitched slab from the eave to the ridge, in a frame where the ridge runs
 * along x: `run` and `rise` set the pitch, `side` which slope. Rafter tails
 * show under the eave and a fascia board closes it.
 */
function roofSlope(THREE: ThreeNamespace, group: any, along: number, run: number, rise: number, eaveY: number, side: -1 | 1, materials: RoofMaterials, thickness: number): void {
  const pitch = Math.atan2(rise, run);
  const slabLength = Math.hypot(run, rise);
  const slab = tbox(THREE, group, [along, thickness, slabLength], [0, eaveY + rise / 2, side * run / 2], materials.roof);
  slab.rotation.x = side * pitch;
  // The fascia along the eave, and rafter tails under it.
  const fascia = tbox(THREE, group, [along, 0.14, 0.04], [0, eaveY - 0.02, side * (run + 0.02)], materials.fascia, false);
  fascia.rotation.x = side * pitch;
  const tails = Math.max(2, Math.round(along / 0.6));
  for (let index = 0; index <= tails; index += 1) {
    const x = -along / 2 + 0.1 + (index / tails) * (along - 0.2);
    const tail = tbox(THREE, group, [0.07, 0.1, 0.7], [x, eaveY - 0.08 + rise * (0.35 / run) * 0.5, side * (run - 0.35)], materials.fascia, false);
    tail.rotation.x = side * pitch;
  }
}

/**
 * A gable roof: two pitched slopes meeting on a ridge, with a ridge cap,
 * rafter tails and fascia at the eaves, and triangular gable fills at each
 * end. `ridge` says which axis the ridge runs along ("x" is the default; "z"
 * puts the gables over the door face, the way a barn's are).
 */
function gableRoof(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, rise: number, overhang: number, materials: RoofMaterials, options: Readonly<{ thickness?: number; ridge?: "x" | "z"; endOverhang?: number }> = {}): number {
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const ridge = options.ridge ?? "x";
  const thickness = options.thickness ?? 0.16;
  const endOverhang = options.endOverhang ?? overhang;
  const alongSpan = ridge === "x" ? width : depth;
  const acrossSpan = ridge === "x" ? depth : width;
  const frame = new THREE.Group();
  if (ridge === "z") frame.rotation.y = Math.PI / 2;
  const run = acrossSpan / 2 + overhang;
  const ridgeY = shell.wallHeight + rise;
  for (const side of [-1, 1] as const) roofSlope(THREE, frame, alongSpan + endOverhang * 2, run, rise, shell.wallHeight, side, materials, thickness);
  // Ridge cap.
  tbox(THREE, frame, [alongSpan + endOverhang * 2 + 0.1, thickness + 0.04, 0.36], [0, ridgeY + 0.05, 0], materials.roof);
  // Gable fills: the wall's own material, up to the underside of the slopes, with a barge board along the edge.
  const gable = new THREE.Shape();
  gable.moveTo(-acrossSpan / 2, shell.wallHeight - 0.01);
  gable.lineTo(acrossSpan / 2, shell.wallHeight - 0.01);
  gable.lineTo(0, ridgeY - thickness * 0.4);
  gable.closePath();
  const geometry = new THREE.ExtrudeGeometry(gable, { depth: shell.wallThickness, bevelEnabled: false });
  for (const side of [-1, 1] as const) {
    // The shape is drawn in the (z, y) plane; ±90° about y stands it across the building's end, extruded inward.
    const fill = tmesh(THREE, frame, geometry, materials.gable);
    fill.rotation.y = side * Math.PI / 2;
    fill.position.set(side * (alongSpan / 2 - shell.wallThickness), 0, 0);
    // Barge boards along the gable's edge.
    const pitch = Math.atan2(rise, run);
    for (const slope of [-1, 1] as const) {
      const board = tbox(THREE, frame, [0.05, 0.16, Math.hypot(run, rise) + 0.1], [side * (alongSpan / 2 + endOverhang + 0.01), shell.wallHeight + rise / 2 - 0.06, slope * run / 2], materials.fascia, false);
      board.rotation.x = slope * pitch;
    }
  }
  group.add(frame);
  return ridgeY;
}

/**
 * A gambrel (barn) roof in the `ridge` frame: a steep lower slope, a shallow
 * upper slope, each side, with the gable fills shaped to match. Returns the
 * profile as (across, y) points so a builder can hang things in the gable.
 */
function gambrelRoof(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, rise: number, overhang: number, materials: RoofMaterials, ridge: "x" | "z" = "z"): Readonly<{ ridgeY: number; kneeY: number; kneeAcross: number }> {
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const thickness = 0.16;
  const alongSpan = ridge === "x" ? width : depth;
  const acrossSpan = ridge === "x" ? depth : width;
  const frame = new THREE.Group();
  if (ridge === "z") frame.rotation.y = Math.PI / 2;
  const half = acrossSpan / 2;
  const kneeAcross = half * 0.55;
  const kneeY = shell.wallHeight + rise * 0.62;
  const ridgeY = shell.wallHeight + rise;
  const along = alongSpan + overhang * 2;
  for (const side of [-1, 1] as const) {
    // Lower slope: from the eave (past the wall by the overhang) up to the knee.
    const lowerRun = half + overhang - kneeAcross;
    const lowerRise = kneeY - (shell.wallHeight - overhang * 0.3);
    const lowerPitch = Math.atan2(lowerRise, lowerRun);
    const lower = tbox(THREE, frame, [along, thickness, Math.hypot(lowerRun, lowerRise) + 0.1], [0, (shell.wallHeight - overhang * 0.3 + kneeY) / 2, side * (kneeAcross + lowerRun / 2)], materials.roof);
    lower.rotation.x = side * lowerPitch;
    // Upper slope: knee to ridge.
    const upperRun = kneeAcross;
    const upperRise = ridgeY - kneeY;
    const upperPitch = Math.atan2(upperRise, upperRun);
    const upper = tbox(THREE, frame, [along, thickness, Math.hypot(upperRun, upperRise) + 0.1], [0, (kneeY + ridgeY) / 2, side * (kneeAcross / 2)], materials.roof);
    upper.rotation.x = side * upperPitch;
    // Fascia and rafter tails at the eave.
    const eaveY = shell.wallHeight - overhang * 0.3;
    const fascia = tbox(THREE, frame, [along, 0.16, 0.05], [0, eaveY - 0.02, side * (half + overhang + 0.02)], materials.fascia, false);
    fascia.rotation.x = side * lowerPitch;
    const tails = Math.round(along / 0.6);
    for (let index = 0; index <= tails; index += 1) {
      const x = -along / 2 + 0.1 + (index / tails) * (along - 0.2);
      const tail = tbox(THREE, frame, [0.08, 0.12, 0.6], [x, eaveY + 0.1, side * (half + overhang - 0.3)], materials.fascia, false);
      tail.rotation.x = side * lowerPitch;
    }
  }
  tbox(THREE, frame, [along + 0.1, thickness + 0.04, 0.4], [0, ridgeY + 0.05, 0], materials.roof);
  // Gable fills in the wall's material, following the gambrel profile.
  const gable = new THREE.Shape();
  gable.moveTo(-half, shell.wallHeight - 0.01);
  gable.lineTo(half, shell.wallHeight - 0.01);
  gable.lineTo(kneeAcross, kneeY - 0.05);
  gable.lineTo(0, ridgeY - 0.08);
  gable.lineTo(-kneeAcross, kneeY - 0.05);
  gable.closePath();
  const geometry = new THREE.ExtrudeGeometry(gable, { depth: shell.wallThickness, bevelEnabled: false });
  for (const side of [-1, 1] as const) {
    const fill = tmesh(THREE, frame, geometry, materials.gable);
    fill.rotation.y = side * Math.PI / 2;
    fill.position.set(side * (alongSpan / 2 - shell.wallThickness), 0, 0);
    // Barge boards down both breaks of the profile.
    for (const slope of [-1, 1] as const) {
      const lowerRun = half + overhang - kneeAcross;
      const lowerRise = kneeY - (shell.wallHeight - overhang * 0.3);
      const b1 = tbox(THREE, frame, [0.05, 0.16, Math.hypot(lowerRun, lowerRise) + 0.06], [side * (alongSpan / 2 + overhang + 0.01), (shell.wallHeight - overhang * 0.3 + kneeY) / 2 - 0.06, slope * (kneeAcross + lowerRun / 2)], materials.fascia, false);
      b1.rotation.x = slope * Math.atan2(lowerRise, lowerRun);
      const b2 = tbox(THREE, frame, [0.05, 0.16, Math.hypot(kneeAcross, ridgeY - kneeY) + 0.06], [side * (alongSpan / 2 + overhang + 0.01), (kneeY + ridgeY) / 2 - 0.06, slope * kneeAcross / 2], materials.fascia, false);
      b2.rotation.x = slope * Math.atan2(ridgeY - kneeY, kneeAcross);
    }
  }
  group.add(frame);
  return { ridgeY, kneeY, kneeAcross };
}

/** A hip roof: four slopes from the eaves up to a short ridge along x, built as one mesh with metre UVs, over an eave board and rafter tails. */
function hipRoof(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, rise: number, overhang: number, materials: RoofMaterials): void {
  const { width, depth } = definition.footprint;
  const wallHeight = definition.shell!.wallHeight;
  const hw = width / 2 + overhang;
  const hd = depth / 2 + overhang;
  const y0 = wallHeight;
  const y1 = wallHeight + rise;
  const ridge = Math.max(0, hw - hd);
  // Corners clockwise from the front-left, then the two ridge ends.
  const c = [[-hw, y0, hd], [hw, y0, hd], [hw, y0, -hd], [-hw, y0, -hd]] as const;
  const r0 = [-ridge, y1, 0] as const;
  const r1 = [ridge, y1, 0] as const;
  const triangles: ReadonlyArray<readonly [readonly number[], readonly number[], readonly number[]]> = [
    [c[0], c[1], r1], [c[0], r1, r0],   // front slope
    [c[2], c[3], r0], [c[2], r0, r1],   // back slope
    [c[1], c[2], r1],                   // east hip
    [c[3], c[0], r0],                   // west hip
  ];
  const positions = new Float32Array(triangles.flatMap((triangle) => triangle.flatMap((vertex) => [...vertex])));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(triangles.length * 6), 2));
  geometry.computeVertexNormals();
  tmesh(THREE, group, geometry, materials.roof);
  // The same roof again a hair lower and inset, so the slab has a visible thickness at the eaves.
  const under = new THREE.BufferGeometry();
  under.setAttribute("position", new THREE.BufferAttribute(positions.map((value, index) => (index % 3 === 1 ? value - 0.14 : value)), 3));
  under.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(triangles.length * 6), 2));
  under.computeVertexNormals();
  tmesh(THREE, group, under, materials.roof);
  // Fascia round the eaves and rafter tails under it.
  for (const [length, x, z, rot] of [[width + overhang * 2, 0, hd, 0], [width + overhang * 2, 0, -hd, 0], [depth + overhang * 2, hw, 0, Math.PI / 2], [depth + overhang * 2, -hw, 0, Math.PI / 2]] as const) {
    const board = tbox(THREE, group, [length, 0.16, 0.05], [x, wallHeight - 0.08, z], materials.fascia, false);
    board.rotation.y = rot;
  }
  for (let x = -width / 2 + 0.3; x < width / 2; x += 0.6) for (const z of [hd - 0.3, -hd + 0.3]) tbox(THREE, group, [0.08, 0.1, 0.6], [x, wallHeight - 0.06, z], materials.fascia, false);
  for (let z = -depth / 2 + 0.3; z < depth / 2; z += 0.6) for (const x of [hw - 0.3, -hw + 0.3]) tbox(THREE, group, [0.6, 0.1, 0.08], [x, wallHeight - 0.06, z], materials.fascia, false);
  // Ridge tiles.
  if (ridge > 0.1) tbox(THREE, group, [ridge * 2 + 0.3, 0.12, 0.3], [0, y1 + 0.04, 0], materials.roof, false);
}

/** A hanging lantern: a warm point light in a little glass-and-iron body on a chain, so no interior is a cave in daylight. */
function roomLight(THREE: ThreeNamespace, group: any, position: readonly [number, number, number], intensity: number, distance: number, anchorY: number): void {
  const light = new THREE.PointLight(0xffd9a0, intensity, distance, 1.6);
  light.position.set(position[0], position[1], position[2]);
  group.add(light);
  const body = iron(THREE);
  const glass = new THREE.MeshStandardMaterial({ color: "#ffe2a8", emissive: "#ffb347", emissiveIntensity: 1.6, roughness: 0.3, transparent: true, opacity: 0.85 });
  cylinder(THREE, group, 0.1, 0.06, 0.06, [position[0], position[1] + 0.14, position[2]], body, 8);
  cylinder(THREE, group, 0.07, 0.07, 0.2, [position[0], position[1], position[2]], glass, 8);
  cylinder(THREE, group, 0.09, 0.09, 0.03, [position[0], position[1] - 0.12, position[2]], body, 8);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    box(THREE, group, [0.012, 0.22, 0.012], [position[0] + Math.cos(angle) * 0.07, position[1], position[2] + Math.sin(angle) * 0.07], body, false);
  }
  const chain = hangingLightChain(position[1], anchorY);
  const suspension = cylinder(THREE, group, 0.008, 0.008, chain.height, [position[0], chain.centreY, position[2]], body, 4, false);
  suspension.userData.farmHangingLight = Object.freeze({ lanternY: position[1], anchorY: chain.topY });
}

/** A lamp on the wall beside a door, lit. */
function wallLantern(THREE: ThreeNamespace, group: any, position: readonly [number, number, number], rotationY: number): void {
  const lamp = new THREE.Group();
  lamp.position.set(...position);
  lamp.rotation.y = rotationY;
  const body = iron(THREE);
  box(THREE, lamp, [0.04, 0.14, 0.1], [0, 0.18, 0.05], body, false);
  box(THREE, lamp, [0.03, 0.03, 0.18], [0, 0.22, 0.13], body, false);
  const glass = new THREE.MeshStandardMaterial({ color: "#ffe2a8", emissive: "#ffb347", emissiveIntensity: 1.4, roughness: 0.3 });
  box(THREE, lamp, [0.12, 0.16, 0.12], [0, 0.1, 0.2], glass, false);
  box(THREE, lamp, [0.16, 0.03, 0.16], [0, 0.2, 0.2], body, false);
  box(THREE, lamp, [0.16, 0.03, 0.16], [0, 0.01, 0.2], body, false);
  const light = new THREE.PointLight(0xffc27a, 2.2, 5, 1.8);
  light.position.set(0, 0.1, 0.3);
  lamp.add(light);
  group.add(lamp);
}

type WindowOptions = Readonly<{ shutters?: any; flowerBox?: boolean; muntins?: readonly [number, number]; sill?: boolean }>;

/**
 * A window in a wall: a recessed pane behind a frame with muntins and a
 * sill, and when asked a pair of louvred shutters and a flower box under it.
 * `position` is the wall's outer face; the window faces +z in its own frame,
 * turned by `rotationY`.
 */
function paneWindow(THREE: ThreeNamespace, group: any, size: readonly [number, number], position: readonly [number, number, number], rotationY: number, frame: any, options: WindowOptions = {}): void {
  const win = new THREE.Group();
  win.position.set(...position);
  win.rotation.y = rotationY;
  const [w, h] = size;
  box(THREE, win, [w, h, 0.03], [0, 0, -0.02], paneGlass(THREE), false);
  // Frame: four boards round the pane, standing proud of the wall.
  const f = 0.07;
  tbox(THREE, win, [w + f * 2, f, 0.08], [0, h / 2 + f / 2, 0.02], frame, false);
  tbox(THREE, win, [w + f * 2, f, 0.08], [0, -h / 2 - f / 2, 0.02], frame, false);
  tbox(THREE, win, [f, h, 0.08], [-w / 2 - f / 2, 0, 0.02], frame, false);
  tbox(THREE, win, [f, h, 0.08], [w / 2 + f / 2, 0, 0.02], frame, false);
  const [columns, rows] = options.muntins ?? [2, 2];
  for (let index = 1; index < columns; index += 1) box(THREE, win, [0.035, h, 0.04], [-w / 2 + (w / columns) * index, 0, 0.0], frame, false);
  for (let index = 1; index < rows; index += 1) box(THREE, win, [w, 0.035, 0.04], [0, -h / 2 + (h / rows) * index, 0.0], frame, false);
  if (options.sill !== false) tbox(THREE, win, [w + f * 2 + 0.1, 0.06, 0.16], [0, -h / 2 - f - 0.03, 0.06], frame, false);
  if (options.shutters) {
    for (const side of [-1, 1] as const) {
      const shutter = new THREE.Group();
      shutter.position.set(side * (w / 2 + f + w * 0.24), 0, 0.04);
      tbox(THREE, shutter, [w * 0.46, h + f * 2, 0.05], [0, 0, 0], options.shutters, false);
      const slats = Math.max(3, Math.round(h / 0.12));
      for (let index = 0; index < slats; index += 1) {
        const slat = box(THREE, shutter, [w * 0.36, 0.03, 0.02], [0, -h / 2 + (index + 0.5) * (h / slats), 0.03], standard(THREE, "#2a3a2e", 1, 0), false);
        slat.rotation.x = 0.5;
      }
      win.add(shutter);
    }
  }
  if (options.flowerBox) {
    const wood = timber(THREE);
    tbox(THREE, win, [w + 0.1, 0.2, 0.22], [0, -h / 2 - f - 0.17, 0.12], wood, false);
    const petals = ["#ff6f91", "#ffd33d", "#ff8a2b", "#c96fd8"];
    for (let index = 0; index < 6; index += 1) {
      const x = -w / 2 + (index + 0.5) * (w / 6);
      sphere(THREE, win, 0.06, [x, -h / 2 - f - 0.02, 0.12], standard(THREE, "#4f9a3a", 0.9, 0));
      sphere(THREE, win, 0.035, [x, -h / 2 - f + 0.04, 0.16], standard(THREE, petals[index % petals.length]!, 0.7, 0));
    }
  }
  group.add(win);
}

/** A cupola on a ridge: a little louvred tower with its own roof and a weathervane. */
function cupola(THREE: ThreeNamespace, group: any, position: readonly [number, number, number], size: number, materials: Readonly<{ wall: any; roof: any; trim: any }>): void {
  const tower = new THREE.Group();
  tower.position.set(...position);
  const h = size * 1.2;
  tbox(THREE, tower, [size, h, size], [0, h / 2, 0], materials.wall);
  for (const x of [-size / 2, size / 2]) for (const z of [-size / 2, size / 2]) box(THREE, tower, [0.06, h, 0.06], [x, h / 2, z], materials.trim, false);
  // Louvres on each face.
  for (let side = 0; side < 4; side += 1) {
    const angle = side * Math.PI / 2;
    for (let index = 0; index < 4; index += 1) {
      const louvre = box(THREE, tower, [size * 0.6, 0.03, 0.05], [Math.sin(angle) * (size / 2 + 0.01), h * 0.25 + index * h * 0.15, Math.cos(angle) * (size / 2 + 0.01)], materials.trim, false);
      louvre.rotation.y = angle;
      louvre.rotation.x = 0.5;
    }
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(size * 0.85, size * 0.7, 4), materials.roof);
  cap.position.y = h + size * 0.35;
  cap.rotation.y = Math.PI / 4;
  cap.castShadow = true;
  tower.add(cap);
  weathervane(THREE, tower, [0, h + size * 0.7, 0]);
  group.add(tower);
}

/** A weathervane: a rod, the four points, and a rooster silhouette on top. */
function weathervane(THREE: ThreeNamespace, group: any, position: readonly [number, number, number]): void {
  const metal = iron(THREE);
  const vane = new THREE.Group();
  vane.position.set(...position);
  cylinder(THREE, vane, 0.015, 0.015, 0.8, [0, 0.4, 0], metal, 6, false);
  for (const angle of [0, Math.PI / 2]) {
    const bar = cylinder(THREE, vane, 0.01, 0.01, 0.5, [0, 0.35, 0], metal, 6, false);
    bar.rotation.z = Math.PI / 2;
    bar.rotation.y = angle;
  }
  sphere(THREE, vane, 0.035, [0, 0.35, 0], standard(THREE, "#d8c060", 0.35, 0.8));
  // The rooster: body, tail, head, comb.
  const bird = new THREE.Group();
  bird.position.y = 0.62;
  bird.rotation.y = 0.6;
  const body = sphere(THREE, bird, 0.09, [0, 0, 0], metal);
  body.scale.set(1.3, 0.8, 0.4);
  const tail = box(THREE, bird, [0.16, 0.18, 0.03], [-0.13, 0.1, 0], metal, false);
  tail.rotation.z = 0.6;
  sphere(THREE, bird, 0.045, [0.13, 0.08, 0], metal);
  box(THREE, bird, [0.06, 0.05, 0.02], [0.13, 0.14, 0], metal, false);
  box(THREE, bird, [0.06, 0.02, 0.02], [0.2, 0.07, 0], metal, false);
  vane.add(bird);
  group.add(vane);
}

/** A stone chimney with a cap and pot. */
function chimney(THREE: ThreeNamespace, group: any, position: readonly [number, number, number], height: number, width = 0.6): void {
  tbox(THREE, group, [width, height, width], [position[0], position[1] + height / 2, position[2]], stone(THREE));
  tbox(THREE, group, [width + 0.14, 0.1, width + 0.14], [position[0], position[1] + height + 0.05, position[2]], stone(THREE), false);
  tcylinder(THREE, group, 0.12, 0.14, 0.4, [position[0], position[1] + height + 0.3, position[2]], farmMaterial(THREE, "brick", { colors: ["#8a4a3a", "#5a2a20", "#b06a55", "#9a8a7a"], metresPerTile: 0.5 }), 10);
}

/** Interior plank lines on the inside faces of a box shell, so a wall is boards from inside as well as out. */
function interiorStuds(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, material: any, spacing = 0.6): void {
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  for (let x = -halfW + t + spacing / 2; x < halfW - t; x += spacing) {
    tbox(THREE, group, [0.08, shell.wallHeight - 0.1, 0.06], [x, shell.wallHeight / 2, -halfD + t + 0.03], material, false);
  }
  for (let z = -halfD + t + spacing / 2; z < halfD - t; z += spacing) {
    for (const x of [-halfW + t + 0.03, halfW - t - 0.03]) tbox(THREE, group, [0.06, shell.wallHeight - 0.1, 0.08], [x, shell.wallHeight / 2, z], material, false);
  }
  // A top plate all round.
  tbox(THREE, group, [width - t * 2, 0.1, 0.1], [0, shell.wallHeight - 0.05, -halfD + t + 0.05], material, false);
  for (const x of [-halfW + t + 0.05, halfW - t - 0.05]) tbox(THREE, group, [0.1, 0.1, depth - t * 2], [x, shell.wallHeight - 0.05, 0], material, false);
}

// ---------------------------------------------------------------------------
// The buildings.

/**
 * The barn: red board-and-batten over a stone plinth, a gambrel roof in dark
 * shingles with the gable over the doors, a hay-loft door under a hay hood
 * and pulley, a cupola with a weathervane, crossed-brace doors, and inside a
 * hay pile, a workbench, the loft with its ladder and lanterns.
 */
export function createBarn(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  const red = farmMaterial(THREE, "battens");
  const trim = paintedWood(THREE, TRIM);
  const roof = farmMaterial(THREE, "shingles");
  const fascia = paint(THREE, TRIM);
  foundation(THREE, group, definition, 0.4);
  tbox(THREE, group, [width - t * 2, 0.06, depth - t * 2], [0, 0.03, 0], farmMaterial(THREE, "wood", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 2 }));
  drawShell(THREE, group, definition, { wall: red, trim }, { cornerBoards: true });
  const profile = gambrelRoof(THREE, group, definition, 2.6, 0.45, { roof, gable: red, fascia }, "z");
  // The hay-loft door in the +z gable over the main doors, with a hay hood and a pulley beam.
  const loftDoorY = shell.wallHeight + 0.9;
  tbox(THREE, group, [1.1, 1.3, 0.1], [0, loftDoorY, halfD + 0.02], timber(THREE), false);
  tbox(THREE, group, [1.3, 0.12, 0.14], [0, loftDoorY + 0.72, halfD + 0.04], trim, false);
  for (const x of [-0.6, 0.6]) tbox(THREE, group, [0.12, 1.45, 0.14], [x, loftDoorY, halfD + 0.04], trim, false);
  const brace = tbox(THREE, group, [0.1, 1.5, 0.03], [0, loftDoorY, halfD + 0.09], trim, false);
  brace.rotation.z = 0.7;
  const beam = tbox(THREE, group, [0.14, 0.14, 1.4], [0, profile.ridgeY - 0.5, halfD + 0.6], timber(THREE));
  beam.castShadow = true;
  const pulley = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), iron(THREE));
  pulley.position.set(0, profile.ridgeY - 0.66, halfD + 1.2);
  group.add(pulley);
  cylinder(THREE, group, 0.01, 0.01, 1.0, [0, profile.ridgeY - 1.2, halfD + 1.2], standard(THREE, "#c9b99c", 0.9, 0), 4, false);
  // Hay hood: a little gable over the beam.
  for (const side of [-1, 1] as const) {
    const hood = tbox(THREE, group, [1.3, 0.1, 1.5], [side * 0.55, profile.ridgeY - 0.3, halfD + 0.45], roof);
    hood.rotation.z = -side * 0.8;
  }
  tbox(THREE, group, [0.1, 0.16, 1.5], [0, profile.ridgeY + 0.08, halfD + 0.45], roof, false);
  cupola(THREE, group, [0, profile.ridgeY + 0.1, 0], 0.7, { wall: trim, roof, trim: fascia });
  // A white X on each long side wall, and windows either side of the doors and along the sides.
  for (const side of [-1, 1] as const) {
    for (const sign of [1, -1] as const) {
      const bar = tbox(THREE, group, [0.05, 2.2, 0.12], [side * (halfW + 0.03), shell.wallHeight / 2, 0], trim, false);
      bar.rotation.x = sign * 0.75;
    }
    paneWindow(THREE, group, [0.8, 0.7], [side * (halfW + 0.02), 2.2, -1.8], side * Math.PI / 2, trim, { muntins: [2, 2] });
    paneWindow(THREE, group, [0.8, 0.7], [side * (halfW + 0.02), 2.2, 1.8], side * Math.PI / 2, trim, { muntins: [2, 2] });
  }
  for (const x of [-halfW + 1.1, halfW - 1.1]) paneWindow(THREE, group, [0.7, 0.7], [x, 2.2, halfD + 0.02], 0, trim, { muntins: [2, 2] });
  for (const x of [-halfW + 1.4, halfW - 1.4]) wallLantern(THREE, group, [x, shell.door!.height + 0.3, halfD + 0.02], 0);
  // Inside, every piece where the fixture list puts it.
  const hay = farmMaterial(THREE, "straw");
  const hayPile = fixtureNamed(definition, "hay-pile");
  drawFixtureBox(THREE, group, hayPile, hay, { top: hayPile.top * 0.55 });
  const mound = tsphere(THREE, group, hayPile.width * 0.42, [hayPile.x - 0.2, hayPile.top * 0.55, hayPile.z], hay);
  mound.scale.set(1, hayPile.top * 0.45 / (hayPile.width * 0.42), hayPile.depth / hayPile.width);
  const wood = timber(THREE);
  drawWorkbench(THREE, group, fixtureNamed(definition, "workbench"), wood);
  // Tools on the bench.
  const bench = fixtureNamed(definition, "workbench");
  cylinder(THREE, group, 0.02, 0.02, 0.5, [bench.x, bench.top + 0.03, bench.z + 0.5], standard(THREE, "#c9b99c", 0.9, 0), 6).rotation.z = Math.PI / 2;
  box(THREE, group, [0.12, 0.05, 0.18], [bench.x, bench.top + 0.03, bench.z - 0.4], iron(THREE), false);
  drawPlatform(THREE, group, fixtureNamed(definition, "loft"), farmMaterial(THREE, "wood", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 2 }));
  drawLadder(THREE, group, fixtureNamed(definition, "ladder"), wood);
  const loftHay = fixtureNamed(definition, "loft-hay");
  drawFixtureBox(THREE, group, loftHay, hay, { inset: 0.05 });
  for (const y of [loftHay.bottom + 0.27, loftHay.bottom + 0.55]) for (const dx of [-0.4, 0.4]) tbox(THREE, group, [0.05, 0.03, loftHay.depth - 0.06], [loftHay.x + dx, y, loftHay.z], standard(THREE, "#a07a28", 1, 0), false);
  interiorStuds(THREE, group, definition, wood);
  const barnCeilingAt = (x: number) => gambrelRoofHeightAt({ wallHeight: shell.wallHeight, rise: 2.6, halfSpan: halfW, overhang: 0.45, across: x }) - 0.12;
  roomLight(THREE, group, [0, shell.wallHeight - 0.4, 0.6], 9, 11, barnCeilingAt(0));
  const sideLightX = -halfW + t + 1.2;
  roomLight(THREE, group, [sideLightX, shell.wallHeight - 1.2, -halfD + t + 2.2], 4, 7, barnCeilingAt(sideLightX));
  roomLight(THREE, group, [0, shell.wallHeight + 1.4, -halfD + t + 0.8], 4, 6, barnCeilingAt(0));
  const doors = createDoorLeaves(THREE, group, definition, "barn", { leaf: farmMaterial(THREE, "battens", { colors: ["#7a2620", "#3a1410", "#a8312b", "#6a1f1a"] }), trim });
  return Object.freeze({ group, doors, fixtureDoors: {}, animate: null });
}

/**
 * The stable: dark timber framing over lighter planks, a shingle gable roof
 * with a deep front overhang over the stall windows, dutch doors, a horseshoe
 * over the door, and inside three stalls with swinging half-doors, straw,
 * a saddle rack and hay nets.
 */
export function createStable(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  const planks = farmMaterial(THREE, "planks", { colors: ["#9a6a3c", "#5a3a1f", "#c9955a", "#3a2412"] });
  const dark = timber(THREE, "#4a3220");
  const trim = timber(THREE, "#3a2616");
  const roof = farmMaterial(THREE, "shingles", { colors: ["#5a4a3a", "#3a2e22", "#7a6a55", "#22180f"] });
  foundation(THREE, group, definition, 0.3);
  tbox(THREE, group, [width - t * 2, 0.06, depth - t * 2], [0, 0.03, 0], farmMaterial(THREE, "soil", { colors: ["#6a5030", "#4a3420", "#9a7a50"] }));
  drawShell(THREE, group, definition, { wall: planks, trim }, { cornerBoards: true });
  gableRoof(THREE, group, definition, 1.5, 0.9, { roof, gable: planks, fascia: paint(THREE, "#3a2616") }, { endOverhang: 0.5 });
  // Half-timbering: dark studs and diagonal braces over the outside of every wall.
  for (const z of [halfD + 0.01, -halfD - 0.01]) {
    for (let x = -halfW + 1; x < halfW - 0.5; x += 1) {
      if (z > 0 && Math.abs(x) < shell.door!.width / 2 + 0.3) continue;
      tbox(THREE, group, [0.12, shell.wallHeight - 0.1, 0.06], [x, shell.wallHeight / 2, z], dark, false);
    }
    for (const side of [-1, 1] as const) {
      const brace = tbox(THREE, group, [0.1, 1.9, 0.05], [side * (halfW - 0.55), shell.wallHeight * 0.5, z], dark, false);
      brace.rotation.z = side * 0.45;
    }
  }
  for (const x of [halfW + 0.01, -halfW - 0.01]) {
    for (let z = -halfD + 1; z < halfD - 0.5; z += 1) tbox(THREE, group, [0.06, shell.wallHeight - 0.1, 0.12], [x, shell.wallHeight / 2, z], dark, false);
  }
  // The rails: a top plate all round and a low rail that stops at the door jambs.
  wallBands(THREE, group, definition, dark, { y: shell.wallHeight - 0.07, height: 0.14, thickness: 0.06 });
  wallBands(THREE, group, definition, dark, { y: 0.37, height: 0.14, thickness: 0.06 });
  // Stall windows along the front, either side of the doors, with hay nets under them; a horseshoe over the door.
  for (const x of [-halfW + 1.5, halfW - 1.5]) {
    paneWindow(THREE, group, [1.0, 0.6], [x, 2.0, halfD + 0.02], 0, trim, { muntins: [3, 1] });
    paneWindow(THREE, group, [1.0, 0.6], [x, 2.0, -halfD - 0.02], Math.PI, trim, { muntins: [3, 1] });
  }
  const shoe = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 8, 16, Math.PI * 1.5), iron(THREE));
  shoe.position.set(0, shell.door!.height + 0.42, halfD + 0.06);
  shoe.rotation.z = -Math.PI * 0.75;
  group.add(shoe);
  wallLantern(THREE, group, [shell.door!.width / 2 + 0.5, shell.door!.height + 0.1, halfD + 0.02], 0);
  // A water bucket and a hay bale by the door, on the front wall.
  tcylinder(THREE, group, 0.16, 0.13, 0.3, [-shell.door!.width / 2 - 0.55, 0.15 + 0.3, halfD + 0.32], farmMaterial(THREE, "galvanised", { metresPerTile: 0.6 }), 12);
  // Inside: three stalls against the back wall — every wall, panel and door where the fixture list has it.
  const straw = farmMaterial(THREE, "straw");
  const fixtureDoors: Record<string, BuildingDoors> = {};
  for (const entry of farmFixtures(definition)) {
    if (entry.name.startsWith("stall-wall")) {
      drawFixtureBox(THREE, group, entry, planks);
      tbox(THREE, group, [0.08, entry.top, 0.08], [entry.x, entry.top / 2, entry.z + entry.depth / 2], dark, false);
      tbox(THREE, group, [0.06, 0.06, entry.depth], [entry.x, entry.top, entry.z], dark, false);
    }
    if (entry.name.startsWith("stall-front")) {
      drawFixtureBox(THREE, group, entry, planks, { top: entry.top - 0.06 });
      tbox(THREE, group, [entry.width, 0.06, entry.depth + 0.02], [entry.x, entry.top - 0.03, entry.z], dark, false);
      // Iron bars above the panel so the stall reads as a stall.
      for (let x = entry.x - entry.width / 2 + 0.12; x < entry.x + entry.width / 2; x += 0.12) cylinder(THREE, group, 0.012, 0.012, 0.7, [x, entry.top + 0.35, entry.z], iron(THREE), 6, false);
      tbox(THREE, group, [entry.width, 0.05, entry.depth + 0.02], [entry.x, entry.top + 0.7, entry.z], dark, false);
    }
    if (entry.kind === "door") {
      const stall = fixtureNamed(definition, entry.name.replace("door", "front"));
      const stallWidth = stall.width + entry.width;
      const centreX = (stall.x - stall.width / 2 + entry.x + entry.width / 2) / 2;
      tbox(THREE, group, [stallWidth - 0.1, 0.12, 1.4], [centreX, 0.16, entry.z - 0.87], straw, false);
      // A hay net hung on the stall's back wall.
      const net = tsphere(THREE, group, 0.22, [centreX, 1.1, entry.z - 1.5], straw);
      net.scale.set(1, 1.2, 0.6);
      fixtureDoors[entry.name] = drawFixtureDoor(THREE, group, entry, planks, (leaf, leafBox) => {
        tbox(THREE, leaf, [leafBox.width, 0.06, leafBox.depth + 0.02], [leafBox.centreX, leafBox.height - 0.03, 0], dark, false);
        tbox(THREE, leaf, [0.06, leafBox.height - 0.06, leafBox.depth + 0.02], [leafBox.centreX * 2 + entry.door!.hinge * 0.03, (leafBox.height - 0.06) / 2, 0], dark, false);
        const brace = tbox(THREE, leaf, [0.06, Math.hypot(leafBox.width, leafBox.height) - 0.2, 0.02], [leafBox.centreX, leafBox.height / 2, leafBox.depth / 2 + 0.01], dark, false);
        brace.rotation.z = Math.atan2(leafBox.width, leafBox.height);
        const bolt = box(THREE, leaf, [0.14, 0.03, 0.03], [leafBox.centreX * 2 * 0.9, leafBox.height * 0.6, leafBox.depth / 2 + 0.02], iron(THREE), false);
        bolt.castShadow = false;
      });
    }
  }
  // A saddle rack with a saddle on it, and a bridle on a peg.
  const rack = fixtureNamed(definition, "saddle-rack");
  drawFixtureBox(THREE, group, rack, dark, { bottom: rack.top - 0.05 });
  tbox(THREE, group, [0.06, rack.top - 0.05, 0.06], [rack.x, (rack.top - 0.05) / 2, rack.z], dark, false);
  const saddle = tsphere(THREE, group, 0.22, [rack.x, rack.top + 0.06, rack.z], farmMaterial(THREE, "wood", { colors: ["#5a2e14", "#2f1808", "#8a5a34"], metresPerTile: 0.5 }));
  saddle.scale.set(1, 0.45, 0.8);
  interiorStuds(THREE, group, definition, dark, 0.8);
  const stableCeiling = gableRoofHeightAt({ wallHeight: shell.wallHeight, rise: 1.5, run: depth / 2 + 0.9, across: 0.3 }) - 0.12;
  roomLight(THREE, group, [-width / 4, shell.wallHeight - 0.35, 0.3], 7, 9, stableCeiling);
  roomLight(THREE, group, [width / 4, shell.wallHeight - 0.35, 0.3], 7, 9, stableCeiling);
  const doors = createDoorLeaves(THREE, group, definition, "dutch", { leaf: planks, trim: dark });
  return Object.freeze({ group, doors, fixtureDoors, animate: null });
}

/**
 * The farmhouse: cream plaster with dark half-timbering over a stone plinth,
 * a clay-tile hip roof with a stone chimney, shuttered windows with flower
 * boxes, a porch step under a tiled awning, and a room to sit in by the
 * hearth.
 */
export function createCottage(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  const plaster = farmMaterial(THREE, "plaster");
  const beam = timber(THREE, "#4a3020");
  const tile = farmMaterial(THREE, "clay-tiles");
  const shutter = paintedWood(THREE, "#3f6a4a");
  foundation(THREE, group, definition, 0.5, 0.1);
  tbox(THREE, group, [width - t * 2, 0.06, depth - t * 2], [0, 0.03, 0], farmMaterial(THREE, "wood", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 2 }));
  drawShell(THREE, group, definition, { wall: plaster, trim: beam }, { cornerBoards: true });
  hipRoof(THREE, group, definition, 2.2, 0.55, { roof: tile, gable: plaster, fascia: paint(THREE, "#4a3020") });
  chimney(THREE, group, [halfW - 1.2, shell.wallHeight + 0.6, -halfD + 1.2], 1.9);
  // Half-timbering: a mid rail round the house, studs between the windows, braces at the corners.
  for (const z of [halfD + 0.01, -halfD - 0.01]) {
    for (const side of [-1, 1] as const) {
      const brace = tbox(THREE, group, [0.1, 1.4, 0.06], [side * (halfW - 0.5), 0.75, z], beam, false);
      brace.rotation.z = side * 0.55;
    }
  }
  // The mid rail stops at the door jambs; the top plate runs over the lintel.
  wallBands(THREE, group, definition, beam, { y: 1.15, height: 0.14, thickness: 0.07 });
  wallBands(THREE, group, definition, beam, { y: shell.wallHeight - 0.07, height: 0.14, thickness: 0.07 });
  // Windows: two on the front with shutters and flower boxes, one each side, one at the back.
  for (const x of [-halfW + 1.3, halfW - 1.3]) paneWindow(THREE, group, [0.8, 0.9], [x, 1.75, halfD + 0.02], 0, beam, { shutters: shutter, flowerBox: true, muntins: [2, 3] });
  paneWindow(THREE, group, [0.8, 0.9], [halfW + 0.02, 1.75, 0.6], Math.PI / 2, beam, { shutters: shutter, muntins: [2, 3] });
  paneWindow(THREE, group, [0.8, 0.9], [-halfW - 0.02, 1.75, -0.6], -Math.PI / 2, beam, { shutters: shutter, muntins: [2, 3] });
  paneWindow(THREE, group, [1.2, 0.9], [0, 1.75, -halfD - 0.02], Math.PI, beam, { muntins: [3, 3] });
  // Porch: a flagstone landing no taller than the threshold (the leaf swings over it), a tiled awning on brackets, a lantern by the door.
  tbox(THREE, group, [2.2, 0.08, 1.2], [0, 0.04, halfD + 0.6], stone(THREE));
  const awning = tbox(THREE, group, [2.0, 0.08, 0.9], [0, shell.door!.height + 0.55, halfD + 0.4], tile);
  awning.rotation.x = 0.4;
  for (const x of [-0.85, 0.85]) {
    tbox(THREE, group, [0.08, 0.08, 0.8], [x, shell.door!.height + 0.28, halfD + 0.4], beam, false);
    const strut = tbox(THREE, group, [0.08, 0.9, 0.08], [x, shell.door!.height - 0.1, halfD + 0.5], beam, false);
    strut.rotation.x = -0.75;
  }
  wallLantern(THREE, group, [shell.door!.width / 2 + 0.35, shell.door!.height - 0.3, halfD + 0.02], 0);
  // Inside: a rug, a table with two stools, a stone hearth with a fire, a dresser of crockery and a lamp.
  const rug = farmMaterial(THREE, "brick", { colors: ["#a83a3a", "#7a2828", "#c95a4a", "#d8b24a"], metresPerTile: 0.5 });
  tbox(THREE, group, [2.4, 0.02, 1.8], [0, 0.07, 0.2], rug, false);
  const table = fixtureNamed(definition, "table");
  drawFixtureBox(THREE, group, table, beam, { bottom: table.top - 0.06 });
  for (const [x, z] of [[-0.5, -0.3], [0.5, 0.3], [-0.5, 0.3], [0.5, -0.3]] as const) tbox(THREE, group, [0.06, table.top - 0.06, 0.06], [table.x + x, (table.top - 0.06) / 2, table.z + z], beam, false);
  // A jug and a loaf on the table.
  cylinder(THREE, group, 0.06, 0.05, 0.16, [table.x - 0.3, table.top + 0.08, table.z], standard(THREE, "#5a7fb0", 0.5, 0), 10);
  const loaf = sphere(THREE, group, 0.1, [table.x + 0.25, table.top + 0.05, table.z + 0.1], standard(THREE, "#c9955a", 0.9, 0));
  loaf.scale.set(1.4, 0.6, 0.8);
  drawStool(THREE, group, fixtureNamed(definition, "stool-north"), beam);
  drawStool(THREE, group, fixtureNamed(definition, "stool-south"), beam);
  const hearth = fixtureNamed(definition, "hearth");
  drawFixtureBox(THREE, group, hearth, stone(THREE));
  box(THREE, group, [0.8, 0.7, 0.2], [hearth.x, 0.5, hearth.z + 0.12], standard(THREE, "#1b1f24", 1, 0));
  tbox(THREE, group, [hearth.width + 0.2, 0.1, hearth.depth + 0.2], [hearth.x, hearth.top + 0.05, hearth.z], beam, false);
  for (const [dx, dz] of [[-0.15, 0.1], [0.12, 0.14], [0, 0.05]] as const) cylinder(THREE, group, 0.05, 0.05, 0.4, [hearth.x + dx, 0.2, hearth.z + dz], farmMaterial(THREE, "bark", { metresPerTile: 0.3 }), 7).rotation.z = Math.PI / 2;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: "#ff6a1a", emissiveIntensity: 2.2, transparent: true, opacity: 0.9 }));
  flame.position.set(hearth.x, 0.42, hearth.z + 0.12);
  group.add(flame);
  const ember = new THREE.PointLight(0xff8a2b, 3, 5, 1.8);
  ember.position.set(hearth.x, 0.5, hearth.z + 0.3);
  group.add(ember);
  // Wall beams, ceiling joists and a board ceiling inside (the hip roof is one-sided; from below it is the ceiling you see).
  interiorStuds(THREE, group, definition, beam, 1.0);
  for (let x = -halfW + t + 0.5; x < halfW - t; x += 0.7) tbox(THREE, group, [0.12, 0.14, depth - t * 2], [x, shell.wallHeight - 0.07, 0], beam, false);
  tbox(THREE, group, [width - t * 2, 0.04, depth - t * 2], [0, shell.wallHeight + 0.02, 0], farmMaterial(THREE, "planks", { colors: ["#d9cdb5", "#a8957a", "#f0e6d2", "#8a7a60"], metresPerTile: 1.2 }), false);
  roomLight(THREE, group, [0, shell.wallHeight - 0.4, 0.2], 5, 9, shell.wallHeight);
  const doors = createDoorLeaves(THREE, group, definition, "panel", { leaf: paintedWood(THREE, "#3f6a4a"), trim: paintedWood(THREE, "#2e5238") });
  return Object.freeze({ group, doors, fixtureDoors: {}, animate: null });
}

/** A greenhouse: a white frame with glass walls and a glass gable roof on a brick plinth, a gutter, a propped roof vent, and benches of pots along both sides. */
export function createGreenhouse(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  const frame = paintedWood(THREE, TRIM);
  const glass = glassMaterial(THREE, 0.3);
  tbox(THREE, group, [width, 0.12, depth], [0, 0.06, 0], farmMaterial(THREE, "brick", { colors: ["#8e8b82", "#6a675f", "#a8a59a", "#5a574f"], metresPerTile: 0.6 }));
  // Brick plinth, then glass walls drawn from the shell list, with frame posts every metre.
  const plinth = farmMaterial(THREE, "brick", { metresPerTile: 0.7 });
  for (const wall of shellWalls(definition, true)) {
    const mesh = tbox(THREE, group, [wall.length, 0.55, wall.thickness + 0.06], [wall.x, 0.275, wall.z], plinth);
    mesh.rotation.y = wall.rotationY;
  }
  // The sill plate on the plinth and the top plate under the eaves are RINGS on the walls, not slabs across the room.
  wallBands(THREE, group, definition, frame, { y: 0.58, height: 0.06, thickness: t + 0.1, offset: 0 });
  drawShell(THREE, group, definition, { wall: glass, trim: frame }, { cornerBoards: true });
  for (let x = -halfW + 1; x < halfW - 0.5; x += 1) {
    tbox(THREE, group, [0.07, shell.wallHeight, t + 0.05], [x, shell.wallHeight / 2, -halfD + t / 2], frame, false);
    if (Math.abs(x) > shell.door!.width / 2 + 0.2) tbox(THREE, group, [0.07, shell.wallHeight, t + 0.05], [x, shell.wallHeight / 2, halfD - t / 2], frame, false);
  }
  for (let z = -halfD + 0.9; z < halfD - 0.5; z += 0.9) {
    for (const x of [-halfW + t / 2, halfW - t / 2]) tbox(THREE, group, [t + 0.05, shell.wallHeight, 0.07], [x, shell.wallHeight / 2, z], frame, false);
  }
  // A horizontal rail halfway up every glass wall.
  tbox(THREE, group, [width + 0.02, 0.06, t + 0.04], [0, 1.5, -halfD + t / 2], frame, false);
  for (const x of [-halfW + t / 2, halfW - t / 2]) tbox(THREE, group, [t + 0.04, 0.06, depth], [x, 1.5, 0], frame, false);
  wallBands(THREE, group, definition, frame, { y: shell.wallHeight, height: 0.1, thickness: t + 0.08, offset: 0, shadow: true });
  // Gutters along the eaves with a downpipe at one corner.
  const gutter = standard(THREE, "#c9c9c9", 0.4, 0.5);
  for (const x of [-halfW - 0.06, halfW + 0.06]) cylinder(THREE, group, 0.05, 0.05, depth + 0.2, [x, shell.wallHeight + 0.02, 0], gutter, 8, false).rotation.x = Math.PI / 2;
  cylinder(THREE, group, 0.03, 0.03, shell.wallHeight, [halfW + 0.08, shell.wallHeight / 2, halfD - 0.2], gutter, 8, false);
  // Glass gable roof on a frame ridge, with a vent window propped open on one slope.
  const rise = 1.1;
  const run = halfW + 0.12;
  const pitch = Math.atan2(rise, run);
  const slabLength = Math.hypot(run, rise);
  const roofFrame = new THREE.Group();
  roofFrame.rotation.y = Math.PI / 2;
  for (const side of [-1, 1] as const) {
    const slab = box(THREE, roofFrame, [depth + 0.2, 0.03, slabLength], [0, shell.wallHeight + rise / 2, side * run / 2], glass, false);
    slab.rotation.x = side * pitch;
    for (let z = -halfD; z <= halfD + 0.01; z += 0.9) {
      const rafter = tbox(THREE, roofFrame, [0.07, 0.1, slabLength], [z, shell.wallHeight + rise / 2 + 0.03, side * run / 2], frame, false);
      rafter.rotation.x = side * pitch;
    }
    const purlin = tbox(THREE, roofFrame, [depth + 0.2, 0.06, 0.06], [0, shell.wallHeight + rise / 2 + 0.05, side * run / 2], frame, false);
    purlin.rotation.x = side * pitch;
  }
  // The vent: a pane on the +x slope propped up on a stay.
  const vent = new THREE.Group();
  vent.position.set(0.6, shell.wallHeight + rise * 0.72, run * 0.28);
  vent.rotation.x = pitch - 0.45;
  box(THREE, vent, [0.8, 0.03, 0.7], [0, 0, 0.35], glass, false);
  tbox(THREE, vent, [0.86, 0.06, 0.06], [0, 0, 0.7], frame, false);
  for (const x of [-0.4, 0.4]) tbox(THREE, vent, [0.06, 0.06, 0.7], [x, 0, 0.35], frame, false);
  roofFrame.add(vent);
  cylinder(THREE, roofFrame, 0.012, 0.012, 0.4, [0.6, shell.wallHeight + rise * 0.72 - 0.15, run * 0.28 + 0.6], iron(THREE), 6, false).rotation.x = 0.4;
  tbox(THREE, roofFrame, [depth + 0.3, 0.12, 0.14], [0, shell.wallHeight + rise, 0], frame);
  group.add(roofFrame);
  // Gable-end glass triangles with a frame post up the middle.
  const gable = new THREE.Shape();
  gable.moveTo(-run + 0.1, shell.wallHeight);
  gable.lineTo(run - 0.1, shell.wallHeight);
  gable.lineTo(0, shell.wallHeight + rise);
  gable.closePath();
  const geometry = new THREE.ExtrudeGeometry(gable, { depth: 0.03, bevelEnabled: false });
  for (const side of [-1, 1] as const) {
    const fill = new THREE.Mesh(geometry, glass);
    fill.position.set(0, 0, side * (halfD - 0.03) + (side < 0 ? 0 : 0));
    group.add(fill);
    tbox(THREE, group, [0.07, rise - 0.1, 0.08], [0, shell.wallHeight + rise / 2 - 0.05, side * halfD], frame, false);
    const board = tbox(THREE, group, [run * 2 - 0.2, 0.07, 0.08], [0, shell.wallHeight + 0.02, side * halfD], frame, false);
    board.castShadow = false;
  }
  // Benches of pots down both long walls, in the fixtures' boxes (the box reaches the top of the plants).
  const bench = timber(THREE, WOOD);
  const pot = farmMaterial(THREE, "brick", { colors: ["#b8623a", "#8a4a2a", "#d8825a", "#a8583a"], metresPerTile: 0.4 });
  const leaf = farmMaterial(THREE, "foliage", { colors: ["#4f9a3a", "#2f6428", "#7fc45a"], metresPerTile: 0.5 });
  const tomato = standard(THREE, "#d43a3a", 0.5, 0);
  let n = 0;
  for (const name of ["bench-west", "bench-east"]) {
    const entry = fixtureNamed(definition, name);
    drawWorkbench(THREE, group, { ...entry, top: 0.83 }, bench);
    for (let z = entry.z - entry.depth / 2 + 0.15; z < entry.z + entry.depth / 2 - 0.05; z += 0.42) {
      tcylinder(THREE, group, 0.13, 0.1, 0.24, [entry.x, 0.95, z], pot, 10);
      if (n % 3 === 2) {
        // A tomato cane with fruit.
        cylinder(THREE, group, 0.012, 0.012, 0.8, [entry.x, 1.45, z], timber(THREE), 5, false);
        for (const y of [1.2, 1.45, 1.7]) tsphere(THREE, group, 0.12, [entry.x + (y % 2 ? 0.05 : -0.05), y, z], leaf, 10, 8);
        sphere(THREE, group, 0.04, [entry.x + 0.1, 1.35, z + 0.06], tomato);
        sphere(THREE, group, 0.04, [entry.x - 0.09, 1.58, z - 0.05], tomato);
      } else {
        tsphere(THREE, group, 0.16, [entry.x, 1.17, z], leaf, 10, 8);
      }
      n += 1;
    }
  }
  // A watering can on the floor by the door and seed trays under the east bench.
  const can = farmMaterial(THREE, "galvanised", { metresPerTile: 0.5 });
  tcylinder(THREE, group, 0.12, 0.12, 0.26, [halfW - 1.0, 0.25, halfD - 0.7], can, 12);
  cylinder(THREE, group, 0.02, 0.02, 0.3, [halfW - 0.85, 0.32, halfD - 0.7], can, 6, false).rotation.z = -0.9;
  const east = fixtureNamed(definition, "bench-east");
  for (let z = east.z - 0.5; z <= east.z + 0.5; z += 0.5) tbox(THREE, group, [0.4, 0.06, 0.3], [east.x, 0.15, z], standard(THREE, "#2b2b2b", 0.8, 0), false);
  roomLight(THREE, group, [0, shell.wallHeight + 0.5, 0], 3, 8, shell.wallHeight + 1.15);
  const doors = createDoorLeaves(THREE, group, definition, "glass", { leaf: glass, trim: frame });
  return Object.freeze({ group, doors, fixtureDoors: {}, animate: null });
}

/** The tool shed: rusting corrugated iron on a timber frame, a lean-to roof with a stovepipe, a hasped door, and shelves of tins and tools inside. */
export function createShed(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  const wall = farmMaterial(THREE, "corrugated");
  const roof = farmMaterial(THREE, "corrugated", { colors: ["#5a636a", "#353c41", "#242a2e", "#8a4a22"], metresPerTile: 1 });
  const frameWood = timber(THREE, "#4a3a2a");
  tbox(THREE, group, [width + 0.1, 0.12, depth + 0.1], [0, 0.06, 0], farmMaterial(THREE, "brick", { colors: ["#6f6f6f", "#4f4f4f", "#8f8f8f", "#3f3f3f"], metresPerTile: 0.6 }));
  drawShell(THREE, group, definition, { wall, trim: frameWood }, { cornerBoards: true });
  // Timber rails top and bottom outside, the way a sheet-iron shed is framed.
  wallBands(THREE, group, definition, frameWood, { y: 0.25, height: 0.1, thickness: 0.06, offset: t / 2 + 0.05 });
  wallBands(THREE, group, definition, frameWood, { y: shell.wallHeight - 0.05, height: 0.1, thickness: 0.06, offset: t / 2 + 0.05 });
  // Lean-to roof, higher at the back, with the back wall carried up under it.
  const pitch = 0.18;
  const slab = tbox(THREE, group, [width + 0.4, 0.06, depth + 0.6], [0, shell.wallHeight + 0.22, -0.05], roof);
  slab.rotation.x = pitch;
  tbox(THREE, group, [width, 0.5, t], [0, shell.wallHeight + 0.22, -halfD + t / 2], wall);
  for (const side of [-1, 1] as const) {
    const fill = new THREE.Shape();
    fill.moveTo(-halfD, shell.wallHeight - 0.01);
    fill.lineTo(halfD, shell.wallHeight - 0.01);
    fill.lineTo(halfD, shell.wallHeight + 0.02);
    fill.lineTo(-halfD, shell.wallHeight + 0.47);
    fill.closePath();
    const wedge = tmesh(THREE, group, new THREE.ExtrudeGeometry(fill, { depth: t, bevelEnabled: false }), wall);
    wedge.rotation.y = -Math.PI / 2;
    wedge.position.set(side < 0 ? -halfW : halfW - t, 0, 0);
  }
  const fascia = tbox(THREE, group, [width + 0.4, 0.12, 0.04], [0, shell.wallHeight + 0.22 - Math.sin(pitch) * (depth / 2 + 0.3) - 0.04, halfD + 0.3], frameWood, false);
  fascia.castShadow = false;
  // Stovepipe through the roof with a rain cap.
  const pipe = standard(THREE, "#3a3a3a", 0.6, 0.4);
  cylinder(THREE, group, 0.08, 0.08, 1.0, [halfW - 0.6, shell.wallHeight + 0.6, -halfD + 0.6], pipe, 10);
  cylinder(THREE, group, 0.14, 0.02, 0.12, [halfW - 0.6, shell.wallHeight + 1.15, -halfD + 0.6], pipe, 10);
  // Gutter and downpipe along the front eave.
  const gutter = standard(THREE, "#5a6068", 0.5, 0.5);
  cylinder(THREE, group, 0.05, 0.05, width + 0.4, [0, shell.wallHeight + 0.22 - Math.sin(pitch) * (depth / 2 + 0.3) - 0.02, halfD + 0.36], gutter, 8, false).rotation.z = Math.PI / 2;
  cylinder(THREE, group, 0.03, 0.03, shell.wallHeight, [-halfW - 0.1, shell.wallHeight / 2, halfD + 0.2], gutter, 8, false);
  // The window sits on the LATCH side of the door: the leaf hinges on the -x jamb and swings past square, so anything on that side of the front wall is in its way.
  // It is sized to the strip of wall between the door casing (door.width / 2 + 0.14) and the corner board (halfW - 0.08), sill included, so its frame never lands on the casing.
  const casingEdge = shell.door!.width / 2 + 0.14;
  const cornerEdge = halfW - 0.08;
  paneWindow(THREE, group, [0.5, 0.45], [(casingEdge + cornerEdge) / 2, 1.55, halfD + 0.02], 0, frameWood, { muntins: [2, 1] });
  // A hasp and padlock on the door frame.
  const metal = iron(THREE);
  box(THREE, group, [0.12, 0.04, 0.02], [shell.door!.width / 2 + 0.12, 1.05, halfD + 0.06], metal, false);
  const lock = box(THREE, group, [0.06, 0.08, 0.03], [shell.door!.width / 2 + 0.06, 0.96, halfD + 0.08], standard(THREE, "#c9a03a", 0.4, 0.7), false);
  lock.castShadow = false;
  // Inside: shelves along the back with tins and jars, a workbench with a vice, tools on the wall — each in its fixture's box.
  const shelf = timber(THREE, WOOD);
  const shelves = fixtureNamed(definition, "shelves");
  for (const y of [shelves.bottom + 0.02, 1.3, shelves.top - 0.02]) tagFixture(tbox(THREE, group, [shelves.width, 0.04, shelves.depth], [shelves.x, y, shelves.z], shelf), shelves);
  for (const x of [shelves.x - shelves.width / 2 + 0.03, shelves.x + shelves.width / 2 - 0.03]) tbox(THREE, group, [0.05, shelves.top - shelves.bottom, shelves.depth], [x, (shelves.top + shelves.bottom) / 2, shelves.z], shelf, false);
  const tins = [standard(THREE, "#c9a03a", 0.5, 0.4), standard(THREE, "#b03a3a", 0.5, 0.4), standard(THREE, "#3a6ab0", 0.5, 0.4), standard(THREE, "#d8d8d8", 0.4, 0.6)];
  let n = 0;
  for (const y of [shelves.bottom + 0.06, 1.34]) for (let x = shelves.x - shelves.width / 2 + 0.25; x < shelves.x + shelves.width / 2 - 0.15; x += 0.32) {
    if (n % 5 === 4) {
      const jar = cylinder(THREE, group, 0.07, 0.07, 0.18, [x, y + 0.09, shelves.z], glassMaterial(THREE, 0.5), 10);
      jar.castShadow = false;
      cylinder(THREE, group, 0.075, 0.075, 0.03, [x, y + 0.19, shelves.z], standard(THREE, "#c9a03a", 0.4, 0.6), 10);
    } else {
      cylinder(THREE, group, 0.09, 0.09, 0.2 + (n % 3) * 0.05, [x, y + 0.12, shelves.z], tins[n % 4]!, 10);
      box(THREE, group, [0.12, 0.08, 0.01], [x, y + 0.13, shelves.z + 0.09], standard(THREE, "#f1e6d2", 0.8, 0), false);
    }
    n += 1;
  }
  const bench = fixtureNamed(definition, "workbench");
  drawWorkbench(THREE, group, bench, shelf);
  box(THREE, group, [0.16, 0.14, 0.1], [bench.x, bench.top + 0.07, bench.z + 0.5], metal, false);
  cylinder(THREE, group, 0.02, 0.02, 0.2, [bench.x - 0.12, bench.top + 0.1, bench.z + 0.5], metal, 6).rotation.z = Math.PI / 2;
  // A rake, a shovel and a pitchfork leaning on the west wall, inside the tools fixture.
  const tools = fixtureNamed(definition, "tools");
  const handle = timber(THREE, "#c9b99c");
  const tool = tagFixture(cylinder(THREE, group, 0.02, 0.02, 1.6, [tools.x - 0.05, 0.8, tools.z - 0.3], handle, 6), tools);
  tool.rotation.z = 0.12;
  box(THREE, group, [0.05, 0.25, 0.2], [tools.x + 0.08, 1.62, tools.z - 0.3], metal, false);
  const rake = cylinder(THREE, group, 0.02, 0.02, 1.7, [tools.x - 0.05, 0.85, tools.z + 0.3], handle, 6);
  rake.rotation.z = 0.12;
  box(THREE, group, [0.05, 0.05, 0.35], [tools.x + 0.1, 1.72, tools.z + 0.3], metal, false);
  for (let index = 0; index < 6; index += 1) box(THREE, group, [0.05, 0.08, 0.02], [tools.x + 0.1, 1.78, tools.z + 0.15 + index * 0.06], metal, false);
  const fork = cylinder(THREE, group, 0.02, 0.02, 1.5, [tools.x - 0.05, 0.75, tools.z], handle, 6);
  fork.rotation.z = 0.12;
  for (const dz of [-0.05, 0, 0.05]) box(THREE, group, [0.015, 0.25, 0.015], [tools.x + 0.07, 1.6, tools.z + dz], metal, false);
  roomLight(THREE, group, [0, shell.wallHeight - 0.3, 0.2], 3.5, 6, shell.wallHeight + 0.16);
  const doors = createDoorLeaves(THREE, group, definition, "plank", { leaf: farmMaterial(THREE, "planks", { colors: ["#4a555c", "#2b3237", "#6a757c", "#1f2529"] }), trim: frameWood });
  return Object.freeze({ group, doors, fixtureDoors: {}, animate: null });
}

/** A walk-in hen house: warm planks, a shingle roof with a rooster vane, a pop-hole with a ramp, a wire-mesh window, nest boxes, a roost and a straw floor. */
export function createCoop(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const t = shell.wallThickness;
  const halfW = width / 2;
  const halfD = depth / 2;
  const plank = farmMaterial(THREE, "planks", { colors: ["#c98a4b", "#7a4a22", "#e0a86a", "#4a2a12"] });
  const dark = timber(THREE);
  const roof = farmMaterial(THREE, "shingles", { colors: ["#6a4a34", "#4a3020", "#8a6a4a", "#2a1a10"] });
  foundation(THREE, group, definition, 0.28, 0.05);
  drawShell(THREE, group, definition, { wall: plank, trim: dark }, { cornerBoards: true });
  gableRoof(THREE, group, definition, 1.0, 0.4, { roof, gable: plank, fascia: paint(THREE, WOOD_DARK) }, { thickness: 0.1 });
  weathervane(THREE, group, [0, shell.wallHeight + 1.1, 0]);
  // A pop-hole with a ramp on the east side so the hens have their own door.
  box(THREE, group, [0.05, 0.45, 0.4], [halfW + 0.01, 0.42, 0.4], standard(THREE, "#2b1d14", 1, 0), false);
  tbox(THREE, group, [0.05, 0.5, 0.05], [halfW + 0.02, 0.45, 0.18], dark, false);
  tbox(THREE, group, [0.05, 0.5, 0.05], [halfW + 0.02, 0.45, 0.62], dark, false);
  const ramp = tbox(THREE, group, [0.95, 0.04, 0.4], [halfW + 0.45, 0.14, 0.4], dark);
  ramp.rotation.z = 0.3;
  for (let index = 0; index < 5; index += 1) tbox(THREE, group, [0.04, 0.03, 0.4], [halfW + 0.15 + index * 0.17, 0.22 + index * 0.05, 0.4], dark, false);
  // A wire-mesh window on the front with a shutter propped above it.
  const mesh = new THREE.Group();
  mesh.position.set(halfW - 0.7, 1.5, halfD + 0.02); // latch side of the door, clear of the swinging leaf
  box(THREE, mesh, [0.5, 0.4, 0.02], [0, 0, -0.01], standard(THREE, "#1b1f24", 1, 0), false);
  for (let x = -0.22; x <= 0.22; x += 0.055) box(THREE, mesh, [0.006, 0.4, 0.006], [x, 0, 0.01], standard(THREE, "#9aa0a6", 0.4, 0.6), false);
  for (let y = -0.17; y <= 0.17; y += 0.055) box(THREE, mesh, [0.5, 0.006, 0.006], [0, y, 0.01], standard(THREE, "#9aa0a6", 0.4, 0.6), false);
  tbox(THREE, mesh, [0.6, 0.06, 0.06], [0, 0.23, 0.02], dark, false);
  tbox(THREE, mesh, [0.6, 0.06, 0.06], [0, -0.23, 0.02], dark, false);
  tbox(THREE, mesh, [0.06, 0.52, 0.06], [-0.27, 0, 0.02], dark, false);
  tbox(THREE, mesh, [0.06, 0.52, 0.06], [0.27, 0, 0.02], dark, false);
  const shutter = tbox(THREE, mesh, [0.56, 0.44, 0.03], [0, 0.4, 0.2], plank, false);
  shutter.rotation.x = -1.2;
  group.add(mesh);
  // A painted "EGGS" board over the door.
  tbox(THREE, group, [0.9, 0.24, 0.04], [0, shell.door!.height + 0.14, halfD + 0.05], paintedWood(THREE, TRIM), false);
  // Inside: straw, nest boxes along the back, a roost perch, a feeder and a water fount — in the fixtures' boxes.
  tbox(THREE, group, [width - t * 2, 0.08, depth - t * 2], [0, 0.04, 0], farmMaterial(THREE, "straw"), false);
  const nests = fixtureNamed(definition, "nest-boxes");
  const boxes = 3;
  const boxWidth = nests.width / boxes;
  const straw = farmMaterial(THREE, "straw", { metresPerTile: 0.4 });
  for (let index = 0; index < boxes; index += 1) {
    const x = nests.x - nests.width / 2 + boxWidth * (index + 0.5);
    const floor = tbox(THREE, group, [boxWidth - 0.04, 0.05, nests.depth], [x, nests.bottom + 0.025, nests.z], dark);
    if (index === 1) tagFixture(floor, nests);
    tbox(THREE, group, [boxWidth - 0.04, 0.05, nests.depth], [x, nests.top - 0.05, nests.z], dark);
    tbox(THREE, group, [0.04, nests.top - nests.bottom, nests.depth], [x - boxWidth / 2 + 0.02, (nests.top + nests.bottom) / 2, nests.z], dark, false);
    tbox(THREE, group, [boxWidth - 0.08, 0.08, nests.depth - 0.05], [x, nests.bottom + 0.09, nests.z], straw, false);
    tbox(THREE, group, [boxWidth - 0.04, 0.1, 0.03], [x, nests.bottom + 0.1, nests.z + nests.depth / 2], dark, false);
    sphere(THREE, group, 0.05, [x - 0.1, nests.bottom + 0.17, nests.z], standard(THREE, "#f4ead8", 0.7, 0)).scale.set(1, 1.25, 1);
    if (index !== 1) sphere(THREE, group, 0.05, [x + 0.08, nests.bottom + 0.17, nests.z + 0.05], standard(THREE, "#e8d3b0", 0.7, 0)).scale.set(1, 1.25, 1);
  }
  tbox(THREE, group, [0.04, nests.top - nests.bottom, nests.depth], [nests.x + nests.width / 2 - 0.02, (nests.top + nests.bottom) / 2, nests.z], dark, false);
  const roost = fixtureNamed(definition, "roost");
  tagFixture(cylinder(THREE, group, 0.03, 0.03, roost.width, [roost.x, (roost.top + roost.bottom) / 2, roost.z], dark, 8), roost).rotation.z = Math.PI / 2;
  for (const x of [roost.x - roost.width / 2 + 0.05, roost.x + roost.width / 2 - 0.05]) tbox(THREE, group, [0.04, roost.bottom, 0.04], [x, roost.bottom / 2, roost.z], dark, false);
  // Feeder and fount by the east wall.
  const galv = farmMaterial(THREE, "galvanised", { metresPerTile: 0.4 });
  tcylinder(THREE, group, 0.14, 0.18, 0.12, [halfW - 0.5, 0.14, 0.5], galv, 12);
  tcylinder(THREE, group, 0.09, 0.09, 0.3, [halfW - 0.5, 0.33, 0.5], galv, 12);
  tcylinder(THREE, group, 0.12, 0.12, 0.2, [halfW - 0.5, 0.18, -0.1], standard(THREE, "#d43a3a", 0.5, 0), 12);
  roomLight(THREE, group, [0, shell.wallHeight - 0.3, 0.2], 2.5, 5, gableRoofHeightAt({ wallHeight: shell.wallHeight, rise: 1, run: depth / 2 + 0.4, across: 0.2 }) - 0.1);
  const doors = createDoorLeaves(THREE, group, definition, "plank", { leaf: plank, trim: dark });
  return Object.freeze({ group, doors, fixtureDoors: {}, animate: null });
}

/** The eight faces of a round shell drawn as flat boxes, so the walls the eye sees are the walls the body hits. */
function roundBody(THREE: ThreeNamespace, group: any, definition: FarmDecorDefinition, material: any, trim: any): void {
  drawShell(THREE, group, definition, { wall: material, trim });
}

/** A grain silo: a tall octagonal tower in galvanised steel with hoop bands and corner seams, a domed cap with a vent, a caged ladder to a railed catwalk, a chute, and a grain heap inside. */
export function createSilo(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const shell = definition.shell!;
  const face = roundFace(shell, definition.footprint, 0);
  const steel = farmMaterial(THREE, "galvanised");
  const band = standard(THREE, "#6f7780", 0.45, 0.65);
  tbox(THREE, group, [definition.footprint.width + 0.2, 0.2, definition.footprint.depth + 0.2], [0, 0.1, 0], farmMaterial(THREE, "brick", { colors: ["#7a7a7a", "#5a5a5a", "#9a9a9a", "#4a4a4a"], metresPerTile: 0.6 }));
  roundBody(THREE, group, definition, steel, band);
  // Corner seams up every edge, hoop bands every metre, and a domed cap on the circumradius so it covers the corners.
  for (let index = 0; index < shell.sides; index += 1) {
    const angle = (index + 0.5) / shell.sides * Math.PI * 2;
    box(THREE, group, [0.08, shell.wallHeight, 0.08], [Math.sin(angle) * (face.circumradius - 0.02), shell.wallHeight / 2, Math.cos(angle) * (face.circumradius - 0.02)], band, false).rotation.y = angle;
  }
  for (let y = 0.9; y < shell.wallHeight; y += 1.1) wallBands(THREE, group, definition, band, { y, height: 0.1, thickness: 0.08 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(face.circumradius + 0.1, shell.sides * 2, 8, 0, Math.PI * 2, 0, Math.PI / 2), farmMaterial(THREE, "galvanised", { colors: ["#a5aab0", "#6f7780", "#4a5058"], metresPerTile: 1 }));
  cap.position.y = shell.wallHeight;
  cap.scale.y = 0.55;
  cap.castShadow = true;
  group.add(cap);
  // Cap ribs, a vent hood and a lightning rod.
  for (let index = 0; index < shell.sides; index += 1) {
    const rib = box(THREE, group, [0.06, 0.06, face.circumradius + 0.1], [0, shell.wallHeight + 0.02, 0], band, false);
    rib.rotation.y = (index / shell.sides) * Math.PI * 2;
    rib.position.set(Math.sin(rib.rotation.y) * (face.circumradius + 0.1) / 2, shell.wallHeight + (face.circumradius + 0.1) * 0.55 * 0.5, Math.cos(rib.rotation.y) * (face.circumradius + 0.1) / 2);
    rib.rotation.x = -0.5;
  }
  const capTop = shell.wallHeight + (face.circumradius + 0.1) * 0.55;
  cylinder(THREE, group, 0.22, 0.22, 0.3, [0, capTop + 0.1, 0], band, 10);
  cylinder(THREE, group, 0.3, 0.3, 0.06, [0, capTop + 0.3, 0], band, 10);
  cylinder(THREE, group, 0.01, 0.01, 0.8, [0, capTop + 0.7, 0], iron(THREE), 4, false);
  // The ladder up the −z face, in a safety cage, to the catwalk round the top: platforms and rails from the fixture list.
  const rail = standard(THREE, "#5a6068", 0.5, 0.6);
  const grate = farmMaterial(THREE, "galvanised", { colors: ["#7e8790", "#5a6068", "#3f444a"], metresPerTile: 0.5, roughness: 0.6 });
  const ladder = fixtureNamed(definition, "ladder");
  drawLadder(THREE, group, ladder, rail);
  for (let y = 2.2; y < ladder.top; y += 0.9) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 6, 16, Math.PI), rail);
    hoop.position.set(ladder.x, y, ladder.z - 0.1);
    hoop.rotation.x = Math.PI / 2;
    hoop.rotation.z = Math.PI;
    group.add(hoop);
  }
  for (const entry of farmFixtures(definition)) {
    if (entry.name.startsWith("catwalk")) drawPlatform(THREE, group, entry, grate);
    if (entry.name.startsWith("rail")) drawRailing(THREE, group, entry, rail);
  }
  // A discharge chute on the +x side, and a name plate by the door.
  const chute = cylinder(THREE, group, 0.16, 0.16, 2.4, [face.apothem + 0.3, 1.6, 0.3], band, 10);
  chute.rotation.z = -0.5;
  cylinder(THREE, group, 0.18, 0.12, 0.3, [face.apothem + 0.95, 0.85, 0.3], band, 10).rotation.z = -0.5;
  // Inside: a heap of grain against the back, a chute above it, a spill either side of the way in, and a low lamp so the tower is not a cave.
  const inner = face.apothem - shell.wallThickness;
  const grainMaterial = farmMaterial(THREE, "straw", { colors: ["#d8b24a", "#a07a28", "#f0d478"], metresPerTile: 0.4 });
  const heap = fixtureNamed(definition, "grain");
  const grain = new THREE.Mesh(metricUvs(new THREE.ConeGeometry(heap.width / 2, heap.top, 16), 0.4), grainMaterial);
  grain.position.set(heap.x, heap.top / 2, heap.z);
  grain.receiveShadow = true;
  group.add(tagFixture(grain, heap));
  for (const name of ["spill-east", "spill-west"]) {
    const entry = fixtureNamed(definition, name);
    const pile = tagFixture(tsphere(THREE, group, entry.width / 2, [entry.x, entry.top * 0.4, entry.z], grainMaterial), entry);
    pile.scale.y = entry.top / entry.width;
  }
  cylinder(THREE, group, 0.22, 0.14, 1.6, [0, shell.wallHeight - 1.2, -inner * 0.35], band, 10);
  // A plate under the dome so the tower has a top from inside.
  cylinder(THREE, group, face.circumradius, face.circumradius, 0.06, [0, shell.wallHeight - 0.03, 0], band, shell.sides, false).rotation.y = Math.PI / shell.sides;
  roomLight(THREE, group, [0, 2.7, 0.3], 7, 8, shell.wallHeight - 0.06);
  const roofLight = new THREE.PointLight(0xffe9b8, 4, 8, 1.4);
  roofLight.position.set(0, shell.wallHeight - 0.5, 0);
  group.add(roofLight);
  const doors = createDoorLeaves(THREE, group, definition, "plank", { leaf: farmMaterial(THREE, "galvanised", { metresPerTile: 0.8 }), trim: band });
  return Object.freeze({ group, doors, fixtureDoors: {}, animate: null });
}

/** A windmill: a fieldstone base under a plastered, timber-braced octagonal tower, a shingled cap, four big lattice sails turning on the back, and the millstone inside. */
export function createWindmill(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const shell = definition.shell!;
  const face = roundFace(shell, definition.footprint, 0);
  const plaster = farmMaterial(THREE, "plaster", { colors: ["#d9cdb5", "#a89a80", "#f4ecdc"] });
  const timberMaterial = timber(THREE);
  const roofMaterial = farmMaterial(THREE, "shingles");
  tbox(THREE, group, [definition.footprint.width + 0.2, 0.16, definition.footprint.depth + 0.2], [0, 0.08, 0], stone(THREE));
  roundBody(THREE, group, definition, plaster, timberMaterial);
  // A stone course round the bottom of the tower, on every face.
  for (const wall of shellWalls(definition, true)) {
    const course = tbox(THREE, group, [wall.length + 0.02, 1.1, wall.thickness + 0.06], [wall.x, 0.55, wall.z], stone(THREE));
    course.rotation.y = wall.rotationY;
  }
  // Timber posts on every corner, a ring beam at the top and halfway, and a brace on each face.
  for (let index = 0; index < shell.sides; index += 1) {
    const angle = (index + 0.5) / shell.sides * Math.PI * 2;
    tbox(THREE, group, [0.16, shell.wallHeight, 0.16], [Math.sin(angle) * (face.circumradius - 0.05), shell.wallHeight / 2, Math.cos(angle) * (face.circumradius - 0.05)], timberMaterial, false).rotation.y = angle;
    const faceAngle = (index / shell.sides) * Math.PI * 2;
    if (index === 0) continue;
    const brace = tbox(THREE, group, [0.1, face.length * 1.1, 0.06], [Math.sin(faceAngle) * (face.apothem + 0.02), 2.4, Math.cos(faceAngle) * (face.apothem + 0.02)], timberMaterial, false);
    brace.rotation.y = faceAngle;
    brace.rotation.z = index % 2 ? 0.9 : -0.9;
  }
  for (const y of [shell.wallHeight - 0.08, 2.9, 1.15]) wallBands(THREE, group, definition, timberMaterial, { y, height: 0.14, thickness: 0.1 });
  // The cap: a shingled cone over an eave ring, with a finial.
  const cone = new THREE.Mesh(metricUvs(new THREE.ConeGeometry(face.circumradius + 0.4, 2.1, shell.sides), 1.2), roofMaterial);
  cone.position.y = shell.wallHeight + 1.05;
  cone.rotation.y = Math.PI / shell.sides;
  cone.castShadow = true;
  group.add(cone);
  const eave = cylinder(THREE, group, face.circumradius + 0.42, face.circumradius + 0.42, 0.12, [0, shell.wallHeight + 0.02, 0], timberMaterial, shell.sides);
  eave.rotation.y = Math.PI / shell.sides;
  sphere(THREE, group, 0.14, [0, shell.wallHeight + 2.12, 0], timberMaterial);
  // Windows on two faces, a lantern by the door.
  paneWindow(THREE, group, [0.6, 0.8], [face.apothem + 0.03, 3.4, 0], Math.PI / 2, timberMaterial, { muntins: [2, 3] });
  paneWindow(THREE, group, [0.6, 0.8], [-face.apothem - 0.03, 2.2, 0], -Math.PI / 2, timberMaterial, { muntins: [2, 3] });
  wallLantern(THREE, group, [shell.door!.width / 2 + 0.35, shell.door!.height, face.apothem + 0.02], 0);
  // The sails: a windshaft out of the cap on the −z face, a hub, and four long lattice vanes with canvas, turned by `animate`.
  const hubY = shell.wallHeight + 0.55;
  const hub = new THREE.Group();
  hub.position.set(0, hubY, -face.apothem - 0.75);
  const shaftOut = tcylinder(THREE, group, 0.14, 0.16, 1.1, [0, hubY, -face.apothem - 0.3], timberMaterial, 10);
  shaftOut.rotation.x = Math.PI / 2;
  tcylinder(THREE, hub, 0.26, 0.26, 0.36, [0, 0, 0], timberMaterial, 12).rotation.x = Math.PI / 2;
  const canvas = farmMaterial(THREE, "plaster", { colors: ["#f1e6d2", "#c9b99c", "#ffffff"], metresPerTile: 1, doubleSided: true });
  const sailLength = 3.3;
  for (let index = 0; index < 4; index += 1) {
    const vane = new THREE.Group();
    vane.rotation.z = index * Math.PI / 2;
    // The stock: the main spar, tapering out from the hub.
    tbox(THREE, vane, [0.12, sailLength, 0.1], [0, sailLength / 2, 0], timberMaterial);
    // The lattice: a leading bar and cross bars, with canvas laced over the outer two thirds.
    tbox(THREE, vane, [0.05, sailLength * 0.78, 0.05], [0.62, sailLength * 0.6, 0], timberMaterial, false);
    for (let y = sailLength * 0.25; y < sailLength * 0.98; y += 0.28) tbox(THREE, vane, [0.66, 0.04, 0.04], [0.33, y, 0], timberMaterial, false);
    const cloth = tbox(THREE, vane, [0.56, sailLength * 0.62, 0.015], [0.34, sailLength * 0.64, 0.035], canvas, false);
    cloth.castShadow = true;
    hub.add(vane);
  }
  group.add(hub);
  // The tail pole and fantail off the back of the cap.
  const tail = tcylinder(THREE, group, 0.06, 0.08, 2.4, [0, shell.wallHeight + 0.4, face.apothem * 0.5 + 0.8], timberMaterial, 8);
  tail.rotation.x = Math.PI / 2 - 0.3;
  // Inside: the millstone on a plinth under its shaft, sacks of flour, and the loft across the back with its ladder — from the fixture list.
  const stoneMaterial = stone(THREE);
  const millstone = fixtureNamed(definition, "millstone");
  tagFixture(tcylinder(THREE, group, millstone.width / 2 - 0.05, millstone.width / 2, 0.4, [millstone.x, 0.32, millstone.z], stoneMaterial, 20), millstone);
  tcylinder(THREE, group, millstone.width / 2 - 0.13, millstone.width / 2 - 0.13, 0.18, [millstone.x, millstone.top - 0.09, millstone.z], farmMaterial(THREE, "plaster", { colors: ["#9c9990", "#6a675f", "#c9c5bb"], metresPerTile: 0.6 }), 20);
  // A hopper over the stone.
  const hopper = new THREE.Mesh(metricUvs(new THREE.ConeGeometry(0.4, 0.5, 4, 1, true), 1), timber(THREE, WOOD));
  hopper.position.set(millstone.x, millstone.top + 0.55, millstone.z);
  hopper.rotation.x = Math.PI;
  hopper.rotation.y = Math.PI / 4;
  group.add(hopper);
  const shaft = fixtureNamed(definition, "shaft");
  tagFixture(tcylinder(THREE, group, shaft.width / 2, shaft.width / 2, shell.wallHeight - 0.7, [shaft.x, shell.wallHeight / 2 + 0.3, shaft.z], timberMaterial, 8), shaft);
  const sack = farmMaterial(THREE, "plaster", { colors: ["#d8c39a", "#a8956e", "#f0e2c0"], metresPerTile: 0.5 });
  const sacks = fixtureNamed(definition, "sacks");
  for (const [dx, dz] of [[0.1, 0.25], [-0.15, -0.2], [0.15, -0.15]] as const) {
    const bag = tagFixture(tsphere(THREE, group, 0.28, [sacks.x + dx, 0.26, sacks.z + dz], sack), sacks);
    bag.scale.set(1, 0.85, 1);
    cylinder(THREE, group, 0.08, 0.1, 0.1, [sacks.x + dx, 0.52, sacks.z + dz], sack, 8);
  }
  drawPlatform(THREE, group, fixtureNamed(definition, "loft"), farmMaterial(THREE, "wood", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 2 }));
  drawLadder(THREE, group, fixtureNamed(definition, "ladder"), timberMaterial);
  roomLight(THREE, group, [0, shell.wallHeight - 0.4, -0.9], 3, 5, shell.wallHeight - 0.06);
  roomLight(THREE, group, [0, shell.wallHeight - 0.6, 0.3], 5, 9, shell.wallHeight - 0.06);
  const doors = createDoorLeaves(THREE, group, definition, "plank", { leaf: farmMaterial(THREE, "planks", { colors: ["#6a4a2a", "#3a2412", "#8a6a44", "#2a1a0a"] }), trim: timberMaterial });
  let spin = 0;
  return Object.freeze({
    group,
    doors,
    fixtureDoors: {},
    animate: (dt: number) => {
      spin += dt * 0.35;
      hub.rotation.z = spin;
    },
  });
}

/** A gazebo: turned posts on a lattice-skirted deck, railings on three sides, brackets under a shingled octagonal roof with a finial, steps at the front, and a bench ring under a lantern. */
export function createGazebo(THREE: ThreeNamespace, definition: FarmDecorDefinition): BuildingModel {
  const group = new THREE.Group();
  const { width, depth } = definition.footprint;
  const shell = definition.shell!;
  const canopy = gazeboCanopy(shell.wallHeight, 1.4);
  const halfW = width / 2;
  const halfD = depth / 2;
  const white = paintedWood(THREE, TRIM);
  const deck = farmMaterial(THREE, "wood", { colors: ["#9a7248", "#5a3a1f", "#c9a06a"], metresPerTile: 1.5 });
  const roof = farmMaterial(THREE, "shingles", { colors: ["#4a5a6a", "#2e3a48", "#6a7a8a", "#1a2028"] });
  // Deck a step up on a lattice skirt, the posts drawn from the shell list, with a step at the front.
  tbox(THREE, group, [width, 0.2, depth], [0, 0.22, 0], deck);
  const lattice = farmMaterial(THREE, "brick", { colors: ["#f1e6d2", "#d9cdb5", "#ffffff", "#4a3a2a"], metresPerTile: 0.3 });
  for (const [w, x, z, rot] of [[width, 0, halfD - 0.02, 0], [width, 0, -halfD + 0.02, 0], [depth, halfW - 0.02, 0, Math.PI / 2], [depth, -halfW + 0.02, 0, Math.PI / 2]] as const) {
    const skirt = tbox(THREE, group, [w - 0.1, 0.12, 0.03], [x, 0.06, z], lattice, false);
    skirt.rotation.y = rot;
  }
  tbox(THREE, group, [1.4, 0.1, 0.5], [0, 0.05, halfD + 0.25], deck);
  tbox(THREE, group, [1.4, 0.1, 0.3], [0, 0.15, halfD + 0.15], deck);
  for (const wall of shellWalls(definition, true)) {
    // Turned posts: a square base and cap with a round column between, and a bracket to the roof.
    tbox(THREE, group, [wall.length, 0.5, wall.thickness], [wall.x, 0.55, wall.z], white);
    cylinder(THREE, group, wall.length * 0.42, wall.length * 0.42, shell.wallHeight - 1.2, [wall.x, shell.wallHeight / 2 + 0.05, wall.z], white, 12);
    cylinder(THREE, group, wall.length * 0.55, wall.length * 0.45, 0.16, [wall.x, 0.88, wall.z], white, 12);
    tbox(THREE, group, [wall.length, 0.4, wall.thickness], [wall.x, shell.wallHeight - 0.2, wall.z], white);
    for (const [dx, dz] of [[-Math.sign(wall.x), 0], [0, -Math.sign(wall.z)]] as const) {
      const bracket = tbox(THREE, group, [0.05, 0.5, 0.05], [wall.x + dx * 0.25, shell.wallHeight - 0.32, wall.z + dz * 0.25], white, false);
      bracket.rotation.z = dx * 0.75;
      bracket.rotation.x = -dz * 0.75;
    }
  }
  // Railings on the back and both sides, open at the front — solid, from the fixture list.
  for (const name of ["rail-back", "rail-west", "rail-east"]) drawRailing(THREE, group, fixtureNamed(definition, name), white);
  // A frieze of spindles under the eaves all round.
  for (const [len, x, z, rot] of [[width, 0, halfD - 0.09, 0], [width, 0, -halfD + 0.09, 0], [depth, halfW - 0.09, 0, Math.PI / 2], [depth, -halfW + 0.09, 0, Math.PI / 2]] as const) {
    const frieze = new THREE.Group();
    frieze.position.set(x, shell.wallHeight - 0.2, z);
    frieze.rotation.y = rot;
    tbox(THREE, frieze, [len - 0.36, 0.05, 0.05], [0, -0.16, 0], white, false);
    for (let s = -len / 2 + 0.3; s < len / 2 - 0.2; s += 0.16) cylinder(THREE, frieze, 0.014, 0.014, 0.3, [s, -0.02, 0], white, 6, false);
    // The missing upper header made the spindles and canopy look suspended in
    // mid-air. This rail meets both the post caps and the roof's base.
    const header = tbox(THREE, frieze, [len, canopy.headerHeight, 0.14], [0, canopy.headerCentreY - (shell.wallHeight - 0.2), 0], white, false);
    header.userData.gazeboRoofSupport = true;
    group.add(frieze);
  }
  // Octagonal shingled roof over an eave ring, with a finial.
  const radius = Math.hypot(halfW, halfD) + 0.35;
  const cone = new THREE.Mesh(metricUvs(new THREE.ConeGeometry(radius, 1.4, 8), 1.2), roof);
  cone.position.y = canopy.roofCentreY;
  cone.rotation.y = Math.PI / 8;
  cone.castShadow = true;
  cone.receiveShadow = true;
  group.add(cone);
  const eave = cylinder(THREE, group, radius, radius, 0.14, [0, shell.wallHeight, 0], white, 8);
  eave.rotation.y = Math.PI / 8;
  cylinder(THREE, group, 0.05, 0.05, 0.3, [0, shell.wallHeight + 1.5, 0], white, 8);
  sphere(THREE, group, 0.12, [0, shell.wallHeight + 1.7, 0], white);
  // Ceiling boards under the roof.
  const ceiling = cylinder(THREE, group, radius - 0.4, radius - 0.4, 0.04, [0, shell.wallHeight + 0.12, 0], deck, 8);
  ceiling.rotation.y = Math.PI / 8;
  // Bench ring inside, along the back and sides — every bench a seat — and a lantern.
  const seat = timber(THREE, WOOD);
  for (const name of ["bench-back", "bench-west", "bench-east"]) drawSeat(THREE, group, fixtureNamed(definition, name), seat);
  roomLight(THREE, group, [0, shell.wallHeight - 0.35, 0], 3, 7, shell.wallHeight + 0.1);
  return Object.freeze({ group, doors: null, fixtureDoors: {}, animate: null });
}

/** Every building builder by the catalog's `model` name. */
export const FARM_BUILDING_BUILDERS: Readonly<Record<string, (THREE: ThreeNamespace, definition: FarmDecorDefinition) => BuildingModel>> = Object.freeze({
  barn: createBarn,
  stable: createStable,
  cottage: createCottage,
  greenhouse: createGreenhouse,
  shed: createShed,
  coop: createCoop,
  silo: createSilo,
  windmill: createWindmill,
  gazebo: createGazebo,
});
