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
 * The collection: the whole roster on one scrolling screen, a row per model with
 * every paint saved for it.
 *
 * Separate from `SCREEN_GARAGE`, which is the *editor*. This is where a player
 * looks at what they have built and picks the car they are taking to the line;
 * the editor is where one car is actually painted, and it is reached from here
 * exactly as it is reached from the setup screen's paint pane.
 */
export const SCREEN_COLLECTION = "collection";
/**
 * The leaderboards: the global board for a given mode and objective, and the
 * player's own bests, as two tabs of one screen.
 *
 * On the title menu rather than hanging off the results panel, because it is
 * somewhere a player goes *instead* of racing — the same argument the collection
 * makes. It needs no remembered return for the same reason the collection needs
 * none: there is exactly one way in.
 */
export const SCREEN_BOARDS = "boards";
/**
 * Getting into an online match: quick search, a private room code, and the
 * lobby you wait in. The match *itself* is not a screen — it is the race screen
 * with a session attached, exactly as the tutorial is the race screen with a
 * coach attached, and for the same reason: there must not be a second, subtly
 * different copy of the driving for the online path to drift into.
 */
export const SCREEN_ONLINE = "online";
/**
 * The campaign: a node map, and the briefing that plays over a mission splash
 * before the tree.
 *
 * One screen for both, because a briefing owns nothing but ENTER and every
 * screen costs an input path, a debug-handle case and a renderer branch. The
 * stage is state inside `ui/campaign.js`, exactly as the setup screen's pane is.
 *
 * Like the collection and the leaderboards it has one way in — the title menu —
 * and so needs no remembered return.
 */
export const SCREEN_CAMPAIGN = "campaign";

export const SCREENS = [
  SCREEN_TITLE,
  SCREEN_MODES,
  SCREEN_SETUP,
  SCREEN_RACE,
  SCREEN_PAUSED,
  SCREEN_RESULTS,
  SCREEN_RADIO,
  SCREEN_GARAGE,
  SCREEN_COLLECTION,
  SCREEN_BOARDS,
  SCREEN_ONLINE,
  SCREEN_CAMPAIGN,
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
/**
 * Open the leaderboards on the board the current setup would race for, and ask
 * for it.
 *
 * A command rather than something `enterScreen` could do, for the reason all the
 * others are: fetching a board is impure and the shell is not. It is also what
 * makes arriving here show the board you were about to drive rather than
 * whatever the screen was last left on.
 */
export const COMMAND_BOARDS = "boards";
/** Open a connection and start looking for a match. */
export const COMMAND_ONLINE = "online";
/** Tear the session down: the player has backed out of online play. */
export const COMMAND_ONLINE_LEAVE = "online-leave";
/** Open the campaign map, reading the career off disk. */
export const COMMAND_CAMPAIGN = "campaign";

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
  //
  // `garageReturn` is the same fact about the garage, and it did not used to
  // exist: the editor was reachable only from the setup screen's paint pane, so
  // ESC had one sensible answer. The online lobby is now a second way in — a
  // driver has to be able to paint the car they are about to race without
  // leaving the room — and a hardcoded return would drop them out of the lobby.
  // `campaignEventId` is the one piece of state the shell keeps about the race
  // itself, and it is here rather than in `init-game.js` because it changes what
  // two *menus* mean: on a campaign run, CHANGE CAR / TRACK is nonsense — the
  // event names the car's opposition, the strip and the distance — and quitting
  // belongs back on the map rather than on the mode list. Deciding that is the
  // shell's job, and putting the flag anywhere else would put menu meaning in
  // the composition root.
  return {
    screen,
    cursor: 0,
    modeId,
    radioReturn: SCREEN_TITLE,
    garageReturn: SCREEN_SETUP,
    campaignEventId: null,
  };
}

/**
 * Marks the race about to be built as a campaign event's, or clears it.
 *
 * Cleared by every other way of starting a run, so a career race cannot leave
 * the pause menu talking about a campaign after the player has gone off and
 * picked a car themselves.
 */
export function setCampaignRun(shell, eventId) {
  return { ...shell, campaignEventId: eventId ?? null };
}

export function isCampaignRun(shell) {
  return Boolean(shell.campaignEventId);
}

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/**
 * The menu on each screen, as data. The title screen has a single item so that
 * "press start" goes through exactly the same confirm path as everything else —
 * one code path for the whole shell rather than a special case at the front.
 */
