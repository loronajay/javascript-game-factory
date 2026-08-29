const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const assetRoot = path.join(__dirname, '..', 'assets', 'quaternius-player');

function readGlbJson(filename) {
  const bytes = fs.readFileSync(path.join(assetRoot, filename));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/u, ''));
}

test('player body is a textured Base Character on the shared 65-joint rig', () => {
  const gltf = readGlbJson('base-character.glb');
  assert.ok(gltf.meshes.length >= 1);
  assert.ok(gltf.materials.length >= 2);
  assert.ok(gltf.textures.length >= 1);
  assert.equal(gltf.skins.length, 1);
  assert.equal(gltf.skins[0].joints.length, 65);
});

test('player animation bank contains dedicated locomotion and crouch clips', () => {
  const gltf = readGlbJson('locomotion.glb');
  const clips = new Set(gltf.animations.map((animation) => animation.name));
  for (const clip of [
    'Idle_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop',
  ]) assert.ok(clips.has(clip), `missing ${clip}`);
  assert.equal(gltf.skins[0].joints.length, 65);
});
