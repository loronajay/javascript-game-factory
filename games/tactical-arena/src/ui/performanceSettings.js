export const PERFORMANCE_MODE_STORAGE_KEY = "tactical-arena.performance-mode";
export const DEFAULT_PERFORMANCE_MODE = "full";

export function normalizePerformanceMode(mode) {
  return mode === "balanced" ? "balanced" : DEFAULT_PERFORMANCE_MODE;
}

function mediaMatches(windowRef, query) {
  try {
    return Boolean(windowRef?.matchMedia?.(query)?.matches);
  } catch {
    return false;
  }
}

export function shouldUseReducedMotionPresentation({ windowRef = globalThis.window } = {}) {
  return mediaMatches(windowRef, "(prefers-reduced-motion: reduce)");
}

export function shouldUseLowCostBoardPresentation({
  root = globalThis.document?.documentElement,
  windowRef = globalThis.window,
} = {}) {
  return (
    normalizePerformanceMode(root?.dataset?.performance) === "balanced" ||
    shouldUseReducedMotionPresentation({ windowRef }) ||
    mediaMatches(windowRef, "(pointer: coarse)")
  );
}

export function applyPerformanceMode(mode, root = globalThis.document?.documentElement) {
  const normalized = normalizePerformanceMode(mode);
  if (root?.dataset) root.dataset.performance = normalized;
  return normalized;
}

export function loadPerformanceMode(storage = globalThis.localStorage) {
  try {
    return normalizePerformanceMode(storage?.getItem(PERFORMANCE_MODE_STORAGE_KEY));
  } catch {
    return DEFAULT_PERFORMANCE_MODE;
  }
}

export function savePerformanceMode(mode, storage = globalThis.localStorage) {
  const normalized = normalizePerformanceMode(mode);
  try {
    storage?.setItem(PERFORMANCE_MODE_STORAGE_KEY, normalized);
  } catch {
    // Storage is optional; the mode still applies for the current session.
  }
  return normalized;
}