/**
 * The mode list, with the campaign at the head of it.
 *
 * The campaign belongs **here** rather than on the title menu: it is a way to
 * play, which is exactly what this screen is a list of, and a player looking
 * for something to do looks at the modes. It is first because it is the
 * single-player spine — the other four are what you play once you have run out
 * of it.
 *
 * It is a row shaped like a mode rather than a real one in `sim/modes.js`,
 * because a mode names an objective and a campaign event names its own. That is
 * also why `confirmShell` resolves this list **by id** instead of indexing
 * `MODES`: with a row here that is not a mode, an index would open Distance
 * Race whenever the campaign was picked.
 */
const CAMPAIGN_MENU_ITEM = {
  id: "campaign",
  label: "Campaign",
  blurb: "A career, one race at a time. Start at the bottom of the city and work east.",
  available: true,
  campaign: true,
  objective: { label: "CHAPTER", options: [{ label: "The Street" }] },
};

const MODE_MENU = [CAMPAIGN_MENU_ITEM, ...MODES];

const MENUS = {
  [SCREEN_TITLE]: () => ({
    title: "SPEED DEMON",
    subtitle: "Manual-shift drag racing",
    items: [
      // START stays item zero: ENTER on a fresh boot must start a race without
      // anyone having to read the screen.
      { id: "start", label: "START", enabled: true },
      // The garage is on the title menu because it is somewhere a player goes
      // *instead* of racing. Reaching it only through the pre-race picker made
      // browsing what you own cost a mode choice and three locked panes first.
      { id: "garage", label: "GARAGE", enabled: true },
      // Next to the garage rather than buried behind a race, for the same
      // reason: a player who wants to know where they stand should not have to
      // drive to find out.
      { id: "boards", label: "LEADERBOARDS", enabled: true },
      { id: "tutorial", label: "HOW TO DRIVE", enabled: true },
      { id: "radio", label: "RADIO", enabled: true },
    ],
  }),
  [SCREEN_MODES]: () => ({
    title: "SELECT MODE",
    subtitle: "ESC to go back",
    items: MODE_MENU.map((mode) => ({
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
  [SCREEN_PAUSED]: (shell) => ({
    title: "PAUSED",
    subtitle: "ESC to resume",
    items: [
      { id: "resume", label: "RESUME", enabled: true },
      { id: "restart", label: "RESTART RUN", enabled: true },
      // A campaign event names the strip, the distance and the driver in the
      // other lane, so there is nothing to change — the way out is the map.
      ...(isCampaignRun(shell)
        ? [{ id: "campaign", label: "BACK TO CAMPAIGN", enabled: true }]
        : [{ id: "setup", label: "CHANGE CAR / TRACK", enabled: true }]),
      { id: "radio", label: "RADIO", enabled: true },
      { id: "menu", label: "QUIT TO MENU", enabled: true },
    ],
  }),
  [SCREEN_RESULTS]: (shell) => ({
    title: "RESULTS",
    subtitle: null,
    items: [
      { id: "again", label: "RUN IT AGAIN", enabled: true },
      ...(isCampaignRun(shell)
        ? [{ id: "campaign", label: "BACK TO CAMPAIGN", enabled: true }]
        : [{ id: "setup", label: "CHANGE CAR / TRACK", enabled: true }]),
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
  const menu = build(shell);
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
  // Against the menu rather than against `MODES`, because the campaign row sits
  // at the head of it — indexing the catalog would put the cursor one row above
  // the mode the player last chose.
  const index = MODE_MENU.findIndex((mode) => mode.id === shell.modeId);
  return index >= 0 ? index : 0;
}

/**
 * Moves to a screen, placing the cursor sensibly for it.
 *
 * Arriving at the radio or the garage also records where you arrived *from*,
 * which is the only history the shell keeps: those two are reachable from more
 * than one place and want opposite answers on the way out. Every other screen
 * has a single sensible place to back out to.
 *
 * Neither can be recorded as its own return, so radio→radio and garage→garage
 * cannot trap you on a screen whose ESC leads back to itself.
 */
export function enterScreen(shell, screen) {
  const radioReturn = screen === SCREEN_RADIO ? shell.screen : shell.radioReturn;
  const garageReturn = screen === SCREEN_GARAGE ? shell.screen : shell.garageReturn;
  return {
    ...shell,
    screen,
    cursor: openingCursor(shell, screen),
    radioReturn: radioReturn === SCREEN_RADIO ? SCREEN_TITLE : radioReturn,
    garageReturn: garageReturn === SCREEN_GARAGE ? SCREEN_SETUP : garageReturn,
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
        case "garage":
          return outcome(enterScreen(shell, SCREEN_COLLECTION));
        case "boards":
          return outcome(enterScreen(shell, SCREEN_BOARDS), COMMAND_BOARDS);
        // The tutorial skips the mode list and the picker: a guided run is a
        // fixed run, and asking a player to choose a car before they have been
        // told how to drive one is the wrong order.
        case "tutorial":
          return outcome(enterScreen(shell, SCREEN_RACE), COMMAND_TUTORIAL);
        default:
          return outcome(enterScreen(shell, SCREEN_MODES));
      }

    case SCREEN_MODES: {
      const mode = MODE_MENU[shell.cursor];
      // The campaign is a row on this list that is not a mode, so it is
      // answered before anything asks the mode catalog about it.
      if (mode?.campaign) {
        return outcome(enterScreen(shell, SCREEN_CAMPAIGN), COMMAND_CAMPAIGN);
      }
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
        case "campaign":
          return outcome(enterScreen(shell, SCREEN_CAMPAIGN), COMMAND_CAMPAIGN);
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
        case "campaign":
          return outcome(enterScreen(shell, SCREEN_CAMPAIGN), COMMAND_CAMPAIGN);
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

    // And the collection: ENTER there opens the editor on the car under the
    // cursor, which is a question about the garage rather than about the flow.
    case SCREEN_COLLECTION:
      return outcome(shell);

    // The leaderboards have nothing to confirm: every tab is taken by moving
    // onto it, and a list row is read rather than chosen. ENTER is deliberately
    // inert here rather than being given a job to justify the key.
    case SCREEN_BOARDS:
      return outcome(shell);

    // And the campaign: ENTER there opens a briefing, turns its pages, and
    // finally asks for a race — all questions about an event and a career,
    // which the shell deliberately cannot see. `init-game.js` moves the screen
    // itself when the briefing is done, exactly as the setup screen's START
    // button does.
    case SCREEN_CAMPAIGN:
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
    // Backing out of a campaign result goes to the map rather than to the
    // picker, for the same reason its menu says so: a career race has nothing
    // to pick.
    case SCREEN_RESULTS:
      return isCampaignRun(shell)
        ? outcome(enterScreen(shell, SCREEN_CAMPAIGN), COMMAND_CAMPAIGN)
        : outcome(enterScreen(shell, SCREEN_SETUP));
    // Back to wherever the stereo was opened from. A race paused behind it is
    // still sitting there and must be returned to, not thrown away.
    case SCREEN_RADIO:
      return outcome(enterScreen(shell, shell.radioReturn ?? SCREEN_TITLE));
    // Back to whichever screen opened the editor — the setup screen's paint
    // pane, or an online lobby. A lobby is a room you are still sitting in, so
    // returning to the setup screen from it would silently leave the match.
    case SCREEN_GARAGE:
      return outcome(enterScreen(shell, shell.garageReturn ?? SCREEN_SETUP));
    // The collection hangs off the title menu and nowhere else, so unlike the
    // editor it needs no remembered return.
    case SCREEN_COLLECTION:
      return outcome(enterScreen(shell, SCREEN_TITLE));
    // Likewise the leaderboards and the campaign map: one way in, so one way
    // out. (Backing out of a *briefing* is the campaign screen's own business
    // and never reaches here — the same split the setup screen's panes make.)
    case SCREEN_BOARDS:
    case SCREEN_CAMPAIGN:
      return outcome(enterScreen(shell, SCREEN_TITLE));
    // Backing out of online has to close the socket as well as change screen —
    // an abandoned lobby that nobody left is a room the server keeps alive and
    // an opponent left staring at a driver who is not coming back.
    case SCREEN_ONLINE:
      return outcome(enterScreen(shell, SCREEN_MODES), COMMAND_ONLINE_LEAVE);
    default:
      return outcome(shell);
  }
}
