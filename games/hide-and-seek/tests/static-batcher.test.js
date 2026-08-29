const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

// Which meshes may be collapsed into one draw call is a rendering rule, so it lives beside the
// renderer rather than in the mirrored pure layer. What it must guarantee is that nothing which
// moves, and nothing a raycast has to identify, is ever merged away — a batched door leaf is a door
// that cannot swing, and a batched drawer face is a drawer the player can no longer point at.
async function loadBatcher() {
  const moduleUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'static-batcher.js')).href;
  return (await import(moduleUrl)).createStaticBatcher;
}

const matrix = () => ({ clone() { return matrix(); }, invert() { return this; }, multiply() { return this; } });

function node(type, props = {}) {
  const self = {
    type, children: [], parent: null, visible: true, userData: {}, matrixWorld: matrix(),
    castShadow: false, receiveShadow: false, ...props,
    add(child) { child.parent = self; self.children.push(child); return self; },
    remove(child) { const at = self.children.indexOf(child); if (at >= 0) self.children.splice(at, 1); child.parent = null; },
    updateMatrixWorld() {},
    updateMatrix() {},
  };
  return self;
}

function geometry({ attributes = ['position', 'normal', 'uv'], index = true } = {}) {
  const attrs = {};
  for (const name of attributes) attrs[name] = {};
  const self = {
    attributes: attrs, index, disposed: false, morphAttributes: {},
    clone() { return geometry({ attributes, index }); },
    applyMatrix4() { return self; },
    dispose() { self.disposed = true; },
  };
  return self;
}

function mesh(material, options = {}) {
  return node('Mesh', { isMesh: true, material, geometry: geometry(options), ...options });
}

const MATERIAL_A = { uuid: 'a' };
const MATERIAL_B = { uuid: 'b' };

function fakeThree() {
  return { Mesh: function Mesh(geo, material) { return node('Mesh', { isMesh: true, geometry: geo, material }); } };
}
const mergeAll = (geometries) => ({ merged: geometries.length, attributes: { position: {} }, dispose() {} });

test('leaves are grouped by material so one floor becomes one draw call per material', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: mergeAll });
  const floor = node('Group');
  for (let i = 0; i < 5; i += 1) floor.add(mesh(MATERIAL_A));
  for (let i = 0; i < 3; i += 1) floor.add(mesh(MATERIAL_B));

  const groups = [...batcher.collectBatchGroups(floor).values()];
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.meshes.length).sort(), [3, 5]);
});

test('geometry that cannot be merged with its neighbours is grouped apart rather than merged wrongly', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: mergeAll });
  const floor = node('Group');
  floor.add(mesh(MATERIAL_A));
  floor.add(mesh(MATERIAL_A, { attributes: ['position', 'normal'] }));
  floor.add(mesh(MATERIAL_A, { index: false }));
  // Shadow flags belong to the mesh, not the geometry, so a batch may only hold one setting.
  floor.add(mesh(MATERIAL_A, { castShadow: true }));

  assert.equal(batcher.collectBatchGroups(floor).size, 4);
});

test('a skipped subtree is left whole, meshes and children alike', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: mergeAll });
  const floor = node('Group');
  const hinge = node('Group');
  const leaf = mesh(MATERIAL_A);
  hinge.add(leaf); leaf.add(mesh(MATERIAL_A)); // the knob
  floor.add(hinge);
  floor.add(mesh(MATERIAL_A));
  floor.add(mesh(MATERIAL_A));

  const groups = [...batcher.collectBatchGroups(floor, { skip: new Set([hinge]) }).values()];
  assert.equal(groups.length, 1);
  assert.equal(groups[0].meshes.length, 2);
});

test('a mesh a raycast has to identify keeps its own identity', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: mergeAll });
  const floor = node('Group');
  const button = mesh(MATERIAL_A);
  floor.add(button);
  for (let i = 0; i < 4; i += 1) floor.add(mesh(MATERIAL_A));

  batcher.flatten(floor, { skip: new Set([button]) });
  assert.ok(floor.children.includes(button), 'the interactable must survive the merge');
  assert.equal(button.geometry.disposed, false);
});

test('flattening replaces the merged meshes with one batch and reports the saving', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: mergeAll });
  const floor = node('Group');
  const originals = [];
  for (let i = 0; i < 6; i += 1) { const item = mesh(MATERIAL_A); originals.push(item); floor.add(item); }
  const lone = mesh(MATERIAL_B);
  floor.add(lone);

  const stats = batcher.flatten(floor);
  assert.equal(stats.merged, 6);
  assert.equal(stats.batches, 1);
  // A group of one merges to exactly what it already was, so it is left alone.
  assert.equal(stats.skipped, 1);
  assert.equal(floor.children.length, 2);
  assert.ok(floor.children.includes(lone));
  for (const item of originals) assert.equal(item.geometry.disposed, true, 'merged geometry must be released');
});

test('an emptied container is pruned, but a floor group and anything skipped stays', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: mergeAll });
  const floor = node('Group', { userData: { floorId: 2 } });
  const bed = node('Group');
  for (let i = 0; i < 3; i += 1) bed.add(mesh(MATERIAL_A));
  const drawer = node('Group');
  floor.add(bed); floor.add(drawer);
  floor.add(mesh(MATERIAL_A));

  const stats = batcher.flatten(floor, { skip: new Set([drawer]) });
  assert.equal(stats.merged, 4);
  assert.equal(stats.pruned, 1);
  assert.ok(!floor.children.includes(bed));
  assert.ok(floor.children.includes(drawer), 'a skipped container is never pruned');
});

test('nothing is merged when the renderer cannot merge geometry', async () => {
  const batcher = (await loadBatcher())({ THREE: fakeThree(), mergeGeometries: null });
  const floor = node('Group');
  for (let i = 0; i < 4; i += 1) floor.add(mesh(MATERIAL_A));

  const stats = batcher.flatten(floor);
  assert.equal(stats.batches, 0);
  assert.equal(floor.children.length, 4);
});
