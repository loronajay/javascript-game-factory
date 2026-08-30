import { createStaticBatcher } from './static-batcher.js';

// The hotel's renderer.
//
// It does not decide where anything is. `hotel-plan.js` answers that with plain data, and this walks
// the plan turning it into meshes. That split is what lets a server build the same building with no
// WebGL in the process — and it means a wall can never exist for the eye but not for collision, or
// the other way round, because both come from the one list.
// How many point lights the hotel ever has switched on. This is a hard number rather than a budget:
// three.js bakes the light count into every material's shader program cache key, so a hotel that
// lights 8 lamps on one floor and 16 in the stairwell is a hotel that recompiles ~220 materials on
// the frame the player opens the stairwell door. The lamps themselves are plain records, and the
// nearest `LIGHT_POOL_SIZE` of them are assigned into these fixed slots as the player moves.
export const LIGHT_POOL_SIZE = 8;

// The nearest lit lamps to a point, from the floors that are lit. Pure, and deliberately here
// rather than in the mirrored pure layer: a server has no lights to choose between.
export function selectPoolLights(candidates, { floors = null, origin = { x: 0, y: 0, z: 0 }, poolSize = LIGHT_POOL_SIZE } = {}) {
  const lit = [];
  for (const entry of candidates || []) {
    if (floors && !floors.includes(entry.floor)) continue;
    const dx = entry.x - origin.x; const dy = entry.y - origin.y; const dz = entry.z - origin.z;
    lit.push({ entry, distance: dx * dx + dy * dy + dz * dz });
  }
  lit.sort((a, b) => a.distance - b.distance);
  return lit.slice(0, poolSize).map((item) => item.entry);
}

