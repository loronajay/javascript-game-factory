// Windrush Downs, drawn: the sky, the light, the rolling ground and the tracks
// worn into it, the water, the far hills and the fence round it all
// (planning-docs/FARM_RIDING_PLAN.md).
//
// The farm's world is built round a 28 m field — its sun's shadow box, its
// hills and treeline ring the field, its fog closes in at 90 m — so the Downs
// draws its own, two hundred metres across, from the same parts: the farm's
// sky colours, the room's procedural surfaces (grass, dirt, gravel), the
// farm's tree builders. The ground is `downsGround` exactly: the mesh, the
// tracks laid over it and every prop stand on that one function. The sun's
// shadow box follows the rider, so shadows are crisp wherever they are.

import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { findGround } from "./farm-catalog/ground.mjs";
import { SKY } from "./farm-world.mjs";
import { createPine, createTree } from "./farm-props-plants.mjs";
import { DOWNS_BOUNDS, DOWNS_EARTHWORKS, DOWNS_HALF_DEPTH, DOWNS_HALF_WIDTH, DOWNS_STREAM, DOWNS_ZONES, downsGround, downsWaterSurface } from "./downs-terrain.mjs";
import { DOWNS_GATE, OVAL, XC_TRAIL, ovalPoint, type DownsPoint } from "./downs-scene.mjs";
import type { SurfaceStyle } from "./arcade-room-catalog/surfaces.mjs";

type ThreeNamespace = Record<string, any>;

export type DownsWorld = Readonly<{
  /** Follow the rider with the sun's shadow box. */
  update: (dt: number, focus: DownsPoint) => void;
  dispose: () => void;
}>;

/** How far past the fence the ground runs before the fog. */
export const APRON = 90;
export const FOG = Object.freeze({ near: 70, far: 330 });
const UV_SPAN = Object.freeze({ u: 20, v: 20 });

const style = (id: string): SurfaceStyle => findGround(id)!.style;
const TURF: SurfaceStyle = Object.freeze({ ...style("ground.clover"), colors: Object.freeze(["#5c9e45", "#3f7a31", "#86c264", "#6b8a3c"]) });
const TRACK: SurfaceStyle = Object.freeze({ pattern: "dirt", colors: Object.freeze(["#9b7a4f", "#7d5f3a", "#b8966a", "#8a7a52"]), repeat: 8, roughness: 0.95, metalness: 0 });
const SAND: SurfaceStyle = Object.freeze({ pattern: "dirt", colors: Object.freeze(["#d8c28e", "#bea673", "#e8d6a6", "#c9b27e"]), repeat: 9, roughness: 0.95, metalness: 0 });
const MOWN: SurfaceStyle = Object.freeze({ ...style("ground.meadow"), colors: Object.freeze(["#7fb452", "#5f943d", "#a2cf70", "#7a6a3c"]) });

/** A planar UV (metres ÷ 20) for every vertex, so every surface tiles at the same scale and never stretches. */
function planarUvs(THREE: ThreeNamespace, geometry: any): void {
  const position = geometry.attributes.position;
  const uv = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uv[index * 2] = position.getX(index) / UV_SPAN.u;
    uv[index * 2 + 1] = position.getZ(index) / UV_SPAN.v;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function createSkyDome(THREE: ThreeNamespace): any {
  const material = new THREE.ShaderMaterial({
    uniforms: { horizon: { value: new THREE.Color(SKY.horizon) }, zenith: { value: new THREE.Color(SKY.zenith) } },
    vertexShader: "varying float vHeight; void main() { vHeight = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 horizon; uniform vec3 zenith; varying float vHeight; void main() { float t = clamp(vHeight * 1.6, 0.0, 1.0); t = t * t * (3.0 - 2.0 * t); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }",
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 16), material);
  dome.name = "downs-sky";
  return dome;
}

/** The ground: one grid over the Downs and its apron, every vertex on `downsGround`. */
function createTerrain(THREE: ThreeNamespace): any {
  const width = DOWNS_BOUNDS.width + APRON * 2;
  const depth = DOWNS_BOUNDS.depth + APRON * 2;
  const step = 2.5;
  const geometry = new THREE.PlaneGeometry(width, depth, Math.round(width / step), Math.round(depth / step));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index);
    // Out on the apron the land keeps rolling, then lifts a little toward the hills.
    const past = Math.max(0, Math.abs(x) - DOWNS_HALF_WIDTH, Math.abs(z) - DOWNS_HALF_DEPTH);
    position.setY(index, downsGround({ x, z }) + past * past * 0.0016);
  }
  geometry.computeVertexNormals();
  planarUvs(THREE, geometry);
  const mesh = new THREE.Mesh(geometry, createSurfaceMaterial(THREE, style("ground.meadow"), UV_SPAN));
  mesh.name = "downs-ground";
  mesh.receiveShadow = true;
  return mesh;
}

