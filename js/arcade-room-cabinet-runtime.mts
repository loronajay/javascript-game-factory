// Cabinet scene ownership. Layout rows are instances, so the scene must be
// instance-driven too: two Lovers Lost rows mean two independent meshes.

import { getCabinetFootprint, type CabinetDefinition } from "./arcade-room-cabinet.mjs";
import type { RoomLayout } from "./arcade-room-layout.mjs";
import { createCabinetModel } from "./arcade-room-model.mjs";

export type CabinetRuntimeInstance = Readonly<{
  instanceId: string;
  definition: CabinetDefinition;
  model: any;
  screen: any;
  footprint: ReturnType<typeof getCabinetFootprint>;
}>;

export type CabinetRuntime = Readonly<{
  sync: (layout: Pick<RoomLayout, "items">) => void;
  instances: () => readonly CabinetRuntimeInstance[];
  modelFor: (instanceId: string) => any | undefined;
  instanceFor: (instanceId: string) => CabinetRuntimeInstance | undefined;
}>;

function disposeModel(model: any): void {
  model.traverse?.((object: any) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    for (const material of materials) {
      material.map?.dispose?.();
      material.dispose?.();
    }
  });
}

export function createCabinetRuntime(
  THREE: any,
  scene: any,
  definitions: readonly CabinetDefinition[],
  makeModel: (THREE: any, definition: CabinetDefinition) => any = createCabinetModel,
): CabinetRuntime {
  const catalog = new Map(definitions.map((definition) => [definition.id, definition]));
  const byId = new Map<string, CabinetRuntimeInstance>();

  function create(instanceId: string, definition: CabinetDefinition): CabinetRuntimeInstance {
    const model = makeModel(THREE, definition);
    model.userData.cabinetInstanceId = instanceId;
    const glow = new THREE.PointLight(definition.palette.trim, 2.4, 5.2, 2);
    glow.position.set(0, 2.08, 0.65);
    model.add(glow);
    scene.add(model);
    return {
      instanceId,
      definition,
      model,
      screen: model.getObjectByName("screen"),
      footprint: getCabinetFootprint(definition),
    };
  }

  function sync(layout: Pick<RoomLayout, "items">): void {
    const wanted = new Set(layout.items.map((item) => item.instanceId));
    for (const [instanceId, entry] of byId) {
      if (wanted.has(instanceId)) continue;
      scene.remove(entry.model);
      disposeModel(entry.model);
      byId.delete(instanceId);
    }
    for (const placement of layout.items) {
      const definition = catalog.get(placement.cabinetId);
      if (!definition) continue;
      let entry = byId.get(placement.instanceId);
      if (entry && entry.definition.id !== placement.cabinetId) {
        scene.remove(entry.model);
        disposeModel(entry.model);
        byId.delete(placement.instanceId);
        entry = undefined;
      }
      entry ??= create(placement.instanceId, definition);
      byId.set(placement.instanceId, entry);
      entry.model.position.set(placement.x, 0, placement.z);
      entry.model.rotation.y = placement.rotationY;
      entry.model.visible = !placement.hidden;
    }
  }

  return Object.freeze({
    sync,
    instances: () => [...byId.values()],
    modelFor: (instanceId: string) => byId.get(instanceId)?.model,
    instanceFor: (instanceId: string) => byId.get(instanceId),
  });
}
