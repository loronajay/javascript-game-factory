(function attachPerformance(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelPerformance = api;
})(typeof window !== 'undefined' ? window : globalThis, function createPerformanceApi() {
  'use strict';

  function createChangeTracker() {
    let previous = Symbol('unset');
    return (value) => {
      if (Object.is(value, previous)) return false;
      previous = value;
      return true;
    };
  }

  function createIntervalGate(intervalSeconds) {
    let nextRun = -Infinity;
    return (elapsedSeconds) => {
      if (elapsedSeconds < nextRun) return false;
      nextRun = elapsedSeconds + intervalSeconds;
      return true;
    };
  }

  function createInvalidatedCache(compute) {
    let valid = false;
    let value;
    return {
      get() {
        if (!valid) { value = compute(); valid = true; }
        return value;
      },
      invalidate() { valid = false; },
    };
  }

  // A fixed-timestep accumulator. requestAnimationFrame fires at display rate, so tying gameplay to
  // it makes a 144hz machine run a different game from a 60hz one — and makes server-authoritative
  // sync impossible. Simulation advances in whole ticks; rendering still happens once per frame.
  function createFixedTimestep({ tickRate = 60, maxTicksPerFrame = 5, maxFrameDelta = 0.25 } = {}) {
    const step = 1 / tickRate;
    let accumulator = 0;
    let simulatedTime = 0;
    let ticks = 0;
    return {
      step,
      // Returns how many whole ticks this frame owes. A long stall (tab restored, GC pause) is
      // capped and the remainder dropped rather than replayed, which is what stops a spiral of death.
      advance(frameDelta) {
        const delta = Math.max(0, Math.min(Number.isFinite(frameDelta) ? frameDelta : 0, maxFrameDelta));
        accumulator += delta;
        // The epsilon matters: 60 frames of exactly 1/60s otherwise accumulate to a hair under one
        // second in binary floating point and the second lands a tick short.
        let due = Math.floor((accumulator + step * 1e-6) / step);
        if (due > maxTicksPerFrame) { due = maxTicksPerFrame; accumulator = 0; }
        else accumulator = Math.max(0, accumulator - due * step);
        ticks += due;
        simulatedTime = ticks * step;
        return due;
      },
      // Fraction of a tick already accumulated, for render-side interpolation when we need it.
      getAlpha() { return accumulator / step; },
      getElapsed() { return simulatedTime; },
      getTicks() { return ticks; },
    };
  }

  function createAdaptiveQualityController({ initialScale = 1, minScale = 0.7, sampleWindow = 45 } = {}) {
    let scale = initialScale;
    let total = 0;
    let samples = 0;
    return {
      sample(frameMs) {
        total += frameMs;
        samples += 1;
        if (samples < sampleWindow) return null;
        const average = total / samples;
        total = 0;
        samples = 0;
        const next = average > 28 ? Math.max(minScale, scale - 0.1) : average < 18 ? Math.min(initialScale, scale + 0.05) : scale;
        if (next === scale) return null;
        scale = Math.round(next * 100) / 100;
        return scale;
      },
      getScale() { return scale; },
    };
  }

  return { createAdaptiveQualityController, createChangeTracker, createFixedTimestep, createIntervalGate, createInvalidatedCache };
});
