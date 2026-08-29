export function createPlayer({ THREE, camera, renderer, scene, config: CONFIG, floorY, world, elevator, controls, performance, menu, stamina, document, window }) {
  const keys = {};
  const isTouchDevice = window.matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window);
  const forceDragLook = controls.shouldAutoStartDragLook(window.location.search);
  const raycaster = new THREE.Raycaster(); raycaster.far = CONFIG.interactDistance;
  const shouldScanInteractions = performance.createIntervalGate(0.08);
  let currentEyeHeight = CONFIG.eyeHeight;
  let dragLookMode = false; let mouseLookPointerId = null; let mouseLookLastX = 0; let mouseLookLastY = 0;
  let lookTouchId = null; let lookLastX = 0; let lookLastY = 0;

  function applyLookDelta(dx, dy, sensitivity) {
    world.state.yaw -= dx * sensitivity; world.state.pitch -= dy * sensitivity; const max = Math.PI / 2 - 0.05;
    world.state.pitch = Math.max(-max, Math.min(max, world.state.pitch)); camera.rotation.y = world.state.yaw; camera.rotation.x = world.state.pitch;
  }
  // The menu owns what is on screen; the player only reports whether it has the mouse. A lock lost
  // mid-round is a pause, and the state machine decides that — pressing Esc on the caught screen must
  // not stack a pause menu over it.
  function notifyMenu(action) { if (menu) menu.dispatch(action); }
  function enterDragLookMode() { dragLookMode = true; world.state.isLocked = true; }
  function leaveDragLookMode() { dragLookMode = false; mouseLookPointerId = null; world.state.isLocked = false; notifyMenu('pause'); }
  // Called by the menu when the player picks Play or Resume, so the pointer-lock request always rides
  // on a real click gesture.
  function beginPlay() {
    if (isTouchDevice || forceDragLook) { enterDragLookMode(); return; }
    controls.requestPreferredLookMode(document.body.requestPointerLock ? () => document.body.requestPointerLock() : null)
      .then((mode) => { if (mode === 'drag-look') enterDragLookMode(); });
  }
  function interactableAllowed(item) { return (!item.enabled || item.enabled()) && item.object.visible !== false; }
  function updateInteractionTarget() {
    world.state.activeInteractable = null; raycaster.setFromCamera(new THREE.Vector2(0, 0), camera); const hits = raycaster.intersectObjects(scene.children, true);
    if (hits.length) { let object = hits[0].object; while (object) { const found = world.collections.interactables.find((item) => item.object === object && interactableAllowed(item)); if (found) { world.state.activeInteractable = found; break; } object = object.parent; } }
    if (world.state.activeInteractable) { world.promptEl.textContent = `[E] ${world.state.activeInteractable.prompt()}`; world.promptEl.classList.add('visible'); }
    else { world.promptEl.textContent = ''; world.promptEl.classList.remove('visible'); }
  }
  function interact() { if (world.state.activeInteractable) world.state.activeInteractable.action(); }
  function tryMove(dx, dz) {
    let feetY = camera.position.y - currentEyeHeight; const nextX = camera.position.x + dx; let ground = world.resolveGroundHeight(nextX, camera.position.z, feetY);
    if (ground !== null && !world.collidesAt(nextX, camera.position.z, ground)) { camera.position.x = nextX; feetY = ground; camera.position.y = ground + currentEyeHeight; }
    const nextZ = camera.position.z + dz; ground = world.resolveGroundHeight(camera.position.x, nextZ, feetY);
    if (ground !== null && !world.collidesAt(camera.position.x, nextZ, ground)) { camera.position.z = nextZ; camera.position.y = ground + currentEyeHeight; }
  }
  function nearestFloorFromFeet(feetY) {
    let floor = 1; let diff = Infinity; for (let id = 1; id <= 4; id += 1) { const candidate = Math.abs(feetY - floorY(id)); if (candidate < diff) { floor = id; diff = candidate; } }
    return { floor, diff };
  }
  function isInStairwellXZ() { return camera.position.x > 4.65 && camera.position.x < 8.95 && camera.position.z > 42.8 && camera.position.z < 55.6; }
  function refreshLocation() {
    // Lighting culls by vertical proximity while the player is off a floor (stairwell/elevator), so
    // the feet height has to be published, not just the floor id.
    world.state.playerFeetY = camera.position.y - currentEyeHeight;
    if (elevator.elevator.state === 'moving' && elevator.isPlayerInsideXZ()) { world.state.playerFloor = 0; world.floorBadge.textContent = 'Elevator'; return; }
    const near = nearestFloorFromFeet(camera.position.y - currentEyeHeight);
    if (near.diff < 0.38) { world.state.playerFloor = near.floor; world.floorBadge.textContent = `Floor ${near.floor}`; }
    else if (isInStairwellXZ()) { world.state.playerFloor = 0; world.floorBadge.textContent = 'Stairwell'; }
    else { world.state.playerFloor = near.floor; world.floorBadge.textContent = `Floor ${near.floor}`; }
  }
  function setupInput() {
    document.addEventListener('pointerlockerror', () => { if (!isTouchDevice) enterDragLookMode(); });
    document.addEventListener('pointerlockchange', () => { if (isTouchDevice) return; if (document.pointerLockElement === document.body) { dragLookMode = false; world.state.isLocked = true; } else if (!dragLookMode) { world.state.isLocked = false; notifyMenu('pause'); } });
    document.addEventListener('mousemove', (event) => { if (world.state.isLocked && !isTouchDevice && !dragLookMode) applyLookDelta(event.movementX, event.movementY, 0.0022); });
    window.addEventListener('keydown', (event) => { keys[event.code] = true; if (event.code === 'Escape' && dragLookMode) leaveDragLookMode(); if (event.code === 'KeyE' && !event.repeat) interact(); }); window.addEventListener('keyup', (event) => { keys[event.code] = false; });
    for (const [id, code] of Object.entries({ moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD' })) { const button = document.getElementById(id); const press = (event) => { event.preventDefault(); keys[code] = true; }; const release = (event) => { event.preventDefault(); keys[code] = false; }; button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('pointerleave', release); }
    document.getElementById('interactBtn').addEventListener('pointerdown', (event) => { event.preventDefault(); interact(); }); renderer.domElement.style.touchAction = 'none';
    const crouchButton = document.getElementById('crouchBtn');
    if (crouchButton) { const crouchOn = (event) => { event.preventDefault(); keys.KeyC = true; }; const crouchOff = (event) => { event.preventDefault(); keys.KeyC = false; }; crouchButton.addEventListener('pointerdown', crouchOn); crouchButton.addEventListener('pointerup', crouchOff); crouchButton.addEventListener('pointercancel', crouchOff); crouchButton.addEventListener('pointerleave', crouchOff); }
    renderer.domElement.addEventListener('pointerdown', (event) => { if (!world.state.isLocked) return; if (isTouchDevice) { if (event.clientX < window.innerWidth * 0.45) return; lookTouchId = event.pointerId; lookLastX = event.clientX; lookLastY = event.clientY; } else if (dragLookMode) { mouseLookPointerId = event.pointerId; mouseLookLastX = event.clientX; mouseLookLastY = event.clientY; } else return; if (renderer.domElement.setPointerCapture) renderer.domElement.setPointerCapture(event.pointerId); });
    renderer.domElement.addEventListener('pointermove', (event) => { if (isTouchDevice && event.pointerId === lookTouchId) { const dx = event.clientX - lookLastX; const dy = event.clientY - lookLastY; lookLastX = event.clientX; lookLastY = event.clientY; applyLookDelta(dx, dy, 0.004); } else if (!isTouchDevice && dragLookMode && event.pointerId === mouseLookPointerId) { const dx = event.clientX - mouseLookLastX; const dy = event.clientY - mouseLookLastY; mouseLookLastX = event.clientX; mouseLookLastY = event.clientY; applyLookDelta(dx, dy, 0.0032); } });
    const clearLook = (event) => { if (event.pointerId === lookTouchId) lookTouchId = null; if (event.pointerId === mouseLookPointerId) mouseLookPointerId = null; }; renderer.domElement.addEventListener('pointerup', clearLook); renderer.domElement.addEventListener('pointercancel', clearLook);
  }
  function update(delta, elapsed) {
    if (!world.state.isLocked || world.state.gameOver) { world.promptEl.classList.remove('visible'); return; }
    const crouching = !!(keys.KeyC || keys.ControlLeft || keys.ControlRight); world.state.playerCrouching = crouching; const desiredEyeHeight = crouching ? CONFIG.crouchEyeHeight : CONFIG.eyeHeight; const feetY = camera.position.y - currentEyeHeight; currentEyeHeight += Math.sign(desiredEyeHeight - currentEyeHeight) * Math.min(Math.abs(desiredEyeHeight - currentEyeHeight), delta * 4.8); world.state.playerEyeHeight = currentEyeHeight; camera.position.y = feetY + currentEyeHeight;
    // The seeker is held in the closed elevator while the hiders scatter. Looking around is still allowed —
    // the head start is a rule about walking, not a frozen frame.
    const held = !!world.state.seekerHeld;
    const forward = held ? 0 : (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0); const strafe = held ? 0 : (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    // The sprint key is a request, not a speed: the meter decides whether it is honoured, so a spent
    // player drops back to a walk mid-stride instead of running on an empty bar.
    const wantSprint = !!(keys.ShiftLeft || keys.ShiftRight); const moving = !!(forward || strafe);
    const sprinting = stamina ? stamina.update(delta, { wantSprint, moving, crouching }) : wantSprint && moving && !crouching;
    const speed = crouching ? CONFIG.crouchSpeed : sprinting ? CONFIG.sprintSpeed : CONFIG.walkSpeed; const step = speed * delta;
    if (forward || strafe) { const direction = new THREE.Vector3(); camera.getWorldDirection(direction); direction.y = 0; direction.normalize(); const right = new THREE.Vector3(-direction.z, 0, direction.x); const move = new THREE.Vector3().addScaledVector(direction, forward * step).addScaledVector(right, strafe * step); if (move.lengthSq() > step * step) move.setLength(step); tryMove(move.x, move.z); }
    if (elevator.elevator.state !== 'moving' && elevator.isPlayerInsideXZ() && Math.abs((camera.position.y - currentEyeHeight) - elevator.elevator.car.position.y) < 0.72) camera.position.y = elevator.elevator.car.position.y + currentEyeHeight;
    refreshLocation(); if (shouldScanInteractions(elapsed)) updateInteractionTarget();
  }
  setupInput(); refreshLocation();
  return { update, beginPlay, refreshLocation, interact, isCrouching: () => !!(keys.KeyC || keys.ControlLeft || keys.ControlRight), getEyeHeight: () => currentEyeHeight };
}
