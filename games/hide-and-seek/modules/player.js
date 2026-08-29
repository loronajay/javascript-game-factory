export function createPlayer({ THREE, camera, renderer, scene, config: CONFIG, floorY, world, elevator, controls, movement, flashlight: flashlightLogic, flashlightConfig, performance, menu, stamina, document, window }) {
  const BODY = { height: CONFIG.bodyHeight, radius: CONFIG.playerRadius };
  const keys = {};
  const isTouchDevice = window.matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window);
  const forceDragLook = controls.shouldAutoStartDragLook(window.location.search);
  const raycaster = new THREE.Raycaster(); raycaster.far = CONFIG.interactDistance;
  const shouldScanInteractions = performance.createIntervalGate(0.08);
  let currentEyeHeight = CONFIG.eyeHeight;
  let flashlightState = flashlightLogic.createFlashlightState();
  let dragLookMode = false; let mouseLookPointerId = null; let mouseLookLastX = 0; let mouseLookLastY = 0;
  let lookTouchId = null; let lookLastX = 0; let lookLastY = 0;
  const flashlightStatus = document.getElementById('flashlightStatus');
  // The beam is switched with `intensity`, never with `visible`. Hiding it takes it out of three's
  // light state, `numSpotLights` is part of every material's shader program cache key, and so the F
  // key would otherwise recompile the entire hotel — on the most-pressed key in the game.
  const BEAM_INTENSITY = 5.4;
  const flashlightBeam = new THREE.SpotLight(0xffedc2, 0, 31, Math.PI / 7, 0.58, 1.35);
  flashlightBeam.name = 'Local Player Flashlight'; flashlightBeam.position.set(0.12, -0.12, -0.08);
  flashlightBeam.target.position.set(0, -0.08, -5);
  camera.add(flashlightBeam, flashlightBeam.target);
  if (!camera.parent) scene.add(camera);

  function paintFlashlight() {
    flashlightBeam.intensity = flashlightState.on ? BEAM_INTENSITY : 0;
    const percent = Math.ceil(flashlightState.charge * 100);
    if (flashlightStatus) { flashlightStatus.dataset.on = String(flashlightState.on); flashlightStatus.dataset.charge = String(percent); flashlightStatus.textContent = `FLASHLIGHT ${flashlightState.on ? 'ON' : flashlightState.charge > 0 ? 'OFF' : 'EMPTY'} · ${percent}% · F`; }
    const button = document.getElementById('flashlightBtn');
    if (button) { button.dataset.on = String(flashlightState.on); button.textContent = flashlightState.on ? 'LIGHT ON' : 'LIGHT'; }
  }
  // The battery is server-authoritative online — a client that reports its own charge is the same
  // class of cheat as one that reports it wasn't caught — so the snapshot's value is applied over
  // whatever the local prediction drained.
  function applyRemoteFlashlight(view) {
    if (!view) return;
    const changed = flashlightState.on !== view.on || Math.ceil(flashlightState.charge * 100) !== Math.ceil(view.charge * 100);
    flashlightState = flashlightLogic.createFlashlightState(view.on, view.charge);
    if (changed) paintFlashlight();
  }

  function setFlashlight(on) {
    const previousOn = flashlightState.on;
    flashlightState = flashlightLogic.setFlashlight(flashlightState, on);
    const changed = previousOn !== flashlightState.on;
    paintFlashlight();
    if (changed) world.emit('flashlight-change', { playerId: 'local', flashlightOn: flashlightState.on, flashlightCharge: flashlightState.charge });
    return flashlightState.on;
  }
  function toggleFlashlight() { return setFlashlight(!flashlightState.on); }
  function addFlashlightCharge(charge) {
    const before = flashlightState.charge;
    flashlightState = flashlightLogic.addFlashlightCharge(flashlightState, charge);
    const added = flashlightState.charge - before;
    if (added > 0) {
      paintFlashlight();
      world.emit('flashlight-charge', { playerId: 'local', added, flashlightCharge: flashlightState.charge });
      world.notify(`FLASHLIGHT CHARGE: ${Math.ceil(flashlightState.charge * 100)}%`, 1800);
    }
    return added;
  }

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
  // Online a press is a *request*: it goes out on the input and the server decides what it opened,
  // whether the drawer still had the key in it, and whether the door was locked. Running the local
  // action too would give this client a hotel that briefly disagrees with everyone else's.
  function interact() {
    if (world.state.remoteFixtures) return;
    if (world.state.activeInteractable) world.state.activeInteractable.action();
  }
  // The local player is not a special kind of body: it walks through the same pure mover the demons
  // and the hiders use, so a server ticking a remote player can never disagree with this client.
  function tryMove(dx, dz) {
    const feetY = camera.position.y - currentEyeHeight;
    const step = movement.stepAxes(world.space, BODY, { x: camera.position.x, y: feetY, z: camera.position.z }, dx, dz);
    if (!step.moved) return;
    camera.position.set(step.x, step.y + currentEyeHeight, step.z);
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
    window.addEventListener('keydown', (event) => { keys[event.code] = true; if (event.code === 'Escape' && dragLookMode) leaveDragLookMode(); if (event.code === 'KeyE' && !event.repeat) interact(); if (event.code === 'KeyF' && !event.repeat && world.state.isLocked && !world.state.gameOver) toggleFlashlight(); }); window.addEventListener('keyup', (event) => { keys[event.code] = false; });
    for (const [id, code] of Object.entries({ moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD' })) { const button = document.getElementById(id); const press = (event) => { event.preventDefault(); keys[code] = true; }; const release = (event) => { event.preventDefault(); keys[code] = false; }; button.addEventListener('pointerdown', press); button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('pointerleave', release); }
    const interactButton = document.getElementById('interactBtn');
    // The button holds the key down for a beat rather than firing once: online the authority reads a
    // rising edge off the input stream, and a flag that is never true in a sent frame is never seen.
    interactButton.addEventListener('pointerdown', (event) => { event.preventDefault(); keys.KeyE = true; interact(); });
    for (const release of ['pointerup', 'pointercancel', 'pointerleave']) interactButton.addEventListener(release, () => { keys.KeyE = false; }); renderer.domElement.style.touchAction = 'none';
    const crouchButton = document.getElementById('crouchBtn');
    if (crouchButton) { const crouchOn = (event) => { event.preventDefault(); keys.KeyC = true; }; const crouchOff = (event) => { event.preventDefault(); keys.KeyC = false; }; crouchButton.addEventListener('pointerdown', crouchOn); crouchButton.addEventListener('pointerup', crouchOff); crouchButton.addEventListener('pointercancel', crouchOff); crouchButton.addEventListener('pointerleave', crouchOff); }
    const flashlightButton = document.getElementById('flashlightBtn');
    if (flashlightButton) flashlightButton.addEventListener('pointerdown', (event) => { event.preventDefault(); if (world.state.isLocked && !world.state.gameOver) toggleFlashlight(); });
    renderer.domElement.addEventListener('pointerdown', (event) => { if (!world.state.isLocked) return; if (isTouchDevice) { if (event.clientX < window.innerWidth * 0.45) return; lookTouchId = event.pointerId; lookLastX = event.clientX; lookLastY = event.clientY; } else if (dragLookMode) { mouseLookPointerId = event.pointerId; mouseLookLastX = event.clientX; mouseLookLastY = event.clientY; } else return; if (renderer.domElement.setPointerCapture) renderer.domElement.setPointerCapture(event.pointerId); });
    renderer.domElement.addEventListener('pointermove', (event) => { if (isTouchDevice && event.pointerId === lookTouchId) { const dx = event.clientX - lookLastX; const dy = event.clientY - lookLastY; lookLastX = event.clientX; lookLastY = event.clientY; applyLookDelta(dx, dy, 0.004); } else if (!isTouchDevice && dragLookMode && event.pointerId === mouseLookPointerId) { const dx = event.clientX - mouseLookLastX; const dy = event.clientY - mouseLookLastY; mouseLookLastX = event.clientX; mouseLookLastY = event.clientY; applyLookDelta(dx, dy, 0.0032); } });
    const clearLook = (event) => { if (event.pointerId === lookTouchId) lookTouchId = null; if (event.pointerId === mouseLookPointerId) mouseLookPointerId = null; }; renderer.domElement.addEventListener('pointerup', clearLook); renderer.domElement.addEventListener('pointercancel', clearLook);
  }
  function update(delta, elapsed) {
    if (!world.state.isLocked || world.state.gameOver) { world.promptEl.classList.remove('visible'); return; }
    const previousFlashlight = flashlightState;
    flashlightState = flashlightLogic.tickFlashlight(flashlightState, delta, flashlightConfig);
    if (Math.ceil(previousFlashlight.charge * 100) !== Math.ceil(flashlightState.charge * 100) || previousFlashlight.on !== flashlightState.on) paintFlashlight();
    if (previousFlashlight.on && !flashlightState.on) {
      world.emit('flashlight-change', { playerId: 'local', flashlightOn: false, flashlightCharge: 0 });
      world.notify('YOUR FLASHLIGHT IS OUT.', 2200);
    }
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
  setupInput(); refreshLocation(); paintFlashlight();
  return {
    update, beginPlay, refreshLocation, interact, setFlashlight, toggleFlashlight, addFlashlightCharge, applyRemoteFlashlight,
    isCrouching: () => !!(keys.KeyC || keys.ControlLeft || keys.ControlRight),
    // What the player is trying to do, which is the only thing an online round sends. The answer to
    // whether any of it happened comes back from the server.
    getInput: () => ({
      forward: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0),
      strafe: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
      yaw: world.state.yaw,
      crouch: !!(keys.KeyC || keys.ControlLeft || keys.ControlRight),
      sprint: !!(keys.ShiftLeft || keys.ShiftRight),
      light: flashlightState.on,
      interact: !!keys.KeyE,
    }),
    getEyeHeight: () => currentEyeHeight,
    getState: () => ({ crouching: !!world.state.playerCrouching, eyeHeight: currentEyeHeight, flashlightOn: flashlightState.on, flashlightCharge: flashlightState.charge }),
  };
}
