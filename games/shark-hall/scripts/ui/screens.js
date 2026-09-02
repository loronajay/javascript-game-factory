// Which screen is up, as data.
//
// Pure — no element is touched here — so the navigation rules can be tested
// exactly rather than clicked through. The whole reason this file exists is one
// rule that is easy to get wrong and impossible to see from the markup: BACK IS
// CONTEXTUAL. From a settings panel opened off the main menu, back is the main
// menu; from the same panel opened off the pause modal mid-rack, back is the
// pause modal, because the player is not trying to leave their match.
//
// The demo answered that by asking the DOM whether a class was present. This
// answers it from state, which is why it can be a test.

/** The full-screen front door, with the splash behind it. */
export const LAYER_MENU = "menu";
/** Modals over a live rack. */
export const LAYER_PAUSE = "pause";
export const LAYER_RESULT = "result";
/** Nothing up: the table is live. */
export const LAYER_TABLE = "table";

export const LAYERS = Object.freeze([LAYER_MENU, LAYER_PAUSE, LAYER_RESULT, LAYER_TABLE]);

export const PANEL_MAIN = "main";
export const PANEL_PLAY = "play";
export const PANEL_HOW = "how";
/** The rules in print. Reachable from the front door AND from a paused rack,
 *  because the moment you need it is mid-argument, not before the break. */
export const PANEL_RULES = "rules";
export const PANEL_SETTINGS = "settings";

export const PANELS = Object.freeze([PANEL_MAIN, PANEL_PLAY, PANEL_HOW, PANEL_RULES, PANEL_SETTINGS]);

export const isLayer = (value) => LAYERS.includes(value);
export const isPanel = (value) => PANELS.includes(value);

/** Coerce anything into a real layer. Unknown input goes to the menu, never to a blank screen. */
export function normalizeLayer(value) {
  return isLayer(value) ? value : LAYER_MENU;
}

export function normalizePanel(value) {
  return isPanel(value) ? value : PANEL_MAIN;
}

/**
 * Where "Back" goes from a menu panel.
 *
 * @param cameFrom the layer the front door was opened from
 * @returns `{ layer, panel }` — the screen to show next
 */
export function backTarget(cameFrom = LAYER_MENU) {
  // The front door opened FROM the pause modal is a detour, not a destination:
  // the player went looking for settings mid-rack, so back returns them to their
  // paused match rather than to the main menu, one click from abandoning it.
  if (cameFrom === LAYER_PAUSE) return { layer: LAYER_PAUSE, panel: PANEL_MAIN };
  return { layer: LAYER_MENU, panel: PANEL_MAIN };
}

/**
 * What Escape does.
 *
 * The result modal deliberately swallows it: the rack is over and the player has
 * two real choices in front of them, and dismissing that screen would leave them
 * looking at a finished table with nothing to do.
 */
export function escapeTarget(layer, { started, paused }) {
  const current = normalizeLayer(layer);
  if (current === LAYER_RESULT) return null;
  if (current === LAYER_MENU) return started && paused ? LAYER_PAUSE : null;
  if (current === LAYER_PAUSE) return LAYER_TABLE;
  return started ? LAYER_PAUSE : null;
}
