export function createFurnishings({ THREE, materials: MAT, world, keyLabelForFloor }) {
  const { collections, state } = world;
  // Furniture is placed by the plan, not by this module: `place` renders one placement record. The
  // boxes a body cannot walk through are already in the plan's collider list, so nothing here
  // registers collision — a bed that is solid on screen and thin air on the server is exactly the
  // drift this seam exists to prevent.

  // A material instance is what decides whether two meshes can share a draw call, so anything the
  // hotel places dozens of gets one material rather than one per placement. The pot used to be a
  // fresh MeshStandardMaterial per plant, which made 58 pots 58 batches that could never merge.
  const potMaterial = new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.9 });
  const vendingMaterials = new Map();
  function vendingMaterial(color) {
    if (!vendingMaterials.has(color)) vendingMaterials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.66 }));
    return vendingMaterials.get(color);
  }

  function addPlant(parent, x, z, scale = 1) {
    const group = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * scale, 0.18 * scale, 0.42 * scale, 16), potMaterial);
    pot.position.y = 0.2 * scale; group.add(pot);
    for (let i = 0; i < 7; i += 1) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), MAT.green); leaf.position.set((Math.random() - 0.5) * 0.35 * scale, 0.55 * scale + Math.random() * 0.45 * scale, (Math.random() - 0.5) * 0.35 * scale); group.add(leaf); }
    group.position.set(x, 0, z); parent.add(group); return group;
  }
  function addDesk(parent, x, z, rotationY = 0) {
    const group = new THREE.Group(); const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.7), MAT.wood); top.position.y = 0.85; top.castShadow = true; top.receiveShadow = true; group.add(top);
    for (const [lx, ly, lz] of [[-0.68, 0.4, -0.25], [0.68, 0.4, -0.25], [-0.68, 0.4, 0.25], [0.68, 0.4, 0.25]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.08), MAT.dark); leg.position.set(lx, ly, lz); group.add(leg); }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }
  function addTableLamp(parent, x, z, y = 0.9) {
    const group = new THREE.Group(); const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.08, 18), MAT.brass); base.position.y = 0.04;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 10), MAT.brass); stem.position.y = 0.29;
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.29, 0.24, 20), MAT.shade); shade.position.y = 0.6;
    group.add(base, stem, shade); group.position.set(x, y, z); parent.add(group);
    // A lamp contributes a *record* to the hotel's light pool rather than a PointLight of its own.
    // One more light in the scene is one more entry in every material's shader program key, and the
    // pool exists precisely so that number never moves. The shade's emissive is what makes it read
    // as lit whether or not the pool is currently spending a slot on it.
    const floor = world.getFloorId(group);
    group.updateMatrixWorld(true);
    const spot = group.getWorldPosition(new THREE.Vector3());
    collections.floorLights.get(floor)?.push({ floor, x: spot.x, y: spot.y + 0.55, z: spot.z, color: 0x750000, intensity: 0.2, distance: 4.2, decay: 2 });
    return group;
  }
  function addBed(parent, x, z, rotationY = 0) {
    const group = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.45, 3.2), MAT.dark); base.position.y = 0.3;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 3), MAT.linen); mattress.position.y = 0.67;
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.15, 2.3), MAT.bed); blanket.position.set(0, 0.82, 0.25); group.add(base, mattress, blanket);
    for (const xOffset of [-0.45, 0.45]) { const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.16, 0.45), MAT.linen); pillow.position.set(xOffset, 0.84, -1); group.add(pillow); }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }
  function addCouch(parent, x, z, rotationY = 0) {
    const group = new THREE.Group(); const seat = new THREE.Mesh(new THREE.BoxGeometry(2, 0.45, 0.9), MAT.accent); seat.position.y = 0.35;
    const back = new THREE.Mesh(new THREE.BoxGeometry(2, 0.7, 0.22), MAT.accent); back.position.set(0, 0.75, -0.34);
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.9), MAT.accent); arm1.position.set(-0.9, 0.52, 0); const arm2 = arm1.clone(); arm2.position.x = 0.9;
    group.add(seat, back, arm1, arm2); group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }
  function makeKeyMesh() {
    const group = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.023, 8, 16), MAT.brass); ring.rotation.x = Math.PI / 2; ring.position.x = -0.09;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), MAT.brass); shaft.position.x = 0.06;
    const tooth1 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.08, 0.035), MAT.brass); tooth1.position.set(0.14, -0.035, 0); const tooth2 = tooth1.clone(); tooth2.position.x = 0.19;
    group.add(ring, shaft, tooth1, tooth2); group.scale.setScalar(0.9); return group;
  }
  function addDresser(parent, x, z, rotationY = 0, { keyId = null, keyLabel = null, label = 'drawer', planId = null } = {}) {
    const root = new THREE.Group(); root.position.set(x, 0, z); root.rotation.y = rotationY; parent.add(root);
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.9, 0.58), MAT.wood); body.position.y = 0.45; body.castShadow = true; body.receiveShadow = true; root.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.08, 0.66), MAT.wood); top.position.y = 0.94; root.add(top);
    const drawer = new THREE.Group(); drawer.position.set(0, 0.62, -0.31); root.add(drawer); const face = new THREE.Mesh(new THREE.BoxGeometry(1.13, 0.28, 0.08), MAT.wood); drawer.add(face);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.05), MAT.brass); handle.position.set(0, 0, -0.065); face.add(handle);
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.18, 0.48), MAT.dark); tray.position.set(0, -0.03, 0.22); drawer.add(tray);
    const keyMesh = makeKeyMesh(); keyMesh.position.set(0, 0.09, 0.12); keyMesh.rotation.z = 0.1; drawer.add(keyMesh); keyMesh.visible = !!keyId;
    const item = { planId, root, drawer, face, open: false, searched: false, keyId, keyLabel: keyLabel || keyId, label, targetZ: -0.31, closedZ: -0.31, openZ: -0.83, keyMesh };
    collections.dynamicDrawers.push(item);
    if (planId) collections.drawersByPlanId.set(planId, item);
    collections.interactables.push({ object: face, enabled: () => true, prompt: () => !item.open ? `Open ${item.label}` : !item.searched ? `Search ${item.label}` : `Close ${item.label}`, action: () => {
      if (!item.open) { item.open = true; item.targetZ = item.openZ; return; }
      if (!item.searched) { item.searched = true; if (item.keyId) { world.addInventoryKey(item.keyId, item.keyLabel); item.keyMesh.visible = false; } else world.notify('Nothing useful in this drawer.'); world.emit('drawer-searched', { keyId: item.keyId || null, floor: world.getFloorId(root) }); return; }
      item.open = false; item.targetZ = item.closedZ;
    } });
    return item;
  }
  function addVending(parent, x, z, color, rotationY = 0) {
    const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group);
    world.addBox(group, 0, 1.1, 0, 1.1, 2.2, 0.9, vendingMaterial(color));
    world.addBox(group, 0, 1.3, -0.455, 0.74, 1.05, 0.05, MAT.dark); world.addBox(group, 0.28, 0.56, -0.46, 0.16, 0.18, 0.05, MAT.brass); return group;
  }
  function update(delta, config) {
    for (const item of collections.dynamicDrawers) { const diff = item.targetZ - item.drawer.position.z; if (Math.abs(diff) > 0.001) item.drawer.position.z += Math.sign(diff) * Math.min(Math.abs(diff), config.drawerSpeed * delta); }
  }

  // Online the server owns which drawers are open and whether the key is still in one, so a snapshot
  // drives the slide and hides the key rather than a click doing it locally.
  function applyDrawer(planId, { amount, searched }) {
    const item = collections.drawersByPlanId.get(planId);
    if (!item) return false;
    item.targetZ = item.closedZ + (item.openZ - item.closedZ) * Math.max(0, Math.min(1, amount));
    item.open = amount > 0.05;
    if (searched && item.keyMesh) item.keyMesh.visible = false;
    return true;
  }

  // --- the mall's fixtures ------------------------------------------------------------------------
  //
  // A hotel furnishes with beds, couches, desks, dressers, planters and vending. Cinder Mall's first
  // pass had to dress thirteen tenancies out of that list, so the bookstore got a bed and the arcade
  // got a nightstand. These are the shapes a shop is actually made of, ported from the standalone
  // prototype. Collision comes from the plan as it does for every other placement — nothing here
  // registers a collider.

  const bookMaterials = [MAT.red, MAT.upholstery, MAT.green, MAT.linen, MAT.wood];

  // A shelving run: sides, back, and shelves with books stood along them.
  function addBookcase(parent, x, z, rotationY = 0, width = 8.2, height = 1.95) {
    const group = new THREE.Group();
    const depth = 0.48;
    for (const px of [-width / 2 + 0.06, width / 2 - 0.06]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, height, depth), MAT.wood);
      side.position.set(px, height / 2, 0); group.add(side);
    }
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.07), MAT.dark);
    back.position.set(0, height / 2, depth / 2 - 0.035); group.add(back);
    const perShelf = Math.max(4, Math.floor(width * 2.4));
    for (const shelfY of [0.05, 0.49, 0.93, 1.37, 1.88]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(width - 0.12, 0.08, depth), MAT.wood);
      shelf.position.set(0, shelfY, 0); group.add(shelf);
      if (shelfY > 1.8) continue;
      for (let i = 0; i < perShelf; i += 1) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.05 + Math.random() * 0.05, 0.22 + Math.random() * 0.12, 0.3), bookMaterials[i % bookMaterials.length]);
        book.position.set(-width / 2 + 0.28 + i * ((width - 0.6) / perShelf), shelfY + 0.2, 0.02);
        group.add(book);
      }
    }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  // A plain merchandise gondola. Cheap on purpose: a mall needs dozens of these and each one only
  // has to break a sight line.
  function addShelf(parent, x, z, rotationY = 0, width = 3, height = 1.8, depth = 0.65, finish = 'wood') {
    const material = finish === 'metal' ? MAT.metal : finish === 'dark' ? MAT.dark : MAT.wood;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, height / 2, z); mesh.rotation.y = rotationY;
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  // A hanging clothes rail with garments on it.
  function addRack(parent, x, z, rotationY = 0, width = 3) {
    const group = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.08), MAT.metal);
    bar.position.y = 1.48; group.add(bar);
    for (const dx of [-width / 2 + 0.07, width / 2 - 0.07]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), MAT.metal);
      leg.position.set(dx, 0.75, 0); group.add(leg);
    }
    for (let i = 0; i < 8; i += 1) {
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.04), i % 3 === 0 ? MAT.red : i % 3 === 1 ? MAT.upholstery : MAT.linen);
      cloth.position.set(-width / 2 + 0.3 + i * ((width - 0.6) / 7), 1.02, 0.08); group.add(cloth);
    }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  // A food-court table with four stools.
  function addTable(parent, x, z) {
    const group = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.11, 1.55), MAT.wood);
    top.position.y = 0.73; group.add(top);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.74, 0.14), MAT.metal);
    post.position.y = 0.37; group.add(post);
    for (const [dx, dz] of [[1.05, 0], [-1.05, 0], [0, 1.05], [0, -1.05]]) {
      const stool = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.8, 0.68), MAT.upholstery);
      stool.position.set(dx, 0.4, dz); group.add(stool);
    }
    group.position.set(x, 0, z); parent.add(group); return group;
  }

  function addCinemaSeat(parent, x, z) {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.68), MAT.red);
    seat.position.set(0, 0.48, 0.02); group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.82, 0.14), MAT.red);
    back.position.set(0, 0.93, -0.29); back.rotation.x = -0.08; group.add(back);
    for (const dx of [-0.36, 0.36]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.62), MAT.dark);
      arm.position.set(dx, 0.66, 0); group.add(arm);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.46, 0.07), MAT.metal);
      leg.position.set(dx * 0.72, 0.23, 0.08); group.add(leg);
    }
    group.position.set(x, 0, z); parent.add(group); return group;
  }

  // A low island of bins — a toy store's display, and short enough to crouch behind.
  function addToyDisplay(parent, x, z, rotationY = 0, width = 3.2) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.14, 0.8), MAT.wood);
    base.position.y = 0.12; group.add(base);
    for (const shelfY of [0.42, 0.78]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.72), MAT.wood);
      shelf.position.y = shelfY; group.add(shelf);
    }
    for (let i = 0; i < 7; i += 1) {
      const bin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.42), [MAT.red, MAT.upholstery, MAT.green, MAT.linen][i % 4]);
      bin.position.set(-width / 2 + 0.3 + i * ((width - 0.6) / 6), 0.58, i % 2 ? -0.12 : 0.12); group.add(bin);
    }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  // A showroom bed. Deliberately not `addBed` — a squared-off display piece standing in a furniture
  // department, not a slept-in hotel room.
  function addDisplayBed(parent, x, z, rotationY = 0) {
    const group = new THREE.Group();
    for (const [w, h, d, px, py, pz, material] of [
      [2.05, 0.42, 3, 0, 0.27, 0, MAT.dark],
      [1.96, 0.24, 2.9, 0, 0.6, 0, MAT.linen],
      [1.88, 0.14, 2.1, 0, 0.78, 0.3, MAT.upholstery],
      [0.78, 0.15, 0.43, -0.42, 0.81, -1, MAT.linen],
      [0.78, 0.15, 0.43, 0.42, 0.81, -1, MAT.linen],
    ]) {
      const part = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      part.position.set(px, py, pz); group.add(part);
    }
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  function addArcadeCabinet(parent, x, z, rotationY = 0) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.85, 0.9), MAT.black);
    body.position.y = 0.925; group.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.48), MAT.screen);
    screen.position.set(0, 1.24, -0.456); screen.rotation.y = Math.PI; group.add(screen);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.32), MAT.red);
    panel.position.set(0, 0.8, -0.53); panel.rotation.x = -0.25; group.add(panel);
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  function addCrate(parent, x, z, scale = 1.15) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(scale, scale, scale), MAT.wood);
    crate.position.set(x, scale / 2, z); crate.castShadow = true; crate.receiveShadow = true;
    parent.add(crate); return crate;
  }

  // A standing lamp on a side table — the one warm practical in a furniture showroom.
  function addSideTableLamp(parent, x, z) {
    const group = new THREE.Group();
    const table = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.56, 0.7), MAT.wood);
    table.position.y = 0.28; group.add(table);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 8), MAT.brass);
    stem.position.y = 0.84; group.add(stem);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.29, 0.24, 16), MAT.shade);
    shade.position.y = 1.15; group.add(shade);
    group.position.set(x, 0, z); parent.add(group); return group;
  }

  // A salon station: a chair, a mirror and a ledge under it.
  function addSalonStation(parent, x, z, rotationY = 0) {
    const group = new THREE.Group();
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.9, 0.75), MAT.upholstery);
    chair.position.y = 0.45; group.add(chair);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.45, 0.08), MAT.glass);
    mirror.position.set(0, 1.35, -5.5); group.add(mirror);
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 0.45), MAT.wood);
    ledge.position.set(0, 0.9, -5.1); group.add(ledge);
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  // A checkout or service counter. Size comes off the placement, because a pharmacy counter and a
  // food-court servery are the same object at two lengths.
  function addCounter(parent, x, z, rotationY = 0, width = 4, depth = 1) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, 1.3, depth), MAT.wood);
    body.position.y = 0.65; group.add(body);
    const top = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.08, depth + 0.14), MAT.dark);
    top.position.y = 1.34; group.add(top);
    group.position.set(x, 0, z); group.rotation.y = rotationY; parent.add(group); return group;
  }

  // A cinema screen: a pale rectangle on the end wall, so a dark auditorium still reads as one.
  function addCinemaScreen(parent, x, z, rotationY = 0, width = 7.1, height = 2.2) {
    const screen = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.06), MAT.linen);
    screen.position.set(x, 1.75, z); screen.rotation.y = rotationY;
    parent.add(screen); return screen;
  }

  // One placement record from the plan becomes one piece of furniture.
  function addFountain(parent, x, z) {
    const group = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.8, 0.7, 32), MAT.dark);
    basin.position.y = 0.35; group.add(basin);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1, 28), MAT.wall);
    plinth.position.y = 0.78; group.add(plinth);
    group.position.set(x, 0, z); parent.add(group); return group;
  }

  function place(parent, placement) {
    const { type, x, z, rotationY = 0 } = placement;
    if (type === 'bed') return addBed(parent, x, z, rotationY);
    if (type === 'couch') return addCouch(parent, x, z, rotationY);
    if (type === 'plant') return addPlant(parent, x, z, placement.scale || 1);
    if (type === 'vending') return addVending(parent, x, z, placement.color, rotationY);
    if (type === 'dresser') return addDresser(parent, x, z, rotationY, { keyId: placement.keyId || null, keyLabel: placement.keyLabel || null, label: placement.label || 'drawer', planId: placement.id || null });
    if (type === 'desk') {
      const desk = addDesk(parent, x, z, rotationY);
      if (placement.lamp) addTableLamp(desk, 0, 0.13);
      return desk;
    }
    if (type === 'bookcase') return addBookcase(parent, x, z, rotationY, placement.width || 8.2, placement.height || 1.95);
    if (type === 'fountain') return addFountain(parent, x, z);
    if (type === 'shelf') return addShelf(parent, x, z, rotationY, placement.width || 3, placement.height || 1.8, placement.depth || 0.65, placement.finish || 'wood');
    if (type === 'rack') return addRack(parent, x, z, rotationY, placement.width || 3);
    if (type === 'table') return addTable(parent, x, z);
    if (type === 'cinema-seat') return addCinemaSeat(parent, x, z);
    if (type === 'toy-display') return addToyDisplay(parent, x, z, rotationY, placement.width || 3.2);
    if (type === 'display-bed') return addDisplayBed(parent, x, z, rotationY);
    if (type === 'arcade') return addArcadeCabinet(parent, x, z, rotationY);
    if (type === 'crate') return addCrate(parent, x, z, placement.scale || 1.15);
    if (type === 'side-table-lamp') return addSideTableLamp(parent, x, z);
    if (type === 'salon-station') return addSalonStation(parent, x, z, rotationY);
    if (type === 'counter') return addCounter(parent, x, z, rotationY, placement.width || 4, placement.depth || 1);
    if (type === 'cinema-screen') return addCinemaScreen(parent, x, z, rotationY, placement.width || 7.1, placement.height || 2.2);
    return null;
  }

  return {
    addPlant, addDesk, addTableLamp, addBed, addCouch, addDresser, addVending,
    addBookcase, addShelf, addRack, addTable, addCinemaSeat, addToyDisplay, addDisplayBed,
    addArcadeCabinet, addCrate, addSideTableLamp, addSalonStation, addCounter, addCinemaScreen,
    place, update, keyLabelForFloor, state, applyDrawer,
  };
}
