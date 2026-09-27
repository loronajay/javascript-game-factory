// The productive trees, drawn in their Tree Plots. The layout owns where the
// plots are; `layout.trees` owns what stands in each; this file only draws it.
//
// A tree is the decor catalog's own procedural model (farm-props-plants.mts) —
// the same oak, pine, birch and willow the build catalog places, and the apple
// tree's shape in each orchard species' leaves — scaled by how far it has
// grown. A model is rebuilt only when what it IS changes (species, standing or
// felled, fruit on it or not); growth between quarter hours is a scale on the
// model already standing. Fruit hangs only when a tree is ready to pick, and a
// felled tree is a stump with a shoot coming back out of it.
import { createBirch, createFruitTree, createPine, createStump, createTree, createWillow } from "./farm-props-plants.mjs";
import { findTreeSpecies } from "./farm-catalog/trees.mjs";
import { treeStatus } from "./farm-trees.mjs";
/** How tall a tree stands for its growth: a knee-high sapling up to the full model. */
export function treeScale(status) {
    if (status.stage === "mature")
        return 1;
    if (status.stage === "stump")
        return 1;
    return 0.16 + 0.84 * Math.min(1, Math.max(0, status.progress));
}
/** A felled tree's shoot, once it has begun to grow back: nothing, then a sapling-sized sprout. */
export function stumpShootScale(status) {
    return status.stage === "stump" && status.progress > 0.2 ? 0.08 + 0.2 * status.progress : 0;
}
function seedOf(plotId) {
    let hash = 7;
    for (let index = 0; index < plotId.length; index += 1)
        hash = (hash * 31 + plotId.charCodeAt(index)) % 997;
    return 1 + hash / 997 * 5;
}
function buildTree(THREE, species, seed, fruit) {
    switch (species.model) {
        case "fruit": return createFruitTree(THREE, seed, { fruitColor: species.fruitColor, leaves: species.leaves, fruit });
        case "pine": return createPine(THREE, seed);
        case "birch": return createBirch(THREE, seed);
        case "willow": return createWillow(THREE, seed);
        default: return createTree(THREE, seed);
    }
}
function dispose(root) {
    root.traverse?.((node) => {
        node.geometry?.dispose?.();
        // Materials come from the farm's shared material cache; only geometry is this view's.
    });
    root.parent?.remove(root);
}
export function createFarmTreesView(THREE, scene) {
    const root = new THREE.Group();
    root.name = "farm-productive-trees";
    scene.add(root);
    const views = new Map();
    function modelFor(row, species, status) {
        const seed = seedOf(row.plotId);
        if (status.stage !== "stump")
            return buildTree(THREE, species, seed, status.action === "pick");
        const group = new THREE.Group();
        group.add(createStump(THREE));
        const shoot = buildTree(THREE, species, seed, false);
        shoot.name = "shoot";
        group.add(shoot);
        return group;
    }
    function sync(layout, farmMinutes) {
        const plots = new Map(layout.decor.map((row) => [row.instanceId, row]));
        const seen = new Set();
        for (const row of layout.trees) {
            const plot = plots.get(row.plotId);
            const species = findTreeSpecies(row.speciesId);
            if (!plot || !species)
                continue;
            seen.add(row.plotId);
            const status = treeStatus(row, farmMinutes);
            const key = `${species.id}|${status.stage === "stump" ? "stump" : "tree"}|${status.action === "pick" ? "fruit" : ""}`;
            let view = views.get(row.plotId);
            if (!view) {
                const group = new THREE.Group();
                group.userData.treePlotId = row.plotId;
                root.add(group);
                view = { group, model: null, key: "", shake: 0 };
                views.set(row.plotId, view);
            }
            if (view.key !== key) {
                if (view.model)
                    dispose(view.model);
                view.model = modelFor(row, species, status);
                view.group.add(view.model);
                view.key = key;
            }
            view.group.position.set(plot.x, 0, plot.z);
            view.group.rotation.y = plot.rotationY;
            if (status.stage === "stump") {
                view.model.scale.setScalar(1);
                const shoot = view.model.getObjectByName("shoot");
                const scale = stumpShootScale(status);
                shoot.visible = scale > 0;
                shoot.scale.setScalar(Math.max(0.001, scale));
                shoot.position.y = 0.5;
            }
            else {
                view.model.scale.setScalar(treeScale(status));
            }
        }
        for (const [plotId, view] of views) {
            if (seen.has(plotId))
                continue;
            dispose(view.group);
            views.delete(plotId);
        }
    }
    function shake(plotId) {
        const view = views.get(plotId);
        if (view)
            view.shake = 1;
    }
    function update(dt) {
        for (const view of views.values()) {
            if (view.shake <= 0 || !view.model)
                continue;
            view.shake = Math.max(0, view.shake - dt * 3.2);
            const wobble = Math.sin(view.shake * 38) * 0.05 * view.shake;
            view.model.rotation.z = wobble;
            view.model.rotation.x = wobble * 0.6;
        }
    }
    return Object.freeze({ sync, shake, update });
}
