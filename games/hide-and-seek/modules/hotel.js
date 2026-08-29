// The hotel's renderer.
//
// It does not decide where anything is. `hotel-plan.js` answers that with plain data, and this walks
// the plan turning it into meshes. That split is what lets a server build the same building with no
// WebGL in the process — and it means a wall can never exist for the eye but not for collision, or
// the other way round, because both come from the one list.
export function createHotel({ THREE, scene, materials: MAT, config: CONFIG, floorY, keyIdForFloor, keyLabelForFloor, floorDefs, layout, plan: planApi, world, furnishings, elevator, performance, mergeGeometries }) {
  const { collections, stairwellGroup } = world;
  // The stairwell is 108 treads plus every rail segment. Left as individual meshes that is several
  // hundred draw calls in the one place the player is guaranteed to stand, so the static parts are
  // baked into one mesh per material at build time. Nothing in the stairwell moves.
  const stairBatch = { treads: [], rails: [] };
  const railMat = new THREE.MeshStandardMaterial({ color: 0x202329, metalness: 0.42, roughness: 0.62 });
  const floorLightingChanged = performance.createChangeTracker();
  let plan = null;

  function bakeStatic(geometry, matrix, bucket) {
    if (!mergeGeometries) return null;
    const baked = geometry.clone().applyMatrix4(matrix);
    bucket.push(baked);
    return baked;
  }
  function registerFloorLight(floor, light) { collections.floorLights.get(floor)?.push(light); }
  function materialFor(name) { return MAT[name] || MAT.wall; }
  function groupFor(floor) { return collections.floorGroups.get(floor); }

  function createRoomDoor(parent, spec) {
    const hinge = new THREE.Group(); hinge.position.set(spec.x, 0, spec.z - spec.width / 2); parent.add(hinge);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.12, spec.width), MAT.wood); door.position.set(0, 1.06, spec.width / 2); door.castShadow = true; door.receiveShadow = true; hinge.add(door);
    for (const xSide of [-0.078, 0.078]) { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), MAT.brass); knob.position.set(xSide, 0, spec.width * 0.34); door.add(knob); }
    const roomNumber = spec.roomNumber;
    const item = { planId: spec.id, hinge, door, open: spec.openInitially, target: 0, side: spec.side, locked: spec.locked, roomNumber, requiredKey: spec.requiredKey };
    if (spec.openInitially) { item.target = spec.openAngle; hinge.rotation.y = item.target; }
    world.setOpening(spec.id, hinge.rotation.y);
    collections.dynamicDoors.push(item); collections.roomDoors.set(roomNumber, item);
    collections.interactables.push({ object: door, enabled: () => true, prompt: () => {
      if (item.locked) return item.requiredKey && world.state.inventory.has(item.requiredKey) ? `Unlock ${roomNumber} with key` : `${roomNumber} — Locked`;
      return `${item.open ? 'Close' : 'Open'} ${roomNumber}`;
    }, action: () => {
      if (item.locked) { if (item.requiredKey && world.state.inventory.has(item.requiredKey)) { item.locked = false; world.notify(`${roomNumber} unlocked.`); world.emit('door-unlocked', { roomNumber, keyId: item.requiredKey }); } else { world.notify(`${roomNumber} is locked. Search drawers or find another route.`); return; } }
      item.open = !item.open; item.target = item.open ? spec.openAngle : 0;
    } });
    return item;
  }
  function createSecretPanel(parent, spec) {
    const hinge = new THREE.Group(); hinge.position.set(spec.x, 0, spec.z - spec.width / 2); parent.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.05, spec.width), MAT.wall); panel.position.set(0, 1.025, spec.width / 2); panel.castShadow = true; panel.receiveShadow = true; hinge.add(panel);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.125, 1.72, 0.035), new THREE.MeshStandardMaterial({ color: 0xcac7bd, roughness: 0.9 })); trim.position.set(spec.side === 'left' ? 0.065 : -0.065, 0, spec.width * 0.31); panel.add(trim);
    const item = { planId: spec.id, id: spec.id, hinge, panel, side: spec.side, open: false, target: 0, discovered: false };
    world.setOpening(spec.id, 0);
    collections.dynamicDoors.push(item); collections.secretPanels.set(spec.id, item);
    collections.interactables.push({ object: panel, enabled: () => true, prompt: () => !item.discovered ? 'Inspect loose wall panel' : `${item.open ? 'Close' : 'Open'} secret passage`, action: () => {
      if (!item.discovered) { item.discovered = true; world.notify('A hidden passage is behind the wall.'); world.emit('secret-discovered', { id: spec.id, floor: spec.floor }); }
      item.open = !item.open; item.target = item.open ? spec.openAngle : 0; if (item.open) world.emit('secret-opened', { id: spec.id, floor: spec.floor });
    } });
    return item;
  }
  function createHallDoors(def) {
    const specs = plan.hallDoors.filter((entry) => entry.floor === def.id);
    if (!specs.length) return;
    const parent = groupFor(def.id);
    const group = new THREE.Group(); group.position.set(CONFIG.elevatorCenterX, 0, CONFIG.elevatorFrontZ - 0.08); parent.add(group);
    const meshes = {};
    for (const spec of specs) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), MAT.metal);
      mesh.position.set(spec.direction * 0.46, 1.175, 0); group.add(mesh); meshes[spec.side] = mesh;
      world.setOpening(spec.id, 0);
    }
    collections.hallElevatorDoors.set(def.id, { group, left: meshes.left, right: meshes.right, amount: 0, planIds: specs.map((spec) => spec.id) });
  }
  function addWallLamp(parent, x, y, z, rotationY = 0) {
    const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.32, 0.06), MAT.brass)); const shade = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), MAT.shade); shade.rotation.x = Math.PI; shade.position.set(0, -0.02, -0.06); group.add(shade); group.position.set(x, y, z); group.rotation.y = rotationY; parent.add(group);
  }
  function addRailSegment(start, end) {
    const a = new THREE.Vector3(start.x, start.y, start.z); const b = new THREE.Vector3(end.x, end.y, end.z); const vector = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(0.035, 0.035, vector.length(), 6);
    const position = a.clone().add(b).multiplyScalar(0.5);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.clone().normalize());
    if (mergeGeometries) {
      bakeStatic(geometry, new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1)), stairBatch.rails);
      geometry.dispose();
      return;
    }
    const rail = new THREE.Mesh(geometry, railMat); rail.position.copy(position); rail.quaternion.copy(quaternion); rail.castShadow = true; stairwellGroup.add(rail);
  }
  function buildStairwell() {
    for (const tread of plan.stairs.treads) {
      const geometry = new THREE.BoxGeometry(tread.w, tread.h, tread.d);
      const position = new THREE.Vector3(tread.x, tread.y, tread.z);
      if (mergeGeometries) {
        bakeStatic(geometry, new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, tread.rotationY || 0, 0)), new THREE.Vector3(1, 1, 1)), stairBatch.treads);
        geometry.dispose();
        continue;
      }
      const mesh = new THREE.Mesh(geometry, MAT.wood); mesh.position.copy(position); mesh.rotation.y = tread.rotationY || 0; stairwellGroup.add(mesh);
    }
    for (const segment of plan.stairs.rails) addRailSegment(segment.start, segment.end);
  }
  function flushStairBatch() {
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
    plan = planApi.createHotelPlan({ config: CONFIG, floorDefs, layout, floorY, keyIdForFloor, keyLabelForFloor });
    world.setPlan(plan);

    for (const def of floorDefs) {
      const group = new THREE.Group();
      group.name = `Floor ${def.id}`; group.userData.floorId = def.id; group.position.y = floorY(def.id);
      scene.add(group); collections.floorGroups.set(def.id, group); collections.floorLights.set(def.id, []);
    }

    // Structure. A furnishing's collider box is in the plan too, but it is drawn as real furniture
    // rather than as a grey box, so it is skipped here.
    for (const entry of plan.boxes) {
      if (entry.group === 'furnishing') continue;
      const parent = groupFor(entry.floor);
      if (!parent) continue;
      const material = entry.kind === 'slab' || entry.kind === 'ceiling' ? materialFor(entry.material) : materialFor(entry.material);
      const mesh = world.addBox(parent, entry.x, entry.localY, entry.z, entry.w, entry.h, entry.d, material);
      if (entry.rotationY) mesh.rotation.y = entry.rotationY;
      if (entry.kind === 'slab' || entry.kind === 'ceiling') mesh.castShadow = false;
      if (entry.kind === 'call-button') {
        const callFloor = entry.callFloor;
        collections.interactables.push({
          object: mesh, enabled: () => true,
          prompt: () => (elevator.elevator.currentFloor === callFloor && elevator.elevator.state === 'open' ? 'Elevator is here' : 'Call elevator'),
          action: () => elevator.call(callFloor),
        });
      }
    }
    for (const entry of plan.signs) world.addSign(groupFor(entry.floor), entry.text, entry.x, entry.localY, entry.z, entry.rotationY, entry.w, entry.h);
    for (const entry of plan.doorFrames) world.addDoorFrame(groupFor(entry.floor), { x: entry.x, z: entry.z, width: entry.width, height: entry.height, material: materialFor(entry.material) });
    for (const entry of plan.wallLamps) addWallLamp(groupFor(entry.floor), entry.x, entry.localY, entry.z, entry.rotationY);
    for (const entry of plan.lights) {
      const light = new THREE.PointLight(entry.color, entry.intensity, entry.distance, entry.decay);
      light.position.set(entry.x, entry.localY, entry.z); light.castShadow = false;
      groupFor(entry.floor).add(light); registerFloorLight(entry.floor, light);
    }

    for (const spec of plan.roomDoors) createRoomDoor(groupFor(spec.floor), spec);
    for (const spec of plan.secretPanels) createSecretPanel(groupFor(spec.floor), spec);
    for (const def of floorDefs) createHallDoors(def);

    for (const entry of plan.fixtures) {
      const parent = groupFor(entry.floor);
      if (entry.kind === 'room-fill') {
        const door = collections.roomDoors.get(entry.roomNumber);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(entry.w, entry.h, entry.d), new THREE.MeshStandardMaterial({ color: 0xe7dfca, emissive: entry.spec.color, emissiveIntensity: door && door.open ? entry.spec.emissiveIntensity : 0.12, roughness: 0.8 }));
        mesh.position.set(entry.x, entry.localY, entry.z); parent.add(mesh);
        if (door) { door.fillFixture = mesh; door.fillSpec = entry.spec; }
      } else {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(entry.w, entry.h, entry.d), materialFor(entry.material));
        mesh.position.set(entry.x, entry.localY, entry.z); parent.add(mesh);
      }
    }

    for (const placement of plan.furnishings) furnishings.place(groupFor(placement.floor), placement);

    buildStairwell();
    flushStairBatch();
    scene.updateMatrixWorld(true);
    world.colliderData();
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
      if (Math.abs(diff) > 0.001) {
        item.hinge.rotation.y += Math.sign(diff) * Math.min(Math.abs(diff), CONFIG.doorSpeed * delta);
        // The plan owns the collider; the runtime only reports how far this leaf has swung.
        world.setOpening(item.planId, item.hinge.rotation.y);
      }
      if (item.fillFixture) item.fillFixture.material.emissiveIntensity = Math.abs(item.hinge.rotation.y) > 0.12 ? item.fillSpec.emissiveIntensity : 0.12;
    }
  }
  return { build, update, getPlan: () => plan };
}
