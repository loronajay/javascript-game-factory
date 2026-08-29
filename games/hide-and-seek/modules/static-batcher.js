// Static geometry batching.
//
// The hotel is built out of the plan one record at a time, which is the right shape for a building
// that has to exist identically on a server — but it means a wall, a slab, a ceiling tile, a door
// frame jamb and a bed leg are each their own mesh, and each of those is its own draw call. Four
// furnished floors came to roughly 2,880 of them per frame, all of it geometry that never moves.
//
// The stairwell already had the answer: `bakeStatic`/`mergeGeometries` in hotel.js collapses 115
// treads and 51 rail segments into two meshes. This generalises it. Rather than making every
// builder batch-aware — which would drag the merge decision back into the code that is supposed to
// only walk the plan — the hotel is built exactly as before and then *flattened*: each floor group
// is traversed once, its static leaf meshes are grouped by material, and each group becomes one
// merged mesh.
//
// What is deliberately left alone:
//   - anything that moves or is animated (door leaves, drawer trays, the elevator cabin), passed in
//     as `skip` roots whose whole subtree is untouched;
//   - anything a raycast has to identify (interactable faces, buttons) — merging those would erase
//     the object identity `player.js` matches against;
//   - anything with a material of its own (signs, plates, vending fronts), because a group of one
//     merges to exactly what it already was.
//
// Merged meshes stay raycastable. The interaction ray reads the *nearest* hit and then walks up to
// find an interactable, so a wall that stops being a raycast target is a door you can open through
// it. The trade that is real: a merged floor is one bounding box, so per-wall frustum culling is
// gone. That is the intended trade — 24 always-drawn batches beat ~900 individually culled boxes.
export function createStaticBatcher({ THREE, mergeGeometries }) {
  // Two geometries can only be merged if they carry the same attributes in the same index mode, so
  // that shape is part of the group key rather than something the merge is left to discover.
  function attributeSignature(geometry) {
    return `${Object.keys(geometry.attributes).sort().join(',')}|${geometry.index ? 'i' : 'n'}`;
  }

  function isBatchable(node) {
    if (!node.isMesh || node.isSkinnedMesh || node.isInstancedMesh) return false;
    if (node.children.length) return false;
    if (node.visible === false) return false;
    if (node.userData && node.userData.noBatch) return false;
    if (!node.geometry || !node.geometry.attributes || !node.geometry.attributes.position) return false;
    if (!node.material || Array.isArray(node.material)) return false;
    if (node.geometry.morphAttributes && Object.keys(node.geometry.morphAttributes).length) return false;
    return true;
  }

  // Pure selection: which leaves under `root` may be merged, and with which other leaves. Exported
  // so the rule can be tested against plain objects with no WebGL in the process.
  function collectBatchGroups(root, { skip = new Set() } = {}) {
    const groups = new Map();
    const visit = (node) => {
      if (node !== root && skip.has(node)) return;
      if (isBatchable(node)) {
        const key = `${node.material.uuid}|${attributeSignature(node.geometry)}|${node.castShadow ? 1 : 0}${node.receiveShadow ? 1 : 0}`;
        let group = groups.get(key);
        if (!group) {
          group = { key, material: node.material, castShadow: !!node.castShadow, receiveShadow: !!node.receiveShadow, meshes: [] };
          groups.set(key, group);
        }
        group.meshes.push(node);
        return;
      }
      for (const child of node.children.slice()) visit(child);
    };
    visit(root);
    return groups;
  }

  // Collapse one subtree. Returns how many meshes went in and how many came out, because the only
  // honest way to talk about this change is the draw-call count before and after.
  function flatten(root, { skip = new Set(), name = 'Batch' } = {}) {
    const stats = { merged: 0, batches: 0, skipped: 0, pruned: 0 };
    if (!mergeGeometries) return stats;
    root.updateMatrixWorld(true);
    const toRoot = root.matrixWorld.clone().invert();
    for (const group of collectBatchGroups(root, { skip }).values()) {
      if (group.meshes.length < 2) { stats.skipped += group.meshes.length; continue; }
      const baked = [];
      for (const mesh of group.meshes) {
        mesh.updateMatrixWorld(true);
        baked.push(mesh.geometry.clone().applyMatrix4(toRoot.clone().multiply(mesh.matrixWorld)));
      }
      let merged = null;
      try { merged = mergeGeometries(baked, false); } catch (error) { merged = null; }
      for (const geometry of baked) geometry.dispose();
      if (!merged) { stats.skipped += group.meshes.length; continue; }
      for (const mesh of group.meshes) {
        mesh.parent?.remove(mesh);
        mesh.geometry.dispose();
      }
      const batch = new THREE.Mesh(merged, group.material);
      batch.name = `${name} · ${group.meshes.length}×`;
      batch.castShadow = group.castShadow;
      batch.receiveShadow = group.receiveShadow;
      batch.matrixAutoUpdate = false;
      batch.updateMatrix();
      root.add(batch);
      stats.merged += group.meshes.length;
      stats.batches += 1;
    }
    // A bed whose every plank was merged away leaves an empty Group behind, and an empty Group is
    // still a node the scene graph walks and a matrix it recomposes every frame. Nothing keeps a
    // reference to those, so they go with the meshes.
    const prune = (node) => {
      for (const child of node.children.slice()) {
        if (skip.has(child)) continue;
        prune(child);
        if (child.type === 'Group' && !child.children.length && !(child.userData && child.userData.floorId !== undefined)) {
          node.remove(child);
          stats.pruned += 1;
        }
      }
    };
    prune(root);
    return stats;
  }

  return { collectBatchGroups, flatten };
}
