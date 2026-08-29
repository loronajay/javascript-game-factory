export function createHotel({ THREE, scene, materials: MAT, config: CONFIG, floorY, keyIdForFloor, keyLabelForFloor, floorDefs, layout, world, furnishings, elevator, performance, mergeGeometries }) {
  const { collections, stairwellGroup } = world;
  // The stairwell is 108 treads plus every rail segment. Left as individual meshes that is several
  // hundred draw calls in the one place the player is guaranteed to stand, so the static parts are
  // baked into one mesh per material at build time. Nothing in the stairwell moves.
  const stairBatch = { treads: [], rails: [] };
  function bakeStatic(geometry, matrix, bucket) {
    if (!mergeGeometries) return null;
    const baked = geometry.clone().applyMatrix4(matrix);
    bucket.push(baked);
    return baked;
  }
  const floorLightingChanged = performance.createChangeTracker();
  function registerFloorLight(floor, light) { collections.floorLights.get(floor)?.push(light); }

  function createRoomDoor(parent, { x, z, width = 1.45, side = 'left', roomNumber = '', locked = false, requiredKey = null, openInitially = false }) {
    const hinge = new THREE.Group(); hinge.position.set(x, 0, z - width / 2); parent.add(hinge);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.12, width), MAT.wood); door.position.set(0, 1.06, width / 2); door.castShadow = true; door.receiveShadow = true; hinge.add(door);
    for (const xSide of [-0.078, 0.078]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), MAT.brass); knob.position.set(xSide, 0, width * 0.34); door.add(knob); }
    const item = { hinge, door, open: openInitially, target: 0, side, locked, roomNumber, requiredKey, colliderCache: null };
    const direction = side === 'left' ? -1 : 1; if (openInitially) { item.target = direction * CONFIG.doorOpenAngle; hinge.rotation.y = item.target; }
    item.colliderCache = world.registerBoxCollider(door, { width: 0.1, height: 2.12, depth: width });
    collections.dynamicDoors.push(item); collections.roomDoors.set(roomNumber, item);
    collections.interactables.push({ object: door, enabled: () => true, prompt: () => {
      if (item.locked) return item.requiredKey && world.state.inventory.has(item.requiredKey) ? `Unlock ${roomNumber} with key` : `${roomNumber} — Locked`;
      return `${item.open ? 'Close' : 'Open'} ${roomNumber}`;
    }, action: () => {
      if (item.locked) { if (item.requiredKey && world.state.inventory.has(item.requiredKey)) { item.locked = false; world.notify(`${roomNumber} unlocked.`); world.emit('door-unlocked', { roomNumber, keyId: item.requiredKey }); } else { world.notify(`${roomNumber} is locked. Search drawers or find another route.`); return; } }
      item.open = !item.open; item.target = item.open ? direction * CONFIG.doorOpenAngle : 0;
    } });
    return item;
  }
  function createSecretPanel(parent, { x, z, width = 1.15, side = 'left', id }) {
    const hinge = new THREE.Group(); hinge.position.set(x, 0, z - width / 2); parent.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.05, width), MAT.wall); panel.position.set(0, 1.025, width / 2); panel.castShadow = true; panel.receiveShadow = true; hinge.add(panel);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.125, 1.72, 0.035), new THREE.MeshStandardMaterial({ color: 0xcac7bd, roughness: 0.9 })); trim.position.set(side === 'left' ? 0.065 : -0.065, 0, width * 0.31); panel.add(trim);
    const item = { id, hinge, panel, side, open: false, target: 0, discovered: false, colliderCache: null }; const direction = side === 'left' ? -1 : 1;
    item.colliderCache = world.registerBoxCollider(panel, { width: 0.11, height: 2.05, depth: width }, () => Math.abs(item.hinge.rotation.y) < 1.25);
    collections.dynamicDoors.push(item); collections.secretPanels.set(id, item);
    collections.interactables.push({ object: panel, enabled: () => true, prompt: () => !item.discovered ? 'Inspect loose wall panel' : `${item.open ? 'Close' : 'Open'} secret passage`, action: () => {
      if (!item.discovered) { item.discovered = true; world.notify('A hidden passage is behind the wall.'); world.emit('secret-discovered', { id, floor: world.getFloorId(panel) }); }
      item.open = !item.open; item.target = item.open ? direction * CONFIG.doorOpenAngle : 0; if (item.open) world.emit('secret-opened', { id, floor: world.getFloorId(panel) });
    } });
    return item;
  }
  function splitWallForOpening(parent, x, roomMinZ, roomMaxZ, openingZ, openingWidth, thickness = 0.22) {
    const lowEnd = openingZ - openingWidth / 2; const highStart = openingZ + openingWidth / 2;
    const lowDepth = Math.max(0, lowEnd - roomMinZ); const highDepth = Math.max(0, roomMaxZ - highStart);
    if (lowDepth > 0.05) world.addWall(parent, x, roomMinZ + lowDepth / 2, thickness, lowDepth);
    if (highDepth > 0.05) world.addWall(parent, x, highStart + highDepth / 2, thickness, highDepth);
  }
  function addRoom(parent, def, roomNumber, centerX, centerZ, side, floorMat) {
    const width = 8; const depth = 8; const roomMinX = centerX - 4; const roomMaxX = centerX + 4; const roomMinZ = centerZ - 4; const roomMaxZ = centerZ + 4;
    const isSecret = def.secretRooms.includes(roomNumber); const secretZ = centerZ - 2.35;
    world.addFloor(parent, centerX, centerZ, width, depth, floorMat); world.registerGroundRect(parent, centerX, centerZ, width, depth); world.addCeiling(parent, centerX, centerZ, width, depth); world.addWall(parent, centerX, roomMinZ, width, 0.22); world.addWall(parent, centerX, roomMaxZ, width, 0.22);
    let roomDoor;
    if (side === 'left') {
      if (isSecret) { splitWallForOpening(parent, roomMinX, roomMinZ, roomMaxZ, secretZ, 1.15); createSecretPanel(parent, { x: roomMinX + 0.04, z: secretZ, id: `${roomNumber}-secret` }); } else world.addWall(parent, roomMinX, centerZ, 0.22, depth);
      splitWallForOpening(parent, roomMaxX, roomMinZ, roomMaxZ, centerZ, 1.45); world.addSign(parent, roomNumber, roomMaxX - 0.13, 2.15, centerZ - 1.35, -Math.PI / 2, 1.05, 0.52); world.addDoorFrame(parent, { x: roomMaxX - 0.12, z: centerZ });
      roomDoor = createRoomDoor(parent, { x: roomMaxX - 0.05, z: centerZ, side: 'left', roomNumber, locked: def.lockedRooms.includes(roomNumber), requiredKey: keyIdForFloor(def.id), openInitially: def.openRooms.includes(roomNumber) });
    } else {
      if (isSecret) { splitWallForOpening(parent, roomMaxX, roomMinZ, roomMaxZ, secretZ, 1.15); createSecretPanel(parent, { x: roomMaxX - 0.04, z: secretZ, side: 'right', id: `${roomNumber}-secret` }); } else world.addWall(parent, roomMaxX, centerZ, 0.22, depth);
      splitWallForOpening(parent, roomMinX, roomMinZ, roomMaxZ, centerZ, 1.45); world.addSign(parent, roomNumber, roomMinX + 0.13, 2.15, centerZ - 1.35, Math.PI / 2, 1.05, 0.52); world.addDoorFrame(parent, { x: roomMinX + 0.12, z: centerZ });
      roomDoor = createRoomDoor(parent, { x: roomMinX + 0.05, z: centerZ, side: 'right', roomNumber, locked: def.lockedRooms.includes(roomNumber), requiredKey: keyIdForFloor(def.id), openInitially: def.openRooms.includes(roomNumber) });
    }
    const fillSpec = layout.getRoomFillLight(def.id);
    const fillFixture = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.42), new THREE.MeshStandardMaterial({ color: 0xe7dfca, emissive: fillSpec.color, emissiveIntensity: roomDoor.open ? fillSpec.emissiveIntensity : 0.12, roughness: 0.8 }));
    fillFixture.position.set(centerX, 3.08, centerZ); parent.add(fillFixture); roomDoor.fillFixture = fillFixture; roomDoor.fillSpec = fillSpec;
    const variant = def.roomVariants[roomNumber] || 'standard'; const outward = side === 'left' ? -1 : 1;
    if (variant === 'standard') { furnishings.addBed(parent, centerX + outward * 1.95, centerZ - 0.2, side === 'left' ? Math.PI / 2 : -Math.PI / 2); const desk = furnishings.addDesk(parent, centerX - outward * 1.55, centerZ + 3.02); furnishings.addTableLamp(desk, 0, 0.13); furnishings.addDresser(parent, centerX, centerZ - 3.02, Math.PI, { keyId: def.keyPlacements[roomNumber] || null, keyLabel: keyLabelForFloor(def.id) }); furnishings.addPlant(parent, centerX + outward * 2.7, centerZ + 2.35); }
    else if (variant === 'suite') { furnishings.addCouch(parent, centerX, centerZ + 1.15, Math.PI); furnishings.addBed(parent, centerX + outward * 1.95, centerZ - 1.25, side === 'left' ? Math.PI / 2 : -Math.PI / 2); const desk = furnishings.addDesk(parent, centerX - outward * 1.45, centerZ + 3.02); furnishings.addTableLamp(desk, 0, 0.13); furnishings.addDresser(parent, centerX - 0.15 * outward, centerZ - 3.02, Math.PI, { keyId: def.keyPlacements[roomNumber] || null, keyLabel: keyLabelForFloor(def.id) }); furnishings.addPlant(parent, centerX - outward * 2.65, centerZ + 0.65, 0.95); }
    else { world.addBox(parent, centerX, 1, centerZ - 2.85, 5, 2, 0.55, MAT.dark, true); world.addBox(parent, centerX + outward * 2.6, 0.62, centerZ + 2.75, 1, 1.24, 0.75, MAT.metal, true); furnishings.addDresser(parent, centerX - outward * 1.65, centerZ + 3.02, 0, { keyId: def.keyPlacements[roomNumber] || null, keyLabel: keyLabelForFloor(def.id), label: 'tool drawer' }); }
    collections.roomCenters.set(roomNumber, { floor: def.id, x: centerX, z: centerZ, side });
  }
  function addSecretTunnel(parent, def, roomA, roomB) {
    const a = collections.roomCenters.get(roomA); const b = collections.roomCenters.get(roomB); if (!a || !b || a.side !== b.side) return;
    const x = a.side === 'left' ? -13.25 : 13.25; const panelZA = a.z - 2.35; const panelZB = b.z - 2.35; const minZ = Math.min(panelZA, panelZB) - 1.05; const maxZ = Math.max(panelZA, panelZB) + 1.05; const depth = maxZ - minZ; const centerZ = (minZ + maxZ) / 2;
    world.addFloor(parent, x, centerZ, 2.55, depth, def.id === 4 ? MAT.floor4 : MAT.dark); world.registerGroundRect(parent, x, centerZ, 2.55, depth);
    // Published so the sanity meter can tell a passage from a corridor: a tunnel drains the meter.
    collections.secretTunnels.push({ id: `${roomA}-${roomB}-tunnel`, kind: 'tunnel', floor: def.id, minX: x - 1.275, maxX: x + 1.275, minZ, maxZ }); world.addCeiling(parent, x, centerZ, 2.55, depth, 2.55);
    world.addWall(parent, a.side === 'left' ? -14.5 : 14.5, centerZ, 0.18, depth, 2.55, MAT.dark); world.addWall(parent, x, minZ, 2.55, 0.18, 2.55, MAT.dark); world.addWall(parent, x, maxZ, 2.55, 0.18, 2.55, MAT.dark);
    const gapStart = Math.min(a.z, b.z) + 4; const gapEnd = Math.max(a.z, b.z) - 4; if (gapEnd > gapStart) world.addWall(parent, a.side === 'left' ? -12.03 : 12.03, (gapStart + gapEnd) / 2, 0.18, gapEnd - gapStart, 2.55, MAT.dark);
    const red = new THREE.PointLight(0x9b1d1d, 0.45, 7, 2); red.position.set(x, 2.05, centerZ); parent.add(red); registerFloorLight(def.id, red); const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.18), MAT.redLight); fixture.position.set(x, 2.4, centerZ); parent.add(fixture);
  }
  function addWallLamp(parent, x, y, z, rotationY = 0) {
    const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.06), MAT.brass)); const shade = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.shade); shade.rotation.x = Math.PI; shade.position.set(0, -0.02, -0.06); group.add(shade); group.position.set(x, y, z); group.rotation.y = rotationY; parent.add(group);
  }
  function addRailSegment(start, end, material) {
    const a = new THREE.Vector3(start.x, start.y, start.z); const b = new THREE.Vector3(end.x, end.y, end.z); const vector = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(0.035, 0.035, vector.length(), 6);
    const position = a.clone().add(b).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize());
    if (mergeGeometries) {
      bakeStatic(geometry, new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)), stairBatch.rails);
      geometry.dispose();
      return;
    }
    const rail = new THREE.Mesh(geometry, material); rail.position.copy(position); rail.quaternion.copy(quaternion); rail.castShadow = true; stairwellGroup.add(rail);
  }
  function addGuard(guard, y, material) {
    const start = { x: guard.x1, y: y + guard.height, z: guard.z1 }; const end = { x: guard.x2, y: y + guard.height, z: guard.z2 }; addRailSegment(start, end, material); addRailSegment({ ...start, y }, start, material); addRailSegment({ ...end, y }, end, material);
  }
  function addStairwellShell(parent, def, shell, railMat) {
    const { xWest, xEast, zMin, zMax } = shell.bounds; const entrance = shell.entrance;
    world.addWall(parent, xWest, zMin + entrance.lowPierDepth / 2, 0.22, entrance.lowPierDepth, CONFIG.floorHeight);
    world.addWall(parent, xWest, entrance.maxZ + entrance.highPierDepth / 2, 0.22, entrance.highPierDepth, CONFIG.floorHeight);
    world.addBox(parent, xWest, 3.42, entrance.z, 0.22, 2.36, entrance.width, MAT.wall, true);
    world.addWall(parent, xEast, (zMin + zMax) / 2, 0.22, zMax - zMin, CONFIG.floorHeight); world.addWall(parent, (xWest + xEast) / 2, zMin, xEast - xWest, 0.22, CONFIG.floorHeight); world.addWall(parent, (xWest + xEast) / 2, zMax, xEast - xWest, 0.22, CONFIG.floorHeight);
    world.addSign(parent, 'STAIRS', xWest - 0.13, 2.35, entrance.z - 1.22, Math.PI / 2, 1.1, 0.42); world.addDoorFrame(parent, { x: xWest - 0.13, z: entrance.z, width: entrance.width, height: 2.24, material: MAT.brass });
    world.addBox(parent, shell.threshold.x, -0.06, shell.threshold.z, shell.threshold.w, 0.12, shell.threshold.d, MAT.wood); world.registerGroundRect(parent, shell.threshold.x, shell.threshold.z, shell.threshold.w, shell.threshold.d);
    if (def.id === 1) {
      const base = shell.baseSlab;
      world.addBox(parent, base.x, -0.06, base.z, base.w, 0.12, base.d, MAT.wood);
      world.registerGroundRect(parent, base.x, base.z, base.w, base.d);
    }
    if (def.id === 4) world.addCeiling(parent, (xWest + xEast) / 2, (zMin + zMax) / 2, xEast - xWest, zMax - zMin, 4.42);
    for (const guard of shell.guards.filter((item) => item.edge.startsWith('floor-'))) addGuard(guard, floorY(def.id), railMat);
    const light = new THREE.PointLight(0x8e0000, 0.62, 8, 2); light.position.set(6.75, 2.7, 48.9); light.castShadow = false; parent.add(light); registerFloorLight(def.id, light);
  }
  function buildContinuousStairwell(shell, railMat) {
    const stairLayout = layout.createStairLayout({ floorCount: 4, floorHeight: CONFIG.floorHeight });
    for (const landing of stairLayout.landings) { const geometry = new THREE.BoxGeometry(landing.w, 0.14, landing.d); const position = new THREE.Vector3(landing.x, landing.y - 0.07, landing.z); if (mergeGeometries) { bakeStatic(geometry, new THREE.Matrix4().setPosition(position), stairBatch.treads); geometry.dispose(); } else { const mesh = new THREE.Mesh(geometry, MAT.wood); mesh.position.copy(position); stairwellGroup.add(mesh); } world.registerGroundWorld(landing.x - landing.w / 2, landing.x + landing.w / 2, landing.z - landing.d / 2, landing.z + landing.d / 2, () => landing.y); if (landing.kind === 'switchback') addGuard(shell.guards.find((guard) => guard.edge === 'switchback-north'), landing.y, railMat); }
    for (const flight of stairLayout.flights) {
      const dx = flight.endX - flight.startX; const dz = flight.endZ - flight.startZ; const length = Math.hypot(dx, dz); const rotation = Math.atan2(dx, dz); const run = length / flight.steps;
      for (let i = 0; i < flight.steps; i += 1) {
        const t = (i + 0.5) / flight.steps; const topT = (i + 1) / flight.steps;
        const geometry = new THREE.BoxGeometry(flight.width, 0.15, run + 0.035);
        const position = new THREE.Vector3(flight.startX + dx * t, flight.startY + (flight.endY - flight.startY) * topT - 0.075, flight.startZ + dz * t);
        if (mergeGeometries) {
          bakeStatic(geometry, new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotation, 0)), new THREE.Vector3(1, 1, 1)), stairBatch.treads);
          geometry.dispose();
          continue;
        }
        const tread = new THREE.Mesh(geometry, MAT.wood); tread.position.copy(position); tread.rotation.y = rotation; stairwellGroup.add(tread);
      }
      world.registerGroundWorld(flight.startX - flight.width / 2, flight.startX + flight.width / 2, Math.min(flight.startZ, flight.endZ), Math.max(flight.startZ, flight.endZ), (x, z) => flight.startY + (flight.endY - flight.startY) * Math.max(0, Math.min(1, (z - flight.startZ) / (flight.endZ - flight.startZ))), () => true, 1);
      const xOffset = flight.railSide * (flight.width / 2 + 0.045); const start = { x: flight.startX + xOffset, y: flight.startY + 0.86, z: flight.startZ }; const end = { x: flight.endX + xOffset, y: flight.endY + 0.86, z: flight.endZ }; addRailSegment(start, end, railMat); addRailSegment({ ...start, y: start.y - 0.86 }, start, railMat); addRailSegment({ ...end, y: end.y - 0.86 }, end, railMat);
    }
  }
  function addElevatorHall(parent, def) {
    const wallZ = CONFIG.elevatorFrontZ; const center = CONFIG.elevatorCenterX; const leftEdge = center - 1.05; const rightEdge = center + 1.05;
    world.addWall(parent, -9 + (leftEdge + 9) / 2, wallZ, leftEdge + 9, 0.22); world.addWall(parent, rightEdge + (9 - rightEdge) / 2, wallZ, 9 - rightEdge, 0.22); world.addBox(parent, center, 2.78, wallZ, 2.1, 0.84, 0.22, MAT.wall, true);
    world.addBox(parent, leftEdge - 0.08, 1.3, wallZ, 0.16, 2.6, 0.28, MAT.brass); world.addBox(parent, rightEdge + 0.08, 1.3, wallZ, 0.16, 2.6, 0.28, MAT.brass); world.addSign(parent, `FLOOR ${def.id}`, center, 2.72, wallZ - 0.13, 0, 1.25, 0.42);
    const group = new THREE.Group(); group.position.set(center, 0, wallZ - 0.08); parent.add(group); const left = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.35, 0.08), MAT.metal); const right = left.clone(); left.position.set(-0.46, 1.175, 0); right.position.set(0.46, 1.175, 0); group.add(left, right);
    const doors = { group, left, right, amount: 0 }; collections.hallElevatorDoors.set(def.id, doors); world.registerBoxCollider(left, { width: 0.92, height: 2.35, depth: 0.08 }, () => doors.amount < 0.62, true); world.registerBoxCollider(right, { width: 0.92, height: 2.35, depth: 0.08 }, () => doors.amount < 0.62, true);
    const button = world.addBox(parent, rightEdge + 0.44, 1.25, wallZ - 0.215, 0.11, 0.18, 0.04, MAT.brass); collections.interactables.push({ object: button, enabled: () => true, prompt: () => elevator.elevator.currentFloor === def.id && elevator.elevator.state === 'open' ? 'Elevator is here' : 'Call elevator', action: () => elevator.call(def.id) });
  }
  function buildFloor(def, shell, railMat) {
    const group = new THREE.Group(); group.name = `Floor ${def.id}`; group.userData.floorId = def.id; group.position.y = floorY(def.id); scene.add(group); collections.floorGroups.set(def.id, group); collections.floorLights.set(def.id, []); const floorMat = MAT[`floor${def.id}`] || MAT.floor1;
    world.addFloor(group, 0, 0, 8, 84, floorMat); world.registerGroundRect(group, 0, 0, 8, 84); world.addCeiling(group, 0, 0, 8, 84); for (const [z, d] of [[-38, 8], [-25, 2], [-15, 2], [-5, 2], [5, 2], [15, 2], [25, 2], [38, 8]]) { world.addWall(group, -4.1, z, 0.22, d); world.addWall(group, 4.1, z, 0.22, d); }
    world.addFloor(group, 0, -51, 18, 18, floorMat); world.registerGroundRect(group, 0, -51, 18, 18); world.addCeiling(group, 0, -51, 18, 18); world.addWall(group, -9.1, -51, 0.22, 18); world.addWall(group, 9.1, -51, 0.22, 18); world.addWall(group, 0, -60.1, 18.2, 0.22); world.addWall(group, -6.55, -42.05, 5, 0.22); world.addWall(group, 6.55, -42.05, 5, 0.22);
    const serviceDepth = CONFIG.elevatorFrontZ - 42; const serviceCenterZ = 42 + serviceDepth / 2; const serviceWidth = 13.6;
    world.addFloor(group, -2.2, serviceCenterZ, serviceWidth, serviceDepth, floorMat); world.registerGroundRect(group, -2.2, serviceCenterZ, serviceWidth, serviceDepth); world.addCeiling(group, -2.2, serviceCenterZ, serviceWidth, serviceDepth); world.addWall(group, -9.1, serviceCenterZ, 0.22, serviceDepth); world.addWall(group, 9.1, serviceCenterZ, 0.22, serviceDepth); world.addWall(group, -6.55, 42.05, 5, 0.22); world.addWall(group, 4.3, 42.05, 0.6, 0.22);
    [30, 20, 10, 0, -10, -20, -30].forEach((z, i) => { addRoom(group, def, `${def.id}${String(i * 2 + 1).padStart(2, '0')}`, -8, z, 'left', floorMat); addRoom(group, def, `${def.id}${String(i * 2 + 2).padStart(2, '0')}`, 8, z, 'right', floorMat); }); for (const link of def.secretLinks) addSecretTunnel(group, def, link[0], link[1]);
    if (def.id === 1) { world.addBox(group, 0, 0.65, -56.2, 6, 1.3, 1, MAT.wood, true); world.addSign(group, 'CHECK-IN', 0, 2.05, -56.75, 0, 2.2); furnishings.addCouch(group, -4.7, -49.2, Math.PI / 2); furnishings.addCouch(group, 4.7, -49.2, -Math.PI / 2); furnishings.addPlant(group, -7.1, -58, 1.3); furnishings.addPlant(group, 7.1, -58, 1.3); }
    else if (def.id === 2) { furnishings.addCouch(group, -3.4, -51.4); furnishings.addCouch(group, 3.4, -51.4); furnishings.addPlant(group, -7, -56.8, 1.25); furnishings.addPlant(group, 7, -56.8, 1.25); }
    else if (def.id === 3) { furnishings.addCouch(group, 0, -52.8); furnishings.addPlant(group, -6.7, -57, 1.2); furnishings.addPlant(group, 6.7, -57, 1.2); }
    else { furnishings.addPlant(group, 6.8, -57); }
    furnishings.addVending(group, -8.54, 49.35, def.id === 4 ? 0x55534c : def.id === 3 ? 0x5b3a69 : 0x7b2f33, -Math.PI / 2); furnishings.addVending(group, -8.54, 51.05, def.id === 2 ? 0x2f6d4d : 0x334a73, -Math.PI / 2); addElevatorHall(group, def); addStairwellShell(group, def, shell, railMat);
    const hallLighting = layout.getHallLighting();
    for (let z = -35; z <= 35; z += hallLighting.fixtureSpacing) { addWallLamp(group, -3.88, 2, z, -Math.PI / 2); addWallLamp(group, 3.88, 2, z, Math.PI / 2); }
    for (let z = -32; z <= 32; z += hallLighting.pointSpacing) { const light = new THREE.PointLight(hallLighting.color, hallLighting.intensity, hallLighting.distance, hallLighting.decay); light.position.set(0, 2.35, z); light.castShadow = hallLighting.castShadow; group.add(light); registerFloorLight(def.id, light); }
    const serviceLight = new THREE.PointLight(0x8e0000, 0.62, 9, 2); serviceLight.position.set(0, 2.6, 50.2); serviceLight.castShadow = false; group.add(serviceLight); registerFloorLight(def.id, serviceLight);
  }
  function flushStairBatch(railMat) {
    if (!mergeGeometries) return;
    for (const [bucket, material, name] of [[stairBatch.treads, MAT.wood, 'Stair Treads'], [stairBatch.rails, railMat, 'Stair Rails']]) {
      if (!bucket.length) continue;
      const merged = mergeGeometries(bucket, false);
      for (const geometry of bucket) geometry.dispose();
      bucket.length = 0;
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = name;
      stairwellGroup.add(mesh);
    }
  }

  function build() {
    const shell = layout.createStairwellShellLayout(); const railMat = new THREE.MeshStandardMaterial({ color: 0x202329, metalness: 0.42, roughness: 0.62 });
    for (const def of floorDefs) buildFloor(def, shell, railMat); buildContinuousStairwell(shell, railMat);
    flushStairBatch(railMat);
    scene.updateMatrixWorld(true); world.colliderData();
  }
  function update(delta) {
    const activeFloor = world.state.playerFloor;
    const litFloors = layout.selectVisibleLightFloors({
      activeFloor, feetY: world.state.playerFeetY, floorHeight: CONFIG.floorHeight, floorCount: floorDefs.length,
    });
    if (floorLightingChanged(litFloors.join(','))) {
      for (const [floor, lights] of collections.floorLights) for (const light of lights) light.visible = litFloors.includes(floor);
    }
    for (const item of collections.dynamicDoors) {
      const diff = item.target - item.hinge.rotation.y;
      if (Math.abs(diff) > 0.001) { item.hinge.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), CONFIG.doorSpeed * delta); item.colliderCache.invalidate(); }
      if (item.fillFixture) item.fillFixture.material.emissiveIntensity = Math.abs(item.hinge.rotation.y) > 0.12 ? item.fillSpec.emissiveIntensity : 0.12;
    }
  }
  return { build, update };
}
