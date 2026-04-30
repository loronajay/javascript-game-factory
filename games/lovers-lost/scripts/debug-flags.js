const DEBUG_OBSTACLE_ALIASES = {
  spike:      'spikes',
  spikes:     'spikes',
  bird:       'bird',
  birds:      'bird',
  arrow:      'arrowwall',
  arrows:     'arrowwall',
  arrowwall:  'arrowwall',
  arrowwalls: 'arrowwall',
  goblin:     'goblin',
  goblins:    'goblin',
};

const DEBUG_OBSTACLE_LABELS = {
  spikes:    'spikes',
  bird:      'birds',
  arrowwall: 'arrows',
  goblin:    'goblins',
};

function normalizeDebugObstacleType(value) {
  if (typeof value !== 'string') return null;
  return DEBUG_OBSTACLE_ALIASES[value.trim().toLowerCase()] || null;
}

function debugEnabledFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const value = params.get('debug');
  return value === '1' || value === 'true';
}

function debugObstacleTypeFromSearch(search) {
  const params = new URLSearchParams(search || '');
  const value = params.get('debugObstacle') || params.get('practice') || params.get('practiceObstacle');
  return normalizeDebugObstacleType(value);
}

function toggleDebugHotkey(enabled, key) {
  if (key !== 'F3') return { handled: false, enabled };
  return { handled: true, enabled: !enabled };
}

export {
  DEBUG_OBSTACLE_ALIASES,
  DEBUG_OBSTACLE_LABELS,
  normalizeDebugObstacleType,
  debugEnabledFromSearch,
  debugObstacleTypeFromSearch,
  toggleDebugHotkey,
};
