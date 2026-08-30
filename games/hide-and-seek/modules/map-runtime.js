// Map-owned geometry is separate from the app's renderer, input listeners, menus and connection.
export function disposeMapObjects(root, sharedMaterials = new Set()) {
  const geometries = new Set(); const materials = new Set(); const textures = new Set();
  const sharedTextures = new Set();
  for (const material of sharedMaterials) for (const value of Object.values(material)) if (value?.isTexture) sharedTextures.add(value);
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material && !sharedMaterials.has(material)) materials.add(material);
    }
    object.skeleton?.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture && !sharedTextures.has(value)) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
  root.removeFromParent(); root.clear();
}

export function createMapRuntime({ THREE, scene, materials, createMap, canChange = () => true, onReady = () => {} }) {
  const parts = {};
  const sharedMaterials = new Set(Object.values(materials));
  let current = null; let makeDemons = null;

  function prepare(mapId) {
    if (current?.mapId === mapId) return true;
    if (current && !canChange()) return false;
    const group = new THREE.Group(); group.name = `Map: ${mapId}`;
    let next;
    try {
      next = createMap(mapId, group);
      if (makeDemons) next.demons = makeDemons(next.world, group, mapId);
    } catch (error) {
      next?.demons?.dispose?.();
      disposeMapObjects(group, sharedMaterials);
      throw error;
    }
    if (current) {
      parts.demons?.dispose?.();
      disposeMapObjects(current.group, sharedMaterials);
    }
    // Keep the API handles held by player/online controllers, replacing their map-owned state
    // and closures together only after the new building has been successfully constructed.
    for (const [name, value] of Object.entries(next)) {
      if (parts[name]) Object.assign(parts[name], value);
      else parts[name] = value;
    }
    scene.add(group);
    current = { mapId, group };
    onReady(parts);
    return true;
  }

  function setDemonsFactory(factory) {
    makeDemons = factory;
    parts.demons = factory(parts.world, current.group, current.mapId);
    return parts.demons;
  }

  return { parts, prepare, setDemonsFactory };
}
