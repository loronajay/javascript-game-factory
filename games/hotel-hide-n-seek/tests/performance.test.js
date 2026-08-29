const test = require('node:test');
const assert = require('node:assert/strict');

const { createChangeTracker, createIntervalGate, createInvalidatedCache } = require('../modules/performance.js');

test('change tracking skips repeated expensive render work', () => {
  const changed = createChangeTracker();

  assert.equal(changed('2'), true);
  assert.equal(changed('2'), false);
  assert.equal(changed('↑ 3'), true);
  assert.equal(changed('↑ 3'), false);
});

test('interaction work is capped to a fixed interval', () => {
  const shouldRun = createIntervalGate(0.08);

  assert.equal(shouldRun(0), true);
  assert.equal(shouldRun(0.04), false);
  assert.equal(shouldRun(0.079), false);
  assert.equal(shouldRun(0.08), true);
});

test('dynamic collider bounds are reused until the door moves', () => {
  let computations = 0;
  const cache = createInvalidatedCache(() => ({ revision: ++computations }));

  assert.deepEqual(cache.get(), { revision: 1 });
  assert.deepEqual(cache.get(), { revision: 1 });
  assert.equal(computations, 1);

  cache.invalidate();
  assert.deepEqual(cache.get(), { revision: 2 });
  assert.equal(computations, 2);
});
