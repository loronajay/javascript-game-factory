const test = require('node:test');
const assert = require('node:assert/strict');

const flashlight = require('../flashlight-logic.js');

test('flashlights start off and toggle immutably', () => {
  const initial = flashlight.createFlashlightState();
  const on = flashlight.toggleFlashlight(initial);

  assert.deepEqual(initial, { on: false, charge: 1 });
  assert.deepEqual(on, { on: true, charge: 1 });
  assert.deepEqual(flashlight.toggleFlashlight(on), { on: false, charge: 1 });
});

test('the flashlight has a compact snapshot suitable for a player network pose', () => {
  const state = flashlight.setFlashlight(flashlight.createFlashlightState(), true);

  assert.deepEqual(flashlight.describeFlashlight(state), { on: true, charge: 1 });
  assert.deepEqual(Object.keys(flashlight.describeFlashlight(state)), ['on', 'charge']);
});

test('charge drains slowly only while the flashlight is on and shuts it off at zero', () => {
  const on = flashlight.setFlashlight(flashlight.createFlashlightState(true), true);
  const half = flashlight.tickFlashlight(on, 150, { drainSeconds: 300 });
  const empty = flashlight.tickFlashlight(half, 150, { drainSeconds: 300 });

  assert.deepEqual(half, { on: true, charge: 0.5 });
  assert.deepEqual(empty, { on: false, charge: 0 });
  assert.deepEqual(flashlight.tickFlashlight(empty, 30, { drainSeconds: 300 }), empty);
  assert.equal(flashlight.setFlashlight(empty, true).on, false, 'an empty light cannot be switched back on');
});

test('leftover charge adds directly and caps at a full battery', () => {
  const almostEmpty = flashlight.createFlashlightState(false, 0.01);

  assert.deepEqual(flashlight.addFlashlightCharge(almostEmpty, 0.4), { on: false, charge: 0.41 });
  assert.deepEqual(flashlight.addFlashlightCharge(almostEmpty, 2), { on: false, charge: 1 });
  assert.deepEqual(flashlight.createFlashlightDrop({ on: true, charge: 0.4 }), { charge: 0.4 });
});