/** A strip laid over the ground along a path of points (a track, the trail), `lift` above it. */
function createRibbon(THREE: ThreeNamespace, points: readonly DownsPoint[], width: number, surface: SurfaceStyle, lift = 0.04, closed = false): any {
  const positions: number[] = [];
  const indices: number[] = [];
  const count = points.length;
  for (let index = 0; index < count; index += 1) {
    const prev = points[closed ? (index - 1 + count) % count : Math.max(0, index - 1)]!;
    const next = points[closed ? (index + 1) % count : Math.min(count - 1, index + 1)]!;
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    for (const side of [-1, 1]) {
      const x = points[index]!.x + nx * side * width / 2;
      const z = points[index]!.z + nz * side * width / 2;
      positions.push(x, downsGround({ x, z }) + lift, z);
    }
    if (index < count - 1 || closed) {
      const a = index * 2;
      const b = ((index + 1) % count) * 2;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  planarUvs(THREE, geometry);
  const material = createSurfaceMaterial(THREE, surface, UV_SPAN);
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** A path smoothed through its waypoints and sampled about every metre. */
export function smoothPath(points: readonly DownsPoint[], spacing = 1.2): DownsPoint[] {
  const out: DownsPoint[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(points.length - 1, index + 2)]!;
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / spacing));
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (a: number, b: number, c: number, d: number) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: at(p0.x, p1.x, p2.x, p3.x), z: at(p0.z, p1.z, p2.z, p3.z) });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

function rectRibbon(zone: typeof DOWNS_ZONES.green, inset: number): DownsPoint[] {
  const z = (zone.minZ + zone.maxZ) / 2;
  const points: DownsPoint[] = [];
  for (let x = zone.minX + inset; x <= zone.maxX - inset + 1e-6; x += 2) points.push({ x, z });
  return points;
}

function createWater(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  group.name = "downs-water";
  const material = new THREE.MeshStandardMaterial({ color: 0x4f8fb0, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.78 });
  const splash = DOWNS_EARTHWORKS.find((work) => work.kind === "splash")!;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), material);
  disc.rotation.x = -Math.PI / 2;
  disc.rotation.z = splash.heading;
  disc.scale.set(splash.width / 2, splash.depth / 2, 1);
  disc.position.set(splash.x, (downsWaterSurface(splash) ?? 0) + 0.01, splash.z);
  group.add(disc);
  const stream = new THREE.Mesh(new THREE.PlaneGeometry(DOWNS_BOUNDS.width + APRON * 2, DOWNS_STREAM.halfWidth * 2 + 1.6), material);
  stream.rotation.x = -Math.PI / 2;
  stream.position.set(0, (downsWaterSurface({ x: 0, z: DOWNS_STREAM.z }) ?? 0) + 0.01, DOWNS_STREAM.z);
  group.add(stream);
  return group;
}