export function createHotel({ THREE, scene, camera, materials: MAT, config: CONFIG, floorY, keyIdForFloor, keyLabelForFloor, floorDefs: authoredFloorDefs, layout, plan: planApi, maps, mapId, world, furnishings, elevator, performance, mergeGeometries }) {
  const { collections, stairwellGroup } = world;
  // The map this renderer is standing. It is resolved once, at build, and a different one means a
  // rebuilt world — which is why changing map from the menu re-enters the game rather than swapping
  // geometry under a round that is already running.
  let activeMapId = maps ? maps.playableMapId(mapId) : mapId;
  let floorDefs = authoredFloorDefs;
  const batcher = createStaticBatcher({ THREE, mergeGeometries });
  let batchStats = null;
  // The stairwell is 108 treads plus every rail segment. Left as individual meshes that is several
  // hundred draw calls in the one place the player is guaranteed to stand, so the static parts are
  // baked into one mesh per material at build time. Nothing in the stairwell moves.
  const stairBatch = { treads: [], rails: [] };
  const treadBatches = new Map([['wood', stairBatch.treads]]);
  const railMat = new THREE.MeshStandardMaterial({ color: 0x202329, metalness: 0.42, roughness: 0.62 });
  let plan = null;

  function bakeStatic(geometry, matrix, bucket) {
    if (!mergeGeometries) return null;
    const baked = geometry.clone().applyMatrix4(matrix);
    bucket.push(baked);
    return baked;
  }
  // The pool. Every slot is created once, added to the scene once, and never hidden — only moved,
  // recoloured and dimmed. A parked slot sits at zero intensity, which costs a few shader
  // instructions and saves a compile.
  const lightPool = [];
  const poolSelectionChanged = performance.createChangeTracker();
  function buildLightPool() {
    for (let slot = 0; slot < LIGHT_POOL_SIZE; slot += 1) {
      const light = new THREE.PointLight(0xb00000, 0, 9, 2);
      light.name = `Hall Lamp Slot ${slot}`; light.castShadow = false;
      scene.add(light); lightPool.push(light);
    }
  }
  function registerFloorLight(floor, record) { collections.floorLights.get(floor)?.push(record); }
  function materialFor(name) { return MAT[name] || MAT.wall; }
  function groupFor(floor) { return collections.floorGroups.get(floor); }

  function createRoomDoor(parent, spec) {
    // The leaf is the plan's leaf. This used to re-derive it — a 0.1 x 2.12 x width box hinged at
    // `z - width/2` — which silently assumed every door in the game hangs in a wall running along Z,
    // because that is how a hotel corridor is shaped. A mall's storefronts face all four ways, and a
    // door drawn across the wrong axis is a leaf lying flat through the shopfront.
    const hinge = new THREE.Group(); hinge.position.set(spec.hingeX, 0, spec.hingeZ); parent.add(hinge);
    // Plan heights are world coordinates; the parent floor already supplies its elevation.
    const door = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), MAT.wood); door.position.set(spec.localX, spec.y - floorY(spec.floor), spec.localZ); door.castShadow = true; door.receiveShadow = true; hinge.add(door);
    // Knobs sit near the leaf's free edge, which is along whichever of its two footprint axes is long.
    const alongZ = spec.d >= spec.w;
    for (const offset of [-0.078, 0.078]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 12), MAT.brass);
      knob.position.set(alongZ ? offset : spec.w * 0.34, 0, alongZ ? spec.d * 0.34 : offset);
      door.add(knob);
    }
    const roomNumber = spec.roomNumber;
    const item = { planId: spec.id, hinge, door, open: spec.openInitially, target: 0, side: spec.side, locked: spec.locked, roomNumber, requiredKey: spec.requiredKey };
    if (spec.openInitially) { item.target = spec.openAngle; hinge.rotation.y = item.target; }
    world.setOpening(spec.id, hinge.rotation.y);
    collections.dynamicDoors.push(item); collections.roomDoors.set(roomNumber, item); collections.doorsByPlanId.set(spec.id, item);
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
    const hinge = new THREE.Group(); hinge.position.set(spec.hingeX, 0, spec.hingeZ); parent.add(hinge);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), MAT.wall); panel.position.set(spec.localX, spec.y - floorY(spec.floor), spec.localZ); panel.castShadow = true; panel.receiveShadow = true; hinge.add(panel);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.125, 1.72, 0.035), new THREE.MeshStandardMaterial({ color: 0xcac7bd, roughness: 0.9 })); trim.position.set(spec.side === 'left' ? 0.065 : -0.065, 0, spec.width * 0.31); panel.add(trim);
    const item = { planId: spec.id, id: spec.id, hinge, panel, side: spec.side, open: false, target: 0, discovered: false };
    world.setOpening(spec.id, 0);
    collections.dynamicDoors.push(item); collections.secretPanels.set(spec.id, item); collections.doorsByPlanId.set(spec.id, item);
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
    // The shaft is the building's, not the config's — a mall's lift is not in a hotel's lobby.
    const shaft = plan.elevator || { centerX: CONFIG.elevatorCenterX, frontZ: CONFIG.elevatorFrontZ };
    const group = new THREE.Group(); group.position.set(shaft.centerX, 0, specs[0].z); parent.add(group);
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
      const finish = tread.material || 'wood';
      if (!treadBatches.has(finish)) treadBatches.set(finish, []);
      if (mergeGeometries) {
        bakeStatic(geometry, new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromEuler(new THREE.Euler(tread.rotationX || 0, tread.rotationY || 0, 0)), new THREE.Vector3(1, 1, 1)), treadBatches.get(finish));
        geometry.dispose();
        continue;
      }
      const mesh = new THREE.Mesh(geometry, materialFor(finish)); mesh.position.copy(position); mesh.rotation.set(tread.rotationX || 0, tread.rotationY || 0, 0); stairwellGroup.add(mesh);
    }
    for (const segment of plan.stairs.rails) addRailSegment(segment.start, segment.end);
  }
  function flushStairBatch() {
    if (!mergeGeometries) return;
    for (const [bucket, material, name] of [...[...treadBatches].map(([finish, batch]) => [batch, materialFor(finish), 'Stair Treads']), [stairBatch.rails, railMat, 'Stair Rails']]) {
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

  // Everything the plan describes is built one record at a time — that is what keeps the renderer a
  // walk over the plan rather than a second author of the building. The cost is a draw call per
  // wall, slab, ceiling tile, door frame jamb and bed leg, which came to roughly 2,880 per frame.
  // So the hotel is built exactly as before and then flattened: static leaves merge per floor per
  // material, and everything that moves or has to be identified by a raycast is named here.
  function flattenStatics() {
    const skip = new Set();
    // A leaf that swings, slides or is animated. `skip` holds subtree roots, so naming the hinge
    // covers the leaf and its knobs, and naming the drawer covers the face, the tray and the key.
    for (const item of collections.dynamicDoors) skip.add(item.hinge);
    for (const item of collections.dynamicDrawers) skip.add(item.drawer);
    for (const entry of collections.hallElevatorDoors.values()) skip.add(entry.group);
    // A merged mesh has no identity, and `player.js` finds what you are looking at by matching the
    // object a ray hit against this list.
    for (const item of collections.interactables) if (item.object) skip.add(item.object);
    // The room fills are lit by their door's swing, so their material is written to at runtime.
    for (const door of collections.roomDoors.values()) if (door.fillFixture) skip.add(door.fillFixture);

    const totals = { merged: 0, batches: 0, skipped: 0, pruned: 0 };
    for (const def of floorDefs) {
      const group = groupFor(def.id);
      if (!group) continue;
      const stats = batcher.flatten(group, { skip, name: `Floor ${def.id}` });
      for (const key of Object.keys(totals)) totals[key] += stats[key];
    }
    batchStats = totals;
    return totals;
  }

  // Which building this is. The plan factory is chosen by the map registry rather than named here,
  // so a second location is a new pure plan file and a catalog row — this renderer is a walk over
  // whatever plan comes back, and does not know a hotel from a mall.
  function build(mapId = activeMapId) {
    activeMapId = maps ? maps.playableMapId(mapId) : mapId;
    floorDefs = maps ? maps.resolveMapFloorDefs(activeMapId, { floorDefs: authoredFloorDefs }) : authoredFloorDefs;
    plan = maps
      ? maps.resolveMapPlan(activeMapId, { config: CONFIG, floorDefs: authoredFloorDefs, layout, floorY, keyIdForFloor, keyLabelForFloor })
      : planApi.createHotelPlan({ config: CONFIG, floorDefs, layout, floorY, keyIdForFloor, keyLabelForFloor });
    world.setPlan(plan);
    // Everything that walks the stairwell, rides the lift or works out which floor a body is on
    // reads this rather than assuming the hotel's four.
    world.state.floorCount = floorDefs.length;

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
    for (const entry of plan.doorFrames) world.addDoorFrame(groupFor(entry.floor), { x: entry.x, z: entry.z, width: entry.width, height: entry.height, axis: entry.axis || 'z', material: materialFor(entry.material) });
    for (const entry of plan.wallLamps) addWallLamp(groupFor(entry.floor), entry.x, entry.localY, entry.z, entry.rotationY);
    // A lamp is a record in world space, not a light. Which of them are switched on is decided every
    // frame by the pool, and the pool lives on the scene rather than under a floor group.
    for (const entry of plan.lights) registerFloorLight(entry.floor, { floor: entry.floor, x: entry.x, y: entry.y, z: entry.z, color: entry.color, intensity: entry.intensity, distance: entry.distance, decay: entry.decay });

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
    flattenStatics();
    buildLightPool();
    updateLightPool(layout.selectVisibleLightFloors({ activeFloor: world.state.playerFloor, feetY: world.state.playerFeetY, floorHeight: CONFIG.floorHeight, floorCount: floorDefs.length }));
    scene.updateMatrixWorld(true);
    world.colliderData();
  }

  // Reassigning the slots is cheap (a few dozen distance comparisons), but doing it every tick would
  // let a lamp swap slots on a knife edge and flicker, so it only runs when the lit floors change or
  // the player has actually walked somewhere.
  function updateLightPool(litFloors) {
    const origin = camera ? camera.position : { x: 0, y: world.state.playerFeetY, z: 0 };
    const key = `${litFloors.join(',')}|${Math.round(origin.x / 2)}|${Math.round(origin.z / 2)}|${Math.round(origin.y / 2)}`;
    if (!poolSelectionChanged(key)) return;
    const candidates = [];
    for (const [, records] of collections.floorLights) for (const record of records) candidates.push(record);
    const chosen = selectPoolLights(candidates, { floors: litFloors, origin, poolSize: LIGHT_POOL_SIZE });
    for (let slot = 0; slot < lightPool.length; slot += 1) {
      const light = lightPool[slot];
      const record = chosen[slot];
      // A slot with nothing to light is parked, not hidden: hiding it is what changes the count.
      if (!record) { light.intensity = 0; continue; }
      light.position.set(record.x, record.y, record.z);
      light.color.setHex(record.color); light.intensity = record.intensity;
      light.distance = record.distance; light.decay = record.decay;
    }
  }

  function update(delta) {
    const activeFloor = world.state.playerFloor;
    const litFloors = layout.selectVisibleLightFloors({
      activeFloor, feetY: world.state.playerFeetY, floorHeight: CONFIG.floorHeight, floorCount: floorDefs.length,
    });
    updateLightPool(litFloors);
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
  // Online the server owns every door in the hotel, so a snapshot drives the leaf instead of a
  // click. The angle is set as the *target* rather than applied outright: snapshots arrive 15 times
  // a second and the swing is drawn 60, so the existing animation is what smooths between them.
  function applyOpening(planId, angle) {
    const item = collections.doorsByPlanId.get(planId);
    if (!item) return false;
    item.target = angle;
    item.open = Math.abs(angle) > 0.05;
    if (item.discovered === false && item.open) item.discovered = true;
    return true;
  }

  // Snapshots are complete but sparse: an omitted leaf is fully closed, not unchanged.
  function applyOpenings(openings) {
    for (const id of collections.doorsByPlanId.keys()) applyOpening(id, openings[id] ?? 0);
  }

  return { build, update, applyOpening, applyOpenings, getMapId: () => activeMapId, getPlan: () => plan, getBatchStats: () => batchStats };
}
