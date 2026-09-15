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

// Marker decals: a fixed pool per map, shown only for placed tags, oriented by facing, never mutating state.
{
  const { placeMarker } = await import('../scripts/markers.js');
  const { MARKER_LIMIT } = await import('../scripts/markers.js');
  const state = createGameState(0);
  const scene = createMapScene(state.map, state.world3d, state.hazards);
  const pool = scene.root.getObjectByName('markers');
  assert.ok(pool, 'scene owns a marker pool');
  assert.equal(pool.children.length, MARKER_LIMIT, 'pool is sized to the tag limit');
  scene.sync(state, 1000);
  assert.equal(pool.children.filter(o => o.visible).length, 0);
  state.player.yaw = -Math.PI / 2; placeMarker(state, 'arrow');
  state.player.tx += 1; state.player.px += 1; placeMarker(state, 'cross');
  const before = JSON.stringify(state);
  scene.sync(state, 1500);
  assert.equal(JSON.stringify(state), before, 'drawing markers does not mutate simulation state');
  const shown = pool.children.filter(o => o.visible);
  assert.equal(shown.length, 2);
  assert.equal(shown[0].userData.kind, 'arrow');
  assert.ok(Math.abs(shown[0].rotation.y - -Math.PI / 2) < 1e-9, 'arrow decal turns to the facing it was placed with');
  assert.equal(shown[1].userData.kind, 'cross');
  assert.ok(shown[0].position.x !== shown[1].position.x, 'decals sit on their own tiles');
  const rivalPool = scene.root.getObjectByName('rival-markers');
  assert.ok(rivalPool, 'scene owns a second pool for relayed rival tags');
  assert.equal(rivalPool.children.length, MARKER_LIMIT);
  assert.equal(rivalPool.children.filter(o => o.visible).length, 0);
  const { applyRemoteMarker } = await import('../scripts/markers.js');
  applyRemoteMarker(state, { id: 1, kind: 'cross', x: 1, y: 1, dir: 'left' });
  scene.sync(state, 2000);
  const rivalShown = rivalPool.children.filter(o => o.visible);
  assert.equal(rivalShown.length, 1);
  assert.equal(rivalShown[0].userData.kind, 'cross');
  assert.ok(Math.abs(rivalShown[0].rotation.y - Math.PI / 2) < 1e-9);
  const localGlyph = shown[1].getObjectByName('glyph'), rivalGlyph = rivalShown[0].getObjectByName('glyph');
  assert.notEqual(localGlyph.material, rivalGlyph.material, 'rival glyphs use their own material so they read as not yours');
  scene.dispose();
}
console.log('Illuminauts marker decal tests passed.');
