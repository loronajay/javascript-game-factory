const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fixtures = require('../fixtures-logic.js');
const geometry = require('../collision-logic.js');
const load = file => import(pathToFileURL(path.resolve(__dirname, '..', file)));

for (const facing of [-1, 1]) test(`visible and authoritative lift face ${facing} with the plan`, async () => {
  const THREE = await load('vendor/three.module.js');
  const { createElevator } = await load('modules/elevator.js');
  const shaft = { centerX: 34, centerZ: -29, frontZ: -29 + facing * 2.1 };
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const registered = [];
  const world = {
    collections: { hallElevatorDoors: new Map(), interactables: [] },
    state: { floorCount: 2, playerEyeHeight: 1.65 },
    getPlan: () => ({ elevator: shaft }), setOpening() {}, setDynamicHeight() {}, addNumberPlate() {},
    registerBoxCollider(mesh, size) { registered.push({ mesh, size }); },
  };
  const context = { fillRect() {}, strokeRect() {}, fillText() {} };
  const material = new THREE.MeshStandardMaterial();
  const elevator = createElevator({ THREE, scene, camera, materials: { elevatorInterior: material, brass: material, metal: material, dark: material },
    config: { eyeHeight: 1.65 }, floorY: f => (f - 1) * 4.6, world,
    performance: { createChangeTracker: () => () => true }, document: { createElement: () => ({ getContext: () => context }) }, window: {},
  });
  elevator.build();
  assert.equal(elevator.elevator.cabinLeftDoor.position.z, facing * 1.58);
  const back = registered.find(r => r.size.width === 2.5 && r.size.depth === 0.12);
  assert.equal(back.mesh.position.z, -facing * 1.6);
  camera.position.set(34, 1.65, -29 + facing);
  assert.equal(elevator.isPlayerInside(), true);
  elevator.holdSeeker();
  assert.equal(camera.rotation.y, facing > 0 ? Math.PI : 0);
  assert.equal(geometry.inCabinFootprint(camera.position, shaft), true);

  const cfg = { elevatorCenterX: 34, elevatorCenterZ: -29, elevatorFrontZ: shaft.frontZ };
  const state = { elevator: { y: 4.6, doorAmount: 0 } };
  const boxes = fixtures.elevatorColliders(state.elevator, cfg);
  const rear = boxes.find(b => b.id === 'elevator-cabin-back');
  assert.ok(Math.abs((rear.minZ + rear.maxZ) / 2 - (-29 - facing * 1.6)) < 1e-9);
});

// Online the local state machine stands down, and it was the only thing emitting the lift's events —
// so the ride, the arrival and the ding never played in a real match. `applyRemote` reads the edges
// off the authority's own state instead.
test('the replicated lift still announces departures and arrivals', async () => {
  const THREE = await load('vendor/three.module.js');
  const { createElevator } = await load('modules/elevator.js');
  const shaft = { centerX: 34, centerZ: -29, frontZ: -31.1 };
  const emitted = [];
  const world = {
    collections: { hallElevatorDoors: new Map(), interactables: [] },
    state: { floorCount: 2, playerEyeHeight: 1.65 },
    elevatorBadge: { textContent: '', classList: { add() {}, remove() {} } },
    getPlan: () => ({ elevator: shaft }), setOpening() {}, setDynamicHeight() {}, addNumberPlate() {},
    registerBoxCollider() {}, emit: (name, detail) => emitted.push({ name, detail }),
  };
  const context = { fillRect() {}, strokeRect() {}, fillText() {} };
  const material = new THREE.MeshStandardMaterial();
  const elevator = createElevator({ THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(),
    materials: { elevatorInterior: material, brass: material, metal: material, dark: material },
    config: { eyeHeight: 1.65 }, floorY: f => (f - 1) * 4.6, world,
    performance: { createChangeTracker: () => () => true }, document: { createElement: () => ({ getContext: () => context }) }, window: {},
  });
  elevator.build();
  emitted.length = 0;

  const snapshot = (state, floor, targetFloor, y) => ({ state, floor, targetFloor, y, doorAmount: 0 });
  // The first snapshot is the world as it stands, not an event: joining mid-ride must not play a ding.
  elevator.applyRemote(snapshot('moving', 1, 2, 2.3));
  assert.deepEqual(emitted, []);

  elevator.applyRemote(snapshot('opening', 2, 2, 4.6));
  assert.equal(emitted.at(-1).name, 'elevator-arrive');
  assert.equal(emitted.at(-1).detail.floor, 2);

  elevator.applyRemote(snapshot('closing', 2, 1, 4.6));
  elevator.applyRemote(snapshot('moving', 2, 1, 4.4));
  assert.equal(emitted.at(-1).name, 'elevator-start');
  assert.deepEqual([emitted.at(-1).detail.from, emitted.at(-1).detail.to], [2, 1]);

  const before = emitted.length;
  elevator.applyRemote(snapshot('moving', 2, 1, 3.9));
  assert.equal(emitted.length, before, 'an unchanged state is not an event');
});
