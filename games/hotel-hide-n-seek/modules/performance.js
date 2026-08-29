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

  return { createChangeTracker, createIntervalGate, createInvalidatedCache };
});
