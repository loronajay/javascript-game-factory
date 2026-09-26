// Grimnir crop models layered over editor-placed growing plots. The layout owns
// where soil exists; agriculture owns what grows there and which GLB stage is shown.
import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { cropStatus, deadCropModel, farmPlantingCells, findCrop } from "./farm-crops.mjs";
/**
 * How a suffering crop reads in 3D, on its own model: a thirsty plant sags a
 * little and pales; a wilted one collapses outward and browns. `droop` bends
 * the top of the plant (quadratically with height) out and down.
 */
const WITHERING = Object.freeze({
    thirsty: Object.freeze({ droop: 0.45, tint: 0xb9b27a, amount: 0.35 }),
    wilted: Object.freeze({ droop: 1.15, tint: 0xa47a3e, amount: 0.8 }),
});
const CROP_ASSET_ROOT = new URL("../farm/assets/crops/", import.meta.url);
export function cropAssetUrl(file) {
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
    /** Bend and tint a fitted plant in place. Geometry and materials are cloned first: a GLB's are shared. */
    function witherModel(model, droop, tint, amount, leanYaw) {
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const height = Math.max(1e-3, box.max.y - box.min.y);
        const centre = box.getCenter(new THREE.Vector3());
        const lean = { x: Math.sin(leanYaw), z: Math.cos(leanYaw) };
        const point = new THREE.Vector3();
        const inverse = new THREE.Matrix4();
        const tinted = new THREE.Color(tint);
        model.traverse((node) => {
            if (!node.isMesh)
                return;
            const geometry = node.geometry.clone();
            node.geometry = geometry;
            const position = geometry.attributes.position;
            inverse.copy(node.matrixWorld).invert();
            for (let index = 0; index < position.count; index += 1) {
                point.fromBufferAttribute(position, index).applyMatrix4(node.matrixWorld);
                const h = Math.min(1, Math.max(0, (point.y - box.min.y) / height));
                const bend = droop * h * h;
                const dx = point.x - centre.x;
                const dz = point.z - centre.z;
                const radius = Math.hypot(dx, dz);
                // Outward from the crown, pulled toward one shared side so the plant slumps rather than splays.
                const outX = (radius > 1e-4 ? dx / radius : 0) * 0.55 + lean.x * 0.45;
                const outZ = (radius > 1e-4 ? dz / radius : 0) * 0.55 + lean.z * 0.45;
                point.x += outX * bend * height * 0.4;
                point.z += outZ * bend * height * 0.4;
                point.y -= bend * height * 0.38;
                point.applyMatrix4(inverse);
                position.setXYZ(index, point.x, point.y, point.z);
            }
            position.needsUpdate = true;
            geometry.computeBoundingBox();
            geometry.computeBoundingSphere();
            // A multiply tint cannot turn green brown, so the shader swaps the colour
            // toward the tint by the texel's own brightness: leaves go straw, shading survives.
            const recolour = (material) => {
                const copy = material.clone();
                copy.onBeforeCompile = (shader) => {
                    shader.uniforms.witherTint = { value: tinted };
                    shader.uniforms.witherAmount = { value: amount };
                    shader.fragmentShader = shader.fragmentShader
                        .replace("#include <common>", "#include <common>\nuniform vec3 witherTint;\nuniform float witherAmount;")
                        .replace("#include <map_fragment>", "#include <map_fragment>\n{ float witherLuma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, witherTint * (0.35 + 1.3 * witherLuma), witherAmount); }");
                };
                copy.customProgramCacheKey = () => `wither:${tint}:${amount}`;
                return copy;
            };
            node.material = Array.isArray(node.material) ? node.material.map(recolour) : recolour(node.material);
        });
    }
    function cellTile(holder, cell, crop, wet) {
        const border = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.025, 0.82), new THREE.MeshStandardMaterial({ color: crop ? 0xc39a52 : 0x9a7845, roughness: 1 }));
        border.position.set(cell.x, 0.07, cell.z);
        border.receiveShadow = true;
        holder.add(border);
        const earth = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.03, 0.74), new THREE.MeshStandardMaterial({ color: wet ? 0x34291d : 0x5a3421, roughness: 1 }));
        earth.position.set(cell.x, 0.09, cell.z);
        earth.receiveShadow = true;
        holder.add(earth);
    }
    function loadContent(view, itemId, crops, farmMinutes) {
        const token = ++view.loadToken;
        const holder = new THREE.Group();
        view.content.add(holder);
        const cells = farmPlantingCells(itemId);
        for (const cell of cells) {
            const crop = crops.find((entry) => entry.cellId === cell.id);
            const status = crop ? cropStatus(crop, farmMinutes) : null;
            if (itemId === "decor.plant.soil-patch")
                cellTile(holder, cell, crop, Boolean(crop && status && !status.thirsty && !status.dead));
            const definition = crop ? findCrop(crop.cropId) : undefined;
            if (!crop || !definition || !status)
                continue;
            const index = cells.indexOf(cell);
            // A dead crop is the withered plant, never its own (possibly ripe-looking) model.
            const file = status.dead ? deadCropModel(status.stage) : definition.models[status.stage];
            loader.load(cropAssetUrl(file), (gltf) => {
                if (token !== view.loadToken)
                    return;
                const greenhouse = itemId === "decor.building.greenhouse";
                const size = Math.min(status.stage, 2);
                const plant = status.dead
                    ? fittedModel(gltf.scene, greenhouse
                        ? { width: 0.44, depth: 0.44, height: 0.18 + size * 0.1 }
                        : { width: 0.7, depth: 0.66, height: 0.26 + size * 0.14 })
                    : fittedModel(gltf.scene, greenhouse
                        ? { width: 0.42, depth: 0.42, height: 0.34 + status.stage * 0.14 }
                        : { width: 0.68, depth: 0.62, height: 0.48 + status.stage * 0.2 });
                const withering = WITHERING[status.condition];
                if (withering)
                    witherModel(plant, withering.droop, withering.tint, withering.amount, index * 2.1);
                plant.position.x += cell.x;
                plant.position.y += cell.y;
                plant.position.z += cell.z;
                plant.rotation.y = (index % 3 - 1) * 0.08;
                holder.add(plant);
            }, undefined, () => undefined);
        }
    }
    function rebuild(view, itemId, key, crops, farmMinutes) {
        view.loadToken += 1;
        for (const child of [...view.content.children])
            disposeObject(child);
        view.key = key;
        loadContent(view, itemId, crops, farmMinutes);
    }
    return Object.freeze({
        sync(layout, agriculture, farmMinutes) {
            const wanted = new Set();
            for (const row of layout.decor) {
                const cells = farmPlantingCells(row.itemId);
                if (!cells.length)
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
                view.group.position.set(row.x, 0.12, row.z);
                view.group.rotation.y = row.rotationY;
                const planted = agriculture.crops.filter((crop) => crop.plotId === row.instanceId);
                const key = cells.map((cell) => {
                    const crop = planted.find((entry) => entry.cellId === cell.id);
                    if (!crop)
                        return "empty";
                    const status = cropStatus(crop, farmMinutes);
                    return `${crop.cropId}:${status.stage}:${status.condition}:${status.thirsty ? "dry" : "wet"}`;
                }).join("|");
                if (key !== view.key)
                    rebuild(view, row.itemId, key, planted, farmMinutes);
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
