// The shell: which screen the game is on, and how you get between them.
//
// Pure. No canvas, no DOM, no race — this owns the flow and nothing else, the
// same split as `setup-menu.js`. `init-game.js` carries out whatever this asks
// for; the asking is a **command**, so the impure half (building a race) stays
// in one place and the flow itself stays testable without a browser.
//
// The flow:
//
//   title -> modes -> setup -> race -> results
//                       ^        |        |
//                       |     paused      |
//                       +--------+--------+
//
// Backing out (ESC) walks that graph in reverse, one screen per press, and a
// live race pauses rather than being thrown away.

import { MODES, DEFAULT_MODE_ID, modeById } from "../sim/modes.js";

export const SCREEN_TITLE = "title";
export const SCREEN_MODES = "modes";
export const SCREEN_SETUP = "setup";
export const SCREEN_RACE = "race";
export const SCREEN_PAUSED = "paused";
export const SCREEN_RESULTS = "results";
export const SCREEN_RADIO = "radio";
export const SCREEN_GARAGE = "garage";
/**
 * Getting into an online match: quick search, a private room code, and the
 * lobby you wait in. The match *itself* is not a screen — it is the race screen
 * with a session attached, exactly as the tutorial is the race screen with a
 * coach attached, and for the same reason: there must not be a second, subtly
 * different copy of the driving for the online path to drift into.
 */
export const SCREEN_ONLINE = "online";

export const SCREENS = [
  SCREEN_TITLE,
  SCREEN_MODES,
  SCREEN_SETUP,
  SCREEN_RACE,
  SCREEN_PAUSED,
  SCREEN_RESULTS,
  SCREEN_RADIO,
  SCREEN_GARAGE,
  SCREEN_ONLINE,
];

/**
 * What the shell asks the composition root to do on top of changing screen.
 * Everything the shell cannot do itself is one of these five.
 */
export const COMMAND_NONE = "none";
/** Build a fresh race from the current setup. */
export const COMMAND_BEGIN = "begin";
/**
 * Run the *same* thing again, whatever it was.
 *
 * Deliberately separate from `COMMAND_BEGIN`, because "restart this run" and
 * "build the run I just picked" are different requests and only the shell knows
 * which screen asked. Collapsing them is what made RESTART RUN quietly drop you
 * out of the tutorial and into a normal race.
 */
export const COMMAND_RESTART = "restart";
/** Rebuild the setup screen around the newly chosen mode. */
export const COMMAND_MODE = "mode";
/** The player picked something not built yet — buzz, do not advance. */
export const COMMAND_LOCKED = "locked";
/** Build a guided practice run instead of a chosen one. */
export const COMMAND_TUTORIAL = "tutorial";
/** Open a connection and start looking for a match. */
export const COMMAND_ONLINE = "online";
/** Tear the session down: the player has backed out of online play. */
export const COMMAND_ONLINE_LEAVE = "online-leave";

/**
 * Screens whose menu is a modal over a live race, so the world and the
 * instrument cluster keep rendering underneath. The setup screen is not one of
 * them: it replaces the race entirely, and neither is the radio screen.
 */
const OVER_THE_RACE = new Set([SCREEN_RACE, SCREEN_PAUSED, SCREEN_RESULTS]);

export function showsTheRace(screen) {
  return OVER_THE_RACE.has(screen);
}

