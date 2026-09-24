// Grimnir crop models layered over editor-placed growing plots. The layout owns
// where soil exists; agriculture owns what grows there and which GLB stage is shown.

import { GLTFLoader } from "./vendor/loaders/GLTFLoader.js";
import { SOIL_CELL_LAYOUT, cropStatus, findCrop, type FarmAgriculture, type FarmCrop } from "./farm-crops.mjs";
import type { FarmLayout } from "./farm-layout.mjs";

type ThreeNamespace = Record<string, any>;
type PlotView = { group: any; content: any; key: string; loadToken: number };

const CROP_ASSET_ROOT = new URL("../farm/assets/crops/", import.meta.url);

export function cropAssetUrl(file: string): string {
  const url = new URL(file, CROP_ASSET_ROOT);
  // The original Grimnir GLBs embedded a white placeholder image. Keep one
  // explicit revision on the normalized files so browsers do not reuse that
  // earlier response after the pack is corrected in place.
  url.searchParams.set("v", "grimnir-color-1");
  return url.toString();
}

function disposeObject(root: any): void {
  root.traverse?.((node: any) => {
    node.geometry?.dispose?.();
    const material = node.material;
    if (Array.isArray(material)) material.forEach((entry) => entry?.dispose?.());
    else material?.dispose?.();
  });
  root.parent?.remove(root);
}

export type FarmCropsView = Readonly<{
  sync: (layout: FarmLayout, agriculture: FarmAgriculture, farmMinutes: number) => void;
  dispose: () => void;
}>;

export function createFarmCropsView(THREE: ThreeNamespace, scene: any): FarmCropsView {
  const root = new THREE.Group();
  root.name = "farm-growing-crops";
  scene.add(root);
  const loader = new GLTFLoader();
  const plots = new Map<string, PlotView>();

  function fittedModel(model: any, target: Readonly<{ width?: number; depth?: number; height?: number }>): any {
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
    model.traverse((node: any) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
    });
    return model;
  }

  function cellTile(holder: any, cell: typeof SOIL_CELL_LAYOUT[number], crop: FarmCrop | undefined, wet: boolean): void {
    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.92, 0.025, 0.82),
      new THREE.MeshStandardMaterial({ color: crop ? 0xc39a52 : 0x9a7845, roughness: 1 }),
    );
    border.position.set(cell.x, 0.07, cell.z);
    border.receiveShadow = true;
    holder.add(border);
    const earth = new THREE.Mesh(
      new THREE.BoxGeometry(0.84, 0.03, 0.74),
      new THREE.MeshStandardMaterial({ color: wet ? 0x34291d : 0x5a3421, roughness: 1 }),
    );
    earth.position.set(cell.x, 0.09, cell.z);
    earth.receiveShadow = true;
    holder.add(earth);
  }

  function loadContent(view: PlotView, crops: readonly FarmCrop[], farmMinutes: number): void {
    const token = ++view.loadToken;
    const holder = new THREE.Group();
    view.content.add(holder);
    for (const cell of SOIL_CELL_LAYOUT) {
      const crop = crops.find((entry) => entry.cellId === cell.id);
      const status = crop ? cropStatus(crop, farmMinutes) : null;
      cellTile(holder, cell, crop, Boolean(crop && !status?.thirsty));
      const definition = crop ? findCrop(crop.cropId) : undefined;
      if (!crop || !definition || !status) continue;
      loader.load(cropAssetUrl(definition.models[status.stage]), (gltf: any) => {
        if (token !== view.loadToken) return;
        const plant = fittedModel(gltf.scene, { width: 0.68, depth: 0.62, height: 0.48 + status.stage * 0.2 });
        plant.position.x += cell.x;
        plant.position.y += 0.11;
        plant.position.z += cell.z;
        plant.rotation.y = (SOIL_CELL_LAYOUT.indexOf(cell) % 3 - 1) * 0.08;
        holder.add(plant);
      }, undefined, () => undefined);
    }
  }

  function rebuild(view: PlotView, key: string, crops: readonly FarmCrop[], farmMinutes: number): void {
    view.loadToken += 1;
    for (const child of [...view.content.children]) disposeObject(child);
    view.key = key;
    loadContent(view, crops, farmMinutes);
  }

  return Object.freeze({
    sync(layout, agriculture, farmMinutes) {
      const wanted = new Set<string>();
      for (const row of layout.decor) {
        if (row.itemId !== "decor.plant.soil-patch") continue;
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
        const key = SOIL_CELL_LAYOUT.map((cell) => {
          const crop = planted.find((entry) => entry.cellId === cell.id);
          if (!crop) return "empty";
          const status = cropStatus(crop, farmMinutes);
          return `${crop.cropId}:${status.stage}:${status.thirsty ? "dry" : "wet"}`;
        }).join("|");
        if (key !== view.key) rebuild(view, key, planted, farmMinutes);
      }
      for (const [id, view] of plots) {
        if (wanted.has(id)) continue;
        view.loadToken += 1;
        disposeObject(view.group);
        plots.delete(id);
      }
    },
    dispose() {
      for (const view of plots.values()) disposeObject(view.group);
      plots.clear();
      scene.remove(root);
    },
  });
}
