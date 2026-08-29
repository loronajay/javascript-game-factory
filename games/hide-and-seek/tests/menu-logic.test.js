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

test('play leaves the menu and hides the overlay', () => {
  const state = menu.nextMenuState(menu.createMenuState(), ACTIONS.PLAY);
  assert.equal(state.screen, SCREENS.PLAYING);
  assert.equal(menu.isPlaying(state.screen), true);
  assert.equal(menu.isOverlayVisible(state.screen), false);
});

test('how-to and extras return to whichever screen opened them', () => {
  const fromTitle = walk(menu.createMenuState(), [ACTIONS.HOW_TO]);
  assert.equal(fromTitle.screen, SCREENS.HOW_TO);
  assert.equal(menu.nextMenuState(fromTitle, ACTIONS.BACK).screen, SCREENS.TITLE);

  const fromPause = walk(menu.createMenuState(), [ACTIONS.PLAY, ACTIONS.PAUSE, ACTIONS.HOW_TO]);
  assert.equal(fromPause.screen, SCREENS.HOW_TO);
  assert.equal(menu.nextMenuState(fromPause, ACTIONS.BACK).screen, SCREENS.PAUSE);

  const extras = walk(menu.createMenuState(), [ACTIONS.EXTRAS]);
  assert.equal(extras.screen, SCREENS.EXTRAS);
  assert.equal(menu.nextMenuState(extras, ACTIONS.BACK).screen, SCREENS.TITLE);
});

test('pause suspends play and resume returns to it', () => {
  const paused = walk(menu.createMenuState(), [ACTIONS.PLAY, ACTIONS.PAUSE]);
  assert.equal(paused.screen, SCREENS.PAUSE);
  assert.equal(menu.isPlaying(paused.screen), false);
  assert.equal(menu.isOverlayVisible(paused.screen), true);
  assert.equal(menu.nextMenuState(paused, ACTIONS.RESUME).screen, SCREENS.PLAYING);
});

test('being caught takes over from play and cannot be paused away', () => {
  const caught = walk(menu.createMenuState(), [ACTIONS.PLAY, ACTIONS.CAUGHT]);
  assert.equal(caught.screen, SCREENS.CAUGHT);
  assert.equal(menu.isPlaying(caught.screen), false);
  // The caught screen owns the whole viewport; the menu overlay must not stack on top of it.
  assert.equal(menu.isOverlayVisible(caught.screen), false);
  assert.equal(menu.nextMenuState(caught, ACTIONS.PAUSE).screen, SCREENS.CAUGHT);
  assert.equal(menu.nextMenuState(caught, ACTIONS.RESUME).screen, SCREENS.CAUGHT);
});

test('quitting asks the host to restart rather than pretending the world reset', () => {
  const paused = walk(menu.createMenuState(), [ACTIONS.PLAY, ACTIONS.PAUSE]);
  const quit = menu.nextMenuState(paused, ACTIONS.QUIT);
  assert.equal(quit.effect, 'quit');

  const caught = walk(menu.createMenuState(), [ACTIONS.PLAY, ACTIONS.CAUGHT]);
  assert.equal(menu.nextMenuState(caught, ACTIONS.QUIT).effect, 'quit');
  // Nothing else produces an effect.
  assert.equal(menu.nextMenuState(menu.createMenuState(), ACTIONS.PLAY).effect, null);
});

test('unknown and out-of-context actions leave the state untouched', () => {
  const title = menu.createMenuState();
  assert.equal(menu.nextMenuState(title, ACTIONS.RESUME).screen, SCREENS.TITLE);
  assert.equal(menu.nextMenuState(title, ACTIONS.PAUSE).screen, SCREENS.TITLE);
  assert.equal(menu.nextMenuState(title, 'nonsense').screen, SCREENS.TITLE);
  const playing = menu.nextMenuState(title, ACTIONS.PLAY);
  assert.equal(menu.nextMenuState(playing, ACTIONS.PLAY).screen, SCREENS.PLAYING);
});

test('every screen is addressable and the action list is frozen', () => {
  assert.ok(Object.isFrozen(SCREENS));
  assert.ok(Object.isFrozen(ACTIONS));
  for (const screen of Object.values(SCREENS)) assert.equal(typeof screen, 'string');
});
