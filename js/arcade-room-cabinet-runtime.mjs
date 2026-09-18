// Cabinet scene ownership. Layout rows are instances, so the scene must be
// instance-driven too: two Lovers Lost rows mean two independent meshes.
import { getCabinetFootprint } from "./arcade-room-cabinet.mjs";
import { createCabinetModel } from "./arcade-room-model.mjs";
function disposeModel(model) {
    model.traverse?.((object) => {
        object.geometry?.dispose?.();
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        for (const material of materials) {
            material.map?.dispose?.();
            material.dispose?.();
        }
    });
}
export function createCabinetRuntime(THREE, scene, definitions, makeModel = createCabinetModel) {
    const catalog = new Map(definitions.map((definition) => [definition.id, definition]));
    const byId = new Map();
    function create(instanceId, definition) {
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
    function sync(layout) {
        const wanted = new Set(layout.items.map((item) => item.instanceId));
        for (const [instanceId, entry] of byId) {
            if (wanted.has(instanceId))
                continue;
            scene.remove(entry.model);
            disposeModel(entry.model);
            byId.delete(instanceId);
        }
        for (const placement of layout.items) {
            const definition = catalog.get(placement.cabinetId);
            if (!definition)
                continue;
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
        modelFor: (instanceId) => byId.get(instanceId)?.model,
        instanceFor: (instanceId) => byId.get(instanceId),
    });
}
