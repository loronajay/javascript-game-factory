export const ACCURACY_FORECAST_STORAGE_KEY = "tactical-arena.accuracy-forecast";

export function normalizeAccuracyForecastEnabled(value) {
  return value === "off" || value === false ? false : true;
}

export function loadAccuracyForecastEnabled(storage = globalThis.localStorage) {
  try {
    return normalizeAccuracyForecastEnabled(storage?.getItem(ACCURACY_FORECAST_STORAGE_KEY));
  } catch {
    return true;
  }
}

export function saveAccuracyForecastEnabled(enabled, storage = globalThis.localStorage) {
  const normalized = normalizeAccuracyForecastEnabled(enabled);
  try {
    storage?.setItem(ACCURACY_FORECAST_STORAGE_KEY, normalized ? "on" : "off");
  } catch {
    // Storage is optional; the toggle still applies for the current session.
  }
  return normalized;
}

