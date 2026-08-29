const test = require('node:test');
const assert = require('node:assert/strict');

const { createAdaptiveQualityController, createChangeTracker, createFixedTimestep, createIntervalGate, createInvalidatedCache } = require('../modules/performance.js');

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

test('adaptive quality lowers render scale after sustained slow frames and recovers gradually', () => {
  const quality = createAdaptiveQualityController({ initialScale: 1, minScale: 0.7, sampleWindow: 4 });

  assert.equal(quality.sample(34), null);
  quality.sample(34);
  quality.sample(34);
  assert.equal(quality.sample(34), 0.9);
  assert.equal(quality.getScale(), 0.9);

  quality.sample(14);
  quality.sample(14);
  quality.sample(14);
  assert.equal(quality.sample(14), 0.95);
});

test('simulation advances in whole 60hz ticks regardless of the display refresh rate', () => {
  const sixty = createFixedTimestep();
  const oneFortyFour = createFixedTimestep();

  let sixtyTicks = 0;
  for (let frame = 0; frame < 60; frame += 1) sixtyTicks += sixty.advance(1 / 60);
  let fastTicks = 0;
  for (let frame = 0; frame < 144; frame += 1) fastTicks += oneFortyFour.advance(1 / 144);

  assert.equal(sixtyTicks, 60);
  assert.equal(fastTicks, 60);
  assert.equal(sixty.step, 1 / 60);
});

test('a 30hz display still simulates 60 ticks a second, two per frame', () => {
  const timestep = createFixedTimestep();

  let ticks = 0;
  for (let frame = 0; frame < 30; frame += 1) ticks += timestep.advance(1 / 30);

  assert.equal(ticks, 60);
  assert.ok(Math.abs(timestep.getElapsed() - 1) < 1e-9);
});

test('a long stall is capped and its remainder dropped instead of spiralling', () => {
  const timestep = createFixedTimestep({ maxTicksPerFrame: 5 });

  assert.equal(timestep.advance(4), 5);
  assert.equal(timestep.getAlpha(), 0);
  assert.equal(timestep.advance(1 / 60), 1);
});

test('leftover time is carried into the next frame rather than lost', () => {
  const timestep = createFixedTimestep();

  assert.equal(timestep.advance(1 / 100), 0);
  assert.equal(timestep.advance(1 / 100), 1);
  assert.ok(timestep.getAlpha() > 0 && timestep.getAlpha() < 1);
});

test('a negative or broken frame delta cannot rewind the simulation', () => {
  const timestep = createFixedTimestep();

  assert.equal(timestep.advance(-5), 0);
  assert.equal(timestep.advance(NaN), 0);
  assert.equal(timestep.getElapsed(), 0);
});
