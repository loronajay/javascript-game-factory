const test = require('node:test');
const assert = require('node:assert/strict');
const flashlight = require('../flashlight-logic.js');
const { buildPlan } = require('./helpers/map-fixture.js');
const { seededRandom } = require('./helpers/hotel-fixture.js');

async function runtime() {
  const THREE = await import('../vendor/three.module.js');
  const { createFlashlightPickups } = await import('../modules/flashlight-pickups.js');
  const scene = new THREE.Scene();
  let charge = 1;
  const events = [];
  const world = { state: {}, collections: { interactables: [] }, notify() {}, emit: (type, detail) => events.push({ type, ...detail }) };
  const player = { getState: () => ({ flashlightCharge: charge }), addFlashlightCharge(amount) { const old = charge; charge = Math.min(1, charge + amount); return charge - old; } };
  const pickups = createFlashlightPickups({ THREE, scene, world, player, logic: flashlight });
  return { pickups, scene, world, player, events, setCharge(value) { charge = value; } };
}

test('solo floor pickups use the shared selection, retain full-battery pickups, and clean up when collected', async () => {
  const r = await runtime();
  const plan = buildPlan('grand-hotel');
  assert.equal(r.scene.children.length, 0, 'no pickups before a solo round or server snapshot');
  r.pickups.spawnFloorPickups(plan, seededRandom(7));
  const expected = flashlight.createFloorPickups(plan.spawns.flashlights, seededRandom(7));
  assert.equal(r.scene.children.length, expected.length);
  assert.deepEqual(r.pickups.getState().map(p => p.id), expected.map(p => p.id));
  assert.equal(r.events.some(e => e.type === 'flashlight-drop'), false, 'map loot is not an elimination drop');
  const item = r.world.collections.interactables[0];
  assert.match(item.prompt(), /flashlight/i);
  item.action();
  assert.equal(r.pickups.getState().length, expected.length);
  r.setCharge(0.2);
  item.action();
  item.action();
  assert.equal(r.pickups.getState().length, expected.length - 1);
  assert.equal(r.world.collections.interactables.includes(item), false);
  assert.equal(r.events.filter(e => e.type === 'flashlight-pickup').length, 1);
  r.pickups.spawnFloorPickups(plan, seededRandom(8));
  assert.equal(r.pickups.getState().length, expected.length - 1, 'starting twice must not restock loot');
});

test('online snapshots exclusively own pickups, including late joins and consumption', async () => {
  const r = await runtime();
  const plan = buildPlan('grand-hotel');
  r.pickups.spawnFloorPickups(plan, seededRandom(7));
  const staleAction = r.world.collections.interactables[0];
  const snapshot = flashlight.createFloorPickups(plan.spawns.flashlights, seededRandom(55));
  r.pickups.applySnapshot(snapshot);
  assert.equal(r.world.collections.interactables.length, 0, 'replicas have no local collection action');
  assert.equal(r.scene.children.length, snapshot.length);
  r.setCharge(0.2);
  staleAction.action();
  assert.equal(r.player.getState().flashlightCharge, 0.2);
  r.pickups.spawnFloorPickups(plan, seededRandom(1));
  assert.equal(r.pickups.drop({ playerId: 'fake', x: 0, y: 0, z: 0, floor: 1, charge: 1 }), null);
  r.pickups.applySnapshot(snapshot);
  assert.equal(r.scene.children.length, snapshot.length, 'repeated snapshots do not duplicate markers');
  assert.equal(r.pickups.getState().length, snapshot.length);
  r.pickups.applySnapshot(snapshot.slice(1));
  assert.equal(r.scene.children.length, snapshot.length - 1);
  const late = await runtime();
  late.pickups.applySnapshot(snapshot.slice(1));
  assert.deepEqual(late.pickups.getState(), r.pickups.getState());
  r.pickups.applySnapshot([]);
  assert.equal(r.scene.children.length, 0);
});

test('solo eliminated players cannot collect floor loot', async () => {
  const r = await runtime();
  r.pickups.spawnFloorPickups(buildPlan('grand-hotel'), seededRandom(7));
  r.setCharge(0.2);
  r.world.state.playerEliminated = true;
  r.world.collections.interactables[0].action();
  assert.equal(r.player.getState().flashlightCharge, 0.2);
});
