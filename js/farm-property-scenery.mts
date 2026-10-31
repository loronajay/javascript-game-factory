import { destinationSign } from "./farm-fishing-region-world.mjs";
import { propertyTrees, propertyRoutes } from "./farm-property-scene.mjs";
import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { FARM_LOTS } from "./farm-catalog/lots.mjs";
import { createAppleTree, createPine, createBirch, createWillow } from "./farm-props-plants.mjs";
type Three = Record<string, any>;

/** A property's surroundings are a new setting, outside the usable plot. */
export function createPropertyScenery(THREE: Three, scene: any, propertyId: string) {
  const property = FARM_LOTS.find((entry) => entry.id === propertyId);
  const root = new THREE.Group(); root.name = "farm-property-surroundings"; scene.add(root);
  const animated: Array<(seconds: number) => void> = [];
  if (property) {
    const half = property.size / 2;
    const forest = property.theme === "woodland";
    const earth = createSurfaceMaterial(THREE, { pattern: "grass", colors: forest ? ["#496347", "#354d35", "#6a8652", "#645440"] : ["#799958", "#618342", "#9cae69", "#85744a"], repeat: 7, roughness: 1, metalness: 0 }, {u: 180, v: 70});
    for (const [width, depth, x, z] of [[180, 70, 0, -half - 35], [180, 70, 0, half + 35], [70, property.size, -half - 35, 0], [70, property.size, half + 35, 0]]) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), earth);
      patch.rotation.x = -Math.PI / 2; patch.position.set(x, 0.005, z); patch.receiveShadow = true; root.add(patch);
    }
    const stone = new THREE.MeshStandardMaterial({ color: forest ? "#66736a" : "#aaa388", roughness: 1, flatShading: true });
    function rock(x: number, z: number, scale: number): void {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), stone);
      mesh.position.set(x, scale * 0.25, z); mesh.scale.set(scale, scale * 0.8, scale * 0.8); mesh.rotation.y = x; mesh.castShadow = true; root.add(mesh);
    }
    function water(cx: number, cz: number, rx: number, rz: number): void {
      const material = new THREE.MeshStandardMaterial({ color: forest ? "#548e9a" : "#527f9f", roughness: 0.24, metalness: 0.15, transparent: true, opacity: 0.91 });
      const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 96), material); lake.rotation.x = -Math.PI / 2;
      lake.scale.set(rx, rz, 1); lake.position.set(cx, 0.035, cz); root.add(lake);
      const shore = new THREE.Mesh(new THREE.RingGeometry(1, 1.05, 96), new THREE.MeshStandardMaterial({ color: forest ? "#91a08b" : "#c8bb8c", roughness: 1 }));
      shore.rotation.x = -Math.PI / 2; shore.scale.set(rx, rz, 1); shore.position.set(cx, 0.025, cz); root.add(shore);
      for (let index = 0; index < 14; index += 1) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.94, 40), new THREE.MeshBasicMaterial({ color: "#cae3de", transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(cx + Math.sin(index * 2.4) * rx * 0.7, 0.048, cz + Math.cos(index * 2.4) * rz * 0.65); root.add(ring);
        animated.push((seconds) => ring.scale.setScalar(0.5 + (seconds * 0.15 + index * 0.17) % 2));
      }
    }
    if (forest) {
      water(0, -half - 13, 40, 3.4);
      const wood = new THREE.MeshStandardMaterial({ color: "#96734b", roughness: 0.85 });
      for (let index = 0; index < 12; index += 1) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(4, 0.13, 0.72), wood); plank.position.set(0, 0.2, -half - 17.1 + index * 0.74); plank.receiveShadow = true; root.add(plank);
      }
      for (let index = 0; index < 10; index += 1) rock(-42 + index * 9, -half - 33 - index % 2 * 4, 8 + index % 3 * 3);
    } else {
      water(half + 30, -4, 25, 52);
      const wood = new THREE.MeshStandardMaterial({ color: "#8b6c48", roughness: 0.85 });
      for (let index = 0; index < 16; index += 1) {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.13, 3), wood);
        plank.position.set(half + 3 + index * 0.74, 0.2, 7); plank.receiveShadow = true; root.add(plank);
      }
      for (const x of [half + 3, half + 14]) for (const z of [5.5, 8.5]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 1.5, 7), wood); post.position.set(x, 0.3, z); root.add(post);
      }
      for (let index = 0; index < 12; index += 1) { const z = -35 + index * 6; if (Math.abs(z - 7) > 4) rock(half + 4 + Math.sin(index) * 1.5, z, 0.8 + index % 3 * 0.3); }
    }
    for (const entry of propertyTrees({ lot: propertyId })) {
      const tree = entry.kind === "pine" ? createPine(THREE, entry.seed) : entry.kind === "birch" ? createBirch(THREE, entry.seed) : entry.kind === "apple" ? createAppleTree(THREE, entry.seed) : createWillow(THREE, entry.seed);
      tree.position.set(entry.x, 0, entry.z); tree.scale.setScalar(entry.scale); root.add(tree);
    }
    for (const route of propertyRoutes({ lot: propertyId })) {
      destinationSign(THREE, root, route.horse ? "WINDRUSH DOWNS  /  BRIDLE TRAIL" : "PRIVATE FISHING  /  " + (forest ? "CEDAR CREEK" : "SUNWATER LAKE"), route.x + (route.target === "cedar-creek" ? 3 : 0), route.z + (route.target === "cedar-creek" ? 2 : -3), route.target === "estate-lake" ? -Math.PI / 2 : 0);
    }
    // A short spur connects the side gate to the private grounds.
    const spur = new THREE.Mesh(new THREE.PlaneGeometry(forest ? 8 : 4, 2.4), new THREE.MeshStandardMaterial({ color: "#ad9a72", roughness: 1 }));
    spur.rotation.x = -Math.PI / 2; spur.position.set(half + (forest ? 4 : 2), 0.028, 7); root.add(spur);
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 46), new THREE.MeshStandardMaterial({ color: "#b4a17a", roughness: 1 }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(0, 0.03, half + 23); root.add(lane);
  }
  return {
    update(seconds: number) { for (const animate of animated) animate(seconds); },
    dispose() { root.traverse((object: any) => { object.geometry?.dispose?.(); if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; for (const material of materials) { material.map?.dispose?.(); material.dispose?.(); } } }); root.removeFromParent(); },
  };
}
