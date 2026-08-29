(function attachHotelMenu(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelMenu = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelMenuApi() {
  'use strict';

  // The demo's front end is a state machine rather than a single click-to-enter curtain, because the
  // same screens have to serve two entry points: a cold start at the title and a mid-round pause. It
  // is pure so `PLAYING` can be the one place the rest of the game asks "is the simulation running?".
  const SCREENS = Object.freeze({
    TITLE: 'title',
    HOW_TO: 'howTo',
    EXTRAS: 'extras',
    PAUSE: 'pause',
    PLAYING: 'playing',
    CAUGHT: 'caught',
  });

  const ACTIONS = Object.freeze({
    PLAY: 'play',
    HOW_TO: 'howTo',
    EXTRAS: 'extras',
    BACK: 'back',
    PAUSE: 'pause',
    RESUME: 'resume',
    QUIT: 'quit',
    CAUGHT: 'caught',
  });

  // How-to and extras are reached from both the title and the pause menu, so BACK has to remember
  // where it came from instead of always landing on the title.
  const READABLE = Object.freeze([SCREENS.HOW_TO, SCREENS.EXTRAS]);

  function createMenuState() {
    return { screen: SCREENS.TITLE, back: null, effect: null };
  }

  function isPlaying(screen) {
    return screen === SCREENS.PLAYING;
  }

  // The caught screen is its own full-viewport overlay; stacking the menu on top of it would bury
  // the restart button.
  function isOverlayVisible(screen) {
    return screen !== SCREENS.PLAYING && screen !== SCREENS.CAUGHT;
  }

  function goto(screen, back = null) {
    return { screen, back, effect: null };
  }

  function nextMenuState(state, action) {
    const current = state || createMenuState();
    const stay = { ...current, effect: null };
    if (action === ACTIONS.CAUGHT) return isPlaying(current.screen) ? goto(SCREENS.CAUGHT) : stay;
    // Quitting cannot be modelled as a transition: the hotel, the demon and the key ring are all
    // still standing, so the host has to rebuild the session. The machine only reports the intent.
    if (action === ACTIONS.QUIT) return current.screen === SCREENS.PAUSE || current.screen === SCREENS.CAUGHT ? { ...stay, effect: 'quit' } : stay;
    if (READABLE.includes(current.screen)) return action === ACTIONS.BACK ? goto(current.back || SCREENS.TITLE) : stay;
    if (action === ACTIONS.HOW_TO) return goto(SCREENS.HOW_TO, current.screen);
    if (action === ACTIONS.EXTRAS) return goto(SCREENS.EXTRAS, current.screen);
    if (current.screen === SCREENS.TITLE) return action === ACTIONS.PLAY ? goto(SCREENS.PLAYING) : stay;
    if (current.screen === SCREENS.PLAYING) return action === ACTIONS.PAUSE ? goto(SCREENS.PAUSE) : stay;
    if (current.screen === SCREENS.PAUSE) return action === ACTIONS.RESUME ? goto(SCREENS.PLAYING) : stay;
    return stay;
  }

  return { ACTIONS, SCREENS, createMenuState, isOverlayVisible, isPlaying, nextMenuState };
});
