const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const url = require('node:url');

// Which lamps the GPU keeps hot is a rendering question, so the rule lives beside the renderer
// rather than in the mirrored pure layer — a server has no lights to choose between. What it must
// guarantee is the thing three.js is unforgiving about: the *number* of point lights never changes,
// because that number is part of the shader program's cache key.
async function loadHotel() {
  const moduleUrl = url.pathToFileURL(path.resolve(__dirname, '..', 'modules', 'hotel.js')).href;
  return import(moduleUrl);
}

function lamp(floor, x, z, extra = {}) {
  return { floor, x, y: (floor - 1) * 4.6 + 2.4, z, color: 0xb00000, intensity: 0.62, distance: 9, decay: 2, ...extra };
}

test('the lamp pool keeps a constant light count no matter how many floors are lit', async () => {
  const { LIGHT_POOL_SIZE, selectPoolLights } = await loadHotel();
  const candidates = [];
  for (let floor = 1; floor <= 4; floor += 1) for (let z = -32; z <= 32; z += 8) candidates.push(lamp(floor, 0, z));

  const oneFloor = selectPoolLights(candidates, { floors: [2], origin: { x: 0, y: 4.6, z: 0 }, poolSize: LIGHT_POOL_SIZE });
  const stairwell = selectPoolLights(candidates, { floors: [1, 2], origin: { x: 0, y: 2.3, z: 0 }, poolSize: LIGHT_POOL_SIZE });

  assert.equal(oneFloor.length, LIGHT_POOL_SIZE);
  assert.ok(stairwell.length <= LIGHT_POOL_SIZE);
  // Two floors lit used to mean twice the lights in the pass — the stairwell shader recompile.
  assert.equal(stairwell.length, oneFloor.length);
});

test('the pool takes the nearest lamps and only from the lit floors', async () => {
  const candidates = [lamp(1, 0, 30), lamp(1, 0, 2), lamp(1, 0, -12), lamp(3, 0, 0)];
  const { selectPoolLights } = await loadHotel();

  const picked = selectPoolLights(candidates, { floors: [1], origin: { x: 0, y: 0, z: 0 }, poolSize: 2 });

  assert.equal(picked.length, 2);
  assert.deepEqual(picked.map((entry) => entry.z), [2, -12]);
  assert.ok(picked.every((entry) => entry.floor === 1));
});

test('a lit floor with fewer lamps than the pool still returns a short list', async () => {
  const { selectPoolLights } = await loadHotel();

  const picked = selectPoolLights([lamp(1, 0, 0)], { floors: [1], origin: { x: 0, y: 0, z: 0 }, poolSize: 8 });

  // The caller answers this by parking the spare slots at zero intensity: the slot still exists, so
  // the light count — and therefore the compiled program — is unchanged.
  assert.equal(picked.length, 1);
});
