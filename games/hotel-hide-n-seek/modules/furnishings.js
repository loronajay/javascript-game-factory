export function createFurnishings({ THREE, materials: MAT, world, keyLabelForFloor }) {
  const { collections, state } = world;
  function registerStatic(object, width, height, depth) { world.registerBoxCollider(object, { width, height, depth }); }

  function addPlant(parent, x, z, scale = 1) {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.18 * scale, 0.42 * scale, 16), new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.9 }));
    pot.position.y = 0.2 * scale; group.add(pot);
    for (let i = 0; i < 7; i += 1) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), MAT.green); leaf.position.set((Math.random() - 0.5) * 0.35 * scale, 0.55 * scale + Math.random() * 0.45 * scale, (Math.random() - 0.5) * 0.35 * scale); group.add(leaf); }
    group.position.set(x, 0, z); parent.add(group); return group;
  }
  function addDesk(parent, x, z, rotationY = 0) {
    const group = new THREE.Group(); const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.7), MAT.wood); top.position.y = 0.85; top.castShadow = true; top.receiveShadow = true; group.add(top);
    for (const [lx, ly, lz] of [[-0.68, 0.4, -0.25], [0.68, 0.4, -0.25], [-0.68, 0.4, 0.25], [0.68, 0.4, 0.25]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), MAT.dark); leg.position.set(lx, ly, lz); group.add(leg); }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); registerStatic(top, 1.6, 0.1, 0.7); return group;
  }
  function addTableLamp(parent, x, z, y = 0.9) {
    const group = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 18), MAT.brass); base.position.y = 0.04;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10), MAT.brass); stem.position.y = 0.29;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.24, 20), MAT.shade); shade.position.y = 0.6;
    const light = new THREE.PointLight(0x750000, 0.2, 4.2, 2); light.position.y = 0.55; light.castShadow = false; group.add(base, stem, shade, light); group.position.set(x, y, z); parent.add(group); const floor = world.getFloorId(group); collections.floorLights.get(floor)?.push(light); return group;
  }
  function addBed(parent, x, z, rotationY = 0) {
    const group = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 3.2), MAT.dark); base.position.y = 0.3;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 3), MAT.linen); mattress.position.y = 0.67;
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.15, 2.3), MAT.bed); blanket.position.set(0, 0.82, 0.25); group.add(base, mattress, blanket);
    for (const xOffset of [-0.45, 0.45]) { const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.45), MAT.linen); pillow.position.set(xOffset, 0.84, -1); group.add(pillow); }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); registerStatic(base, 2.1, 0.45, 3.2); registerStatic(mattress, 2, 0.25, 3); return group;
  }
  function addCouch(parent, x, z, rotationY = 0) {
    const group = new THREE.Group(); const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.45, 0.9), MAT.accent); seat.position.y = 0.35;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 0.22), MAT.accent); back.position.set(0, 0.75, -0.34);
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.9), MAT.accent); arm1.position.set(-0.9, 0.52, 0); const arm2 = arm1.clone(); arm2.position.x = 0.9;
    group.add(seat, back, arm1, arm2); group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); registerStatic(seat, 2, 0.45, 0.9); registerStatic(back, 2, 0.7, 0.22); registerStatic(arm1, 0.2, 0.62, 0.9); registerStatic(arm2, 0.2, 0.62, 0.9); return group;
  }
  function makeKeyMesh() {
    const group = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.023, 8, 16), MAT.brass); ring.rotation.x = Math.PI / 2; ring.position.x = -0.09;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), MAT.brass); shaft.position.x = 0.06;
    const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.035), MAT.brass); tooth1.position.set(0.14, -0.035, 0); const tooth2 = tooth1.clone(); tooth2.position.x = 0.19;
    group.add(ring, shaft, tooth1, tooth2); group.scale.setScalar(0.9); return group;
  }
  function addDresser(parent, x, z, rotationY = 0, { keyId = null, keyLabel = null, label = 'drawer' } = {}) {
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rotationY; parent.add(root);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 0.58), MAT.wood); body.position.y = 0.45; body.castShadow = true; body.receiveShadow = true; root.add(body); registerStatic(body, 1.35, 0.9, 0.58);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.08, 0.66), MAT.wood); top.position.y = 0.94; root.add(top);
    const drawer = new THREE.Group(); drawer.position.set(0, 0.62, -0.31); root.add(drawer); const face = new THREE.Mesh(new THREE.BoxGeometry(1.13, 0.28, 0.08), MAT.wood); drawer.add(face);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.05), MAT.brass); handle.position.set(0, 0, -0.065); face.add(handle);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.48), MAT.dark); tray.position.set(0, -0.03, 0.22); drawer.add(tray);
    const keyMesh = makeKeyMesh(); keyMesh.position.set(0, 0.09, 0.12); keyMesh.rotation.z = 0.1; drawer.add(keyMesh); keyMesh.visible = !!keyId;
    const item = { root, drawer, face, open: false, searched: false, keyId, keyLabel: keyLabel || keyId, label, targetZ: -0.31, closedZ: -0.31, openZ: -0.83, keyMesh };
    collections.dynamicDrawers.push(item);
    collections.interactables.push({ object: face, enabled: () => true, prompt: () => !item.open ? `Open ${item.label}` : !item.searched ? `Search ${item.label}` : `Close ${item.label}`, action: () => {
      if (!item.open) { item.open = true; item.targetZ = item.openZ; return; }
      if (!item.searched) { item.searched = true; if (item.keyId) { world.addInventoryKey(item.keyId, item.keyLabel); item.keyMesh.visible = false; } else world.notify('Nothing useful in this drawer.'); world.emit('drawer-searched', { keyId: item.keyId || null, floor: world.getFloorId(root) }); return; }
      item.open = false; item.targetZ = item.closedZ;
    } });
    return item;
  }
  function addVending(parent, x, z, color, rotationY = 0) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group);
    world.addBox(group, 0, 1.1, 0, 1.1, 2.2, 0.9, new THREE.MeshStandardMaterial({ color, roughness: 0.66 }), true);
    world.addBox(group, 0, 1.3, -0.455, 0.74, 1.05, 0.05, MAT.dark); world.addBox(group, 0.28, 0.56, -0.46, 0.16, 0.18, 0.05, MAT.brass); return group;
  }
  function update(delta, config) {
    for (const item of collections.dynamicDrawers) { const diff = item.targetZ - item.drawer.position.z; if (Math.abs(diff) > 0.001) item.drawer.position.z += Math.sign(diff) * Math.min(Math.abs(diff), config.drawerSpeed * delta); }
  }

  return { addPlant, addDesk, addTableLamp, addBed, addCouch, addDresser, addVending, update, keyLabelForFloor, state };
}
