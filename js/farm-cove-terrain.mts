// The Cove's ground and water: the shore, the banks, both beds, the water's
// surface, the docks, a moored boat, the lighthouse on the spit, and the
// reeds and rocks at the water's edge.
//
// Everything is drawn FROM the pure profile in farm-cove.mts — the heightfield
// samples `coveGroundAt`, the reeds stand where the lagoon's bank is, the
// docks sit on `COVE_DOCKS` — so what the eye sees is what the walker and the
// server hold a cast to. The docks and the boat are the Quaternius pack's
// models (farm/assets/fishing/); the rest is procedural.

import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { COVE_GROUND_STYLES, coveGroundSurfaceAt, type CoveGroundSurface } from "./farm-cove-ground.mjs";
import {
  COVE_DOCKS,
  COVE_WATER_LEVEL,
  LIGHTHOUSE,
  coveGroundAt,
  coveWaterAt,
  coveWaterDistance,
  onDock,
  type CoveDock,
} from "./farm-cove.mjs";

type ThreeNamespace = Record<string, any>;

export type CoveTerrain = Readonly<{
  /** Ripple the water, bob the boat, turn the lighthouse's lamp. */
  update: (dt: number, seconds: number) => void;
  /** The water's surface, for anything that must draw after it. */
  water: any;
}>;

/** Pier sections (Dock_Long) are this long and this wide in the model's own units; the deck is this high. */
const DOCK_MODEL = Object.freeze({ width: 9.21, length: 21.69, deck: 3.95 });
const HEAD_MODEL = Object.freeze({ width: 14.63, length: 21.69, deck: 3.95 });
const SECTION_LENGTH = 6;

function assetUrl(file: string): string {
  return new URL(`../farm/assets/fishing/${file}`, import.meta.url).toString();
}

/** A small, stable noise: the same Cove every load. */
function hash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz);
  const b = hash(ix + 1, iz);
  const c = hash(ix, iz + 1);
  const d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const GROUND_SURFACES: readonly CoveGroundSurface[] = Object.freeze(["turf", "shore", "lagoon", "reef", "deep"]);

function heightfield(THREE: ThreeNamespace, size: number, segments: number, centre: Readonly<{ x: number; z: number }>, drop: number): any {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index) + centre.x;
    const z = position.getZ(index) + centre.z;
    const bump = coveWaterAt({ x, z }) ? 0 : (smoothNoise(x * 0.2, z * 0.2) - 0.5) * 0.06 * Math.min(1, Math.max(0, -coveWaterDistance({ x, z }) - 3) / 3);
    const height = coveGroundAt({ x, z }) + bump - drop;
    position.setXYZ(index, x, height, z);
  }

  // Sort triangles into a handful of material groups. This keeps the detailed
  // farm meadow on dry land and the same renderer's sediment on the shore and
  // beds without making grass blades show through the water.
  const source = geometry.index;
  if (!source) throw new Error("The Cove heightfield requires indexed plane geometry");
  const triangles: number[][] = GROUND_SURFACES.map(() => []);
  for (let offset = 0; offset < source.count; offset += 3) {
    const a = source.getX(offset);
    const b = source.getX(offset + 1);
    const c = source.getX(offset + 2);
    const x = (position.getX(a) + position.getX(b) + position.getX(c)) / 3;
    const z = (position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3;
    const material = GROUND_SURFACES.indexOf(coveGroundSurfaceAt({ x, z }));
    triangles[material]!.push(a, b, c);
  }
  geometry.setIndex(triangles.flat());
  geometry.clearGroups();
  let start = 0;
  triangles.forEach((indices, materialIndex) => {
    if (indices.length) geometry.addGroup(start, indices.length, materialIndex);
    start += indices.length;
  });
  geometry.computeVertexNormals();
  const materials = GROUND_SURFACES.map((surface) => createSurfaceMaterial(THREE, COVE_GROUND_STYLES[surface], { u: size, v: size }));
  const mesh = new THREE.Mesh(geometry, materials);
  mesh.receiveShadow = true;
  return mesh;
}

