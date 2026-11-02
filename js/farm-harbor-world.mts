import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { BOAT_MODEL_YAW_OFFSET, HARBOR_BOUNDS, HARBOR_DOCKS, HARBOR_ISLANDS, type BoatState } from "./farm-boating.mjs";
import { destinationSign } from "./farm-fishing-region-world.mjs";
import { harborWalkHeight } from "./farm-harbor-geometry.mjs";
import { createAppleTree, createWillow, createLavender, createBush } from "./farm-props-plants.mjs";
import { ISLAND_ORCHARD_TREES } from "./farm-island.mjs";
type Three = Record<string, any>;

/** A coastal handling scene, independent of farm saves and paid travel. */
export function createHarborWorld(THREE: Three, scene: any, onModel: (ok: boolean) => void, island = false) {
  scene.background = new THREE.Color("#c6e1e4"); scene.fog = new THREE.Fog("#c6e1e4", 110, 250);
  scene.add(new THREE.HemisphereLight("#e5f4ff", "#567445", 2.1));
  const sun = new THREE.DirectionalLight("#fff1d3", 2.5); sun.position.set(-35, 65, 25); scene.add(sun);
  const material = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
  const sand = material(island ? "#e8d4ac" : "#d6c9a0"), grass = material(island ? "#9aa966" : "#7b9a58"), wood = material("#9b7650"), darkWood = material("#574633"), stone = material("#92958a");
  function mesh(geometry: any, surface: any, x: number, y: number, z: number, parent = scene) {
    const object = new THREE.Mesh(geometry, surface); object.position.set(x, y, z); parent.add(object); return object;
  }
  function sign(text: string, x: number, z: number, yaw = 0) {
    const raised = new THREE.Group(); raised.position.y = harborWalkHeight({ x, z }) ?? 0; scene.add(raised);
    destinationSign(THREE, raised, text, x, z, yaw, true);
  }
  const waterTime = { value: 0 };
  const waterMaterial = new THREE.MeshPhongMaterial({ color: "#319ba8", specular: "#9bd2d5", shininess: 85 });
  waterMaterial.onBeforeCompile = (shader: any) => {
    shader.uniforms.harborTime = waterTime;
    shader.vertexShader = "uniform float harborTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.z += sin(position.x * 0.32 + harborTime) * 0.05 + cos(position.y * 0.26 + harborTime * 0.8) * 0.04;");
  };
  const water = mesh(new THREE.PlaneGeometry(500, 500, 100, 100), waterMaterial, 0, 0, -20); water.rotation.x = -Math.PI / 2;
  mesh(new THREE.BoxGeometry(175, 4, 80), sand, 0, -1.5, 62);
  mesh(new THREE.BoxGeometry(175, 1, 77), grass, 0, 0.9, 64);
  function groundStrip(width: number, depth: number, centerZ: number, surface: any, lift: number) {
    const geometry = new THREE.PlaneGeometry(width, depth, 1, 24); geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setY(i, (harborWalkHeight({ x: 0, z: centerZ + positions.getZ(i) }) ?? 0.5) + lift);
    geometry.computeVertexNormals(); mesh(geometry, surface, 0, 0, centerZ);
  }
  groundStrip(175, 3.5, 23.75, sand, 0);
  groundStrip(4, 24, 34, material("#bba57b"), 0.015);
  sign(island ? "ORCHARD MARKET / WALK AHEAD" : "THE COVE / COAST PATH", -3, 37, Math.PI);
  sign("HARBOR / BOAT PIER", -3, 25, 0);
  function pine(x: number, z: number, height: number, base = 1) {
    mesh(new THREE.CylinderGeometry(0.2, 0.3, height * 0.55, 6), darkWood, x, base + height * 0.25, z);
    for (let level = 0; level < 3; level++) mesh(new THREE.ConeGeometry(height * (0.32 - level * 0.06), height * 0.58, 7), material(level % 2 ? "#477459" : "#365e4b"), x, base + height * (0.47 + level * 0.19), z);
  }
  if (!island) for (let i = 0; i < 24; i++) pine(-73 + i * 6.3, 37 + (i % 4) * 5, 5 + i % 5);
  if (island) {
    for (const [i, point] of ISLAND_ORCHARD_TREES.entries()) {
      const tree = createAppleTree(THREE, i + 90); tree.position.set(point.x, 1.4, point.z); tree.scale.setScalar(2); scene.add(tree);
    }
    for (let i = 0; i < 12; i++) {
      const bush = i % 2 ? createLavender(THREE, i + 22) : createBush(THREE, i + 22);
      bush.position.set(i < 6 ? -5 : 5, 1.4, 28 + i % 6 * 2); bush.scale.setScalar(1.4); scene.add(bush);
    }
    // The market road leads through a visible village gateway, with a roofline behind it.
    for (const x of [-3, 3]) {
      mesh(new THREE.BoxGeometry(0.65, 3.8, 0.8), material("#eee3c8"), x, 3.3, 42);
      mesh(new THREE.BoxGeometry(1, 0.25, 1.1), material("#b77756"), x, 5.3, 42);
    }
    mesh(new THREE.BoxGeometry(6.7, 0.55, 1), material("#b77756"), 0, 5.1, 42);
    mesh(new THREE.BoxGeometry(13, 5, 6), material("#eeddbd"), 0, 3.9, 53);
    const hallRoof = mesh(new THREE.ConeGeometry(9.8, 3, 4), material("#b77756"), 0, 7.8, 53); hallRoof.rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(2.5, 3.4, 0.15), darkWood, 0, 3.1, 49.9);
    for (const x of [-4.5, 4.5]) mesh(new THREE.BoxGeometry(1.6, 1.6, 0.15), material("#779fa2"), x, 4.7, 49.9);
    // Low orchard ridges close the horizon above the settlement.
    for (let i = 0; i < 7; i++) {
      const ridge = mesh(new THREE.SphereGeometry(1, 16, 10), material(i % 2 ? "#8eaa71" : "#a1b77a"), -90 + i * 30, -2, 89 + i % 2 * 10);
      ridge.scale.set(33, 15 + i % 3 * 3, 25);
    }
    // Productive orchards and shaded coastal walks frame a village, rather than a toy islet.
    for (let i = 0; i < 16; i++) {
      const tree = i % 7 ? createAppleTree(THREE, i + 200) : createWillow(THREE, i + 200);
      tree.position.set((i % 2 ? -1 : 1) * (34 + i % 5 * 6), 1.4, 29 + Math.floor(i / 4) * 9);
      tree.scale.setScalar(1.3); scene.add(tree);
    }
    const path = mesh(new THREE.PlaneGeometry(25, 3), material("#d4ba92"), 13, 1.42, 38); path.rotation.x = -Math.PI / 2;
    sign("ORCHARD HOMESTEADS / E", 24, 39, Math.PI);
    sign("RESIDENTS / VISIT FARMS / E", 9, 31, Math.PI);
    for (const x of [22, 26]) mesh(new THREE.BoxGeometry(0.35, 2, 0.35), material("#eee1c5"), x, 2.4, 41);
    mesh(new THREE.BoxGeometry(4.4, 0.35, 0.4), darkWood, 24, 3.4, 41);
  }
  sign(island ? "FERRY / MAINLAND / E" : "FERRY / ORCHARD ISLE / E", -6, 25, Math.PI);
  sign(island ? "SEA ROUTE / MAINLAND" : "SEA ROUTE / ORCHARD ISLE", -7, -73, Math.PI);
  for (const [i, island] of HARBOR_ISLANDS.entries()) {
    mesh(new THREE.CylinderGeometry(island.radius + 1.8, island.radius + 2.7, 0.6, 48), sand, island.x, -0.15, island.z);
    mesh(new THREE.CylinderGeometry(island.radius, island.radius + 1, 2, 32), grass, island.x, 0.8, island.z);
    for (let j = 0; j < 10; j++) {
      const a = j * 2.4, radius = 3 + j % 3 * 2;
      pine(island.x + Math.cos(a) * radius, island.z + Math.sin(a) * radius, 4 + (j + i) % 4, 1.8);
    }
    for (let j = 0; j < 7; j++) {
      const a = j * 1.7;
      mesh(new THREE.DodecahedronGeometry(0.7 + j % 3 * 0.2), stone, island.x + Math.cos(a) * (island.radius - 0.5), 0.8, island.z + Math.sin(a) * (island.radius - 0.5));
    }
  }
  for (const dock of HARBOR_DOCKS) {
    for (let z = dock.minZ; z < dock.maxZ; z += 0.75) mesh(new THREE.BoxGeometry(dock.maxX - dock.minX, 0.24, 0.69), wood, (dock.minX + dock.maxX) / 2, 0.75, z + 0.35);
    for (const x of [dock.minX + 0.25, dock.maxX - 0.25]) for (let z = dock.minZ; z <= dock.maxZ; z += 3) mesh(new THREE.CylinderGeometry(0.17, 0.2, 2.4, 8), darkWood, x, 0.1, z);
    mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 24), material("#eee1ab"), dock.x, 0.02, dock.z).rotation.x = -Math.PI / 2;
  }
  // Small harbor buildings keep the mainland legible from the water.
  for (const x of [-17, 15]) {
    mesh(new THREE.BoxGeometry(7, 4, 5), material(island ? "#f3e4c8" : x < 0 ? "#e1d4b5" : "#ab6654"), x, 3.1, 30);
    const roof = mesh(new THREE.ConeGeometry(5.3, 2.2, 4), material(island ? "#ad604c" : "#4e6466"), x, 6.1, 30); roof.rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(1.5, 2.7, 0.1), darkWood, x, 2.6, 27.45);
    for (const dx of [-2, 2]) {
      mesh(new THREE.BoxGeometry(1, 1.1, 0.12), material("#8dbac0"), x + dx, 3.6, 27.4);
      if (island) for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(0.3, 1.2, 0.15), material("#6f8b6a"), x + dx + side * 0.65, 3.6, 27.35);
    }
  }
  // Navigation buoys mark the trial's boundary instead of an invisible open-ocean exit.
  for (let x = -60; x <= 60; x += 15) {
    mesh(new THREE.ConeGeometry(0.4, 1, 8), material("#d18a53"), x, 0.4, HARBOR_BOUNDS.minZ + 3);
  }
  for (const x of [-67, 67]) for (let z = -80; z <= 10; z += 15) mesh(new THREE.ConeGeometry(0.4, 1, 8), material("#d18a53"), x, 0.4, z);
  const boat = new THREE.Group(); scene.add(boat);
  const fallback = mesh(new THREE.BoxGeometry(2.1, 0.55, 4.2), wood, 0, 0.1, 0, boat);
  let disposed = false;
  new GLTFLoader().load(new URL("../farm/assets/fishing/boat.glb", import.meta.url).toString(), (gltf: any) => {
    if (disposed) return;
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const scale = 4.4 / size.z;
    model.scale.setScalar(scale); model.rotation.y = BOAT_MODEL_YAW_OFFSET;
    model.position.set(center.x * scale, -box.min.y * scale + 0.04, center.z * scale);
    boat.remove(fallback); boat.add(model); onModel(true);
  }, undefined, () => { if (!disposed) onModel(false); });
  return {
    update(state: BoatState, seconds: number) {
      waterTime.value = seconds;
      boat.position.set(state.x, Math.sin(seconds * 1.4) * 0.035, state.z);
      boat.rotation.set(Math.sin(seconds * 1.1) * 0.012, state.yaw, Math.sin(seconds * 0.9) * 0.018);
    },
    dispose() {
      disposed = true;
      scene.traverse((node: any) => { node.geometry?.dispose(); if (Array.isArray(node.material)) node.material.forEach((m: any) => m.dispose()); else node.material?.dispose(); });
    },
  };
}
