(function attachHotelMenu(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HotelMenu = api;
})(typeof window !== 'undefined' ? window : globalThis, function createHotelMenuApi(root) {
  'use strict';

  // The demo's front end is a state machine rather than a single click-to-enter curtain, because the
  // same screens have to serve two entry points: a cold start at the title and a mid-round pause. It
  // is pure so `PLAYING` can be the one place the rest of the game asks "is the simulation running?".
  const SCREENS = Object.freeze({
    TITLE: 'title',
    SOLO_SETUP: 'soloSetup',
    HOW_TO: 'howTo',
    EXTRAS: 'extras',
    ONLINE: 'online',
    PAUSE: 'pause',
    PLAYING: 'playing',
    CAUGHT: 'caught',
  });

  const ACTIONS = Object.freeze({
    SINGLE_PLAYER: 'singlePlayer',
    PLAY: 'play',
    HOW_TO: 'howTo',
    EXTRAS: 'extras',
    ONLINE: 'online',
    BACK: 'back',
    PAUSE: 'pause',
    RESUME: 'resume',
    QUIT: 'quit',
    CAUGHT: 'caught',
  });

  // How-to and extras are reached from both the title and the pause menu, so BACK has to remember
  // where it came from instead of always landing on the title. The online lobby behaves the same
  // way, except that leaving PLAYING is not its own decision: the server starts the match.
  const READABLE = Object.freeze([SCREENS.HOW_TO, SCREENS.EXTRAS, SCREENS.ONLINE]);
  const MATCH_DEFAULTS = Object.freeze({ hiderCount: 3, hideSeconds: 45, role: 'seeker', mapId: 'grand-hotel' });
  const MATCH_LIMITS = Object.freeze({ minHiders: 1, maxHiders: 8, minHideSeconds: 45, maxHideSeconds: 120 });

  function clampInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(value, 10);
    return Math.min(maximum, Math.max(minimum, Number.isFinite(parsed) ? parsed : fallback));
  }

  // Which building. The catalog is read through the global rather than imported, because the pure
  // layer is classic scripts in the browser: `map-catalog.js` is loaded ahead of this one and is a
  // global by the time a player can touch a menu. Without it the menu still works and every round
  // is in the default map, which is exactly the pre-registry behaviour.
  function normalizeMapId(id) {
    const maps = root && root.HotelMaps;
    if (maps) return maps.normalizeMapId(id);
    return typeof id === 'string' && id.trim() ? id.trim().toLowerCase() : MATCH_DEFAULTS.mapId;
  }

  function normalizeMatchConfig(options = {}) {
    return {
      mapId: normalizeMapId(options.mapId),
      hiderCount: clampInteger(options.hiderCount, MATCH_DEFAULTS.hiderCount, MATCH_LIMITS.minHiders, MATCH_LIMITS.maxHiders),
      hideSeconds: clampInteger(options.hideSeconds, MATCH_DEFAULTS.hideSeconds, MATCH_LIMITS.minHideSeconds, MATCH_LIMITS.maxHideSeconds),
      role: options.role === 'hider' ? 'hider' : 'seeker',
    };
  }

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

  function nextMenuState(state, action, { allowPause = true } = {}) {
    const current = state || createMenuState();
    const stay = { ...current, effect: null };
    if (action === ACTIONS.CAUGHT) return isPlaying(current.screen) ? goto(SCREENS.CAUGHT) : stay;
    // Quitting cannot be modelled as a transition: the hotel, the demon and the key ring are all
    // still standing, so the host has to rebuild the session. The machine only reports the intent.
    if (action === ACTIONS.QUIT) return current.screen === SCREENS.PAUSE || current.screen === SCREENS.CAUGHT ? { ...stay, effect: 'quit' } : stay;
    // The online lobby is a waiting room, and the wait ends when the server says it does — PLAY is
    // dispatched by the net layer on `lobby_started`, never by a button on this screen.
    if (current.screen === SCREENS.ONLINE && action === ACTIONS.PLAY) return goto(SCREENS.PLAYING);
    if (READABLE.includes(current.screen)) return action === ACTIONS.BACK ? goto(current.back || SCREENS.TITLE) : stay;
    if (current.screen === SCREENS.SOLO_SETUP) {
      if (action === ACTIONS.BACK) return goto(SCREENS.TITLE);
      if (action === ACTIONS.PLAY) return goto(SCREENS.PLAYING);
      return stay;
    }
    if (action === ACTIONS.ONLINE) return goto(SCREENS.ONLINE, current.screen);
    if (action === ACTIONS.HOW_TO) return goto(SCREENS.HOW_TO, current.screen);
    if (action === ACTIONS.EXTRAS) return goto(SCREENS.EXTRAS, current.screen);
    if (current.screen === SCREENS.TITLE) return action === ACTIONS.SINGLE_PLAYER ? goto(SCREENS.SOLO_SETUP, SCREENS.TITLE) : stay;
    if (current.screen === SCREENS.PLAYING) return action === ACTIONS.PAUSE && allowPause ? goto(SCREENS.PAUSE) : stay;
    if (current.screen === SCREENS.PAUSE) return action === ACTIONS.RESUME ? goto(SCREENS.PLAYING) : stay;
    return stay;
  }

  return { ACTIONS, SCREENS, MATCH_DEFAULTS, MATCH_LIMITS, createMenuState, isOverlayVisible, isPlaying, nextMenuState, normalizeMatchConfig };
});