/** A tiling ripple normal map, drawn once. */
function rippleNormals(THREE: ThreeNamespace): any {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      heights[y * size + x] = Math.sin(u * 3 + Math.sin(v * 2) * 1.2) * 0.5 + Math.sin(v * 5 + u) * 0.3 + Math.sin((u + v) * 7) * 0.2;
    }
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const left = heights[y * size + ((x + size - 1) % size)]!;
      const right = heights[y * size + ((x + 1) % size)]!;
      const up = heights[((y + size - 1) % size) * size + x]!;
      const down = heights[((y + 1) % size) * size + x]!;
      const nx = (left - right) * 0.8;
      const ny = (up - down) * 0.8;
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * size + x) * 4;
      image.data[offset] = ((nx / length) * 0.5 + 0.5) * 255;
      image.data[offset + 1] = ((ny / length) * 0.5 + 0.5) * 255;
      image.data[offset + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(60, 60);
  return texture;
}

function placeDock(THREE: ThreeNamespace, root: any, loader: any, dock: CoveDock): void {
  const width = dock.deck.maxX - dock.deck.minX;
  const depth = dock.deck.maxZ - dock.deck.minZ;
  if (dock.kind === "head") {
    // The wide dock turned across the pier's end: its length runs east-west.
    loader.load(assetUrl("dock-wide.glb"), (gltf: any) => {
      const model = gltf.scene;
      const along = width / HEAD_MODEL.length;
      const across = (depth + 0.3) / HEAD_MODEL.width;
      const up = (along + across) / 2;
      model.scale.set(across, up, along);
      model.rotation.y = Math.PI / 2;
      model.position.set((dock.deck.minX + dock.deck.maxX) / 2, -HEAD_MODEL.deck * up, (dock.deck.minZ + dock.deck.maxZ) / 2);
      shade(model);
      root.add(model);
    });
    return;
  }
  const sections = Math.max(1, Math.round(depth / SECTION_LENGTH));
  const along = depth / sections / DOCK_MODEL.length;
  const across = (width + 0.25) / DOCK_MODEL.width;
  const up = across;
  for (let index = 0; index < sections; index += 1) {
    // Rope rails over the water; the section on the shore has none.
    const onShore = index === sections - 1;
    loader.load(assetUrl(onShore ? "dock-long-no-rope.glb" : "dock-long.glb"), (gltf: any) => {
      const model = gltf.scene;
      model.scale.set(across, up, along);
      model.position.set((dock.deck.minX + dock.deck.maxX) / 2, -DOCK_MODEL.deck * up, dock.deck.minZ + (index + 0.5) * (depth / sections));
      shade(model);
      root.add(model);
    });
  }
}

function shade(model: any): void {
  model.traverse((node: any) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

function createLighthouse(THREE: ThreeNamespace): { group: any; lamp: any; beam: any } {
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: "#f3efe6", roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: "#b83a2e", roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.5, metalness: 0.4 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 1.2, 16), new THREE.MeshStandardMaterial({ color: "#8a8478", roughness: 0.95 }));
  base.position.y = 0.6;
  group.add(base);
  const bands = 6;
  for (let index = 0; index < bands; index += 1) {
    const bottom = 1.2 + index * 1.6;
    const r0 = 1.7 - index * 0.12;
    const r1 = 1.7 - (index + 1) * 0.12;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 1.6, 16), index % 2 ? red : white);
    band.position.y = bottom + 0.8;
    band.castShadow = true;
    group.add(band);
  }
  const top = 1.2 + bands * 1.6;
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.18, 16), dark);
  gallery.position.y = top + 0.09;
  group.add(gallery);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 12), new THREE.MeshStandardMaterial({ color: "#fff6c9", emissive: "#ffe38a", emissiveIntensity: 1.6, transparent: true, opacity: 0.9 }));
  lamp.position.y = top + 0.75;
  group.add(lamp);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1, 16), red);
  roof.position.y = top + 1.8;
  group.add(roof);
  const beamGeometry = new THREE.ConeGeometry(1.2, 18, 12, 1, true);
  beamGeometry.translate(0, -9, 0);
  beamGeometry.rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: "#fff3b0", transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  beam.position.y = top + 0.75;
  group.add(beam);
  return { group, lamp, beam };
}

