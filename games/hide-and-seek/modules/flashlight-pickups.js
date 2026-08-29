export function createFlashlightPickups({ THREE, scene, world, player }) {
  const drops = new Map();
  let sequence = 0;

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
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 0.42, 10),
      new THREE.MeshStandardMaterial({ color: 0x25272b, emissive: 0x514825, emissiveIntensity: 0.6, roughness: 0.62, metalness: 0.35 }),
    );
    body.rotation.z = Math.PI / 2;
    const lens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.135, 0.135, 0.055, 12),
      new THREE.MeshBasicMaterial({ color: 0xffe7a0 }),
    );
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

  function getState() {
    return [...drops.values()].map(({ id, playerId, x, y, z, floor, charge }) => ({ id, playerId, x, y, z, floor, charge }));
  }

  return { drop, getState };
}
