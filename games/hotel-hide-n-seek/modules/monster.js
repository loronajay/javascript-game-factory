export function createMonster({ THREE, GLTFLoader, scene, camera, config: CONFIG, floorY, world, player, logic, document, window }) {
  const { ENEMY_STATES } = logic;
  const root = new THREE.Group();
  root.name = 'The Guest';
  scene.add(root);
  const facing = new THREE.Vector3(0, 0, 1);
  const raycaster = new THREE.Raycaster();
  const blockerBox = new THREE.Box3(); const blockerHit = new THREE.Vector3();
  const minimap = document.getElementById('miniMap');
  const enemyDot = document.getElementById('enemyDot');
  const playerDot = document.getElementById('playerDot');
  const monsterStatus = document.getElementById('monsterStatus');
  const caughtOverlay = document.getElementById('caughtOverlay');
  const mapBounds = { minX: -10, maxX: 10, minZ: -60, maxZ: 60 };
  const patrolZ = [-52, -34, -18, 0, 18, 34, 49];
  let awareness = logic.createAwareness();
  let route = [];
  let routePurpose = 'roam';
  let mixer = null;
  let activeAction = null;
  let idleAction = null;
  let walkAction = null;
  let fallback = createFallbackDemon();
  let moving = false;
  let detectionCooldown = 0;
  let previousState = awareness.state;
  const inspectionMode = new URLSearchParams(window.location.search).get('inspect') === 'monster';

  function material(color, emissive = 0x000000) {
    return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: emissive ? 0.8 : 0, roughness: 0.88, metalness: 0.04 });
  }

  function createHorn(height = 0.52) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.085, height, 9), material(0x11070a, 0x210006));
    horn.castShadow = true;
    return horn;
  }

  function createFallbackDemon() {
    const demon = new THREE.Group();
    const flesh = material(0x100a0c, 0x120003);
    const bone = material(0x211216, 0x1d0004);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 1.42, 10), flesh); torso.position.y = 1.45; torso.scale.z = 0.56; demon.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 10), flesh); head.position.set(0, 2.25, 0.04); head.scale.set(0.68, 1.18, 0.72); demon.add(head);
    for (const side of [-1, 1]) {
      const horn = createHorn(0.58); horn.position.set(side * 0.14, 2.6, 0); horn.rotation.z = side * -0.38; demon.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff160d })); eye.position.set(side * 0.065, 2.3, 0.195); demon.add(eye);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.34, 7), flesh); arm.position.set(side * 0.31, 1.38, 0); arm.rotation.z = side * -0.12; demon.add(arm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.085, 1.18, 7), bone); leg.position.set(side * 0.12, 0.62, 0); demon.add(leg);
      for (let claw = -1; claw <= 1; claw += 1) { const talon = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.22, 6), bone); talon.position.set(side * 0.31 + claw * 0.035, 0.62, 0.08); talon.rotation.x = Math.PI; demon.add(talon); }
    }
    const jaw = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), flesh); jaw.position.set(0, 2.02, 0.09); jaw.rotation.x = Math.PI; demon.add(jaw);
    demon.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    root.add(demon);
    const aura = new THREE.PointLight(0x8b0000, 0.65, 4.5, 2); aura.position.set(0, 1.7, 0); root.add(aura);
    return demon;
  }

  function addModelDetails(model) {
    const details = new THREE.Group(); details.position.set(0, 2.17, 0.055);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), material(0x4a3332, 0x240002)); mask.scale.set(0.6, 1.22, 0.55); mask.position.set(0, 0, 0.09); details.add(mask);
    for (const side of [-1, 1]) {
      const horn = createHorn(0.34); horn.position.set(side * 0.105, 0.16, 0); horn.rotation.z = side * -0.52; details.add(horn);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff160a })); eye.position.set(side * 0.052, 0.025, 0.175); details.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.018, 0.018), new THREE.MeshBasicMaterial({ color: 0x240000 })); mouth.position.set(0, -0.105, 0.174); details.add(mouth);
    for (const side of [-1, 1]) for (let i = 0; i < 2; i += 1) { const spine = createHorn(0.3 + i * 0.08); spine.position.set(side * (0.2 + i * 0.035), -0.48 - i * 0.34, -0.04); spine.rotation.z = side * (1.12 - i * 0.08); details.add(spine); }
    model.add(details);
  }

  function loadAnimatedBody() {
    if (!GLTFLoader) return;
    const loader = new GLTFLoader();
    loader.load('assets/UAL2_Standard.glb', (gltf) => {
      const model = gltf.scene;
      model.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true; object.receiveShadow = true;
        object.material = material(0x16090b, 0x340005);
        if (object.material.skinning !== undefined) object.material.skinning = true;
      });
      const initial = new THREE.Box3().setFromObject(model); const size = initial.getSize(new THREE.Vector3()); const scale = 2.52 / size.y;
      model.scale.set(scale * 0.67, scale, scale * 0.72); model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model); const center = bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      root.remove(fallback); fallback = null; root.add(model); addModelDetails(root);
      mixer = new THREE.AnimationMixer(model);
      const idleClip = gltf.animations.find((clip) => clip.name === 'Zombie_Idle_Loop');
      const walkClip = gltf.animations.find((clip) => clip.name === 'Zombie_Walk_Fwd_Loop');
      if (idleClip) idleAction = mixer.clipAction(idleClip);
      if (walkClip) walkAction = mixer.clipAction(walkClip);
      setAnimation(idleAction, 1);
    }, undefined, (error) => console.warn('The Guest model could not load; using its shadow-form.', error));
  }

  function setAnimation(action, speed) {
    if (!action) return;
    action.timeScale = speed;
    if (activeAction === action) return;
    action.reset().fadeIn(0.22).play();
    if (activeAction) activeAction.fadeOut(0.22);
    activeAction = action;
  }

  function nearestFloor(y = root.position.y) {
    return Math.max(1, Math.min(4, Math.round(y / CONFIG.floorHeight) + 1));
  }

  function floorPoint(floor, x, z, guided = false) {
    return { x, y: floorY(floor), z, floor, guided };
  }

  function stairsBetween(fromFloor, toFloor) {
    const points = [];
    let floor = fromFloor;
    while (floor !== toFloor) {
      const y = floorY(floor);
      const up = toFloor > floor;
      points.push(floorPoint(floor, 0, 42.8), floorPoint(floor, 5.35, 44.15, true));
      if (up) {
        points.push({ x: 5.65, y, z: 44.7, guided: true }, { x: 5.65, y: y + CONFIG.floorHeight / 2, z: 51.8, guided: true }, { x: 7.85, y: y + CONFIG.floorHeight / 2, z: 51.8, guided: true }, { x: 7.85, y: y + CONFIG.floorHeight, z: 44.7, guided: true });
        floor += 1;
      } else {
        points.push({ x: 7.85, y, z: 44.7, guided: true }, { x: 7.85, y: y - CONFIG.floorHeight / 2, z: 51.8, guided: true }, { x: 5.65, y: y - CONFIG.floorHeight / 2, z: 51.8, guided: true }, { x: 5.65, y: y - CONFIG.floorHeight, z: 44.7, guided: true });
        floor -= 1;
      }
      points.push(floorPoint(floor, 5.35, 44.15, true), floorPoint(floor, 0, 42.8));
    }
    return points;
  }

  function planRoute(target, purpose = 'roam') {
    const fromFloor = nearestFloor();
    const toFloor = target.floor || Math.max(1, Math.min(4, Math.round(target.y / CONFIG.floorHeight) + 1));
    route = fromFloor === toFloor ? [] : stairsBetween(fromFloor, toFloor);
    if (Math.abs(target.x) > 4.25) route.push(floorPoint(toFloor, 0, target.z), floorPoint(toFloor, Math.sign(target.x) * 3.75, target.z));
    route.push({ x: target.x, y: floorY(toFloor), z: target.z, floor: toFloor, guided: false });
    routePurpose = purpose;
  }

  function choosePatrol() {
    const targetFloor = 1 + Math.floor(Math.random() * 4);
    const z = patrolZ[Math.floor(Math.random() * patrolZ.length)];
    planRoute(floorPoint(targetFloor, z < -42 || z > 42 ? (Math.random() - 0.5) * 8 : 0, z), 'roam');
  }

  function tryMove(target, speed, delta) {
    const dx = target.x - root.position.x; const dy = target.y - root.position.y; const dz = target.z - root.position.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 0.18) { root.position.set(target.x, target.y, target.z); route.shift(); moving = false; return; }
    const amount = Math.min(distance, speed * delta); const direction = new THREE.Vector3(dx, dy, dz).normalize();
    const next = root.position.clone().addScaledVector(direction, amount);
    let moved = false;
    if (target.guided) { root.position.copy(next); moved = true; }
    else {
      const ground = world.resolveGroundHeight(next.x, next.z, root.position.y);
      if (ground !== null && !world.collidesAt(next.x, next.z, ground, 2.25, 0.32)) { root.position.set(next.x, ground, next.z); moved = true; }
      else {
        for (const side of [-1, 1]) {
          const sideX = root.position.x + direction.z * side * amount; const sideZ = root.position.z - direction.x * side * amount;
          const sideGround = world.resolveGroundHeight(sideX, sideZ, root.position.y);
          if (sideGround !== null && !world.collidesAt(sideX, sideZ, sideGround, 2.25, 0.32)) { root.position.set(sideX, sideGround, sideZ); moved = true; break; }
        }
      }
    }
    if (moved && Math.hypot(direction.x, direction.z) > 0.01) {
      const turn = Math.min(1, delta * 7); facing.x += (direction.x - facing.x) * turn; facing.z += (direction.z - facing.z) * turn; facing.normalize(); root.rotation.y = Math.atan2(facing.x, facing.z); moving = true;
    } else moving = false;
  }

  function rayIsBlocked() {
    const origin = root.position.clone(); origin.y += 2.05;
    const direction = camera.position.clone().sub(origin); const distance = direction.length(); direction.normalize();
    raycaster.set(origin, direction); raycaster.far = distance;
    for (const collider of world.collections.colliders) {
      if (!collider.enabledProvider()) continue;
      let visible = true; let object = collider.obj;
      while (object) { if (object.visible === false) { visible = false; break; } object = object.parent; }
      if (!visible) continue;
      const box = collider.boxProvider(); blockerBox.min.set(box.minX, box.minY, box.minZ); blockerBox.max.set(box.maxX, box.maxY, box.maxZ);
      const hit = raycaster.ray.intersectBox(blockerBox, blockerHit);
      if (hit && origin.distanceTo(hit) < distance - 0.18) return true;
    }
    return false;
  }

  function seesPlayer() {
    const playerFeetY = camera.position.y - player.getEyeHeight();
    const test = { enemy: { x: root.position.x, y: root.position.y, z: root.position.z, facingX: facing.x, facingZ: facing.z }, player: { x: camera.position.x, y: playerFeetY, z: camera.position.z, crouching: player.isCrouching() }, occluded: false };
    if (!logic.canDetectPlayer(test)) return false;
    return logic.canDetectPlayer({ ...test, occluded: rayIsBlocked() });
  }

  function updateAwareness(delta) {
    detectionCooldown -= delta;
    if (detectionCooldown > 0) return;
    detectionCooldown = 0.085;
    const visible = seesPlayer(); const playerFeetY = camera.position.y - player.getEyeHeight();
    awareness = logic.updateAwareness(awareness, { seesPlayer: visible, delta: 0.085, playerPosition: { x: camera.position.x, y: playerFeetY, z: camera.position.z, floor: world.state.playerFloor || nearestFloor(playerFeetY) } });
    if (awareness.state === ENEMY_STATES.CHASE) planRoute(awareness.lastSeen, 'chase');
    else if (previousState === ENEMY_STATES.CHASE && awareness.state === ENEMY_STATES.SEARCH && awareness.lastSeen) planRoute(awareness.lastSeen, 'search');
    if (awareness.state !== previousState) {
      world.emit('monster-state', { state: awareness.state });
      if (awareness.state === ENEMY_STATES.CHASE) world.notify('IT HAS SEEN YOU.', 1600);
      previousState = awareness.state;
    }
  }

  function updateHud() {
    const enemyMap = logic.projectToMinimap(root.position, mapBounds); const playerMap = logic.projectToMinimap(camera.position, mapBounds);
    enemyDot.style.left = `${enemyMap.left}%`; enemyDot.style.top = `${enemyMap.top}%`; playerDot.style.left = `${playerMap.left}%`; playerDot.style.top = `${playerMap.top}%`;
    const hunting = awareness.state === ENEMY_STATES.CHASE; minimap.classList.toggle('danger', hunting);
    document.body.classList.toggle('monster-chase', hunting); document.body.classList.toggle('monster-search', awareness.state === ENEMY_STATES.SEARCH);
    monsterStatus.textContent = hunting ? 'IT SEES YOU' : awareness.state === ENEMY_STATES.SEARCH ? 'IT IS SEARCHING' : 'THE GUEST IS ROAMING';
    monsterStatus.dataset.state = awareness.state;
  }

  function caught() {
    if (world.state.gameOver) return;
    world.state.gameOver = true; world.state.isLocked = false; caughtOverlay.classList.add('visible'); document.body.classList.add('caught');
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    world.emit('caught', { floor: nearestFloor(), x: root.position.x, z: root.position.z });
  }

  function update(delta) {
    if (world.state.gameOver) { if (mixer) mixer.update(delta * 0.25); return; }
    if (inspectionMode) { if (mixer) { setAnimation(idleAction, 1); mixer.update(delta); } updateHud(); return; }
    updateAwareness(delta);
    if (awareness.state === ENEMY_STATES.ROAM && !route.length) choosePatrol();
    if (awareness.state === ENEMY_STATES.SEARCH && !route.length && awareness.lastSeen) {
      const angle = Math.random() * Math.PI * 2; const radius = 2 + Math.random() * 3;
      planRoute({ ...awareness.lastSeen, x: awareness.lastSeen.x + Math.cos(angle) * radius, z: awareness.lastSeen.z + Math.sin(angle) * radius }, 'search');
    }
    const target = route[0]; const speed = awareness.state === ENEMY_STATES.CHASE ? CONFIG.enemyChaseSpeed : awareness.state === ENEMY_STATES.SEARCH ? CONFIG.enemyWalkSpeed * 1.22 : CONFIG.enemyWalkSpeed;
    if (target) tryMove(target, speed, delta); else moving = false;
    if (mixer) { setAnimation(moving ? walkAction : idleAction, awareness.state === ENEMY_STATES.CHASE ? 1.85 : 1); mixer.update(delta); }
    if (fallback) { const t = window.performance.now() * 0.001; fallback.position.y = Math.sin(t * 3.2) * 0.035; fallback.rotation.z = Math.sin(t * 1.7) * 0.018; }
    const playerFeetY = camera.position.y - player.getEyeHeight();
    if (Math.abs(playerFeetY - root.position.y) < 1.15 && Math.hypot(camera.position.x - root.position.x, camera.position.z - root.position.z) < CONFIG.enemyCatchDistance) caught();
    updateHud();
  }

  const spawns = [];
  for (let floor = 1; floor <= 4; floor += 1) for (const z of [-52, -28, 0, 28, 49]) spawns.push(floorPoint(floor, z < -42 || z > 42 ? 0 : (Math.random() - 0.5) * 3, z));
  const spawn = logic.chooseSpawn(spawns, { x: camera.position.x, z: camera.position.z, floor: world.state.playerFloor }, Math.random, 24);
  root.position.set(spawn.x, spawn.y, spawn.z); if (inspectionMode) root.position.set(0, floorY(1), 24); else choosePatrol(); loadAnimatedBody(); updateHud();
  return { update, root, getState: () => ({ ...awareness, floor: nearestFloor(), position: root.position.clone(), routePurpose }) };
}
