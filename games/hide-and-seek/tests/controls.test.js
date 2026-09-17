const test = require('node:test');
const assert = require('node:assert/strict');

const { requestPreferredLookMode, shouldAutoStartDragLook } = require('../controls.js');

test('uses pointer lock when the browser accepts the request', async () => {
  const mode = await requestPreferredLookMode(() => Promise.resolve());
  assert.equal(mode, 'pointer-lock-requested');
});

test('falls back to drag look when pointer lock rejects', async () => {
  const mode = await requestPreferredLookMode(() => Promise.reject(new Error('unsupported')));
  assert.equal(mode, 'drag-look');
});

test('falls back to drag look when pointer lock is unavailable', async () => {
  const mode = await requestPreferredLookMode(null);
  assert.equal(mode, 'drag-look');
});

test('forced drag-look links start without requiring a browser click', () => {
  assert.equal(shouldAutoStartDragLook('?controls=drag'), true);
  assert.equal(shouldAutoStartDragLook(''), false);
});

// A press is two edges and the input is sampled once a tick. A tap shorter than a tick — a quick
// keyboard tap on a slow frame, a touch-button tap almost always — used to go down and up between two
// samples and was never in any sent frame at all. The latch holds the key down until one sample has
// seen it, then lets the release through, so every press is sent exactly once and every hold reads as
// one press.
const { createPressLatch } = require('../controls.js');

test('a press and release between two samples is still sampled once as down, then up', () => {
  const latch = createPressLatch();
  latch.press(); latch.release();
  assert.equal(latch.sample(), true, 'the press was lost');
  assert.equal(latch.sample(), false, 'the release must follow');
  assert.equal(latch.sample(), false);
});

test('a held key stays down across samples and goes up when released', () => {
  const latch = createPressLatch();
  latch.press();
  assert.equal(latch.sample(), true);
  assert.equal(latch.sample(), true);
  latch.release();
  assert.equal(latch.sample(), false);
});

test('a release and a second press between samples reads as up, then down again', () => {
  const latch = createPressLatch();
  latch.press(); latch.sample();
  latch.release(); latch.press();
  assert.equal(latch.sample(), false, 'the authority needs to see the key go up before it can go down');
  assert.equal(latch.sample(), true);
  latch.release();
  assert.equal(latch.sample(), false);
});

test('reset drops a press nothing will send', () => {
  const latch = createPressLatch();
  latch.press(); latch.reset();
  assert.equal(latch.sample(), false);
  assert.equal(latch.isDown(), false);
});
