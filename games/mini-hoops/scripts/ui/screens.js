// Which screen is showing.
//
// Split in two on purpose: a pure state machine that can be tested under node,
// and a thin DOM binding that toggles classes. Nothing else in the cabinet may
// call `classList` on a screen — if a new screen is added it is added here.

export const SCREEN_MENU = "menu";
export const SCREEN_SETUP = "setup";
export const SCREEN_GAME = "game";
export const SCREEN_BOARDS = "boards";
export const SCREEN_HOWTO = "howto";
export const SCREEN_ONLINE = "online";

export const SCREENS = Object.freeze([SCREEN_MENU, SCREEN_SETUP, SCREEN_ONLINE, SCREEN_GAME, SCREEN_BOARDS, SCREEN_HOWTO]);

/**
 * Where "back" goes from each screen.
 *
 * Everything returns to the menu, including the game — quitting a run is an
 * explicit choice made in the pause overlay, not something the back button does
 * out from under a player mid-shot.
 */
const BACK_TARGETS = Object.freeze({
  [SCREEN_MENU]: SCREEN_MENU,
  [SCREEN_SETUP]: SCREEN_MENU,
  [SCREEN_ONLINE]: SCREEN_MENU,
  [SCREEN_GAME]: SCREEN_MENU,
  [SCREEN_BOARDS]: SCREEN_MENU,
  [SCREEN_HOWTO]: SCREEN_MENU,
});

export function isScreen(name) {
  return SCREENS.includes(name);
}

/** Resolve a requested screen, falling back to the menu rather than blanking. */
export function normalizeScreen(name) {
  return isScreen(name) ? name : SCREEN_MENU;
}

export function backTarget(name) {
  return BACK_TARGETS[normalizeScreen(name)];
}

/**
 * Bind the router to the DOM.
 *
 * @param sections map of screen name -> element
 * @param onChange called after every actual change, with (next, previous)
 */
export function createScreenRouter(sections, { onChange = () => {} } = {}) {
  let current = SCREEN_MENU;

  function apply() {
    for (const name of SCREENS) {
      sections[name]?.classList.toggle("is-active", name === current);
    }
    // The game screen takes over the viewport on phones; the body class is what
    // the landscape/portrait rules in the stylesheet key off.
    document.body.classList.toggle("is-playing", current === SCREEN_GAME);
  }

  apply();

  return {
    current: () => current,
    show(name) {
      const next = normalizeScreen(name);
      if (next === current) return current;
      const previous = current;
      current = next;
      apply();
      onChange(next, previous);
      return current;
    },
    back() {
      return this.show(backTarget(current));
    },
  };
}
