const test = require('node:test');
const assert = require('node:assert/strict');

const menu = require('../menu-logic.js');
const { SCREENS, ACTIONS } = menu;

function walk(state, actions) {
  return actions.reduce((current, action) => menu.nextMenuState(current, action), state);
}

test('a session opens on the title screen with the overlay up and the sim paused', () => {
  const state = menu.createMenuState();
  assert.equal(state.screen, SCREENS.TITLE);
  assert.equal(menu.isOverlayVisible(state.screen), true);
  assert.equal(menu.isPlaying(state.screen), false);
});

test('single player opens match setup before a round can begin', () => {
  const setup = menu.nextMenuState(menu.createMenuState(), ACTIONS.SINGLE_PLAYER);
  assert.equal(setup.screen, SCREENS.SOLO_SETUP);
  assert.equal(menu.isPlaying(setup.screen), false);
  assert.equal(menu.nextMenuState(setup, ACTIONS.BACK).screen, SCREENS.TITLE);

  const state = menu.nextMenuState(setup, ACTIONS.PLAY);
  assert.equal(state.screen, SCREENS.PLAYING);
  assert.equal(menu.isPlaying(state.screen), true);
  assert.equal(menu.isOverlayVisible(state.screen), false);
});

test('single-player match options are clamped to supported values', () => {
  const HOTEL = { mapId: 'grand-hotel' };
  assert.deepEqual(menu.normalizeMatchConfig(), menu.MATCH_DEFAULTS);
  assert.deepEqual(menu.normalizeMatchConfig({ hiderCount: 0, hideSeconds: 8, role: 'hider' }), { ...HOTEL, hiderCount: 1, hideSeconds: 45, role: 'hider' });
  assert.deepEqual(menu.normalizeMatchConfig({ hiderCount: 99, hideSeconds: 999, role: 'ghost' }), { ...HOTEL, hiderCount: 8, hideSeconds: 120, role: 'seeker' });
  assert.deepEqual(menu.normalizeMatchConfig({ hiderCount: '6', hideSeconds: '60', role: 'seeker' }), { ...HOTEL, hiderCount: 6, hideSeconds: 60, role: 'seeker' });
  assert.ok(Object.isFrozen(menu.MATCH_DEFAULTS));
  assert.ok(Object.isFrozen(menu.MATCH_LIMITS));
});

test('the match carries which building it is in, and an unknown one is not a location', () => {
  // Loaded for its side effect: the pure layer is classic scripts, so the catalog is a global by
  // the time a menu can be touched. Without it the menu still answers with the default map.
  require('../map-catalog.js');
  assert.equal(menu.normalizeMatchConfig({ mapId: 'cinder-mall' }).mapId, 'cinder-mall');
  assert.equal(menu.normalizeMatchConfig({ mapId: 'atlantis' }).mapId, 'grand-hotel');
  assert.equal(menu.normalizeMatchConfig({}).mapId, 'grand-hotel');
});

test('how-to and extras return to whichever screen opened them', () => {
  const fromTitle = walk(menu.createMenuState(), [ACTIONS.HOW_TO]);
  assert.equal(fromTitle.screen, SCREENS.HOW_TO);
  assert.equal(menu.nextMenuState(fromTitle, ACTIONS.BACK).screen, SCREENS.TITLE);

  const fromPause = walk(menu.createMenuState(), [ACTIONS.SINGLE_PLAYER, ACTIONS.PLAY, ACTIONS.PAUSE, ACTIONS.HOW_TO]);
  assert.equal(fromPause.screen, SCREENS.HOW_TO);
  assert.equal(menu.nextMenuState(fromPause, ACTIONS.BACK).screen, SCREENS.PAUSE);

  const extras = walk(menu.createMenuState(), [ACTIONS.EXTRAS]);
  assert.equal(extras.screen, SCREENS.EXTRAS);
  assert.equal(menu.nextMenuState(extras, ACTIONS.BACK).screen, SCREENS.TITLE);
});

test('pause suspends play and resume returns to it', () => {
  const paused = walk(menu.createMenuState(), [ACTIONS.SINGLE_PLAYER, ACTIONS.PLAY, ACTIONS.PAUSE]);
  assert.equal(paused.screen, SCREENS.PAUSE);
  assert.equal(menu.isPlaying(paused.screen), false);
  assert.equal(menu.isOverlayVisible(paused.screen), true);
  assert.equal(menu.nextMenuState(paused, ACTIONS.RESUME).screen, SCREENS.PLAYING);
});

