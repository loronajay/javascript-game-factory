import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import * as THREE from './vendor/three.module.min.js';
import { LANE_THEMES, getLaneTheme } from './themes.mjs';
import { createRoomDressing } from './room-dressing.mjs';
import { motifLayout } from './theme-art.mjs';
import { HEAD_Z, RELEASE_Z } from './geometry.mjs';

const require = createRequire(import.meta.url);
const { LANES } = require('../lane-core.js');
const expected = ['crown', 'circuit', 'emerald', 'deco', 'sunset', 'carnival', 'cosmic', 'liberty', 'timber'];

test('emblems keep their physical proportions on wide murals and tall atlas panels', () => {
  for(const [pw,ph,w,h,size] of [[1024,512,14.85,3.85,3.65],[512,1024,5.4,5.6,4.6]]) {
    const {x,y,sx,sy}=motifLayout(pw,ph,w,h,size);
    assert.ok(Math.abs(sx*w/pw-sy*h/ph)<1e-10,'a painted circle stays a circle in world space');
    assert.ok(Math.abs(x+sx*500-pw/2)<1e-8);
    assert.ok(Math.abs(y+sy*500-ph/2)<1e-8);
  }
});

test('every selectable lane has an explicit art direction, not a palette fallback', () => {
  assert.deepEqual(Object.keys(LANE_THEMES), LANES.map(lane => lane.slug));
  assert.deepEqual(LANES.map(lane => getLaneTheme(lane.slug).motif), expected);
  assert.equal(getLaneTheme('unknown'), getLaneTheme('crimson-crown'));
  assert.equal(getLaneTheme('toString'), getLaneTheme('crimson-crown'));
  for (const lane of LANES) {
    const theme = getLaneTheme(lane.slug);
    assert.equal(theme.slug, lane.slug);
    assert.ok(theme.colors.length >= 3);
    assert.ok(theme.artGlow >= 0 && theme.artGlow <= 1.5);
    assert.ok(theme.floorRoughness >= .15 && theme.floorRoughness <= 1);
    assert.equal(Object.isFrozen(theme), true);
  }
});

function fixture() {
  const scene = new THREE.Scene();
  let paints = 0, disposed = 0;
  const textures = Object.fromEntries(['mural', 'panels', 'floor', 'cladding'].map(key => [key, new THREE.Texture()]));
  const textureFactory = () => ({ textures, paint() { paints++; }, dispose() { disposed++; } });
  const dressing = createRoomDressing(scene, null, { textureFactory });
  return { scene, dressing, textures, paints: () => paints, disposed: () => disposed };
}

test('theme switches update surface art, upholstery, trim and props without accumulating scene resources', () => {
  const f = fixture();
  const { dressing, scene, textures } = f;
  const count = () => { let n = 0; scene.traverse(() => n++); return n; };
  const before = count();
  for (let round = 0; round < 3; round++) for (const lane of LANES) {
    dressing.setTheme(getLaneTheme(lane.slug));
    assert.equal(dressing.group.userData.theme, lane.slug);
    assert.equal(dressing.materials.mural.map, textures.mural);
    assert.equal(dressing.materials.panels.emissiveMap, textures.panels);
    assert.equal(dressing.materials.floor.map, textures.floor);
    assert.equal(dressing.materials.upholstery.color.getHex(), getLaneTheme(lane.slug).seat);
    assert.equal(dressing.materials.floor.roughness, getLaneTheme(lane.slug).floorRoughness);
    assert.equal(dressing.props.trophies.visible, ['liberty-lanes', 'oak-and-onyx'].includes(lane.slug));
    assert.equal(count(), before);
  }
  assert.equal(f.paints(), 27);
  dressing.setTheme(getLaneTheme('oak-and-onyx'));
  assert.equal(f.paints(), 27, 'rendering the same house must not repaint/upload textures');
  dressing.dispose();
  assert.equal(f.disposed(), 1);
  assert.equal(scene.children.includes(dressing.group), false);
});

test('dressing stays clear of the physical lane, rack, and elevated follow-camera corridor', () => {
  const { scene, dressing } = fixture();
  dressing.setTheme(getLaneTheme('cosmic-bowl'));
  scene.updateMatrixWorld(true);
  const corridor = new THREE.Box3(new THREE.Vector3(-3.95, -.3, HEAD_Z - 4.6), new THREE.Vector3(3.95, 8, RELEASE_Z + 12));
  dressing.group.traverse(mesh => {
    if (!mesh.isMesh) return;
    assert.equal(new THREE.Box3().setFromObject(mesh).intersectsBox(corridor), false, mesh.name);
  });
  const panels = [];
  dressing.group.traverse(mesh => { if (mesh.name === 'wall-art') panels.push(mesh); });
  assert.ok(panels.length >= 12, 'theme motifs remain visible along the full ball-follow route');
  assert.ok(panels.every(mesh => mesh.material === dressing.materials.panels), 'one shared atlas across wall panels');
});

test('theme modules are self-contained and included in the published runtime', () => {
  const manifest = require('../runtime-assets.json');
  for (const name of ['themes', 'theme-art', 'theme-motifs', 'room-dressing']) {
    assert.ok(manifest.include.includes(`bowl3d/${name}.mjs`));
    const source = readFileSync(new URL(`./${name}.mjs`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /cannon|physics-core|localStorage|Math\.random/);
  }
});
