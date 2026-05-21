// Key binding profiles. All values are KeyboardEvent.code strings.
// LOCAL_2P: two players sharing one keyboard (tight clusters, one on each side).
// SOLO: single player when no keyboard sharing is needed (more comfortable layout).
// Configured bindings are persisted in localStorage and loaded at boot.

const DEFAULT_P1 = {
  left:       'KeyA',
  right:      'KeyD',
  up:         'KeyW',
  down:       'KeyS',
  attack:     'KeyC',
  dash:       'KeyV',
  projectile: 'KeyB',
};

const DEFAULT_P2 = {
  left:       'KeyM',
  right:      'Period',
  up:         'KeyK',
  down:       'Comma',
  attack:     'ArrowLeft',
  dash:       'ArrowDown',
  projectile: 'ArrowRight',
};

const LOCAL_2P_BINDINGS = { p1: { ...DEFAULT_P1 }, p2: { ...DEFAULT_P2 } };

const SOLO_BINDINGS = {
  p1: {
    left:       'KeyA',
    right:      'KeyD',
    up:         'KeyW',
    down:       'KeyS',
    attack:     'KeyJ',
    dash:       'KeyK',
    projectile: 'KeyL',
  },
};

const ACTIONS = ['left', 'right', 'up', 'down', 'attack', 'dash', 'projectile'];

const ACTION_LABELS = {
  left:       'Move Left',
  right:      'Move Right',
  up:         'Jump',
  down:       'Down',
  attack:     'Attack',
  dash:       'Dash',
  projectile: 'Throw',
};

const STORAGE_KEY_P1 = 'sumorai.controls.p1';
const STORAGE_KEY_P2 = 'sumorai.controls.p2';

function formatKeyCode(code) {
  if (code === 'ArrowLeft')    return '←';
  if (code === 'ArrowRight')   return '→';
  if (code === 'ArrowUp')      return '↑';
  if (code === 'ArrowDown')    return '↓';
  if (code === 'Space')        return 'Space';
  if (code === 'Period')       return '.';
  if (code === 'Comma')        return ',';
  if (code === 'Semicolon')    return ';';
  if (code === 'BracketLeft')  return '[';
  if (code === 'BracketRight') return ']';
  if (code === 'Backquote')    return '`';
  if (code === 'Slash')        return '/';
  if (code === 'Backslash')    return '\\';
  if (code === 'Minus')        return '-';
  if (code === 'Equal')        return '=';
  if (code === 'Quote')        return "'";
  if (code.startsWith('Key'))   return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

function _parseStoredBindings(json, defaults) {
  try {
    const obj = JSON.parse(json);
    if (!obj || typeof obj !== 'object') return { ...defaults };
    const result = { ...defaults };
    for (const action of ACTIONS) {
      if (typeof obj[action] === 'string' && obj[action].length > 0) {
        result[action] = obj[action];
      }
    }
    return result;
  } catch {
    return { ...defaults };
  }
}

function loadBindings() {
  const p1Raw = localStorage.getItem(STORAGE_KEY_P1);
  const p2Raw = localStorage.getItem(STORAGE_KEY_P2);
  return {
    p1: p1Raw ? _parseStoredBindings(p1Raw, DEFAULT_P1) : { ...DEFAULT_P1 },
    p2: p2Raw ? _parseStoredBindings(p2Raw, DEFAULT_P2) : { ...DEFAULT_P2 },
  };
}

function saveBindings(p1, p2) {
  try {
    localStorage.setItem(STORAGE_KEY_P1, JSON.stringify(p1));
    localStorage.setItem(STORAGE_KEY_P2, JSON.stringify(p2));
  } catch { /* storage unavailable */ }
}

function getBindings(profile) {
  return JSON.parse(JSON.stringify(profile));
}

export {
  LOCAL_2P_BINDINGS,
  SOLO_BINDINGS,
  ACTIONS,
  ACTION_LABELS,
  DEFAULT_P1,
  DEFAULT_P2,
  formatKeyCode,
  loadBindings,
  saveBindings,
  getBindings,
};
