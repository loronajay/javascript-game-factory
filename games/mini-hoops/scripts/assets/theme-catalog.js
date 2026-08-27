// The registry of cabinet themes.
//
// Same contract as the ball and location catalogs: adding a theme is a data
// change and nothing else. No art, no stylesheet of its own, no second list in
// the markup — every picker in the cabinet is built from this file at runtime.
//
// WHAT A THEME OWNS, AND WHERE IT STOPS.
//
// A theme dresses the CABINET. It never touches the court. Nothing under `sim/`,
// `effects/` or `render/` reads a theme, the canvas is drawn identically under
// every one of them, and a run played in Arcade is the same run played in
// Hardwood — which is what keeps one board meaning one thing, exactly as with
// the rooms. `themeId` is deliberately absent from `preferences.snapshot()`, and
// `tests/store.test.js` says so.
//
// Two colour families are pointedly NOT themed, for the same reason:
//
//   `--fire-*`      the ON FIRE card burns in the magma ball's own trail stops,
//                   verbatim. That card is the canvas speaking through the HUD,
//                   and a themed flame would be a different fire from the one
//                   in the room. `tests/modules.test.js` pins the two together.
//   the neon marks  the tic-tac-toe X and O, and HORSE's letters. Those are
//                   painted on the floor by `render/`, and chrome that drifted
//                   off them would be naming a different colour from the board
//                   underneath. They stay magenta and cyan in every theme.
//
// So a theme is fourteen primitives. Everything else in `styles/game.css` — every
// hairline, every dim label, every soft fill — is DERIVED from `--ink-rgb` and
// `--brass-rgb` in one `:root` block, which is what makes a new theme fourteen
// values rather than a stylesheet of its own. See the token map at the top of
// `styles/game.css`.

/**
 * The primitives every theme must name.
 *
 * Held as a list rather than left implicit because a theme missing one token
 * does not fail loudly — it silently inherits whatever the last theme left on
 * the element the tokens are written to, so the cabinet comes out as two themes
 * mixed together. `tests/theme.test.js` walks this list against every row.
 */
export const THEME_TOKENS = Object.freeze([
  // The two colours every neutral in the cabinet is derived from, as
  // space-separated triples so `rgb(var(--ink-rgb) / 0.16)` can build a hairline
  // out of the same value the body text is set in.
  "--ink-rgb",
  "--brass-rgb",
  // The dark the cabinet shades WITH: the menu vignette, the splash scrims, the
  // frosted HUD cards, the overlay backdrop. A triple rather than a colour
  // because every one of those is a different alpha of the same tint, and they
  // are laid over painted art — so they have to be the theme's own dark rather
  // than flat black, or a blue cabinet greys its own splash out.
  "--shade-rgb",
  // Surfaces, from the page ground inward.
  "--room",
  "--room-deep",
  "--well",
  "--panel",
  "--panel-soft",
  "--panel-strong",
  // The mat the canvas sits on. Seen at the court's rounded corners, and for the
  // instant before a room's backdrop has decoded — so a tan one under a blue
  // cabinet reads as a loading bug rather than as a frame.
  "--court-mat",
  // The primary action, its hover, and the shade its own pressed lip is cut in.
  "--ember",
  "--ember-hot",
  "--ember-shade",
  // The wash painted across the whole page behind the cabinet. This is the token
  // that does the most work on a wide screen, where the court is height-driven
  // and leaves several hundred pixels of bare page either side of it.
  "--backdrop",
]);