test('an online match rejects pause without leaving play', () => {
  const playing = walk(menu.createMenuState(), [ACTIONS.ONLINE, ACTIONS.PLAY]);
  const stillPlaying = menu.nextMenuState(playing, ACTIONS.PAUSE, { allowPause: false });

  assert.equal(stillPlaying.screen, SCREENS.PLAYING);
  assert.equal(menu.isPlaying(stillPlaying.screen), true);
  assert.equal(menu.isOverlayVisible(stillPlaying.screen), false);
});

test('being caught takes over from play and cannot be paused away', () => {
  const caught = walk(menu.createMenuState(), [ACTIONS.SINGLE_PLAYER, ACTIONS.PLAY, ACTIONS.CAUGHT]);
  assert.equal(caught.screen, SCREENS.CAUGHT);
  assert.equal(menu.isPlaying(caught.screen), false);
  // The caught screen owns the whole viewport; the menu overlay must not stack on top of it.
  assert.equal(menu.isOverlayVisible(caught.screen), false);
  assert.equal(menu.nextMenuState(caught, ACTIONS.PAUSE).screen, SCREENS.CAUGHT);
  assert.equal(menu.nextMenuState(caught, ACTIONS.RESUME).screen, SCREENS.CAUGHT);
});

test('quitting asks the host to restart rather than pretending the world reset', () => {
  const paused = walk(menu.createMenuState(), [ACTIONS.SINGLE_PLAYER, ACTIONS.PLAY, ACTIONS.PAUSE]);
  const quit = menu.nextMenuState(paused, ACTIONS.QUIT);
  assert.equal(quit.effect, 'quit');

  const caught = walk(menu.createMenuState(), [ACTIONS.SINGLE_PLAYER, ACTIONS.PLAY, ACTIONS.CAUGHT]);
  assert.equal(menu.nextMenuState(caught, ACTIONS.QUIT).effect, 'quit');
  // Nothing else produces an effect.
  assert.equal(menu.nextMenuState(menu.createMenuState(), ACTIONS.SINGLE_PLAYER).effect, null);
});

test('unknown and out-of-context actions leave the state untouched', () => {
  const title = menu.createMenuState();
  assert.equal(menu.nextMenuState(title, ACTIONS.RESUME).screen, SCREENS.TITLE);
  assert.equal(menu.nextMenuState(title, ACTIONS.PAUSE).screen, SCREENS.TITLE);
  assert.equal(menu.nextMenuState(title, 'nonsense').screen, SCREENS.TITLE);
  const playing = walk(title, [ACTIONS.SINGLE_PLAYER, ACTIONS.PLAY]);
  assert.equal(menu.nextMenuState(playing, ACTIONS.PLAY).screen, SCREENS.PLAYING);
});

test('every screen is addressable and the action list is frozen', () => {
  assert.ok(Object.isFrozen(SCREENS));
  assert.ok(Object.isFrozen(ACTIONS));
  for (const screen of Object.values(SCREENS)) assert.equal(typeof screen, 'string');
});

test('the online lobby is a waiting room the server ends, not a button', () => {
  const title = menu.createMenuState();
  const lobby = menu.nextMenuState(title, menu.ACTIONS.ONLINE);

  assert.equal(lobby.screen, menu.SCREENS.ONLINE);
  assert.equal(menu.isOverlayVisible(lobby.screen), true);
  // Waiting in the lobby is not playing: nothing simulates behind it.
  assert.equal(menu.isPlaying(lobby.screen), false);
  assert.equal(menu.nextMenuState(lobby, menu.ACTIONS.BACK).screen, menu.SCREENS.TITLE);
  assert.equal(menu.nextMenuState(lobby, menu.ACTIONS.PLAY).screen, menu.SCREENS.PLAYING);
});

test('the online lobby remembers where it was opened from', () => {
  const paused = { screen: menu.SCREENS.PAUSE, back: null, effect: null };
  const lobby = menu.nextMenuState(paused, menu.ACTIONS.ONLINE);

  assert.equal(menu.nextMenuState(lobby, menu.ACTIONS.BACK).screen, menu.SCREENS.PAUSE);
});
