export function createFlashlightPickups({ THREE, scene, world, player }) {
  const drops = new Map();
  let sequence = 0;
  // Online a dropped battery is contested state: the server decides who reached it first, off the
  // same positions it resolves a tag from. So the replicated drops are scenery with no `action` —
  // walking over one is the interaction.
  const remote = new Map();
  // One material for every battery ever dropped. A fresh material is a fresh shader program to
  // compile, and the moment a battery hits the floor is the moment a player is being chased.
  const CASING = new THREE.MeshStandardMaterial({ color: 0x25272b, emissive: 0x514825, emissiveIntensity: 0.6, roughness: 0.62, metalness: 0.35 });
  const LENS = new THREE.MeshBasicMaterial({ color: 0xffe7a0 });

  function remove(drop) {
    drop.active = false;
    scene.remove(drop.root);
    drops.delete(drop.id);
  }

  function drop({ playerId, x, y, z, floor, charge }) {
    const remaining = Math.max(0, Math.min(1, Number(charge) || 0));
    if (remaining <= 0) return null;
    const id = `flashlight-drop-${++sequence}`;
    const root = new THREE.Group();
    root.name = `Dropped Flashlight ${playerId}`;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 10), CASING);
    body.rotation.z = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.055, 12), LENS);
    lens.rotation.z = Math.PI / 2; lens.position.x = 0.22;
    root.add(body, lens); root.position.set(x, y + 0.18, z); scene.add(root);
    const entry = { id, playerId, x, y, z, floor, charge: remaining, root, active: true };
    const interactable = {
      object: root,
      enabled: () => entry.active,
      prompt: () => `Recover flashlight (${Math.ceil(entry.charge * 100)}% charge)`,
      action: () => {
        if (!entry.active) return;
        const added = player.addFlashlightCharge(entry.charge);
        if (!(added > 0)) { world.notify('YOUR FLASHLIGHT IS ALREADY FULL.', 1500); return; }
        remove(entry);
        world.emit('flashlight-pickup', { dropId: id, fromPlayerId: playerId, added, flashlightCharge: player.getState().flashlightCharge });
      },
    };
    entry.interactable = interactable;
    drops.set(id, entry);
    world.collections.interactables.push(interactable);
    world.emit('flashlight-drop', { dropId: id, playerId, x, y, z, floor, charge: remaining });
    return entry;
  }

  function makeMarker(x, y, z) {
    const root = new THREE.Group();
    root.name = 'Dropped Flashlight';
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.42, 10), CASING);
    body.rotation.z = Math.PI / 2;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.055, 12), LENS);
    lens.rotation.z = Math.PI / 2; lens.position.x = 0.22;
    root.add(body, lens); root.position.set(x, y + 0.18, z); scene.add(root);
    return root;
  }

  // One snapshot in, the scene's drops out. A battery that has been claimed simply stops arriving.
  function applySnapshot(list = []) {
    const seen = new Set();
    for (const entry of list) {
      seen.add(entry.id);
      if (remote.has(entry.id)) continue;
      remote.set(entry.id, makeMarker(entry.x, entry.y, entry.z));
    }
    for (const [id, root] of [...remote]) {
      if (seen.has(id)) continue;
      scene.remove(root);
      remote.delete(id);
    }
  }

  function getState() {
    return [...drops.values()].map(({ id, playerId, x, y, z, floor, charge }) => ({ id, playerId, x, y, z, floor, charge }));
  }

  return { drop, applySnapshot, getState };
}