/** A seeded generator for the scenery (the same hills for everyone). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createCountryside(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  group.name = "downs-countryside";
  const random = seeded(3141);
  const hillMaterial = new THREE.MeshStandardMaterial({ color: 0x6a8f52, roughness: 1, flatShading: true });
  for (let index = 0; index < 22; index += 1) {
    const angle = (index / 22) * Math.PI * 2 + random() * 0.2;
    const radius = 230 + random() * 60;
    const height = 18 + random() * 30;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMaterial);
    hill.scale.set(40 + random() * 40, height, 40 + random() * 40);
    hill.position.set(Math.cos(angle) * radius, -2, Math.sin(angle) * radius * 0.9);
    group.add(hill);
  }
  // A treeline just outside the fence, gapped at the gate to the square.
  for (let index = 0; index < 110; index += 1) {
    const side = index % 4;
    const along = (random() - 0.5) * 2;
    const out = 4 + random() * 22;
    const x = side === 0 ? along * (DOWNS_HALF_WIDTH + 10) : side === 1 ? DOWNS_HALF_WIDTH + out : side === 2 ? along * (DOWNS_HALF_WIDTH + 10) : -DOWNS_HALF_WIDTH - out;
    const z = side === 0 ? -DOWNS_HALF_DEPTH - out : side === 1 ? along * (DOWNS_HALF_DEPTH + 10) : side === 2 ? DOWNS_HALF_DEPTH + out : along * (DOWNS_HALF_DEPTH + 10);
    if (side === 1 && Math.abs(z - DOWNS_GATE.z) < 12) continue;
    const tree = random() < 0.5 ? createPine(THREE, index + 7) : createTree(THREE, index + 7);
    tree.scale.setScalar(1.1 + random() * 0.8);
    tree.position.set(x, downsGround({ x, z }) + Math.max(0, out - 4) * 0.02, z);
    tree.rotation.y = random() * Math.PI * 2;
    group.add(tree);
  }
  return group;
}

/** The post-and-rail fence round the Downs, draped over the ground, open at the gate to the square. */
function createPerimeter(THREE: ThreeNamespace): any {
  const group = new THREE.Group();
  group.name = "downs-perimeter";
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5534, roughness: 0.9 });
  const w = DOWNS_HALF_WIDTH - 0.5;
  const d = DOWNS_HALF_DEPTH - 0.5;
  const corners: DownsPoint[] = [{ x: -w, z: -d }, { x: w, z: -d }, { x: w, z: d }, { x: -w, z: d }];
  const postGeometry = new THREE.BoxGeometry(0.16, 1.3, 0.16);
  const railGeometry = new THREE.BoxGeometry(1, 0.1, 0.06);
  const posts: any[] = [];
  const rails: any[] = [];
  const spacing = 3;
  for (let side = 0; side < 4; side += 1) {
    const a = corners[side]!;
    const b = corners[(side + 1) % 4]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(length / spacing);
    for (let step = 0; step < steps; step += 1) {
      const p = { x: a.x + (b.x - a.x) * step / steps, z: a.z + (b.z - a.z) * step / steps };
      const q = { x: a.x + (b.x - a.x) * (step + 1) / steps, z: a.z + (b.z - a.z) * (step + 1) / steps };
      const gap = (point: DownsPoint) => Math.abs(point.x - w) < 0.01 && Math.abs(point.z - DOWNS_GATE.z) < DOWNS_GATE.width / 2;
      if (!gap(p)) posts.push(p);
      if (gap(p) || gap(q) || (Math.abs(p.x - w) < 0.01 && Math.abs(q.x - w) < 0.01 && Math.min(p.z, q.z) < DOWNS_GATE.z + DOWNS_GATE.width / 2 && Math.max(p.z, q.z) > DOWNS_GATE.z - DOWNS_GATE.width / 2)) continue;
      rails.push([p, q]);
    }
  }
  const postMesh = new THREE.InstancedMesh(postGeometry, wood, posts.length);
  const railMesh = new THREE.InstancedMesh(railGeometry, wood, rails.length * 2);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  posts.forEach((point, index) => {
    matrix.compose(new THREE.Vector3(point.x, downsGround(point) + 0.6, point.z), quaternion.identity(), new THREE.Vector3(1, 1, 1));
    postMesh.setMatrixAt(index, matrix);
  });
  rails.forEach(([p, q], index) => {
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    const angle = -Math.atan2(q.z - p.z, q.x - p.x);
    const pitch = Math.atan2(downsGround(q) - downsGround(p), length);
    const rotation = new THREE.Quaternion().setFromAxisAngle(up, angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
    for (const [slot, height] of [[0, 0.62], [1, 1.1]] as const) {
      const mid = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
      matrix.compose(new THREE.Vector3(mid.x, (downsGround(p) + downsGround(q)) / 2 + height, mid.z), rotation, new THREE.Vector3(length, 1, 1));
      railMesh.setMatrixAt(index * 2 + slot, matrix);
    }
  });
  postMesh.castShadow = true;
  railMesh.castShadow = true;
  group.add(postMesh, railMesh);
  return group;
}

