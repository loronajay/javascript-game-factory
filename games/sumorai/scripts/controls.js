// Key binding profiles. All values are KeyboardEvent.code strings.
// LOCAL_2P: two players sharing one keyboard (tight clusters, one on each side).
// SOLO: single player when no keyboard sharing is needed (more comfortable layout).

const LOCAL_2P_BINDINGS = {
  p1: {
    left:       'KeyA',
    right:      'KeyD',
    up:         'KeyW',
    down:       'KeyS',
    attack:     'KeyC',
    dash:       'KeyV',
    projectile: 'KeyB',
  },
  p2: {
    left:       'KeyM',        // M
    right:      'Period',      // .
    up:         'KeyK',        // K
    down:       'Comma',       // ,
    attack:     'ArrowLeft',
    dash:       'ArrowDown',
    projectile: 'ArrowRight',
  },
};

// Solo / online default — comfortable single-player layout.
// Player controls the left fighter; right fighter is CPU or remote.
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

// Returns a deep copy of the given profile so callers can mutate for remapping.
function getBindings(profile) {
  return JSON.parse(JSON.stringify(profile));
}

export { LOCAL_2P_BINDINGS, SOLO_BINDINGS, getBindings };
