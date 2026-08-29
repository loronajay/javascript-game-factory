export function createWorld({ THREE, scene, materials: MAT, config: CONFIG, layout, logic, plan: planApi, document, window }) {
  const state = { isLocked: false, yaw: 0, pitch: 0, playerFloor: 1, playerFeetY: 0, playerEyeHeight: CONFIG.eyeHeight, playerCrouching: false, inventory: new Set(), activeInteractable: null, notificationTimer: null };
  const collections = {
    colliders: [], interactables: [], dynamicDoors: [], dynamicDrawers: [],
    floorGroups: new Map(), floorLights: new Map(), roomDoors: new Map(), secretPanels: new Map(), doorsByPlanId: new Map(), drawersByPlanId: new Map(),
    hallElevatorDoors: new Map(), roomCenters: new Map(), secretTunnels: [],
  };
  const stairwellGroup = new THREE.Group();
  stairwellGroup.name = 'Continuous Stairwell';
  scene.add(stairwellGroup);

  const notificationEl = document.getElementById('notification');
  const keyListEl = document.getElementById('keyList');
  const floorBadge = document.getElementById('floorBadge');
  const elevatorBadge = document.getElementById('elevatorBadge');
  const promptEl = document.getElementById('interactionPrompt');

  // The building itself is plain data from hotel-plan.js. Nothing here discovers geometry from a
  // rendered mesh any more: what blocks a body and what a body can stand on are answers the pure
  // layer gives, so a server can give the same ones with no renderer in the process.
  let plan = null;
  // Door id -> swing angle (room doors, secret panels) or open amount (elevator doors).
  const openings = Object.create(null);
  // Surface id -> current height, for the one walkable thing that moves: the elevator car.
  const dynamicHeights = Object.create(null);
  let resolved = [];
  let staticCount = 0;
  let doorCount = 0;
  let openingsDirty = true;

  function setPlan(next) {
    plan = next;
    resolved = plan.colliders.slice();
    staticCount = resolved.length;
    doorCount = staticCount;
    openingsDirty = true;
    for (const tunnel of plan.secretTunnels) collections.secretTunnels.push(tunnel);
    for (const centre of plan.roomCenters) collections.roomCenters.set(centre.roomNumber, { floor: centre.floor, x: centre.x, z: centre.z, side: centre.side });
  }
  function setOpening(id, value) {
    if (openings[id] === value) return;
    openings[id] = value;
    openingsDirty = true;
  }
  function setDynamicHeight(id, value) { dynamicHeights[id] = value; }

  function emit(name, detail = {}) { window.dispatchEvent(new CustomEvent(`hotel:${name}`, { detail })); }
  function notify(message, duration = 2200) {
    notificationEl.textContent = message;
    notificationEl.classList.add('notificationVisible');
    if (state.notificationTimer) window.clearTimeout(state.notificationTimer);
    state.notificationTimer = window.setTimeout(() => notificationEl.classList.remove('notificationVisible'), duration);
  }
  function updateInventoryHud() {
    if (!state.inventory.size) { keyListEl.textContent = 'No keys'; return; }
    keyListEl.textContent = [...state.inventory].map((id) => {
      const match = id.match(/^floor-(\d+)-master$/);
      return match ? `F${match[1]} master` : id;
    }).join(' • ');
  }
  function addInventoryKey(keyId, label) {
    if (state.inventory.has(keyId)) return;
    state.inventory.add(keyId); updateInventoryHud(); notify(`Found: ${label}`);
    emit('key-found', { keyId, label, playerFloor: state.playerFloor });
  }
  function getFloorId(object) {
    let current = object;
    while (current) { if (current.userData && Number.isInteger(current.userData.floorId)) return current.userData.floorId; current = current.parent; }
    return null;
  }
  const colliderPoint = new THREE.Vector3();
  function boxDataFromObject(obj, { width, height, depth }) {
    obj.updateMatrixWorld(true);
    let minX = Infinity; let minY = Infinity; let minZ = Infinity;
    let maxX = -Infinity; let maxY = -Infinity; let maxZ = -Infinity;
    for (const x of [-width / 2, width / 2]) for (const y of [-height / 2, height / 2]) for (const z of [-depth / 2, depth / 2]) {
      colliderPoint.set(x, y, z).applyMatrix4(obj.matrixWorld);
      minX = Math.min(minX, colliderPoint.x); maxX = Math.max(maxX, colliderPoint.x);
      minY = Math.min(minY, colliderPoint.y); maxY = Math.max(maxY, colliderPoint.y);
      minZ = Math.min(minZ, colliderPoint.z); maxZ = Math.max(maxZ, colliderPoint.z);
    }
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }
  // The elevator cabin is the one body the plan cannot describe: it rides the shaft, so its bounds
  // are state rather than layout. Everything else in the hotel comes from the plan.
  function registerBoxCollider(obj, size, enabledProvider = () => true) {
    const collider = { obj, enabledProvider, data: null };
    collider.dataProvider = () => boxDataFromObject(obj, size);
    collections.colliders.push(collider);
    return collider;
  }
  function addBox(parent, x, y, z, w, h, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    return mesh;
  }
  function addFloor(parent, x, z, w, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), material);
    mesh.position.set(x, -0.1, z); mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function addCeiling(parent, x, z, w, d, height = 3.2) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d), MAT.ceiling);
    mesh.position.set(x, height, z); mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function addWall(parent, x, z, w, d, h = 3.2, material = MAT.wall) { return addBox(parent, x, h / 2, z, w, h, d, material); }
  function addDoorFrame(parent, { x, z, width = 1.45, height = 2.12, material = MAT.wood }) {
    for (const part of layout.createDoorFrameLayout({ x, z, width, height })) addBox(parent, part.x, part.y, part.z, part.w, part.h, part.d, material);
  }
  function resolveGroundHeight(x, z, currentFeetY) {
    return planApi.walkHeightAt(plan.surfaces, x, z, currentFeetY, CONFIG.groundSnap, dynamicHeights);
  }
  function colliderAllowed(collider) {
    if (!collider.enabledProvider()) return false;
    let current = collider.obj;
    while (current) { if (current.visible === false) return false; current = current.parent; }
    return true;
  }
  function colliderData() {
    // Doors move rarely, so the swung/slid records are only recomputed when one actually changed.
    if (openingsDirty) {
      resolved.length = staticCount;
      for (const door of plan.swingDoors) {
        const angle = openings[door.id] || 0;
        if (door.hideWhenOpen && Math.abs(angle) >= 1.25) continue;
        resolved.push(planApi.hingedBounds(door, angle));
      }
      for (const door of plan.slidingDoors) {
        const amount = openings[door.id] || 0;
        if (amount >= 0.62) continue;
        resolved.push(planApi.slidingBounds(door, amount));
      }
      openingsDirty = false;
      doorCount = resolved.length;
    }
    resolved.length = doorCount;
    for (const collider of collections.colliders) {
      if (!colliderAllowed(collider)) continue;
      resolved.push(collider.dataProvider());
    }
    return resolved;
  }
  function collidesAt(x, z, feetY, bodyHeight = CONFIG.bodyHeight, radius = CONFIG.playerRadius) {
    return logic.collidesAt(colliderData(), { x, z, feetY, bodyHeight, radius });
  }
  // The two questions a moving body has, and the one a watching one has. The rules that consume
  // them live in movement-logic.js and collision-logic.js; this is only the built hotel answering.
  // `groundAt` returning null ("nothing to stand on") is a different answer from `blocked` — one is
  // a ledge and only the other is worth sliding along.
  const space = {
    groundAt: (x, z, fromY) => resolveGroundHeight(x, z, fromY),
    blocked: (x, z, feetY, bodyHeight = CONFIG.bodyHeight, radius = CONFIG.playerRadius) => collidesAt(x, z, feetY, bodyHeight, radius),
  };
  function sightBlocked(from, to, options) { return logic.segmentBlocked(colliderData(), from, to, options); }
  function addSign(parent, text, x, y, z, rotationY = 0, width = 1.3, height = 0.65) {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4c3523'; ctx.fillRect(0, 0, 512, 256); ctx.strokeStyle = '#c6a869'; ctx.lineWidth = 12; ctx.strokeRect(12, 12, 488, 232);
    ctx.fillStyle = '#f2e5c5'; ctx.font = 'bold 100px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 134);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.85 }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotationY; parent.add(mesh); return mesh;
  }
  function addNumberPlate(parent, text, x, y, z, rotationY = 0, size = 0.22) {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1d1d1d'; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = '#b99b54'; ctx.lineWidth = 8; ctx.strokeRect(5, 5, 118, 118);
    ctx.fillStyle = '#f0e2b5'; ctx.font = 'bold 72px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 68);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), roughness: 0.65 }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotationY; parent.add(mesh); return mesh;
  }

  return {
    state, collections, stairwellGroup, promptEl, floorBadge, elevatorBadge, emit, notify, updateInventoryHud, addInventoryKey, getFloorId,
    setPlan, setOpening, setDynamicHeight, getPlan: () => plan,
    registerBoxCollider, colliderData, addBox, addFloor, addCeiling, addWall, addDoorFrame,
    resolveGroundHeight, collidesAt, space, sightBlocked, addSign, addNumberPlate,
  };
}
