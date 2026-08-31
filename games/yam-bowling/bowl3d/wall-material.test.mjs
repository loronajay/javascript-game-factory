import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as THREE from './vendor/three.module.min.js';
import { createWallMaterial, tileBoxUVs, tintWallMaterial, WALL_MAPS } from './wall-material.mjs';
import { THEMES } from './room.mjs';

test('walls use local color, OpenGL normal and roughness maps with correct sampling', () => {
  const requests = [];
  const loader = { load(url) { requests.push(url); return new THREE.Texture(); } };
  const wall = createWallMaterial({ capabilities: { getMaxAnisotropy: () => 16 } }, loader);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(url => url.includes('/assets/textures/walls/') && url.endsWith('.webp')));
  assert.equal(wall.map.colorSpace, THREE.SRGBColorSpace);
  assert.equal(wall.normalMap.colorSpace, THREE.NoColorSpace);
  assert.equal(wall.roughnessMap.colorSpace, THREE.NoColorSpace);
  for (const map of [wall.map, wall.normalMap, wall.roughnessMap]) {
    assert.equal(map.wrapS, THREE.RepeatWrapping);
    assert.equal(map.wrapT, THREE.RepeatWrapping);
    assert.equal(map.anisotropy, 8);
  }
  assert.equal(wall.metalness, 0);
  assert.equal(wall.roughness, 1);
});

test('all six box faces preserve texture scale instead of stretching across the lane', () => {
  const geometry = new THREE.BoxGeometry(.3, 9, 96);
  const originalPositions = geometry.attributes.position.array.slice();
  tileBoxUVs(geometry, 6);
  const { position, uv } = geometry.attributes;
  for (let face = 0; face < 6; face++) for (const offset of [1, 2]) {
    const a = face * 4, b = a + offset;
    const distance = new THREE.Vector3().fromBufferAttribute(position, a)
      .distanceTo(new THREE.Vector3().fromBufferAttribute(position, b));
    const uvDistance = new THREE.Vector2().fromBufferAttribute(uv, a)
      .distanceTo(new THREE.Vector2().fromBufferAttribute(uv, b));
    assert.ok(Math.abs(uvDistance - distance / 6) < .00001);
  }
  assert.deepEqual(position.array, originalPositions, 'presentation must not alter physical geometry');
});

test('theme changes retain readable wall detail without loading more textures', () => {
  let loads = 0;
  const wall = createWallMaterial(null, { load() { loads++; return new THREE.Texture(); } });
  const maps = [wall.map, wall.normalMap, wall.roughnessMap];
  for (const [, , base] of Object.values(THEMES)) {
    tintWallMaterial(wall, base);
    assert.ok(Math.min(wall.color.r, wall.color.g, wall.color.b) >= .25);
    assert.deepEqual([wall.map, wall.normalMap, wall.roughnessMap], maps);
  }
  assert.equal(loads, 3);
  assert.equal(wall.map.anisotropy, 1);
});

test('wall texture files and their module ship in the runtime within a compact asset budget', () => {
  const manifest = JSON.parse(readFileSync(new URL('../runtime-assets.json', import.meta.url)));
  assert.ok(manifest.include.includes('bowl3d/wall-material.mjs'));
  assert.ok(manifest.include.includes('bowl3d/aim-guide.mjs'));
  assert.ok(manifest.include.includes('bowl3d/shot-path.mjs'));
  assert.ok(manifest.include.includes('assets/textures/walls/*.webp'));
  assert.ok(manifest.include.includes('assets/textures/walls/LICENSE.txt'));
  const maps = Object.values(WALL_MAPS);
  const bytes = maps.reduce((sum, path) => {
    const url = new URL(path, import.meta.url);
    const header = readFileSync(url).subarray(0, 12);
    assert.equal(header.toString('ascii', 0, 4), 'RIFF');
    assert.equal(header.toString('ascii', 8, 12), 'WEBP');
    return sum + statSync(url).size;
  }, 0);
  assert.ok(bytes < 2 * 1024 * 1024, `wall textures use ${bytes} bytes`);
});
