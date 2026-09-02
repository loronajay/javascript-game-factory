const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function glbData(filename) {
  const buffer = fs.readFileSync(path.resolve(__dirname, '..', 'assets', 'horror', filename));
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  let gltf = null;
  let binary = null;
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (type === 0x4e4f534a) gltf = JSON.parse(buffer.toString('utf8', offset, offset + length));
    if (type === 0x004e4942) binary = buffer.subarray(offset, offset + length);
    offset += length;
  }
  if (!gltf || !binary) throw new Error(`${filename} is missing a GLB chunk`);
  return { gltf, binary };
}

function readAccessor({ gltf, binary }, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const readers = {
    5121: ['readUInt8', 1], 5123: ['readUInt16LE', 2], 5125: ['readUInt32LE', 4],
    5126: ['readFloatLE', 4],
  };
  const width = widths[accessor.type];
  const [reader, bytes] = readers[accessor.componentType];
  const stride = view.byteStride || width * bytes;
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  return Array.from({ length: accessor.count }, (_, index) => Array.from(
    { length: width },
    (__, component) => binary[reader](start + index * stride + component * bytes),
  ));
}

function connectedComponents(vertexCount, triangles) {
  const parent = Int32Array.from({ length: vertexCount }, (_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) { const next = parent[index]; parent[index] = root; index = next; }
    return root;
  };
  const join = (a, b) => { const left = find(a); const right = find(b); if (left !== right) parent[right] = left; };
  for (let index = 0; index < triangles.length; index += 3) {
    join(triangles[index][0], triangles[index + 1][0]);
    join(triangles[index][0], triangles[index + 2][0]);
  }
  const components = new Map();
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const root = find(vertex);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(vertex);
  }
  return [...components.values()];
}

for (const filename of ['gaunt-horror-rigged.glb', 'silent-horror-nurse-rigged.glb']) {
  test(`${filename} is an authored skinned creature with reusable gameplay clips`, () => {
    const { gltf } = glbData(filename);
    assert.equal(gltf.skins.length, 1);
    const jointNames = gltf.skins[0].joints.map((index) => gltf.nodes[index].name);
    for (const bone of ['Root', 'Pelvis', 'Spine', 'Chest', 'Head', 'Hand.L', 'Hand.R', 'Thigh.L', 'Thigh.R']) {
      assert.ok(jointNames.includes(bone), `${filename} is missing ${bone}`);
    }
    const clips = gltf.animations.map((animation) => animation.name).sort();
    assert.deepEqual(clips, ['Creature_Chase', 'Creature_Idle', 'Creature_Stalk']);
    const primitive = gltf.meshes[0].primitives[0];
    assert.ok(Number.isInteger(primitive.attributes.JOINTS_0));
    assert.ok(Number.isInteger(primitive.attributes.WEIGHTS_0));
    assert.ok(gltf.animations.every((animation) => animation.channels.length >= 8),
      'clips must animate a body, not just bob the root');
  });
}

test('the nurse lower-leg accessories use coherent weights instead of exploding into loose pieces', () => {
  const data = glbData('silent-horror-nurse-rigged.glb');
  const primitive = data.gltf.meshes[0].primitives[0];
  const positions = readAccessor(data, primitive.attributes.POSITION);
  const joints = readAccessor(data, primitive.attributes.JOINTS_0);
  const weights = readAccessor(data, primitive.attributes.WEIGHTS_0);
  const indices = readAccessor(data, primitive.indices);
  const components = connectedComponents(positions.length, indices);
  const rigidLegPieces = components.filter((vertices) => {
    if (vertices.length < 6 || vertices.length > 10000) return false;
    const heights = vertices.map((vertex) => positions[vertex][1]);
    const meanHeight = heights.reduce((sum, height) => sum + height, 0) / heights.length;
    return meanHeight < 1.08 && Math.max(...heights) - Math.min(...heights) < 0.55;
  });
  assert.ok(rigidLegPieces.length >= 4, 'expected disconnected boot and shin pieces in the nurse sculpt');
  for (const vertices of rigidLegPieces) {
    const signatures = new Set(vertices.map((vertex) => joints[vertex].map((joint, index) =>
      `${joint}:${weights[vertex][index].toFixed(4)}`).join('|')));
    assert.equal(signatures.size, 1, `a ${vertices.length}-vertex lower-leg piece has ${signatures.size} competing transforms`);
  }
});
