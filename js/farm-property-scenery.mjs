import { destinationSign } from "./farm-fishing-region-world.mjs";
import { propertyTrees, propertyRoutes } from "./farm-property-scene.mjs";
import { createSurfaceMaterial } from "./arcade-room-surfaces.mjs";
import { FARM_LOTS } from "./farm-catalog/lots.mjs";
import { createAppleTree, createPine, createBirch, createWillow } from "./farm-props-plants.mjs";
/** Compact gate approaches; the actual fishing water lives on separate maps. */
export function createPropertyScenery(THREE, scene, propertyId) {
    const property = FARM_LOTS.find(entry => entry.id === propertyId);
    const root = new THREE.Group();
    root.name = "farm-property-surroundings";
    scene.add(root);
    if (property) {
        const half = property.size / 2;
        const material = createSurfaceMaterial(THREE, { pattern: "dirt", colors: ["#998465", "#a69273", "#857453", "#b3a17e"], repeat: 3, roughness: 1, metalness: 0 }, { u: 5, v: 3 });
        function approach(x, z, width, depth) {
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(x, .025, z);
            mesh.receiveShadow = true;
            root.add(mesh);
        }
        approach(half - .1, 7, 5, 2.2);
        approach(0, half + 7, 2.2, 19);
        for (const route of propertyRoutes({ lot: propertyId })) {
            if (route.horse)
                approach(0, -half + .1, 2.2, 5);
            destinationSign(THREE, root, route.horse ? "WINDRUSH DOWNS" : route.title.toUpperCase() + " / FISHING", route.sign.x, route.sign.z, route.sign.yaw);
        }
        for (const entry of propertyTrees({ lot: propertyId })) {
            const tree = entry.kind === "pine" ? createPine(THREE, entry.seed) : entry.kind === "birch" ? createBirch(THREE, entry.seed) : entry.kind === "apple" ? createAppleTree(THREE, entry.seed) : createWillow(THREE, entry.seed);
            tree.position.set(entry.x, 0, entry.z);
            tree.scale.setScalar(entry.scale);
            root.add(tree);
        }
    }
    return {
        update(_seconds) { },
        dispose() { root.traverse((object) => { object.geometry?.dispose?.(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            material?.map?.dispose?.();
            material?.dispose?.();
        } }); root.removeFromParent(); },
    };
}