export const THEMES = Object.freeze([
  Object.freeze({
    id: "midnight",
    label: "Midnight",
    blurb: "Blue hour. The coolest room in the building.",
    tokens: Object.freeze({
      "--ink-rgb": "234 240 252",
      "--brass-rgb": "137 196 255",
      "--shade-rgb": "5 8 16",
      "--room": "#0c1120",
      "--room-deep": "#070b16",
      "--well": "#141c30",
      "--panel": "rgba(22, 31, 52, 0.9)",
      "--panel-soft": "rgba(30, 42, 68, 0.72)",
      "--panel-strong": "rgba(19, 27, 46, 0.96)",
      "--court-mat": "#2b3a5c",
      "--ember": "#3f6fd8",
      "--ember-hot": "#5384ec",
      "--ember-shade": "rgba(8, 24, 60, 0.35)",
      "--backdrop":
        "radial-gradient(1200px 660px at 50% -14%, rgba(63, 111, 216, 0.26), rgba(0, 0, 0, 0) 68%), " +
        "radial-gradient(900px 520px at 6% 106%, rgba(137, 196, 255, 0.1), rgba(0, 0, 0, 0) 64%)",
    }),
  }),
  Object.freeze({
    id: "hardwood",
    label: "Hardwood",
    blurb: "The original cabinet. Warm lacquer and one very orange ball.",
    tokens: Object.freeze({
      "--ink-rgb": "246 239 230",
      "--brass-rgb": "240 176 116",
      "--shade-rgb": "14 8 7",
      "--room": "#1a1210",
      "--room-deep": "#120b09",
      "--well": "#211816",
      "--panel": "rgba(43, 31, 28, 0.9)",
      "--panel-soft": "rgba(46, 27, 21, 0.72)",
      "--panel-strong": "rgba(35, 25, 23, 0.96)",
      "--court-mat": "#bd8667",
      "--ember": "#c84c2f",
      "--ember-hot": "#e0683c",
      "--ember-shade": "rgba(73, 27, 17, 0.35)",
      "--backdrop":
        "radial-gradient(1200px 660px at 50% -14%, rgba(200, 76, 47, 0.2), rgba(0, 0, 0, 0) 68%), " +
        "radial-gradient(860px 520px at 8% 106%, rgba(240, 176, 116, 0.08), rgba(0, 0, 0, 0) 62%)",
    }),
  }),
  Object.freeze({
    id: "arcade",
    label: "Arcade",
    blurb: "Magenta and cyan, the way the floor grid already talks.",
    tokens: Object.freeze({
      "--ink-rgb": "243 233 255",
      "--brass-rgb": "109 231 255",
      "--shade-rgb": "9 4 16",
      "--room": "#120a1e",
      "--room-deep": "#0b0514",
      "--well": "#1c1030",
      "--panel": "rgba(37, 21, 60, 0.9)",
      "--panel-soft": "rgba(52, 29, 82, 0.72)",
      "--panel-strong": "rgba(30, 17, 50, 0.96)",
      "--court-mat": "#4a2a6b",
      "--ember": "#c33bcf",
      "--ember-hot": "#d954e4",
      "--ember-shade": "rgba(52, 8, 62, 0.38)",
      "--backdrop":
        "radial-gradient(1100px 620px at 78% -10%, rgba(195, 59, 207, 0.26), rgba(0, 0, 0, 0) 66%), " +
        "radial-gradient(1000px 600px at 12% 104%, rgba(109, 231, 255, 0.14), rgba(0, 0, 0, 0) 64%)",
    }),
  }),
  Object.freeze({
    id: "gymnasium",
    label: "Gymnasium",
    blurb: "Painted cinderblock, and a scoreboard that still works.",
    tokens: Object.freeze({
      "--ink-rgb": "238 244 232",
      "--brass-rgb": "243 197 92",
      "--shade-rgb": "4 10 7",
      "--room": "#0c1611",
      "--room-deep": "#060e0a",
      "--well": "#12211a",
      "--panel": "rgba(20, 38, 29, 0.9)",
      "--panel-soft": "rgba(28, 51, 39, 0.72)",
      "--panel-strong": "rgba(17, 32, 25, 0.96)",
      "--court-mat": "#2f5a44",
      "--ember": "#2f9d68",
      "--ember-hot": "#3fb77c",
      "--ember-shade": "rgba(6, 44, 27, 0.36)",
      "--backdrop":
        "radial-gradient(1200px 640px at 50% -12%, rgba(47, 157, 104, 0.24), rgba(0, 0, 0, 0) 68%), " +
        "radial-gradient(800px 480px at 92% 100%, rgba(243, 197, 92, 0.1), rgba(0, 0, 0, 0) 62%)",
    }),
  }),
  Object.freeze({
    id: "blacktop",
    label: "Blacktop",
    blurb: "Streetlight on wet asphalt. Cold grey, hot orange.",
    tokens: Object.freeze({
      "--ink-rgb": "236 238 241",
      "--brass-rgb": "246 168 92",
      "--shade-rgb": "8 9 10",
      "--room": "#111214",
      "--room-deep": "#0a0b0c",
      "--well": "#1a1c1f",
      "--panel": "rgba(30, 32, 36, 0.9)",
      "--panel-soft": "rgba(41, 44, 49, 0.72)",
      "--panel-strong": "rgba(25, 27, 30, 0.96)",
      "--court-mat": "#3a3d42",
      "--ember": "#ef6a24",
      "--ember-hot": "#ff8038",
      "--ember-shade": "rgba(70, 26, 4, 0.36)",
      "--backdrop":
        "radial-gradient(1000px 560px at 50% -10%, rgba(239, 106, 36, 0.16), rgba(0, 0, 0, 0) 62%), " +
        "repeating-linear-gradient(118deg, rgba(255, 255, 255, 0.014) 0 2px, rgba(0, 0, 0, 0) 2px 9px)",
    }),
  }),
  Object.freeze({
    id: "boardwalk",
    label: "Boardwalk",
    blurb: "Last light on the pier, and the arcade sign coming on.",
    tokens: Object.freeze({
      "--ink-rgb": "252 236 233",
      "--brass-rgb": "255 196 122",
      "--shade-rgb": "15 7 14",
      "--room": "#1b0f1c",
      "--room-deep": "#120814",
      "--well": "#271429",
      "--panel": "rgba(52, 26, 48, 0.9)",
      "--panel-soft": "rgba(70, 35, 60, 0.72)",
      "--panel-strong": "rgba(43, 21, 40, 0.96)",
      "--court-mat": "#7a4258",
      "--ember": "#e2545f",
      "--ember-hot": "#f26a72",
      "--ember-shade": "rgba(84, 16, 30, 0.36)",
      "--backdrop":
        "radial-gradient(1300px 700px at 50% -16%, rgba(255, 196, 122, 0.18), rgba(0, 0, 0, 0) 62%), " +
        "radial-gradient(1000px 620px at 20% 104%, rgba(226, 84, 95, 0.2), rgba(0, 0, 0, 0) 66%)",
    }),
  }),
  Object.freeze({
    id: "cryo",
    label: "Cold Storage",
    blurb: "A hoop bolted up in the walk-in freezer. Nobody minded.",
    tokens: Object.freeze({
      "--ink-rgb": "230 246 250",
      "--brass-rgb": "130 238 246",
      "--shade-rgb": "3 10 13",
      "--room": "#08151a",
      "--room-deep": "#040d11",
      "--well": "#0e2029",
      "--panel": "rgba(16, 40, 49, 0.9)",
      "--panel-soft": "rgba(23, 55, 66, 0.72)",
      "--panel-strong": "rgba(13, 33, 41, 0.96)",
      "--court-mat": "#2c5c68",
      "--ember": "#17a2b0",
      "--ember-hot": "#22bcca",
      "--ember-shade": "rgba(2, 46, 53, 0.36)",
      "--backdrop":
        "radial-gradient(1200px 660px at 50% -14%, rgba(23, 162, 176, 0.24), rgba(0, 0, 0, 0) 68%), " +
        "radial-gradient(900px 540px at 88% 102%, rgba(130, 238, 246, 0.1), rgba(0, 0, 0, 0) 62%)",
    }),
  }),
  Object.freeze({
    id: "carbon",
    label: "Carbon",
    blurb: "No colour but the one that matters. Nothing to look at but the shot.",
    tokens: Object.freeze({
      "--ink-rgb": "240 240 242",
      "--brass-rgb": "210 214 222",
      "--shade-rgb": "6 6 7",
      "--room": "#0e0e0f",
      "--room-deep": "#070708",
      "--well": "#171718",
      "--panel": "rgba(26, 26, 28, 0.9)",
      "--panel-soft": "rgba(36, 36, 39, 0.72)",
      "--panel-strong": "rgba(21, 21, 23, 0.96)",
      "--court-mat": "#333336",
      "--ember": "#d33a3a",
      "--ember-hot": "#e64d4d",
      "--ember-shade": "rgba(70, 8, 8, 0.36)",
      "--backdrop":
        "radial-gradient(1100px 600px at 50% -12%, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0) 64%), " +
        "radial-gradient(900px 540px at 50% 108%, rgba(211, 58, 58, 0.12), rgba(0, 0, 0, 0) 62%)",
    }),
  }),
]);

/**
 * The theme a cabinet with no stored preference opens in.
 *
 * Deliberately not `hardwood`. The brown cabinet is still here and it is still
 * the one the splash art was painted for, but it is a choice now rather than
 * the only answer — owner's call, 2026-08-27.
 */
export const DEFAULT_THEME = "midnight";

export function themeIds() {
  return THEMES.map((theme) => theme.id);
}

/** Resolve a theme id, falling back to the default rather than throwing. */
export function themeById(id) {
  return THEMES.find((theme) => theme.id === id) || THEMES.find((theme) => theme.id === DEFAULT_THEME);
}

/**
 * The four colours a picker shows for a theme.
 *
 * Read straight off the theme's own tokens, so a swatch cannot drift from the
 * cabinet it is advertising. Same rule the ball picker's flight bars live by,
 * and the reason no view in the cabinet does colour arithmetic of its own.
 */
export function themeSwatch(id) {
  const { tokens } = themeById(id);
  return Object.freeze({
    room: tokens["--room"],
    panel: tokens["--panel-soft"],
    ember: tokens["--ember"],
    brass: `rgb(${tokens["--brass-rgb"]})`,
  });
}
