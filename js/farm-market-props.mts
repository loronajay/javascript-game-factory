// The Market Square's stalls and order board, drawn from their one description
// in farm-market-square.mts and the farm's own textured primitives
// (farm-materials.mts), so a stall sits in the same world as the barn and
// blocks exactly where it is drawn. Everything else in the square is an
// ordinary farm decor row and is drawn by farm-props.mts.

import { canvasPlane } from "./arcade-room-decor-primitives.mjs";
import { farmMaterial, tbox, tcylinder, tsphere, type ThreeNamespace } from "./farm-materials.mjs";
import type { MarketStall } from "./farm-market-square.mjs";

const COUNTER_HEIGHT = 1.02;
const POST_HEIGHT = 2.5;

function stripedCanvas(THREE: ThreeNamespace, colors: readonly [string, string]): any {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const stripes = 8;
  for (let index = 0; index < stripes; index += 1) {
    context.fillStyle = index % 2 === 0 ? colors[0] : colors[1];
    context.fillRect((index * canvas.width) / stripes, 0, canvas.width / stripes + 1, canvas.height);
  }
  // A little weave so the canvas reads as cloth, not paint.
  context.globalAlpha = 0.07;
  context.fillStyle = "#000";
  for (let y = 0; y < canvas.height; y += 3) context.fillRect(0, y, canvas.width, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function awningMaterial(THREE: ThreeNamespace, colors: readonly [string, string]): any {
  return new THREE.MeshStandardMaterial({ map: stripedCanvas(THREE, colors), roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
}

function drawSign(context: CanvasRenderingContext2D, width: number, height: number, title: string, ink: string, sub: string): void {
  context.fillStyle = "#f4ecd6";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = ink;
  context.lineWidth = 10;
  context.strokeRect(8, 8, width - 16, height - 16);
  context.fillStyle = ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${Math.round(height * (sub ? 0.36 : 0.5))}px Georgia, serif`;
  context.fillText(title.toUpperCase(), width / 2, sub ? height * 0.4 : height / 2, width - 40);
  if (sub) {
    context.font = `600 ${Math.round(height * 0.2)}px Georgia, serif`;
    context.fillText(sub, width / 2, height * 0.76, width - 40);
  }
}

/** A heaped crate of one crop, for the open stall's counter. */
function produceCrate(THREE: ThreeNamespace, group: any, x: number, z: number, color: string, y: number): void {
  const wood = farmMaterial(THREE, "wood", { colors: ["#9a7248", "#6e4d2c"] });
  tbox(THREE, group, [0.5, 0.16, 0.36], [x, y + 0.08, z], wood);
  const fruit = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const heap = [[-0.14, -0.08], [0, -0.08], [0.14, -0.08], [-0.14, 0.08], [0, 0.08], [0.14, 0.08], [-0.07, 0], [0.07, 0]];
  heap.forEach(([dx, dz], index) => {
    tsphere(THREE, group, 0.075, [x + dx, y + 0.18 + (index >= 6 ? 0.07 : 0), z + dz], fruit, 10, 8);
  });
}

function buildStall(THREE: ThreeNamespace, group: any, stall: MarketStall): void {
  const { width, depth } = stall.footprint;
  const wood = farmMaterial(THREE, "wood", { colors: ["#8a6440", "#5f4128"] });
  const planks = farmMaterial(THREE, "planks", { colors: ["#a07650", "#7a5534", "#5d3f26"] });
  const battens = farmMaterial(THREE, "battens", { colors: ["#8f6a45", "#6b4b2c"] });
  const front = depth / 2;
  const back = -depth / 2;

  // The counter across the front and a bench of shelving at the back.
  tbox(THREE, group, [width, COUNTER_HEIGHT, 0.6], [0, COUNTER_HEIGHT / 2, front - 0.3], planks);
  tbox(THREE, group, [width + 0.1, 0.06, 0.72], [0, COUNTER_HEIGHT + 0.03, front - 0.3], wood);
  tbox(THREE, group, [width, 2.3, 0.08], [0, 1.15, back + 0.04], battens);
  tbox(THREE, group, [width - 0.2, 0.05, 0.4], [0, 1.25, back + 0.28], wood);
  // Corner posts carry the awning.
  for (const sx of [-1, 1]) {
    for (const [z, height] of [[front - 0.06, POST_HEIGHT - 0.3], [back + 0.06, POST_HEIGHT]] as const) {
      tcylinder(THREE, group, 0.06, 0.07, height, [sx * (width / 2 - 0.06), height / 2, z], wood, 10);
    }
  }
  // The awning: a sloped striped canvas from the back beam out past the counter, with a valance.
  const awning = awningMaterial(THREE, stall.colors);
  const run = depth + 0.5;
  const drop = 0.4;
  const slope = Math.atan2(drop, run);
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.3, Math.hypot(run, drop)), awning);
  sheet.rotation.x = -Math.PI / 2 + slope;
  sheet.position.set(0, POST_HEIGHT + 0.05 - drop / 2, back + run / 2);
  sheet.castShadow = true;
  sheet.receiveShadow = true;
  group.add(sheet);
  const valance = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.3, 0.26), awning);
  valance.position.set(0, POST_HEIGHT + 0.05 - drop - 0.13, back + run);
  group.add(valance);

  // The name board stands on the awning's front edge, above the keeper's head and name tag.
  const board = Math.min(width - 0.2, 2.6);
  tbox(THREE, group, [board + 0.12, 0.56, 0.05], [0, POST_HEIGHT - 0.02, front + 0.24], wood);
  canvasPlane(THREE, group, board, 0.48, [640, 118], (context, w, h) => drawSign(context, w, h, stall.title, stall.colors[0], ""), [0, POST_HEIGHT - 0.02, front + 0.27], false);

  if (stall.open) {
    // Stock on the counter and on the back shelf.
    const crops = ["#d8412f", "#f08a24", "#6aa84f", "#7b3fa0", "#e6c64a", "#b5332e"];
    const y = COUNTER_HEIGHT + 0.06;
    [-1.05, -0.35, 0.35, 1.05].forEach((x, index) => produceCrate(THREE, group, x, front - 0.32, crops[index]!, y));
    [-0.8, 0.8].forEach((x, index) => produceCrate(THREE, group, x, back + 0.28, crops[index + 4]!, 1.28));
    // A hanging scale at the corner of the counter.
    const iron = new THREE.MeshStandardMaterial({ color: "#4a4a4a", roughness: 0.4, metalness: 0.7 });
    tcylinder(THREE, group, 0.012, 0.012, 0.5, [width / 2 - 0.35, POST_HEIGHT - 0.7, front - 0.2], iron, 6, false);
    tcylinder(THREE, group, 0.16, 0.12, 0.04, [width / 2 - 0.35, POST_HEIGHT - 0.97, front - 0.2], iron, 16);
    return;
  }
  // Shut: a board shutter over the opening and a notice pinned to it.
  const shutter = farmMaterial(THREE, "planks", { colors: ["#7c5b3c", "#5d4029", "#43301f"] });
  const opening = POST_HEIGHT - 0.3 - COUNTER_HEIGHT - 0.35;
  tbox(THREE, group, [width - 0.16, opening, 0.05], [0, COUNTER_HEIGHT + 0.06 + opening / 2, front - 0.08], shutter);
  canvasPlane(THREE, group, 0.9, 0.5, [360, 200], (context, w, h) => drawSign(context, w, h, "Closed", "#6b4b2c", "opening soon"), [0, COUNTER_HEIGHT + 0.06 + opening / 2, front - 0.05], false);
}

function buildBoard(THREE: ThreeNamespace, group: any, stall: MarketStall): void {
  const { width } = stall.footprint;
  const wood = farmMaterial(THREE, "wood", { colors: ["#8a6440", "#5f4128"] });
  const planks = farmMaterial(THREE, "planks", { colors: ["#a07650", "#7a5534", "#5d3f26"] });
  const shingles = farmMaterial(THREE, "shingles", { colors: ["#6b4b2c", "#4e351e"] });
  for (const sx of [-1, 1]) tbox(THREE, group, [0.12, 2.5, 0.12], [sx * (width / 2 - 0.06), 1.25, 0], wood);
  tbox(THREE, group, [width - 0.1, 1.3, 0.08], [0, 1.45, 0], planks);
  tbox(THREE, group, [width + 0.3, 0.06, 0.5], [0, 2.52, 0.05], shingles);
  canvasPlane(THREE, group, width - 0.4, 0.34, [640, 110], (context, w, h) => drawSign(context, w, h, stall.title, stall.colors[0], ""), [0, 2.24, 0.05], false);
  // An empty board: pins and the one notice that says why.
  canvasPlane(THREE, group, 1.2, 0.8, [420, 280], (context, w, h) => drawSign(context, w, h, "No orders", "#6b4b2c", "contracts open soon"), [0, 1.4, 0.05], false);
}

/** One stall's group, posed in the square. */
export function createMarketStallModel(THREE: ThreeNamespace, stall: MarketStall): any {
  const group = new THREE.Group();
  group.name = `market-stall-${stall.id}`;
  if (stall.kind === "board") buildBoard(THREE, group, stall);
  else buildStall(THREE, group, stall);
  group.position.set(stall.x, 0, stall.z);
  group.rotation.y = stall.rotationY;
  return group;
}
