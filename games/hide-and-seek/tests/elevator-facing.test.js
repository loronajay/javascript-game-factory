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
