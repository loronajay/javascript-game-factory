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
