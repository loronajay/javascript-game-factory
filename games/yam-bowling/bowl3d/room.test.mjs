import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from './vendor/three.module.min.js';
import { createRoom } from './room.mjs';
import { HEAD_Z, RELEASE_Z, ROOM_LENGTH } from './geometry.mjs';
import { LANE_THEMES } from './themes.mjs';

test('the complete room applies every house while retaining lane geometry, markings and saturated neon', t => {
  const context={ createLinearGradient:()=>({addColorStop(){}}),fillRect(){},clearRect(){},fillText(){} };
  const original=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({getContext:()=>context})}});
  t.after(()=>{if(original)Object.defineProperty(globalThis,'document',original);else delete globalThis.document;});
  const scene=new THREE.Scene();let paints=0;
  const room=createRoom(scene,null,{ textureLoader:{load:()=>new THREE.Texture()},themeTextureFactory:()=>({
    textures:Object.fromEntries(['mural','panels','floor','cladding'].map(key=>[key,new THREE.Texture()])),paint(){paints++;},dispose(){},
  }) });
  const objects=[...scene.children];
  const lane=scene.children.find(mesh=>mesh.isMesh&&mesh.geometry.parameters.width===6&&mesh.geometry.parameters.height===.3);
  const geometry=lane.geometry,uv=Array.from(geometry.attributes.uv.array);
  for(const theme of Object.values(LANE_THEMES)) {
    room.setTheme(theme.slug,theme.slug);
    assert.equal(lane.geometry,geometry);
    assert.deepEqual(Array.from(geometry.attributes.uv.array),uv);
    assert.deepEqual(scene.children,objects);
    assert.equal(room.dressing.group.userData.theme,theme.slug);
    assert.equal(lane.material.color.getHex(),theme.wood);
    assert.equal(room.sweep.material.toneMapped,false,'neon should retain its hue under ACES exposure');
    assert.equal(room.sweep.material.color.getHex(),0,'white house lights must not bleach a neon tube');
  }
  assert.equal(paints,9);
  room.setTheme('invalid');room.setTheme('invalid');assert.equal(paints,10);
});

// Inspect scene geometry, not draw calls or WebGL. Canvas-backed lane/sign art
// is unrelated to the sightline and material contracts under test.
test('the room keeps lighting but no cross-lane overhead obstructions', t => {
  const context = { createLinearGradient: () => ({ addColorStop() {} }), fillRect() {} };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement: () => ({ getContext: () => context }) } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  });
  const scene = new THREE.Scene();
  createRoom(scene, null, { textureLoader: { load: () => new THREE.Texture() } });
  const overhead = scene.children.filter(mesh => mesh.isMesh
    && mesh.geometry.parameters.width >= 6
    && mesh.position.y > 6 && mesh.position.y < 8
    && mesh.position.z >= HEAD_Z && mesh.position.z <= RELEASE_Z);
  assert.equal(overhead.length, 0, 'remove the visible fixtures, not just their shadows');
  const houseLights = scene.children.filter(light => light.isPointLight
    && light.position.y === 6.55 && light.position.z >= HEAD_Z);
  assert.ok(houseLights.length >= 8, 'the full length of the lane stays illuminated');
  const walls = scene.children.filter(mesh => mesh.isMesh
    && mesh.geometry.parameters.depth === ROOM_LENGTH
    && mesh.geometry.parameters.height === 9);
  assert.equal(walls.length, 2);
  assert.ok(walls.every(wall=>!wall.castShadow),'the indoor fill must not cast exterior wall shadows across the alley');
  assert.ok(walls.every(wall => wall.material.map && wall.material.normalMap && wall.material.roughnessMap));
  assert.ok(walls.every(wall => Math.abs(wall.geometry.attributes.uv.getX(0)
    - wall.geometry.attributes.uv.getX(1)) > 10), 'side walls repeat instead of stretching');
});
