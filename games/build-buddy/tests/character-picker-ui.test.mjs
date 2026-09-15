import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrailingTask } from '../js/character-picker.js';
import { previewBackingSize } from '../js/character-preview.js';

test('preview backing store follows its rendered size without distorting the character', () => {
  assert.deepEqual(previewBackingSize(646, 180, 2), { width: 1292, height: 360, pixelRatio: 2 });
  assert.deepEqual(previewBackingSize(0, 0, 2), { width: 420, height: 360, pixelRatio: 2 });
});

test('rapid color input is coalesced into one trailing preview update', () => {
  let queued;
  let clears = 0;
  let draws = 0;
  const task = createTrailingTask(() => { draws += 1; }, {
    delay: 75,
    setTimer(callback, delay) { queued = { callback, delay }; return queued; },
    clearTimer(timer) { assert.equal(timer, queued); clears += 1; },
  });

  task.schedule();
  task.schedule();
  task.schedule();
  assert.equal(queued.delay, 75);
  assert.equal(clears, 2);
  assert.equal(draws, 0);
  queued.callback();
  assert.equal(draws, 1);

  task.schedule();
  task.flush();
  assert.equal(draws, 2);
});