export function createCoveTerrain(THREE: ThreeNamespace, scene: any): CoveTerrain {
  const root = new THREE.Group();
  root.name = "cove-terrain";
  scene.add(root);

  // A fine field over the walkable Cove and its near water, a coarse one out to the horizon a hair below it.
  root.add(heightfield(THREE, 64, 256, { x: 0, z: -4 }, 0));
  const far = heightfield(THREE, 420, 140, { x: 0, z: 0 }, 0.12);
  root.add(far);

  const ripples = rippleNormals(THREE);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600, 1, 1),
    new THREE.MeshStandardMaterial({
      color: "#2c7f93",
      roughness: 0.14,
      metalness: 0.08,
      transparent: true,
      opacity: 0.74,
      normalMap: ripples,
      normalScale: new THREE.Vector2(0.35, 0.35),
      depthWrite: false,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = COVE_WATER_LEVEL;
  water.renderOrder = 2;
  water.name = "cove-water";
  root.add(water);

  const loader = new GLTFLoader();
  for (const dock of COVE_DOCKS) placeDock(THREE, root, loader, dock);

  // A rowing boat tied up beside the pier.
  let boat: any = null;
  loader.load(assetUrl("boat.glb"), (gltf: any) => {
    boat = gltf.scene;
    const scale = 3.2 / 9.01;
    boat.scale.setScalar(scale);
    boat.position.set(13.7, COVE_WATER_LEVEL - 0.22, -1.5);
    boat.rotation.y = 0.08;
    shade(boat);
    root.add(boat);
  }, undefined, () => undefined);

  const lighthouse = createLighthouse(THREE);
  lighthouse.group.position.set(LIGHTHOUSE.x, 0, LIGHTHOUSE.z);
  root.add(lighthouse.group);

  // Reeds along the lagoon's bank; rocks along the sea's.
  const reedGeometry = new THREE.CylinderGeometry(0.012, 0.02, 1, 4);
  reedGeometry.translate(0, 0.5, 0);
  const reedPoints: { x: number; z: number; y: number; h: number; lean: number; turn: number }[] = [];
  const rockPoints: { x: number; z: number; y: number; s: number; turn: number }[] = [];
  for (let index = 0; index < 5200; index += 1) {
    const x = -34 + hash(index, 1) * 70;
    const z = -34 + hash(index, 2) * 42;
    const point = { x, z };
    if (onDock(point, 0.6)) continue;
    const water = coveWaterAt(point);
    if (!water || water.inside < 0.3) continue;
    if (water.water === "lagoon" && water.inside < 2.2 && reedPoints.length < 900) {
      reedPoints.push({ x, z, y: coveGroundAt(point), h: 0.9 + hash(index, 3) * 0.9, lean: (hash(index, 4) - 0.5) * 0.3, turn: hash(index, 5) * 6.28 });
    } else if (water.water === "sea" && water.inside < 1.8 && hash(index, 6) < 0.18 && rockPoints.length < 90) {
      rockPoints.push({ x, z, y: coveGroundAt(point), s: 0.25 + hash(index, 7) * 0.5, turn: hash(index, 8) * 6.28 });
    }
  }
  const reeds = new THREE.InstancedMesh(reedGeometry, new THREE.MeshStandardMaterial({ color: "#6d8a3a", roughness: 0.9 }), reedPoints.length);
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#7c7a74", roughness: 0.95 }), rockPoints.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  reedPoints.forEach((reed, index) => {
    euler.set(reed.lean, reed.turn, reed.lean * 0.5);
    quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(reed.x, reed.y, reed.z), quaternion, new THREE.Vector3(1, reed.h - reed.y * 0.5, 1));
    reeds.setMatrixAt(index, matrix);
  });
  rockPoints.forEach((rock, index) => {
    euler.set(rock.turn, rock.turn * 1.7, 0);
    quaternion.setFromEuler(euler);
    matrix.compose(new THREE.Vector3(rock.x, rock.y + rock.s * 0.3, rock.z), quaternion, new THREE.Vector3(rock.s, rock.s * 0.7, rock.s));
    rocks.setMatrixAt(index, matrix);
  });
  reeds.castShadow = true;
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  root.add(reeds, rocks);

  return Object.freeze({
    water,
    update(dt: number, seconds: number) {
      ripples.offset.x = (seconds * 0.012) % 1;
      ripples.offset.y = (seconds * 0.007) % 1;
      if (boat) {
        boat.position.y = COVE_WATER_LEVEL - 0.22 + Math.sin(seconds * 1.1) * 0.04;
        boat.rotation.z = Math.sin(seconds * 0.9) * 0.025;
      }
      lighthouse.beam.rotation.y = seconds * 0.6;
      void dt;
    },
  });
}
