import assert from 'node:assert/strict';
import { MAPS } from '../scripts/maps.js';
import { createGameState } from '../scripts/state.js';
import { createMapScene } from '../scripts/scene-3d.js';
for (let index = 0; index < MAPS.length; index++) {
  const state = createGameState(index);
  const before = JSON.stringify(state);
  const scene = createMapScene(state.map, state.world3d, state.hazards);
  assert.ok(scene.root.children.length > 0);
  scene.sync(state, 1000);
  scene.sync(state, 1500);
  assert.equal(JSON.stringify(state), before, 'drawing does not mutate simulation state');
  assert.equal(scene.root.getObjectByName('hazards').children.filter(o => o.name.startsWith('patrol:')).length, state.hazards.aliens.length);
  let disposed = 0;
  const resources = new Set();
  scene.root.traverse(object => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
    if (object.isInstancedMesh) resources.add(object);
  });
  for (const resource of resources) resource.addEventListener('dispose', () => disposed++);
  scene.dispose();
  assert.equal(disposed, resources.size, 'all per-map GPU resources are disposed exactly once');
}
console.log('Illuminauts 3D scene lifecycle tests passed.');
