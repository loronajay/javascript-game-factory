export function createWorld({ THREE, scene, materials: MAT, config: CONFIG, layout, document, window }) {
  const state = { isLocked: false, yaw: 0, pitch: 0, playerFloor: 1, inventory: new Set(), activeInteractable: null, notificationTimer: null };
  const collections = {
    colliders: [], interactables: [], dynamicDoors: [], dynamicDrawers: [], walkSurfaces: [],
    floorGroups: new Map(), floorLights: new Map(), roomDoors: new Map(), secretPanels: new Map(),
    hallElevatorDoors: new Map(), roomCenters: new Map(),
  };
  const stairwellGroup = new THREE.Group();
  stairwellGroup.name = 'Continuous Stairwell';
  scene.add(stairwellGroup);

  const notificationEl = document.getElementById('notification');
  const keyListEl = document.getElementById('keyList');
  const floorBadge = document.getElementById('floorBadge');
  const elevatorBadge = document.getElementById('elevatorBadge');
  const promptEl = document.getElementById('interactionPrompt');

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
  function registerCollider(obj, boxProvider, enabledProvider = () => true) { collections.colliders.push({ obj, boxProvider, enabledProvider }); }
  function aabbFromObject(obj) {
    obj.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(obj);
    return { minX: box.min.x, maxX: box.max.x, minY: box.min.y, maxY: box.max.y, minZ: box.min.z, maxZ: box.max.z };
  }
  function addBox(parent, x, y, z, w, h, d, material, collider = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
    if (collider) {
      let cachedBox = null;
      registerCollider(mesh, () => { if (!cachedBox) cachedBox = aabbFromObject(mesh); return cachedBox; });
    }
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
  function addWall(parent, x, z, w, d, h = 3.2, material = MAT.wall) { return addBox(parent, x, h / 2, z, w, h, d, material, true); }
  function addDoorFrame(parent, { x, z, width = 1.45, height = 2.12, material = MAT.wood }) {
    for (const part of layout.createDoorFrameLayout({ x, z, width, height })) addBox(parent, part.x, part.y, part.z, part.w, part.h, part.d, material);
  }
  function registerGroundRect(parent, x, z, w, d, localY = 0, priority = 0) {
    collections.walkSurfaces.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, heightAt: () => parent.position.y + localY, enabled: () => parent.visible !== false, priority });
  }
  function registerGroundWorld(minX, maxX, minZ, maxZ, heightAt, enabled = () => true, priority = 0) { collections.walkSurfaces.push({ minX, maxX, minZ, maxZ, heightAt, enabled, priority }); }
  function resolveGroundHeight(x, z, currentFeetY) {
    return layout.resolveWalkSurfaceHeight(collections.walkSurfaces, x, z, currentFeetY, CONFIG.groundSnap);
  }
  function colliderAllowed(collider) {
    if (!collider.enabledProvider()) return false;
    let current = collider.obj;
    while (current) { if (current.visible === false) return false; current = current.parent; }
    return true;
  }
  function collidesAt(x, z, feetY) {
    const playerMinY = feetY + 0.06; const playerMaxY = feetY + CONFIG.bodyHeight;
    for (const collider of collections.colliders) {
      if (!colliderAllowed(collider)) continue;
      const box = collider.boxProvider();
      if (playerMaxY <= box.minY + 0.015 || playerMinY >= box.maxY - 0.015) continue;
      if (x > box.minX - CONFIG.playerRadius && x < box.maxX + CONFIG.playerRadius && z > box.minZ - CONFIG.playerRadius && z < box.maxZ + CONFIG.playerRadius) return true;
    }
    return false;
  }
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
    registerCollider, aabbFromObject, addBox, addFloor, addCeiling, addWall, addDoorFrame, registerGroundRect, registerGroundWorld,
    resolveGroundHeight, collidesAt, addSign, addNumberPlate,
  };
}
