const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = name => import(pathToFileURL(path.resolve(__dirname, '..', name)));

async function fixture() {
  const THREE = await load('vendor/three.module.js');
  const { createMapRuntime } = await load('modules/map-runtime.js');
  const scene = new THREE.Scene();
  const shared = new THREE.MeshStandardMaterial();
  const builds = []; const disposed = []; const stopped = [];
  let allowed = true;
  const runtime = createMapRuntime({ THREE, scene, materials: { shared }, canChange: () => allowed,
    createMap(mapId, group) {
      builds.push(mapId);
      const geometry = new THREE.BoxGeometry();
      geometry.addEventListener('dispose', () => disposed.push(mapId));
      group.add(new THREE.Mesh(geometry, shared));
      if (mapId === 'broken') throw new Error('failed build');
      return { world: { state: { mapId }, getPlan: () => ({ id: mapId }) }, hotel: { getMapId: () => mapId }, elevator: { elevator: { mapId } }, furnishings: { mapId } };
    },
    onReady(parts) { assert.equal(parts.world.getPlan().id, parts.hotel.getMapId()); },
  });
  runtime.prepare('hotel');
  runtime.setDemonsFactory((world, group, mapId) => {
    group.add(new THREE.Group());
    return { primary: { getState: () => ({ mapId }) }, dispose: () => stopped.push(mapId), getStates: () => [world.getPlan().id] };
  });
  return { runtime, scene, shared, builds, disposed, stopped, block: () => { allowed = false; } };
}

test('map preparation replaces only the world and keeps the renderer and consumer handles', async () => {
  const env = await fixture();
  const { world, hotel, elevator, furnishings, demons } = env.runtime.parts;
  const firstGroup = env.scene.children[0];
  let sharedDisposals = 0; env.shared.addEventListener('dispose', () => sharedDisposals++);
  assert.equal(env.runtime.prepare('mall'), true);
  assert.equal(env.scene.children.length, 1);
  assert.equal(firstGroup.parent, null);
  assert.equal(env.runtime.parts.world, world);
  assert.equal(env.runtime.parts.hotel, hotel);
  assert.equal(env.runtime.parts.elevator, elevator);
  assert.equal(env.runtime.parts.furnishings, furnishings);
  assert.equal(env.runtime.parts.demons, demons);
  assert.equal(world.getPlan().id, 'mall');
  assert.equal(elevator.elevator.mapId, 'mall');
  assert.equal(hotel.getMapId(), 'mall');
  assert.deepEqual(demons.getStates(), ['mall']);
  assert.deepEqual(env.disposed, ['hotel']);
  assert.deepEqual(env.stopped, ['hotel']);
  assert.equal(sharedDisposals, 0);
});

test('repeated preparation is a no-op and a running round cannot change maps', async () => {
  const env = await fixture();
  assert.equal(env.runtime.prepare('hotel'), true);
  env.block();
  assert.equal(env.runtime.prepare('mall'), false);
  assert.deepEqual(env.builds, ['hotel']);
  assert.equal(env.runtime.parts.world.getPlan().id, 'hotel');
});

test('failed preparation discards partial geometry and leaves the old world usable', async () => {
  const env = await fixture();
  assert.throws(() => env.runtime.prepare('broken'), /failed build/);
  assert.equal(env.scene.children.length, 1);
  assert.equal(env.runtime.parts.world.getPlan().id, 'hotel');
  assert.deepEqual(env.disposed, ['broken']);
  assert.deepEqual(env.stopped, []);
  assert.equal(env.runtime.prepare('mall'), true);
});
