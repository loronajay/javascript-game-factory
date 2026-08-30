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

// Online the snapshot answering a press is a round trip old. Mirroring it straight back over the
// local light stomps the toggle before the input carrying it has even been sent, which is why F
// only worked occasionally in a real match.
test('a pending toggle survives the snapshots that have not seen it yet', () => {
  const intent = flashlight.createFlashlightIntent(true, 1000);
  const first = flashlight.reconcileFlashlight({ on: false, charge: 0.8 }, intent, 1010);
  assert.equal(first.state.on, true, 'the press must not be undone by a snapshot taken before it');
  assert.equal(first.state.charge, 0.8, 'the charge is always the authority\'s');
  assert.equal(first.intent, intent);

  const settled = flashlight.reconcileFlashlight({ on: true, charge: 0.79 }, first.intent, 1120);
  assert.equal(settled.state.on, true);
  assert.equal(settled.intent, null, 'the intent is released once the server agrees');
});

test('the authority still wins: a refusal, and a stuck intent that times out', () => {
  const dead = flashlight.createFlashlightIntent(true, 0);
  const refused = flashlight.reconcileFlashlight({ on: false, charge: 0 }, dead, 10);
  assert.equal(refused.state.on, false, 'an empty battery cannot be switched on');
  assert.equal(refused.intent, null);

  const stuck = flashlight.createFlashlightIntent(true, 0);
  const held = flashlight.reconcileFlashlight({ on: false, charge: 0.5 }, stuck, 100);
  assert.equal(held.state.on, true);
  const expired = flashlight.reconcileFlashlight({ on: false, charge: 0.5 }, stuck, flashlight.INTENT_GRACE_MS);
  assert.equal(expired.state.on, false, 'a client may not ignore the server forever');
  assert.equal(expired.intent, null);
});

test('with no intent outstanding the snapshot is applied as-is', () => {
  const applied = flashlight.reconcileFlashlight({ on: true, charge: 0.42 }, null, 0);
  assert.deepEqual(applied.state, { on: true, charge: 0.42 });
  assert.equal(applied.intent, null);
});
