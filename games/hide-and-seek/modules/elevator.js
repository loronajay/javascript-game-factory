export function createElevator({ THREE, scene, camera, materials: MAT, config: CONFIG, floorY, world, performance, document, window }) {
  const { collections } = world;
  const elevator = {
    car: new THREE.Group(), currentFloor: 1, targetFloor: 1, state: 'open', doorAmount: 1,
    passengerTrip: false, pendingCall: null, indicatorCanvas: null, indicatorTexture: null,
    cabinLeftDoor: null, cabinRightDoor: null,
    roundHeld: false,
  };
  const indicatorChanged = performance.createChangeTracker();
  // Where the shaft is belongs to the building, and the building is not built yet: this module is
  // composed before `hotel.build()` because the hotel needs it. So the plan is read on demand, and
  // `build()` is where the car is first placed.
  const shaftOf = () => world.getPlan().elevator;
  let shaft = null;
  let facing = -1;
  scene.add(elevator.car);

  function isPlayerInsideXZ() {
    if (!shaft) return false;
    const offset = (camera.position.z - shaft.centerZ) * facing;
    return Math.abs(camera.position.x - shaft.centerX) < 1.12
      && offset > -1.46 && offset < Math.abs(shaft.frontZ - shaft.centerZ) + 0.12;
  }
  function playerEyeHeight() { return world.state.playerEyeHeight || CONFIG.eyeHeight; }
  function isPlayerInside() { return isPlayerInsideXZ() && Math.abs(camera.position.y - (elevator.car.position.y + playerEyeHeight())) < 0.7; }

  function updateIndicator(force = false) {
    let text = String(elevator.currentFloor);
    if (elevator.state === 'moving') text = `${elevator.targetFloor > elevator.currentFloor ? '↑' : '↓'} ${elevator.targetFloor}`;
    if (!force && !indicatorChanged(text)) return;
    indicatorChanged(text);
    const context = elevator.indicatorCanvas.getContext('2d');
    context.fillStyle = '#080a08'; context.fillRect(0, 0, elevator.indicatorCanvas.width, elevator.indicatorCanvas.height);
    context.strokeStyle = '#6a5b35'; context.lineWidth = 5; context.strokeRect(5, 5, elevator.indicatorCanvas.width - 10, elevator.indicatorCanvas.height - 10);
    context.fillStyle = '#e9c96d'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.font = 'bold 62px monospace';
    context.fillText(text, elevator.indicatorCanvas.width / 2, elevator.indicatorCanvas.height / 2 + 3); elevator.indicatorTexture.needsUpdate = true;
  }
  function setHallDoorAmount(floorId, amount) {
    const doors = collections.hallElevatorDoors.get(floorId); if (!doors) return; doors.amount = amount;
    const x = 0.46 + (1.72 - 0.46) * amount; doors.left.position.x = -x; doors.right.position.x = x;
    // The plan owns these colliders; the cabin only reports how far apart the leaves are.
    for (const id of doors.planIds) world.setOpening(id, amount);
  }
  function setCabinDoorAmount(amount) {
    elevator.doorAmount = amount; const x = 0.46 + (1.72 - 0.46) * amount;
    elevator.cabinLeftDoor.position.x = -x; elevator.cabinRightDoor.position.x = x;
  }
  function syncDoors(amount) {
    setCabinDoorAmount(amount);
    for (const id of collections.hallElevatorDoors.keys()) setHallDoorAmount(id, id === elevator.currentFloor ? amount : 0);
  }
  function call(floorId) {
    if (elevator.roundHeld) { world.notify('The elevator is locked until hiding time is over.'); return; }
    if (elevator.state === 'moving' || elevator.state === 'closing') { elevator.pendingCall = floorId; world.notify('Elevator is currently moving. Call registered.'); return; }
    if (elevator.currentFloor === floorId) { elevator.targetFloor = floorId; elevator.state = 'opening'; return; }
    elevator.targetFloor = floorId; elevator.passengerTrip = false; elevator.state = 'closing'; world.notify('Elevator called.'); world.emit('elevator-called', { floor: floorId });
  }
  function requestFloor(floorId) {
    if (elevator.roundHeld) return;
    if (!isPlayerInside()) { world.notify('Step inside the elevator first.'); return; }
    if (elevator.state === 'moving' || elevator.state === 'closing') return;
    if (floorId === elevator.currentFloor) { elevator.state = 'opening'; return; }
    elevator.targetFloor = floorId; elevator.passengerTrip = true; elevator.state = 'closing'; world.notify(`Floor ${floorId} selected.`);
  }
  function build() {
    shaft = shaftOf();
    facing = shaft.frontZ > shaft.centerZ ? 1 : -1;
    elevator.car.position.set(shaft.centerX, floorY(1), shaft.centerZ);
    const group = elevator.car; const cabinWidth = 2.5; const cabinDepth = 3.2; const cabinHeight = 2.65;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(cabinWidth, 0.18, cabinDepth), new THREE.MeshStandardMaterial({ color: 0x4e4b45, metalness: 0.12, roughness: 0.75 })); floor.position.y = -0.09; floor.receiveShadow = true; group.add(floor);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(cabinWidth, 0.12, cabinDepth), MAT.elevatorInterior); ceiling.position.y = cabinHeight; group.add(ceiling);
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.12, cabinHeight, cabinDepth), MAT.elevatorInterior); leftWall.position.set(-cabinWidth / 2, cabinHeight / 2, 0); group.add(leftWall); world.registerBoxCollider(leftWall, { width: 0.12, height: cabinHeight, depth: cabinDepth }, () => true, true);
    const rightWall = leftWall.clone(); rightWall.position.x = cabinWidth / 2; group.add(rightWall); world.registerBoxCollider(rightWall, { width: 0.12, height: cabinHeight, depth: cabinDepth }, () => true, true);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(cabinWidth, cabinHeight, 0.12), MAT.elevatorInterior); backWall.position.set(0, cabinHeight / 2, -facing * cabinDepth / 2); group.add(backWall); world.registerBoxCollider(backWall, { width: cabinWidth, height: cabinHeight, depth: 0.12 }, () => true, true);
    const trimL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.14), MAT.brass); trimL.position.set(-1.08, 1.25, facing * 1.57); group.add(trimL); const trimR = trimL.clone(); trimR.position.x = 1.08; group.add(trimR);
    const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.35, 0.08), MAT.metal); leftDoor.position.set(-0.46, 1.175, facing * 1.58); group.add(leftDoor);
    const rightDoor = leftDoor.clone(); rightDoor.position.x = 0.46; group.add(rightDoor); elevator.cabinLeftDoor = leftDoor; elevator.cabinRightDoor = rightDoor;
    world.registerBoxCollider(leftDoor, { width: 0.92, height: 2.35, depth: 0.08 }, () => elevator.doorAmount < 0.62, true); world.registerBoxCollider(rightDoor, { width: 0.92, height: 2.35, depth: 0.08 }, () => elevator.doorAmount < 0.62, true);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.65, 0.62), MAT.dark); panel.position.set(1.16, 1.28, -facing * 0.25); group.add(panel);
    for (let floorId = 1; floorId <= world.state.floorCount; floorId += 1) {
      const buttonGroup = new THREE.Group(); buttonGroup.position.set(1.105, 0.72 + (floorId - 1) * 0.35, -facing * 0.25); group.add(buttonGroup);
      buttonGroup.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.23, 0.23), MAT.brass)); world.addNumberPlate(buttonGroup, String(floorId), -0.038, 0, 0, -Math.PI / 2, 0.17);
      collections.interactables.push({ object: buttonGroup, fixtureId: `elevator-button-${floorId}`, enabled: () => !elevator.roundHeld && isPlayerInside() && elevator.state !== 'moving' && elevator.state !== 'closing', prompt: () => `Elevator button — Floor ${floorId}`, action: () => requestFloor(floorId) });
    }
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128; elevator.indicatorCanvas = canvas; elevator.indicatorTexture = new THREE.CanvasTexture(canvas);
    const indicator = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.32), new THREE.MeshBasicMaterial({ map: elevator.indicatorTexture })); indicator.position.set(0, 2.27, facing * 1.53); indicator.rotation.y = facing > 0 ? Math.PI : 0; group.add(indicator);
    const light = new THREE.PointLight(0xfff2d4, 0.82, 5, 2); light.position.set(0, 2.35, 0); group.add(light);
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.48), new THREE.MeshStandardMaterial({ color: 0xf2ead1, emissive: 0x77682f, emissiveIntensity: 0.28 })); fixture.position.set(0, 2.55, 0); group.add(fixture);
    // The cabin floor is the one walk surface whose height is state rather than layout.
    world.setDynamicHeight('elevator-car', elevator.car.position.y);
    syncDoors(1); updateIndicator(true);
  }
  function holdSeeker({ moveCamera = true } = {}) {
    elevator.roundHeld = true;
    elevator.currentFloor = 1;
    elevator.targetFloor = 1;
    elevator.state = 'round-hold';
    elevator.passengerTrip = false;
    elevator.pendingCall = null;
    elevator.car.position.y = floorY(1);
    world.setDynamicHeight('elevator-car', elevator.car.position.y);
    syncDoors(0);
    if (moveCamera) {
      camera.position.set(shaft.centerX, floorY(1) + playerEyeHeight(), shaft.centerZ - facing * 0.25);
      camera.rotation.x = 0; camera.rotation.y = facing > 0 ? Math.PI : 0;
      world.state.yaw = camera.rotation.y; world.state.pitch = 0; world.state.playerFloor = 0;
    }
  }
  function releaseSeeker() {
    if (!elevator.roundHeld) return;
    elevator.roundHeld = false;
    elevator.state = 'opening';
  }
  // Online the cabin is the server's. It publishes a height, a floor and how far apart the leaves
  // are; this only draws that, because two clients running their own lift would disagree about where
  // the floor under a passenger is.
  function applyRemote(view) {
    if (!view) return;
    // The local state machine stands down online, and it was the only thing emitting the lift's
    // events — so the ride, the arrival and the ding were all silent in a real match. The edges are
    // read off the authority's own state instead: `closing`/`opening` → `moving` is a departure, and
    // anything → `idle`/`opening` after a trip is an arrival.
    const wasState = elevator.remote ? elevator.state : view.state;
    elevator.remote = true;
    elevator.currentFloor = view.floor;
    elevator.targetFloor = view.targetFloor;
    elevator.state = view.state;
    elevator.car.position.y = view.y;
    world.setDynamicHeight('elevator-car', view.y);
    syncDoors(view.doorAmount);
    updateIndicator();
    if (elevator.state === 'moving' && isPlayerInsideXZ()) world.state.playerFloor = 0;
    if (elevator.state === 'moving') { world.elevatorBadge.classList.remove('hidden'); world.elevatorBadge.textContent = `Elevator ${elevator.targetFloor > elevator.currentFloor ? '↑' : '↓'} Floor ${elevator.targetFloor}`; }
    else world.elevatorBadge.classList.add('hidden');
    if (wasState !== elevator.state) {
      if (elevator.state === 'moving') world.emit('elevator-start', { from: elevator.currentFloor, to: elevator.targetFloor, passenger: isPlayerInsideXZ() });
      else if (wasState === 'moving') world.emit('elevator-arrive', { floor: elevator.currentFloor, passenger: isPlayerInsideXZ() });
    }
  }

  function update(delta, elapsed) {
    // There is one authority per hotel. Online the local state machine stands down entirely rather
    // than running alongside the server's and fighting it over the car's height.
    if (elevator.remote) return;
    const epsilon = 0.005;
    if (elevator.state === 'closing') {
      const next = Math.max(0, elevator.doorAmount - CONFIG.elevatorDoorSpeed * delta); syncDoors(next);
      if (next <= epsilon) { syncDoors(0); elevator.state = 'moving'; if (elevator.passengerTrip) { elevator.passengerTrip = isPlayerInsideXZ(); if (elevator.passengerTrip) world.state.playerFloor = 0; } world.emit('elevator-start', { from: elevator.currentFloor, to: elevator.targetFloor, passenger: elevator.passengerTrip }); updateIndicator(); }
    } else if (elevator.state === 'moving') {
      const targetY = floorY(elevator.targetFloor); const diff = targetY - elevator.car.position.y; elevator.car.position.y += Math.sign(diff) * Math.min(Math.abs(diff), CONFIG.elevatorSpeed * delta); world.setDynamicHeight('elevator-car', elevator.car.position.y);
      if (elevator.passengerTrip && isPlayerInsideXZ()) camera.position.y = elevator.car.position.y + playerEyeHeight() + Math.sin(elapsed * 28) * 0.006;
      if (Math.abs(diff) < 0.008) { elevator.car.position.y = targetY; world.setDynamicHeight('elevator-car', targetY); elevator.currentFloor = elevator.targetFloor; if (elevator.passengerTrip) { world.state.playerFloor = elevator.currentFloor; camera.position.y = targetY + playerEyeHeight(); world.emit('floor-change', { floor: world.state.playerFloor, method: 'elevator' }); } elevator.state = 'opening'; world.emit('elevator-arrive', { floor: elevator.currentFloor, passenger: elevator.passengerTrip }); elevator.passengerTrip = false; updateIndicator(); }
    } else if (elevator.state === 'opening') {
      const next = Math.min(1, elevator.doorAmount + CONFIG.elevatorDoorSpeed * delta); syncDoors(next);
      if (next >= 1 - epsilon) { syncDoors(1); elevator.state = 'open'; if (elevator.pendingCall !== null && elevator.pendingCall !== elevator.currentFloor) { const pending = elevator.pendingCall; elevator.pendingCall = null; window.setTimeout(() => { if (elevator.state === 'open') { elevator.targetFloor = pending; elevator.passengerTrip = false; elevator.state = 'closing'; } }, 500); } }
    }
    updateIndicator();
    if (elevator.state === 'moving') { world.elevatorBadge.classList.remove('hidden'); world.elevatorBadge.textContent = `Elevator ${elevator.targetFloor > elevator.currentFloor ? '↑' : '↓'} Floor ${elevator.targetFloor}`; } else world.elevatorBadge.classList.add('hidden');
  }

  return { elevator, build, call, requestFloor, update, applyRemote, holdSeeker, releaseSeeker, isPlayerInside, isPlayerInsideXZ };
}
