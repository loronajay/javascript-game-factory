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
export const SCREEN_TIC_TAC_TOE = "tictactoe";

export const SCREENS = Object.freeze([
  SCREEN_MENU,
  SCREEN_SETUP,
  SCREEN_ONLINE,
  SCREEN_GAME,
  SCREEN_TIC_TAC_TOE,
  SCREEN_BOARDS,
  SCREEN_HOWTO,
]);

/**
 * The screens that ARE a court: sized to the viewport, and never scrolled.
 *
 * Floor tic-tac-toe used to be a separate HTML page, and the whole of that
 * decision was paid for in this class. `is-playing` pins the cabinet to 100dvh,
 * the page needed a heading the classic court has never had, and undoing the
 * lock meant `styles/tic-tac-toe-stage.css` also had to undo `game.css`'s phone
 * rules wholesale — for a DOM that was not the one they were written for. As a
 * screen it is simply a court, and all of that is gone: one stylesheet, one
 * viewport lock, one set of phone rules.
 *
 * It is also what keeps the soundtrack running. A page navigation destroys the
 * <audio> element streaming it, and nothing brings a stream back — so entering
 * tic-tac-toe cut the music off mid-bar, every time.
 */
export const COURT_SCREENS = Object.freeze([SCREEN_GAME, SCREEN_TIC_TAC_TOE]);

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
  [SCREEN_TIC_TAC_TOE]: SCREEN_MENU,
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
    // A court takes over the viewport on phones; the body class is what the
    // landscape/portrait rules in the stylesheet key off. Both courts, not just
    // the classic one — see COURT_SCREENS.
    document.body.classList.toggle("is-playing", COURT_SCREENS.includes(current));
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