export function createShell({ screen = SCREEN_TITLE, modeId = DEFAULT_MODE_ID } = {}) {
  // `radioReturn` is where ESC goes from the radio screen. The stereo is
  // reachable from the title *and* from a paused race, and those want opposite
  // answers — backing out of the radio must not throw away a live race — so the
  // way in is recorded rather than hardcoded.
  return { screen, cursor: 0, modeId, radioReturn: SCREEN_TITLE };
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * The menu on each screen, as data. The title screen has a single item so that
 * "press start" goes through exactly the same confirm path as everything else —
 * one code path for the whole shell rather than a special case at the front.
 */
const MENUS = {
  [SCREEN_TITLE]: () => ({
    title: "SPEED DEMON",
    subtitle: "Manual-shift drag racing",
    items: [
      // START stays item zero: ENTER on a fresh boot must start a race without
      // anyone having to read the screen.
      { id: "start", label: "START", enabled: true },
      { id: "tutorial", label: "HOW TO DRIVE", enabled: true },
      { id: "radio", label: "RADIO", enabled: true },
    ],
  }),
  [SCREEN_MODES]: () => ({
    title: "SELECT MODE",
    subtitle: "ESC to go back",
    items: MODES.map((mode) => ({
      id: mode.id,
      label: mode.label.toUpperCase(),
      blurb: mode.blurb,
      note: mode.note ?? null,
      enabled: mode.available,
      // What the setup screen will offer for this mode, so the description
      // panel can say what you are choosing between before you commit to it.
      objectiveLabel: mode.objective.label,
      objectiveOptions: mode.objective.options.map((option) => option.label),
    })),
  }),
  [SCREEN_PAUSED]: () => ({
    title: "PAUSED",
    subtitle: "ESC to resume",
    items: [
      { id: "resume", label: "RESUME", enabled: true },
      { id: "restart", label: "RESTART RUN", enabled: true },
      { id: "setup", label: "CHANGE CAR / TRACK", enabled: true },
      { id: "radio", label: "RADIO", enabled: true },
      { id: "menu", label: "QUIT TO MENU", enabled: true },
    ],
  }),
  [SCREEN_RESULTS]: () => ({
    title: "RESULTS",
    subtitle: null,
    items: [
      { id: "again", label: "RUN IT AGAIN", enabled: true },
      { id: "setup", label: "CHANGE CAR / TRACK", enabled: true },
      { id: "menu", label: "QUIT TO MENU", enabled: true },
    ],
  }),
};

export function isMenuScreen(screen) {
  return Object.hasOwn(MENUS, screen);
}

/**
 * The live menu, with the cursor already resolved onto an item, or null on the
 * screens that own their own cursor (setup) or none at all (race). Renderers
 * read `highlighted` rather than comparing indices themselves.
 */
export function menuFor(shell) {
  const build = MENUS[shell.screen];
  if (!build) {
    return null;
  }
  const menu = build();
  return {
    ...menu,
    items: menu.items.map((item, index) => ({ ...item, index, highlighted: index === shell.cursor })),
  };
}

/**
 * Where the cursor should sit on arrival. The mode list opens on the mode
 * already chosen; everything else opens at the top.
 */
function openingCursor(shell, screen) {
  if (screen !== SCREEN_MODES) {
    return 0;
  }
  const index = MODES.findIndex((mode) => mode.id === shell.modeId);
  return index >= 0 ? index : 0;
}

/**
 * Moves to a screen, placing the cursor sensibly for it.
 *
 * Arriving at the radio also records where you arrived *from*, which is the one
 * piece of history the shell keeps: every other screen has a single sensible
 * place to back out to, and the radio does not.
 */
export function enterScreen(shell, screen) {
  const radioReturn = screen === SCREEN_RADIO ? shell.screen : shell.radioReturn;
  return {
    ...shell,
    screen,
    cursor: openingCursor(shell, screen),
    radioReturn: radioReturn === SCREEN_RADIO ? SCREEN_TITLE : radioReturn,
  };
}

const clamp = (value, max) => Math.max(0, Math.min(max, value));

/**
 * Walks the menu cursor. Menus here are vertical lists, so left and right are
 * deliberately inert — the setup screen is where sideways means something, and
 * that cursor belongs to `setup-menu.js`.
 */
export function moveShell(shell, direction) {
  const menu = menuFor(shell);
  if (!menu || (direction !== "up" && direction !== "down")) {
    return shell;
  }
  const step = direction === "up" ? -1 : 1;
  return { ...shell, cursor: clamp(shell.cursor + step, menu.items.length - 1) };
}

const outcome = (shell, command = COMMAND_NONE) => ({ shell, command });

/**
 * ENTER. Returns the next shell and whatever the composition root has to do
 * about it. The race screen is not handled here: while racing, that key is the
 * clutch, and the shell has no business intercepting it.
 */
export function confirmShell(shell) {
  switch (shell.screen) {
    case SCREEN_TITLE:
      switch (menuFor(shell).items[shell.cursor]?.id) {
        case "radio":
          return outcome(enterScreen(shell, SCREEN_RADIO));
        // The tutorial skips the mode list and the picker: a guided run is a
        // fixed run, and asking a player to choose a car before they have been
        // told how to drive one is the wrong order.
        case "tutorial":
          return outcome(enterScreen(shell, SCREEN_RACE), COMMAND_TUTORIAL);
        default:
          return outcome(enterScreen(shell, SCREEN_MODES));
      }

    case SCREEN_MODES: {
      const mode = MODES[shell.cursor];
      if (!mode || !modeById(mode.id)?.available) {
        // Hovering a locked mode must not adopt it — the chosen mode is only
        // ever changed by a confirm that actually goes through.
        return outcome(shell, COMMAND_LOCKED);
      }
      // Online picks its car and its strip in a lobby the two drivers share, so
      // it goes straight there rather than through the solo setup screen.
      if (mode.online) {
        return outcome(enterScreen({ ...shell, modeId: mode.id }, SCREEN_ONLINE), COMMAND_ONLINE);
      }
      return outcome(enterScreen({ ...shell, modeId: mode.id }, SCREEN_SETUP), COMMAND_MODE);
    }

    case SCREEN_SETUP:
      return outcome(enterScreen(shell, SCREEN_RACE), COMMAND_BEGIN);

    case SCREEN_PAUSED:
      switch (menuFor(shell).items[shell.cursor]?.id) {
        case "restart":
          return outcome(enterScreen(shell, SCREEN_RACE), COMMAND_RESTART);
        case "setup":
          return outcome(enterScreen(shell, SCREEN_SETUP));
        case "radio":
          return outcome(enterScreen(shell, SCREEN_RADIO));
        case "menu":
          return outcome(enterScreen(shell, SCREEN_MODES));
        default:
          return outcome(enterScreen(shell, SCREEN_RACE));
      }

    case SCREEN_RESULTS:
      switch (menuFor(shell).items[shell.cursor]?.id) {
        case "setup":
          return outcome(enterScreen(shell, SCREEN_SETUP));
        case "menu":
          return outcome(enterScreen(shell, SCREEN_MODES));
        default:
          return outcome(enterScreen(shell, SCREEN_RACE), COMMAND_RESTART);
      }

    // The radio screen owns its own cursor and its own ENTER — play the
    // highlighted track, or choose a folder when there is none — exactly as the
    // setup screen owns its panes. By the time a key reaches the shell here,
    // the radio has already decided there is nothing left for it to mean.
    case SCREEN_RADIO:
      return outcome(shell);

    // Likewise the garage: its ENTER fires whichever action the cursor is on,
    // and leaving is one of those actions rather than something the shell
    // decides. Anything that reaches here has already been declined.
    case SCREEN_GARAGE:
      return outcome(shell);

    // The online screen owns its own ENTER too — search, create, join, ready —
    // and what any of those mean depends on the session, which the shell
    // deliberately cannot see.
    case SCREEN_ONLINE:
      return outcome(shell);

    default:
      return outcome(shell);
  }
}

/**
 * ESC. One screen back, never a rebuild — backing out of a pause menu has to
 * return to the race that is still sitting there, not start a new one.
 */
export function cancelShell(shell) {
  switch (shell.screen) {
    case SCREEN_MODES:
      return outcome(enterScreen(shell, SCREEN_TITLE));
    case SCREEN_SETUP:
      return outcome(enterScreen(shell, SCREEN_MODES));
    case SCREEN_RACE:
      return outcome(enterScreen(shell, SCREEN_PAUSED));
    case SCREEN_PAUSED:
      return outcome(enterScreen(shell, SCREEN_RACE));
    case SCREEN_RESULTS:
      return outcome(enterScreen(shell, SCREEN_SETUP));
    // Back to wherever the stereo was opened from. A race paused behind it is
    // still sitting there and must be returned to, not thrown away.
    case SCREEN_RADIO:
      return outcome(enterScreen(shell, shell.radioReturn ?? SCREEN_TITLE));
    // The garage is only ever reached from the setup screen's paint pane, so
    // unlike the radio it needs no remembered return — there is one place to go.
    case SCREEN_GARAGE:
      return outcome(enterScreen(shell, SCREEN_SETUP));
    // Backing out of online has to close the socket as well as change screen —
    // an abandoned lobby that nobody left is a room the server keeps alive and
    // an opponent left staring at a driver who is not coming back.
    case SCREEN_ONLINE:
      return outcome(enterScreen(shell, SCREEN_MODES), COMMAND_ONLINE_LEAVE);
    default:
      return outcome(shell);
  }
}
