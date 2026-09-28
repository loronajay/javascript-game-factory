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
//
// A tree is watered like a crop, and reads like one: watered mulch is dark and
// wet; a thirsty tree pales, a wilted one browns and sags, and a dead one is a
// grey, leaning ruin with no fruit on it (farm-trees.mts `treeStatus`).

import { createBirch, createFruitTree, createPine, createStump, createTree, createWillow } from "./farm-props-plants.mjs";
import { findTreeSpecies, type TreeSpecies } from "./farm-catalog/trees.mjs";
import { treeStatus, type FarmTree, type TreeStatus } from "./farm-trees.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

type ThreeNamespace = Record<string, any>;
type TreeView = { group: any; model: any; key: string; shake: number; wet: any };

/** How a suffering tree reads, on its own model: a colour its materials lean toward, and a lean. */
export const TREE_WITHERING: Readonly<Partial<Record<TreeStatus["condition"], Readonly<{ tint: number; amount: number; lean: number }>>>> = Object.freeze({
  thirsty: Object.freeze({ tint: 0xb9b27a, amount: 0.3, lean: 0 }),
  wilted: Object.freeze({ tint: 0xa47a3e, amount: 0.65, lean: 0.06 }),
  dead: Object.freeze({ tint: 0x6f665a, amount: 0.85, lean: 0.14 }),
});

/** How tall a tree stands for its growth: a knee-high sapling up to the full model. */
export function treeScale(status: TreeStatus): number {
  if (status.stage === "mature") return 1;
  if (status.stage === "stump") return 1;
  return 0.16 + 0.84 * Math.min(1, Math.max(0, status.progress));
}

/** A felled tree's shoot, once it has begun to grow back: nothing, then a sapling-sized sprout. */
export function stumpShootScale(status: TreeStatus): number {
  return status.stage === "stump" && status.progress > 0.2 ? 0.08 + 0.2 * status.progress : 0;
}

function seedOf(plotId: string): number {
  let hash = 7;
  for (let index = 0; index < plotId.length; index += 1) hash = (hash * 31 + plotId.charCodeAt(index)) % 997;
  return 1 + hash / 997 * 5;
}

function buildTree(THREE: ThreeNamespace, species: TreeSpecies, seed: number, fruit: boolean): any {
  switch (species.model) {
    case "fruit": return createFruitTree(THREE, seed, { fruitColor: species.fruitColor, leaves: species.leaves, fruit });
    case "pine": return createPine(THREE, seed);
    case "birch": return createBirch(THREE, seed);
    case "willow": return createWillow(THREE, seed);
    default: return createTree(THREE, seed);
  }
}

function dispose(root: any): void {
  root.traverse?.((node: any) => {
    node.geometry?.dispose?.();
    // Materials come from the farm's shared material cache; only geometry is this
    // view's — except the copies a withering tree was given, which are its own.
    if (node.userData?.witheredMaterial) node.material?.dispose?.();
  });
  root.parent?.remove(root);
}

/** Lean every material of a model toward a withered colour. Materials are copied first: the cache's are shared. */
function wither(THREE: ThreeNamespace, model: any, tint: number, amount: number): void {
  const toward = new THREE.Color(tint);
  model.traverse?.((node: any) => {
    if (!node.isMesh || !node.material?.color) return;
    const copy = node.material.clone();
    copy.color.lerp(toward, amount);
    node.material = copy;
    node.userData.witheredMaterial = true;
  });
}

export type FarmTreesView = Readonly<{
  sync: (layout: FarmLayout, farmMinutes: number) => void;
  /** A hit landed: the tree shivers. */
  shake: (plotId: string) => void;
  update: (dt: number) => void;
}>;

export function createFarmTreesView(THREE: ThreeNamespace, scene: any): FarmTreesView {
  const root = new THREE.Group();
  root.name = "farm-productive-trees";
  scene.add(root);
  const views = new Map<string, TreeView>();

  function modelFor(row: FarmTree, species: TreeSpecies, status: TreeStatus): any {
    const seed = seedOf(row.plotId);
    let model: any;
    if (status.stage !== "stump") model = buildTree(THREE, species, seed, status.action === "pick");
    else {
      model = new THREE.Group();
      model.add(createStump(THREE));
      const shoot = buildTree(THREE, species, seed, false);
      shoot.name = "shoot";
      model.add(shoot);
    }
    const withering = TREE_WITHERING[status.condition];
    if (withering) {
      wither(THREE, model, withering.tint, withering.amount);
      model.userData.lean = withering.lean;
    }
    return model;
  }

  /** Dark, wet mulch over the plot's own while the soil holds water. */
  function wetMulch(): any {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.66, 0.004, 24),
      new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.55, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -1 }),
    );
    mesh.position.y = 0.062;
    mesh.receiveShadow = true;
    mesh.name = "wet-mulch";
    return mesh;
  }

  function sync(layout: FarmLayout, farmMinutes: number): void {
    const plots = new Map(layout.decor.map((row) => [row.instanceId, row]));
    const seen = new Set<string>();
    for (const row of layout.trees) {
      const plot = plots.get(row.plotId);
      const species = findTreeSpecies(row.speciesId);
      if (!plot || !species) continue;
      seen.add(row.plotId);
      const status = treeStatus(row, farmMinutes);
      const key = `${species.id}|${status.stage === "stump" ? "stump" : "tree"}|${status.action === "pick" ? "fruit" : ""}|${status.condition}`;
      let view = views.get(row.plotId);
      if (!view) {
        const group = new THREE.Group();
        group.userData.treePlotId = row.plotId;
        root.add(group);
        const wet = wetMulch();
        group.add(wet);
        view = { group, model: null, key: "", shake: 0, wet };
        views.set(row.plotId, view);
      }
      if (view.key !== key) {
        if (view.model) dispose(view.model);
        view.model = modelFor(row, species, status);
        view.group.add(view.model);
        view.key = key;
      }
      view.group.position.set(plot.x, 0, plot.z);
      view.group.rotation.y = plot.rotationY;
      view.wet.visible = status.moist;
      if (status.stage === "stump") {
        view.model.scale.setScalar(1);
        const shoot = view.model.getObjectByName("shoot");
        const scale = stumpShootScale(status);
        shoot.visible = scale > 0;
        shoot.scale.setScalar(Math.max(0.001, scale));
        shoot.position.y = 0.5;
      } else {
        view.model.scale.setScalar(treeScale(status));
      }
      if (view.shake <= 0) view.model.rotation.z = view.model.userData.lean ?? 0;
    }
    for (const [plotId, view] of views) {
      if (seen.has(plotId)) continue;
      view.wet.material.dispose();
      dispose(view.group);
      views.delete(plotId);
    }
  }

  function shake(plotId: string): void {
    const view = views.get(plotId);
    if (view) view.shake = 1;
  }

  function update(dt: number): void {
    for (const view of views.values()) {
      if (view.shake <= 0 || !view.model) continue;
      view.shake = Math.max(0, view.shake - dt * 3.2);
      const wobble = Math.sin(view.shake * 38) * 0.05 * view.shake;
      view.model.rotation.z = (view.model.userData.lean ?? 0) + wobble;
      view.model.rotation.x = wobble * 0.6;
    }
  }

  return Object.freeze({ sync, shake, update });
}
