// What stands at Windrush Downs, drawn (planning-docs/FARM_RIDING_PLAN.md):
// every fence on every course at the height it asks for, with its number and
// its flags (red on the rider's right, white on the left, eventing's rule);
// the rings' rails; the oval's white rails; the arches at the starts and
// finishes; the furlong posts; the stand, the betting booth, the race board
// and the notice board; and the farm's own trees, trough, benches and lamps.
//
// Every model is placed on `downsGround` at its spot, from the one description
// in `downs-scene.mts` — nothing here decides where anything is.

import { box, cylinder, sphere, standard, type ThreeNamespace } from "./arcade-room-decor-primitives.mjs";
import { tbox } from "./farm-materials.mjs";
import { createPine, createTree } from "./farm-props-plants.mjs";
import { createBench, createLampPost, createTrough } from "./farm-props.mjs";
import { createHitchingRail } from "./farm-props-riding.mjs";
import { downsGround } from "./downs-terrain.mjs";
import {
  DOWNS_PROPS,
  DOWNS_RINGS,
  NOVICE_FENCES,
  OPEN_COUNTRY_FENCES,
  OPEN_FENCES,
  RING_RAIL_HEIGHT,
  XC_CHAMPIONSHIP_FENCES,
  XC_FENCES,
  ovalRails,
  ringRails,
  type DownsFence,
  type DownsProp,
} from "./downs-scene.mjs";
import type { RideBox } from "./farm-ride-geometry.mjs";

export type DownsProps = Readonly<{
  /** Show one cross-country line's fences (standard or championship heights) and hide the other's. */
  showCrossCountry: (championship: boolean) => void;
  dispose: () => void;
}>;

const WHITE = "#f2f1ec";
const RED = "#c83a34";
const BLUE = "#2f5f9c";