export function createDownsWorld(THREE: ThreeNamespace, scene: any): DownsWorld {
  scene.background = new THREE.Color(SKY.horizon);
  scene.fog = new THREE.Fog(SKY.horizon, FOG.near, FOG.far);
  const sky = createSkyDome(THREE);
  scene.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xd6ecff, 0x5a7a3a, 1.05);
  scene.add(hemisphere);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  const sunOffset = new THREE.Vector3(-36, 52, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const box = 45;
  sun.shadow.camera.left = -box;
  sun.shadow.camera.right = box;
  sun.shadow.camera.top = box;
  sun.shadow.camera.bottom = -box;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  const terrain = createTerrain(THREE);
  scene.add(terrain);
  const tracks = new THREE.Group();
  tracks.name = "downs-tracks";
  // The Green's gravel, the gallop's turf lane, the rings' sand, the oval's dirt, the trail's mown line.
  tracks.add(createRibbon(THREE, rectRibbon(DOWNS_ZONES.green, 3), DOWNS_ZONES.green.maxZ - DOWNS_ZONES.green.minZ - 6, style("ground.gravel"), 0.03));
  tracks.add(createRibbon(THREE, rectRibbon({ ...DOWNS_ZONES.gallop, minX: -92, maxX: 90 }, 0), 11, TURF, 0.03));
  for (const zone of [DOWNS_ZONES.novice, DOWNS_ZONES.open]) tracks.add(createRibbon(THREE, rectRibbon(zone, 0), zone.maxZ - zone.minZ, SAND, 0.035));
  const oval: DownsPoint[] = [];
  for (let index = 0; index < 160; index += 1) oval.push(ovalPoint(index / 160));
  tracks.add(createRibbon(THREE, oval, OVAL.trackWidth, TRACK, 0.04, true));
  tracks.add(createRibbon(THREE, smoothPath(XC_TRAIL), 4.2, MOWN, 0.05));
  scene.add(tracks);
  const water = createWater(THREE);
  scene.add(water);
  const countryside = createCountryside(THREE);
  scene.add(countryside);
  const perimeter = createPerimeter(THREE);
  scene.add(perimeter);

  return Object.freeze({
    update(_dt, focus) {
      // Snap the shadow box to a grid so its texels do not swim as the rider moves.
      const snap = (value: number) => Math.round(value / 4) * 4;
      const fx = snap(focus.x);
      const fz = snap(focus.z);
      const fy = downsGround({ x: fx, z: fz });
      sun.target.position.set(fx, fy, fz);
      sun.position.set(fx + sunOffset.x, fy + sunOffset.y, fz + sunOffset.z);
      sky.position.set(focus.x, 0, focus.z);
    },
    dispose() {
      for (const object of [sky, hemisphere, sun, sun.target, terrain, tracks, water, countryside, perimeter]) scene.remove(object);
    },
  });
}
