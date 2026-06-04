export const VIEW_MODES = Object.freeze({
  RUNNER: 'runner',
  BUILDER: 'builder',
  HYBRID: 'hybrid',
});

export function normalizeViewMode(value) {
  if (value === VIEW_MODES.RUNNER || value === VIEW_MODES.BUILDER || value === VIEW_MODES.HYBRID) return value;
  return VIEW_MODES.HYBRID;
}

export function viewModeConfig(viewMode) {
  const mode = normalizeViewMode(viewMode);
  return {
    mode,
    showRunnerHud: mode === VIEW_MODES.RUNNER || mode === VIEW_MODES.HYBRID,
    showBuilderHud: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.HYBRID,
    showToolStrip: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.HYBRID,
    showBuilderZones: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.HYBRID,
    showSafetyZone: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.HYBRID,
    showGhost: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.HYBRID,
    showPlacementGrid: mode === VIEW_MODES.BUILDER || mode === VIEW_MODES.HYBRID,
    showRunner: true,
  };
}
