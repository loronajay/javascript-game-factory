// Shark Hall is a room-scale attraction, so its physical model stays separate
// from the upright cabinet builder. The proportions mirror Shark Hall's 9-foot
// table while the presentation is deliberately self-contained for the arcade.

import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";
import { SHARK_HALL_CABINET_ART } from "./arcade-room-scene.mjs";

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

function addCue(THREE: ThreeNamespace, parent: any, x: number, y: number, z: number, angle: number): void {
  const cue = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.024, 1.32, 10),
    material(THREE, "#d8aa67", 0.34),
  );
  cue.position.set(x, y, z);
  cue.rotation.z = Math.PI / 2;
  cue.rotation.y = angle;
  cue.castShadow = true;
  parent.add(cue);
}

function addPoolLight(THREE: ThreeNamespace, root: any, brass: any): void {
  const lightGroup = new THREE.Group();
  lightGroup.name = "table-light";
  root.add(lightGroup);
  box(THREE, lightGroup, "light-bar", [1.72, 0.075, 0.075], [0, 2.22, 0], brass);
  for (const x of [-0.56, 0.56]) {
    box(THREE, lightGroup, "light-chain", [0.022, 0.2, 0.022], [x, 2.32, 0], brass);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.24, 24, 1, true),
      material(THREE, "#173c35", 0.42, 0.18),
    );
    shade.position.set(x, 2.08, 0);
    shade.rotation.x = Math.PI;
    shade.castShadow = true;
    lightGroup.add(shade);
    const glow = new THREE.PointLight(0xffdf9a, 1.55, 3.4, 2);
    glow.position.set(x, 1.96, 0);
    lightGroup.add(glow);
  }
}

function addScoreDisplay(THREE: ThreeNamespace, root: any, shell: any, brass: any): void {
  for (const x of [-0.58, 0.58]) {
    box(THREE, root, "score-post", [0.045, 0.62, 0.045], [x, 1.1, -0.72], brass);
  }
  box(THREE, root, "score-display", [1.5, 0.88, 0.12], [0, 1.42, -0.72], shell);
  box(THREE, root, "score-trim-top", [1.56, 0.045, 0.15], [0, 1.875, -0.72], brass);
  box(THREE, root, "score-trim-bottom", [1.56, 0.045, 0.15], [0, 0.965, -0.72], brass);
  const texture = new THREE.TextureLoader().load(SHARK_HALL_CABINET_ART.keyArt);
  texture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.32, 0.7425),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  screen.name = "screen";
  screen.position.set(0, 1.42, -0.654);
  root.add(screen);
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
  addCue(THREE, root, -0.62, 0.59, 0.875, 0.04);
  addCue(THREE, root, 0.68, 0.52, 0.878, -0.03);

  const fin = new THREE.Shape();
  fin.moveTo(-0.16, -0.07);
  fin.quadraticCurveTo(0.02, 0.18, 0.2, -0.07);
  fin.quadraticCurveTo(0.02, 0.01, -0.16, -0.07);
  const emblem = new THREE.Mesh(new THREE.ShapeGeometry(fin, 12), new THREE.MeshBasicMaterial({ color: definition.palette.trim }));
  emblem.position.set(0, 0.69, 0.868);
  root.add(emblem);

  addScoreDisplay(THREE, root, walnut, brass);
  addPoolLight(THREE, root, brass);
  return root;
}
