const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fixture = require('./helpers/hotel-fixture.js');
const mall = require('./helpers/mall-fixture.js');
const load = file => import(pathToFileURL(path.resolve(__dirname, '..', file)));

// Exercise the plan-to-scene coordinate boundary without a renderer or GPU.
async function buildDoorScene(plan) {
  const THREE = await load('vendor/three.module.js');
  const { createHotel } = await load('modules/hotel.js');
  const collections = {
    floorGroups: new Map(), floorLights: new Map(), roomDoors: new Map(), secretPanels: new Map(),
    doorsByPlanId: new Map(), hallElevatorDoors: new Map(), dynamicDoors: [], dynamicDrawers: [], interactables: [],
  };
  const world = { collections, state: { inventory: new Set() }, stairwellGroup: new THREE.Group(), setPlan() {}, setOpening() {}, colliderData() {} };
  const scene = new THREE.Scene();
  const material = new THREE.MeshStandardMaterial();
  const minimalPlan = { ...plan, boxes: [], signs: [], doorFrames: [], wallLamps: [], lights: [], hallDoors: [], fixtures: [], furnishings: [], stairs: { treads: [], rails: [] } };
  const hotel = createHotel({ THREE, scene, camera: new THREE.PerspectiveCamera(), materials: { wall: material, wood: material, brass: material },
    config: { ...fixture.CONFIG, doorSpeed: 5.2 }, floorY: fixture.floorY,
    floorDefs: [...new Set(plan.roomDoors.map(door => door.floor))].map(id => ({ id })),
    layout: { selectVisibleLightFloors: () => [] }, plan: { createHotelPlan: () => minimalPlan }, world,
    performance: { createChangeTracker: () => () => true },
  });
  hotel.build();
  scene.updateMatrixWorld(true);
  return { THREE, scene, hotel, collections };
}

for (const [name, build] of [['hotel', fixture.buildHotel], ['mall', mall.buildMall]]) {
  test(`${name} door leaves and secret panels occupy the plan's world height on every floor`, async () => {
    const plan = build();
    const { THREE, collections } = await buildDoorScene(plan);
    for (const spec of [...plan.roomDoors, ...plan.secretPanels]) {
      assert.ok(Math.abs(spec.y - spec.h / 2 - fixture.floorY(spec.floor)) < 1e-9, `${spec.id}: collision must stand on floor ${spec.floor}`);
      const item = collections.doorsByPlanId.get(spec.id);
      const position = (item.door || item.panel).getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(position.y - spec.y) < 1e-9, `${spec.id}: visible height ${position.y}, collision height ${spec.y}`);
    }
  });
}

test('a complete sparse door snapshot closes previously open doors, including initially open rooms', async () => {
  const plan = fixture.buildHotel();
  const { hotel, collections } = await buildDoorScene(plan);
  const initial = plan.roomDoors.find(door => door.openInitially);
  const other = plan.roomDoors.find(door => !door.openInitially);
  hotel.applyOpenings({ [initial.id]: initial.openAngle, [other.id]: other.openAngle });
  hotel.update(1);
  hotel.applyOpenings({});
  hotel.update(1);
  for (const spec of [initial, other]) {
    const item = collections.doorsByPlanId.get(spec.id);
    assert.equal(item.target, 0);
    assert.equal(item.hinge.rotation.y, 0);
    assert.equal(item.open, false);
  }
});
