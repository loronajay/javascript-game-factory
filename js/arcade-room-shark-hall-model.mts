// Shark Hall is a room-scale attraction, so its physical model stays separate
// from the upright cabinet builder. The proportions mirror Shark Hall's 9-foot
// table while the presentation is deliberately self-contained for the arcade.

import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";
type ThreeNamespace = Record<string, any>;

const PLAYING_LENGTH = 2.54;
const PLAYING_WIDTH = 1.27;
const HALF_LENGTH = PLAYING_LENGTH / 2;
const HALF_WIDTH = PLAYING_WIDTH / 2;
const BALL_RADIUS = 0.034;
const BED_Y = 0.84;

export const SHARK_HALL_POCKETS = Object.freeze([
  Object.freeze({ x: -HALF_LENGTH, z: -HALF_WIDTH }),
  Object.freeze({ x: -HALF_LENGTH, z: HALF_WIDTH }),
  Object.freeze({ x: HALF_LENGTH, z: -HALF_WIDTH }),
  Object.freeze({ x: HALF_LENGTH, z: HALF_WIDTH }),
  Object.freeze({ x: 0, z: -HALF_WIDTH }),
  Object.freeze({ x: 0, z: HALF_WIDTH }),
]);

const BALL_COLORS = Object.freeze([
  "#f4ca3a", "#245dc1", "#c93438", "#58328e", "#ec7627",
  "#25815f", "#7a2130", "#15171d", "#f4ca3a", "#245dc1",
  "#c93438", "#58328e", "#ec7627", "#25815f", "#7a2130",
]);

export const SHARK_HALL_RACK = Object.freeze(
  [0, 1, 2, 3, 4].flatMap((row) => Array.from({ length: row + 1 }, (_, index) => Object.freeze({
    x: 0.48 + row * BALL_RADIUS * 1.78,
    z: (index - row / 2) * BALL_RADIUS * 2.04,
    color: BALL_COLORS[(row * (row + 1)) / 2 + index]!,
  }))),
);

function material(THREE: ThreeNamespace, color: string, roughness = 0.52, metalness = 0.06): any {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function box(
  THREE: ThreeNamespace,
  parent: any,
  name: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  surface: any,
): any {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), surface);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addBall(THREE: ThreeNamespace, parent: any, name: string, x: number, z: number, color: string): void {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 18, 12),
    material(THREE, color, 0.2, 0.02),
  );
  ball.name = name;
  ball.position.set(x, BED_Y + BALL_RADIUS + 0.012, z);
  ball.castShadow = true;
  parent.add(ball);
}

function addCue(THREE: ThreeNamespace, parent: any, name: string, x: number, y: number, z: number, angle: number): void {
  const cue = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.024, 1.32, 10),
    material(THREE, "#d8aa67", 0.34),
  );
  cue.name = name;
  cue.position.set(x, y, z);
  cue.rotation.z = Math.PI / 2;
  cue.rotation.y = angle;
  cue.castShadow = true;
  parent.add(cue);
}

function addEdgeLighting(THREE: ThreeNamespace, root: any, color: string): void {
  const neon = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 3.4,
    roughness: 0.22,
    metalness: 0.08,
  });
  box(THREE, root, "neon-strip-front", [2.82, 0.035, 0.035], [0, 0.73, 0.878], neon);
  box(THREE, root, "neon-strip-back", [2.82, 0.035, 0.035], [0, 0.73, -0.878], neon);
  box(THREE, root, "neon-strip-left", [0.035, 0.035, 1.52], [-1.538, 0.73, 0], neon);
  box(THREE, root, "neon-strip-right", [0.035, 0.035, 1.52], [1.538, 0.73, 0], neon);

  for (const [x, z] of [[-0.88, 0.91], [0.88, 0.91], [-0.88, -0.91], [0.88, -0.91]] as const) {
    const glow = new THREE.PointLight(color, 0.72, 2.25, 2);
    glow.position.set(x, 0.67, z);
    root.add(glow);
  }
}

export function createSharkHallPoolTable(THREE: ThreeNamespace, definition: CabinetDefinition): any {
  const root = new THREE.Group();
  root.name = definition.id;
  root.userData = { cabinetId: definition.id, gameSlug: definition.gameSlug };

  const walnut = material(THREE, definition.palette.shell, 0.34, 0.06);
  const darkWalnut = material(THREE, "#160b08", 0.42, 0.04);
  const felt = material(THREE, definition.palette.grass, 0.96, 0);
  const cushion = material(THREE, "#162f44", 0.82, 0);
  const brass = material(THREE, definition.palette.trim, 0.26, 0.82);
  const black = material(THREE, "#050606", 0.96, 0.02);

  box(THREE, root, "table", [3.04, 0.3, 1.73], [0, 0.67, 0], walnut);
  box(THREE, root, "felt", [PLAYING_LENGTH, 0.055, PLAYING_WIDTH], [0, BED_Y, 0], felt);
  box(THREE, root, "rail-long-back", [3.04, 0.16, 0.23], [0, 0.87, -0.75], walnut);
  box(THREE, root, "rail-long-front", [3.04, 0.16, 0.23], [0, 0.87, 0.75], walnut);
  box(THREE, root, "rail-short-left", [0.25, 0.16, 1.27], [-1.395, 0.87, 0], walnut);
  box(THREE, root, "rail-short-right", [0.25, 0.16, 1.27], [1.395, 0.87, 0], walnut);

  for (const side of [-1, 1]) {
    box(THREE, root, "cushion-long", [2.42, 0.08, 0.055], [0, 0.89, side * 0.65], cushion);
    box(THREE, root, "cushion-short", [0.055, 0.08, 1.12], [side * 1.285, 0.89, 0], cushion);
  }

  for (const [index, pocket] of SHARK_HALL_POCKETS.entries()) {
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.035, 24), black);
    mouth.name = `pocket-${index + 1}`;
    mouth.position.set(pocket.x, 0.885, pocket.z);
    root.add(mouth);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.096, 0.009, 8, 24), brass);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(pocket.x, 0.908, pocket.z);
    root.add(ring);
  }

  for (const [x, z] of [[-1.19, -0.61], [-1.19, 0.61], [1.19, -0.61], [1.19, 0.61]] as const) {
    box(THREE, root, "leg", [0.25, 0.62, 0.25], [x, 0.31, z], darkWalnut);
    box(THREE, root, "leg-collar", [0.29, 0.08, 0.29], [x, 0.58, z], brass);
    box(THREE, root, "foot", [0.31, 0.08, 0.31], [x, 0.04, z], brass);
  }

  addBall(THREE, root, "cue-ball", -0.72, 0, "#f6f1df");
  SHARK_HALL_RACK.forEach((ball, index) => addBall(THREE, root, `rack-ball-${index + 1}`, ball.x, ball.z, ball.color));
  addCue(THREE, root, "cue-front", -0.08, 0.985, 0.78, 0.025);
  addCue(THREE, root, "cue-back", 0.12, 0.985, -0.78, -0.035);

  const fin = new THREE.Shape();
  fin.moveTo(-0.16, -0.07);
  fin.quadraticCurveTo(0.02, 0.18, 0.2, -0.07);
  fin.quadraticCurveTo(0.02, 0.01, -0.16, -0.07);
  const emblem = new THREE.Mesh(new THREE.ShapeGeometry(fin, 12), new THREE.MeshBasicMaterial({ color: definition.palette.trim }));
  emblem.position.set(0, 0.69, 0.868);
  root.add(emblem);

  addEdgeLighting(THREE, root, definition.palette.trim);
  return root;
}
