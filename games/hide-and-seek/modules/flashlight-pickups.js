export function createFlashlightPickups({ THREE, scene, world, player, logic }) {
  const drops = new Map();
  let sequence = 0;
  let floorSpawned = false;
  let authoritative = false;
  // Online a dropped battery is contested state: the server decides who reached it first, off the
  // same positions it resolves a tag from. So the replicated drops are scenery with no `action` —
  // walking over one is the interaction.
  const remote = new Map();
  // One material for every battery ever dropped. A fresh material is a fresh shader program to
  // compile, and the moment a battery hits the floor is the moment a player is being chased.
  const CASING = new THREE.MeshStandardMaterial({ color: 0x25272b, emissive: 0x514825, emissiveIntensity: 0.6, roughness: 0.62, metalness: 0.35 });
  const LENS = new THREE.MeshBasicMaterial({ color: 0xffe7a0 });
  const BODY_GEOMETRY = new THREE.CylinderGeometry(0.09, 0.12, 0.42, 10);
  const LENS_GEOMETRY = new THREE.CylinderGeometry(0.135, 0.135, 0.055, 12);

  function remove(drop) {
    drop.active = false;
    scene.remove(drop.root);
    drops.delete(drop.id);
    const index = world.collections.interactables.indexOf(drop.interactable);
    if (index >= 0) world.collections.interactables.splice(index, 1);
  }

  function addLocal({ id, playerId, x, y, z, floor, charge }) {
    const root = makeMarker(x, y, z);
    const entry = { id, playerId, x, y, z, floor, charge, root, active: true };
    const enabled = () => entry.active && !authoritative && !world.state.playerEliminated && !world.state.gameOver;
    const interactable = {
      object: root,
      enabled,
      prompt: () => `Recover flashlight (${Math.ceil(entry.charge * 100)}% charge)`,
      action: () => {
        if (!enabled()) return;
        const added = player.addFlashlightCharge(entry.charge);
        if (!(added > 0)) { world.notify('YOUR FLASHLIGHT IS ALREADY FULL.', 1500); return; }
        remove(entry);
        world.emit('flashlight-pickup', { dropId: id, fromPlayerId: playerId, added, flashlightCharge: player.getState().flashlightCharge });
      },
    };
    entry.interactable = interactable;
    drops.set(id, entry);
    world.collections.interactables.push(interactable);
    return entry;
  }

  function drop({ playerId, x, y, z, floor, charge }) {
    if (authoritative) return null;
    const remaining = Math.max(0, Math.min(1, Number(charge) || 0));
    if (remaining <= 0) return null;
    const id = `flashlight-drop-${++sequence}`;
    const entry = addLocal({ id, playerId, x, y, z, floor, charge: remaining });
    world.emit('flashlight-drop', { dropId: id, playerId, x, y, z, floor, charge: remaining });
    return entry;
  }

  // Only solo composition calls this at round start. Entering a map or lobby creates no local loot.
  function spawnFloorPickups(plan, random = Math.random) {
    if (authoritative || floorSpawned) return;
    floorSpawned = true;
    for (const entry of logic.createFloorPickups(plan.spawns?.flashlights, random)) addLocal(entry);
  }

  function makeMarker(x, y, z) {
    const root = new THREE.Group();
    root.name = 'Floor Flashlight';
    const body = new THREE.Mesh(BODY_GEOMETRY, CASING);
    body.rotation.z = Math.PI / 2;
    const lens = new THREE.Mesh(LENS_GEOMETRY, LENS);
    lens.rotation.z = Math.PI / 2; lens.position.x = 0.22;
    root.add(body, lens); root.position.set(x, y + 0.14, z); scene.add(root);
    return root;
  }

  // One snapshot in, the scene's drops out. A battery that has been claimed simply stops arriving.
  function applySnapshot(list = []) {
    authoritative = true;
    for (const entry of [...drops.values()]) remove(entry);
    const seen = new Set();
    for (const entry of list) {
      seen.add(entry.id);
      let replica = remote.get(entry.id);
      if (!replica) {
        replica = { root: makeMarker(entry.x, entry.y, entry.z) };
        remote.set(entry.id, replica);
      }
      replica.record = { ...entry };
      replica.root.position.set(entry.x, entry.y + 0.14, entry.z);
    }
    for (const [id, entry] of remote) {
      if (seen.has(id)) continue;
      scene.remove(entry.root);
      remote.delete(id);
    }
  }

  function getState() {
    if (authoritative) return [...remote.values()].map(entry => ({ ...entry.record }));
    return [...drops.values()].map(({ id, playerId, x, y, z, floor, charge }) => ({ id, playerId, x, y, z, floor, charge }));
  }

  return { drop, spawnFloorPickups, applySnapshot, getState };
}