function sign(THREE: ThreeNamespace, text: string, options: Readonly<{ width?: number; height?: number; background?: string; color?: string; font?: number }> = {}): any {
  const canvas = document.createElement("canvas");
  canvas.width = options.width ?? 512;
  canvas.height = options.height ?? 128;
  const context = canvas.getContext("2d")!;
  context.fillStyle = options.background ?? "#1f3a26";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,.55)";
  context.lineWidth = 6;
  context.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);
  context.fillStyle = options.color ?? "#fff6cf";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${options.font ?? 56}px system-ui, sans-serif`;
  context.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 });
}

/** A striped pole lying across a fence at `y`. */
function pole(THREE: ThreeNamespace, group: any, width: number, y: number, z: number, colors: readonly [string, string] = [WHITE, RED]): void {
  const stripes = Math.max(3, Math.round(width / 0.45));
  const piece = width / stripes;
  for (let index = 0; index < stripes; index += 1) {
    const mesh = cylinder(THREE, group, 0.05, 0.05, piece, [-width / 2 + piece * (index + 0.5), y, z], standard(THREE, index % 2 ? colors[1] : colors[0], 0.55, 0), 10);
    mesh.rotation.z = Math.PI / 2;
  }
}

/** Two wings either side, with cups. */
function wings(THREE: ThreeNamespace, group: any, width: number, height: number, z: number): void {
  for (const side of [-1, 1]) {
    tbox(THREE, group, [0.12, height + 0.35, 0.12], [side * (width / 2 + 0.1), (height + 0.35) / 2, z], standard(THREE, WHITE, 0.6, 0));
    box(THREE, group, [0.5, height + 0.1, 0.06], [side * (width / 2 + 0.4), (height + 0.1) / 2, z], standard(THREE, side > 0 ? RED : BLUE, 0.6, 0));
  }
}

/** A course fence's number board and its flags (red on the right as the rider comes, white on the left). */
function markings(THREE: ThreeNamespace, group: any, fence: DownsFence, height: number): void {
  const reach = fence.width / 2 + 0.9;
  for (const [side, color] of [[1, RED], [-1, WHITE]] as const) {
    // The rider comes from the fence's local +z heading toward −z, so their right is the fence's local +x.
    const x = side * reach;
    cylinder(THREE, group, 0.025, 0.025, 1.7, [x, 0.85, 0], standard(THREE, "#4a3a2a", 0.8, 0), 6);
    const flag = box(THREE, group, [0.38, 0.26, 0.01], [x + (side > 0 ? -0.2 : 0.2), 1.55, 0], standard(THREE, color, 0.7, 0), false);
    flag.userData.flag = true;
  }
  if (fence.number > 0) {
    const board = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), sign(THREE, String(fence.number), { width: 128, height: 128, background: "#f7f3e6", color: "#1d1d1d", font: 84 }));
    // Facing the rider coming in (local +z), and again on the far side.
    board.position.set(-reach - 0.35, Math.max(0.9, height * 0.8), 0.02);
    group.add(board);
    const back = board.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.02;
    group.add(back);
  }
}

function drawFence(THREE: ThreeNamespace, fence: DownsFence): any {
  const group = new THREE.Group();
  const w = fence.width;
  const h = fence.clearance;
  switch (fence.kind) {
    case "vertical":
      wings(THREE, group, w, h, 0);
      pole(THREE, group, w, h, 0);
      pole(THREE, group, w, h * 0.62, 0, [WHITE, BLUE]);
      pole(THREE, group, w, h * 0.3, 0);
      break;
    case "oxer":
      for (const z of [-fence.depth / 2 + 0.1, fence.depth / 2 - 0.1]) {
        wings(THREE, group, w, h, z);
        pole(THREE, group, w, h, z);
        pole(THREE, group, w, h * 0.55, z, [WHITE, BLUE]);
      }
      break;
    case "wall": {
      const brick = standard(THREE, "#b5573d", 0.9, 0);
      tbox(THREE, group, [w, h - 0.06, fence.depth], [0, (h - 0.06) / 2, 0], brick);
      box(THREE, group, [w + 0.06, 0.08, fence.depth + 0.06], [0, h - 0.04, 0], standard(THREE, "#d7d0c2", 0.8, 0));
      break;
    }
    case "log": {
      const bark = standard(THREE, "#6b4a2e", 0.95, 0);
      const log = cylinder(THREE, group, h / 2, h / 2 * 0.92, w, [0, h / 2, 0], bark, 14);
      log.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const end = cylinder(THREE, group, h / 2 - 0.02, h / 2 - 0.02, 0.02, [side * w / 2, h / 2, 0], standard(THREE, "#c9a06a", 0.9, 0), 14, false);
        end.rotation.z = Math.PI / 2;
      }
      break;
    }
    case "hedge": {
      const leaf = standard(THREE, "#3e6b2c", 0.95, 0);
      tbox(THREE, group, [w, h * 0.85, fence.depth], [0, h * 0.425, 0], leaf);
      for (let index = 0; index < 9; index += 1) sphere(THREE, group, 0.28, [-w / 2 + 0.25 + index * (w - 0.5) / 8, h * 0.85, (index % 2 ? 0.12 : -0.12)], leaf).scale.set(1, 0.7, 1.4);
      break;
    }
    case "brush": {
      tbox(THREE, group, [w, h * 0.55, fence.depth], [0, h * 0.275, 0], standard(THREE, "#7a5534", 0.9, 0));
      const twigs = standard(THREE, "#5a7a3a", 1, 0);
      tbox(THREE, group, [w - 0.1, h * 0.5, fence.depth * 0.6], [0, h * 0.78, 0], twigs);
      break;
    }
    case "ditch": {
      // The ditch is cut into the ground; the posts and a guard rail on the take-off side say it is there.
      const rail = cylinder(THREE, group, 0.06, 0.06, w, [0, 0.35, -fence.depth / 2 - 0.3], standard(THREE, "#7a5534", 0.9, 0), 10);
      rail.rotation.z = Math.PI / 2;
      box(THREE, group, [w, 0.02, fence.depth - 0.4], [0, -0.55, 0], standard(THREE, "#3e5d73", 0.2, 0.05), false);
      break;
    }
    default:
      // Banks, drops and the splash are earthworks: only the markings stand.
      break;
  }
  markings(THREE, group, fence, Math.max(h, 1));
  group.position.set(fence.x, downsGround(fence), fence.z);
  group.rotation.y = fence.heading;
  group.traverse((node: any) => { if (node.isMesh) node.castShadow = true; });
  return group;
}

/** A run of white rails along boxes (a ring, the oval), posts at each end of every box. */
function drawRails(THREE: ThreeNamespace, boxes: readonly RideBox[], height: number, color = WHITE): any {
  const group = new THREE.Group();
  const paint = standard(THREE, color, 0.55, 0);
  for (const rail of boxes) {
    const along = rail.footprint.width >= rail.footprint.depth;
    const length = along ? rail.footprint.width : rail.footprint.depth;
    const segment = new THREE.Group();
    const y = downsGround(rail);
    segment.position.set(rail.x, y, rail.z);
    segment.rotation.y = rail.rotationY + (along ? 0 : Math.PI / 2);
    for (const h of [height, height * 0.5]) box(THREE, segment, [length, 0.08, 0.06], [0, h, 0], paint);
    for (const side of [-1, 1]) box(THREE, segment, [0.1, height + 0.06, 0.1], [side * length / 2, (height + 0.06) / 2, 0], paint);
    group.add(segment);
  }
  return group;
}

function drawArch(THREE: ThreeNamespace, entry: DownsProp): any {
  const group = new THREE.Group();
  const wood = standard(THREE, WHITE, 0.6, 0);
  for (const side of [-1, 1]) tbox(THREE, group, [0.3, 4.2, 0.3], [side * entry.width / 2, 2.1, 0], wood);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(entry.width, 0.9, 0.08), [wood, wood, wood, wood, sign(THREE, entry.label ?? "", { width: 1024, height: 128, background: "#1d4a2b", font: 72 }), sign(THREE, entry.label ?? "", { width: 1024, height: 128, background: "#1d4a2b", font: 72 })]);
  banner.position.y = 3.9;
  banner.castShadow = true;
  group.add(banner);
  return group;
}

function drawMarker(THREE: ThreeNamespace, entry: DownsProp): any {
  const group = new THREE.Group();
  tbox(THREE, group, [0.18, 1.4, 0.18], [0, 0.7, 0], standard(THREE, WHITE, 0.6, 0));
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.05), sign(THREE, entry.label ?? "", { width: 256, height: 128, background: "#f7f3e6", color: "#1d1d1d", font: 72 }));
  plate.position.y = 1.45;
  group.add(plate);
  return group;
}

function drawStand(THREE: ThreeNamespace, entry: DownsProp): any {
  const group = new THREE.Group();
  const wood = standard(THREE, "#8a6440", 0.85, 0);
  const paint = standard(THREE, "#2f5f3a", 0.7, 0);
  // Four tiers of benches stepping up away from the track, a roof over them.
  for (let tier = 0; tier < 4; tier += 1) {
    tbox(THREE, group, [entry.width, 0.5 + tier * 0.5, 1.2], [0, (0.5 + tier * 0.5) / 2, -entry.depth / 2 + 0.6 + tier * 1.3], wood);
    box(THREE, group, [entry.width - 0.4, 0.08, 0.35], [0, 0.55 + tier * 0.5, -entry.depth / 2 + 0.5 + tier * 1.3], paint);
  }
  for (const x of [-entry.width / 2 + 0.2, 0, entry.width / 2 - 0.2]) tbox(THREE, group, [0.2, 4.4, 0.2], [x, 2.2, entry.depth / 2 - 0.3], wood);
  const roof = box(THREE, group, [entry.width + 0.8, 0.14, entry.depth + 0.6], [0, 4.45, 0], standard(THREE, "#c8b98f", 0.8, 0));
  roof.rotation.x = -0.12;
  return group;
}

function drawBooth(THREE: ThreeNamespace, entry: DownsProp): any {
  const group = new THREE.Group();
  const wood = standard(THREE, "#f0e4c8", 0.7, 0);
  tbox(THREE, group, [entry.width, 1.1, entry.depth], [0, 0.55, 0], wood);
  tbox(THREE, group, [entry.width, 1.1, 0.1], [0, 2.05, entry.depth / 2 - 0.05], wood);
  for (const side of [-1, 1]) tbox(THREE, group, [0.12, 2.4, 0.12], [side * (entry.width / 2 - 0.06), 1.2, -entry.depth / 2 + 0.06], wood);
  // A striped awning and the sign.
  for (let index = 0; index < 6; index += 1) {
    const stripe = box(THREE, group, [entry.width / 6, 0.06, 1.2], [-entry.width / 2 + entry.width / 12 + index * entry.width / 6, 2.7, -entry.depth / 2 - 0.35], standard(THREE, index % 2 ? WHITE : RED, 0.7, 0));
    stripe.rotation.x = 0.25;
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(entry.width, 0.55, 0.06), sign(THREE, entry.label ?? "", { background: "#7a1f1f", font: 64 }));
  board.position.set(0, 3.15, -entry.depth / 2 - 0.1);
  group.add(board);
  return group;
}

function drawBoard(THREE: ThreeNamespace, entry: DownsProp): any {
  const group = new THREE.Group();
  const wood = standard(THREE, "#6b4a2e", 0.85, 0);
  for (const side of [-1, 1]) tbox(THREE, group, [0.14, 2.3, 0.14], [side * (entry.width / 2 - 0.1), 1.15, 0], wood);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(entry.width, 1.1, 0.08), [wood, wood, wood, wood, sign(THREE, entry.label ?? "", { width: 512, height: 256, background: "#243a28", font: 60 }), sign(THREE, entry.label ?? "", { width: 512, height: 256, background: "#243a28", font: 60 })]);
  panel.position.y = 1.6;
  panel.castShadow = true;
  group.add(panel);
  // A little roof to keep the notices dry.
  const roof = box(THREE, group, [entry.width + 0.3, 0.08, 0.5], [0, 2.3, 0], wood);
  roof.rotation.x = 0.2;
  return group;
}

function drawPost(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  tbox(THREE, group, [0.2, 2.4, 0.2], [0, 1.2, 0], standard(THREE, WHITE, 0.6, 0));
  const disc = cylinder(THREE, group, 0.35, 0.35, 0.06, [0, 2.5, 0], standard(THREE, RED, 0.6, 0), 20);
  disc.rotation.x = Math.PI / 2;
  return group;
}

function drawProp(THREE: ThreeNamespace, entry: DownsProp, seed: number): any {
  switch (entry.kind) {
    case "tree": return createTree(THREE, seed);
    case "pine": return createPine(THREE, seed);
    case "trough": return createTrough(THREE);
    case "bench": return createBench(THREE);
    case "lamp": return createLampPost(THREE);
    case "rail": return createHitchingRail(THREE);
    case "arch": return drawArch(THREE, entry);
    case "marker": return drawMarker(THREE, entry);
    case "post": return drawPost(THREE);
    case "stand": return drawStand(THREE, entry);
    case "booth": return drawBooth(THREE, entry);
    case "raceboard": return drawBoard(THREE, entry);
    case "board": return drawBoard(THREE, entry);
    default: return new THREE.Group();
  }
}

export function createDownsProps(THREE: ThreeNamespace, scene: any): DownsProps {
  const root = new THREE.Group();
  root.name = "downs-props";
  scene.add(root);
  for (const fence of [...NOVICE_FENCES, ...OPEN_FENCES, ...OPEN_COUNTRY_FENCES]) root.add(drawFence(THREE, fence));
  const standard_ = new THREE.Group();
  const championship = new THREE.Group();
  for (const fence of XC_FENCES) standard_.add(drawFence(THREE, fence));
  for (const fence of XC_CHAMPIONSHIP_FENCES) championship.add(drawFence(THREE, fence));
  championship.visible = false;
  root.add(standard_, championship);
  for (const ring of DOWNS_RINGS) root.add(drawRails(THREE, ringRails(ring), RING_RAIL_HEIGHT));
  root.add(drawRails(THREE, ovalRails(), 1.05));
  DOWNS_PROPS.forEach((entry, index) => {
    const model = drawProp(THREE, entry, index + 11);
    model.position.set(entry.x, downsGround(entry), entry.z);
    model.rotation.y = entry.rotationY;
    model.traverse((node: any) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
    root.add(model);
  });
  return Object.freeze({
    showCrossCountry(on) {
      standard_.visible = !on;
      championship.visible = on;
    },
    dispose() {
      scene.remove(root);
    },
  });
}
