import test from "node:test";
import assert from "node:assert/strict";

import {
  ACCURACY_FORECAST_STORAGE_KEY,
  loadAccuracyForecastEnabled,
  saveAccuracyForecastEnabled,
} from "../src/ui/forecastSettings.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("accuracy forecasts are enabled by default", () => {
  assert.equal(loadAccuracyForecastEnabled(memoryStorage()), true);
});

test("accuracy forecast preference can be persisted and restored", () => {
  const storage = memoryStorage();

  saveAccuracyForecastEnabled(false, storage);

  assert.equal(storage.getItem(ACCURACY_FORECAST_STORAGE_KEY), "off");
  assert.equal(loadAccuracyForecastEnabled(storage), false);

  saveAccuracyForecastEnabled(true, storage);

  assert.equal(storage.getItem(ACCURACY_FORECAST_STORAGE_KEY), "on");
  assert.equal(loadAccuracyForecastEnabled(storage), true);
});

