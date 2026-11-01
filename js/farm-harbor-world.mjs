import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { HARBOR_BOUNDS, HARBOR_DOCKS, HARBOR_ISLANDS } from "./farm-boating.mjs";
/** A coastal handling scene, independent of farm saves and paid travel. */
export function createHarborWorld(THREE, scene, onModel) {
    scene.background = new THREE.Color("#c6e1e4");
    scene.fog = new THREE.Fog("#c6e1e4", 110, 250);
    scene.add(new THREE.HemisphereLight("#e5f4ff", "#567445", 2.1));
    const sun = new THREE.DirectionalLight("#fff1d3", 2.5);
    sun.position.set(-35, 65, 25);
    scene.add(sun);
    const material = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
    const sand = material("#d6c9a0"), grass = material("#7b9a58"), wood = material("#9b7650"), darkWood = material("#574633"), stone = material("#92958a");
    function mesh(geometry, surface, x, y, z, parent = scene) {
        const object = new THREE.Mesh(geometry, surface);
        object.position.set(x, y, z);
        parent.add(object);
        return object;
    }
    const waterTime = { value: 0 };
    const waterMaterial = new THREE.MeshPhongMaterial({ color: "#319ba8", specular: "#9bd2d5", shininess: 85 });
    waterMaterial.onBeforeCompile = (shader) => {
        shader.uniforms.harborTime = waterTime;
        shader.vertexShader = "uniform float harborTime;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.z += sin(position.x * 0.32 + harborTime) * 0.05 + cos(position.y * 0.26 + harborTime * 0.8) * 0.04;");
    };
    const water = mesh(new THREE.PlaneGeometry(500, 500, 100, 100), waterMaterial, 0, 0, -20);
    water.rotation.x = -Math.PI / 2;
    mesh(new THREE.BoxGeometry(175, 4, 80), sand, 0, -1.5, 62);
    mesh(new THREE.BoxGeometry(175, 1, 77), grass, 0, 0.9, 64);
    function pine(x, z, height, base = 1) {
        mesh(new THREE.CylinderGeometry(0.2, 0.3, height * 0.55, 6), darkWood, x, base + height * 0.25, z);
        for (let level = 0; level < 3; level++)
            mesh(new THREE.ConeGeometry(height * (0.32 - level * 0.06), height * 0.58, 7), material(level % 2 ? "#477459" : "#365e4b"), x, base + height * (0.47 + level * 0.19), z);
    }
    for (let i = 0; i < 24; i++)
        pine(-73 + i * 6.3, 37 + (i % 4) * 5, 5 + i % 5);
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
        for (let z = dock.minZ; z < dock.maxZ; z += 0.75)
            mesh(new THREE.BoxGeometry(dock.maxX - dock.minX, 0.24, 0.69), wood, (dock.minX + dock.maxX) / 2, 0.75, z + 0.35);
        for (const x of [dock.minX + 0.25, dock.maxX - 0.25])
            for (let z = dock.minZ; z <= dock.maxZ; z += 3)
                mesh(new THREE.CylinderGeometry(0.17, 0.2, 2.4, 8), darkWood, x, 0.1, z);
        mesh(new THREE.TorusGeometry(0.6, 0.06, 6, 24), material("#eee1ab"), dock.x, 0.02, dock.z).rotation.x = -Math.PI / 2;
    }
    // Small harbor buildings keep the mainland legible from the water.
    for (const x of [-17, 15]) {
        mesh(new THREE.BoxGeometry(7, 4, 5), material(x < 0 ? "#e1d4b5" : "#ab6654"), x, 3.1, 30);
        const roof = mesh(new THREE.ConeGeometry(5.3, 2.2, 4), material("#4e6466"), x, 6.1, 30);
        roof.rotation.y = Math.PI / 4;
        mesh(new THREE.BoxGeometry(1.5, 2.7, 0.1), darkWood, x, 2.6, 27.45);
    }
    // Navigation buoys mark the trial's boundary instead of an invisible open-ocean exit.
    for (let x = -60; x <= 60; x += 15) {
        mesh(new THREE.ConeGeometry(0.4, 1, 8), material("#d18a53"), x, 0.4, HARBOR_BOUNDS.minZ + 3);
    }
    for (const x of [-67, 67])
        for (let z = -80; z <= 10; z += 15)
            mesh(new THREE.ConeGeometry(0.4, 1, 8), material("#d18a53"), x, 0.4, z);
    const boat = new THREE.Group();
    scene.add(boat);
    const fallback = mesh(new THREE.BoxGeometry(2.1, 0.55, 4.2), wood, 0, 0.1, 0, boat);
    let disposed = false;
    new GLTFLoader().load(new URL("../farm/assets/fishing/boat.glb", import.meta.url).toString(), (gltf) => {
        if (disposed)
            return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
        const scale = 4.4 / size.z;
        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -box.min.y * scale + 0.04, -center.z * scale);
        boat.remove(fallback);
        boat.add(model);
        onModel(true);
    }, undefined, () => { if (!disposed)
        onModel(false); });
    return {
        update(state, seconds) {
            waterTime.value = seconds;
            boat.position.set(state.x, Math.sin(seconds * 1.4) * 0.035, state.z);
            boat.rotation.set(Math.sin(seconds * 1.1) * 0.012, state.yaw, Math.sin(seconds * 0.9) * 0.018);
        },
        dispose() {
            disposed = true;
            scene.traverse((node) => { node.geometry?.dispose(); if (Array.isArray(node.material))
                node.material.forEach((m) => m.dispose());
            else
                node.material?.dispose(); });
        },
    };
}
