// Grimnir crop models layered over editor-placed growing plots. The layout owns
// where soil exists; agriculture owns what grows there and which GLB stage is shown.
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { cropStatus, findCrop } from "./farm-crops.mjs";
const CROP_ASSET_ROOT = new URL("../farm/assets/crops/", import.meta.url);
function assetUrl(file) {
    const url = new URL(file, CROP_ASSET_ROOT);
    // The original Grimnir GLBs embedded a white placeholder image. Keep one
    // explicit revision on the normalized files so browsers do not reuse that
    // earlier response after the pack is corrected in place.
    url.searchParams.set("v", "grimnir-color-1");
    return url.toString();
}
function disposeObject(root) {
    root.traverse?.((node) => {
        node.geometry?.dispose?.();
        const material = node.material;
        if (Array.isArray(material))
            material.forEach((entry) => entry?.dispose?.());
        else
            material?.dispose?.();
    });
    root.parent?.remove(root);
}
export function createFarmCropsView(THREE, scene) {
    const root = new THREE.Group();
    root.name = "farm-growing-crops";
    scene.add(root);
    const loader = new GLTFLoader();
    const plots = new Map();
    function fittedModel(model, target) {
        const initial = new THREE.Box3().setFromObject(model);
        const size = initial.getSize(new THREE.Vector3());
        const factors = [
            target.width && size.x > 0 ? target.width / size.x : Infinity,
            target.depth && size.z > 0 ? target.depth / size.z : Infinity,
            target.height && size.y > 0 ? target.height / size.y : Infinity,
        ].filter(Number.isFinite);
        model.scale.setScalar(Math.min(...factors));
        const fitted = new THREE.Box3().setFromObject(model);
        const centre = fitted.getCenter(new THREE.Vector3());
        model.position.set(-centre.x, -fitted.min.y, -centre.z);
        model.traverse((node) => {
            if (!node.isMesh)
                return;
            node.castShadow = true;
            node.receiveShadow = true;
        });
        return model;
    }
    function loadContent(view, soilFile, cropFile, stage) {
        const token = ++view.loadToken;
        const holder = new THREE.Group();
        view.content.add(holder);
        loader.load(assetUrl(soilFile), (gltf) => {
            if (token !== view.loadToken)
                return;
            const soil = fittedModel(gltf.scene, { width: 2.9, depth: 1.9 });
            holder.add(soil);
        }, undefined, () => undefined);
        if (!cropFile)
            return;
        loader.load(assetUrl(cropFile), (gltf) => {
            if (token !== view.loadToken)
                return;
            const source = fittedModel(gltf.scene, { height: 0.42 + stage * 0.19 });
            const offsets = [[-0.92, -0.52], [0, -0.52], [0.92, -0.52], [-0.92, 0.52], [0, 0.52], [0.92, 0.52]];
            offsets.forEach(([x, z], index) => {
                const plant = index === 0 ? source : source.clone(true);
                plant.position.x += x;
                plant.position.z += z;
                plant.rotation.y = (index % 3 - 1) * 0.18;
                holder.add(plant);
            });
        }, undefined, () => undefined);
    }
    function rebuild(view, key, wet, cropFile, stage) {
        view.loadToken += 1;
        for (const child of [...view.content.children])
            disposeObject(child);
        view.key = key;
        loadContent(view, wet ? "Env_Dirt_Large_Watered_01.glb" : "Env_Dirt_Large_Dry_01.glb", cropFile, stage);
    }
    return Object.freeze({
        sync(layout, agriculture, farmMinutes) {
            const wanted = new Set();
            for (const row of layout.decor) {
                if (row.itemId !== "decor.plant.soil-patch")
                    continue;
                wanted.add(row.instanceId);
                let view = plots.get(row.instanceId);
                if (!view) {
                    const group = new THREE.Group();
                    const content = new THREE.Group();
                    group.add(content);
                    root.add(group);
                    view = { group, content, key: "", loadToken: 0 };
                    plots.set(row.instanceId, view);
                }
                view.group.position.set(row.x, 0.09, row.z);
                view.group.rotation.y = row.rotationY;
                const planted = agriculture.crops.find((crop) => crop.plotId === row.instanceId);
                const status = planted ? cropStatus(planted, farmMinutes) : null;
                const definition = planted ? findCrop(planted.cropId) : undefined;
                const stage = status?.stage ?? 0;
                const wet = Boolean(planted && !status?.thirsty);
                const cropFile = definition ? definition.models[stage] : null;
                const key = `${cropFile ?? "empty"}:${stage}:${wet ? "wet" : "dry"}`;
                if (key !== view.key)
                    rebuild(view, key, wet, cropFile, stage);
            }
            for (const [id, view] of plots) {
                if (wanted.has(id))
                    continue;
                view.loadToken += 1;
                disposeObject(view.group);
                plots.delete(id);
            }
        },
        dispose() {
            for (const view of plots.values())
                disposeObject(view.group);
            plots.clear();
            scene.remove(root);
        },
    });
}
