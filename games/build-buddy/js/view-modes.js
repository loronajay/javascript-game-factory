// Runner and Builder are the online role views. Shared is the local co-op
// view: one screen, both HUDs, the Runner on the keys and the Builder on the mouse.
export const VIEW_MODES = Object.freeze({
  RUNNER: 'runner',
  BUILDER: 'builder',
  SHARED: 'shared',
});

export function normalizeViewMode(value) {
  if (value === VIEW_MODES.RUNNER || value === VIEW_MODES.BUILDER || value === VIEW_MODES.SHARED) return value;
  return VIEW_MODES.SHARED;
}

export function viewModeConfig(viewMode) {
  const mode = normalizeViewMode(viewMode);
  return {
    mode,
    showRunnerHud: mode === VIEW_MODES.RUNNER || mode === VIEW_MODES.SHARED,
    showBuilderHud: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.SHARED,
    showToolStrip: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.SHARED,
    showBuilderZones: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.SHARED,
    showSafetyZone: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.SHARED,
    showGhost: true,
    showPlacementGrid: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.SHARED,
    showRunner: true,
  };
}
