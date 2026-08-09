import { suite, test, assert, assertEqual, finish } from "./harness.js";

import { MODES, MODE_DISTANCE, MODE_TIME_ATTACK, MODE_ONLINE, DEFAULT_MODE_ID } from "../scripts/sim/modes.js";
import {
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
  SCREENS,
  COMMAND_NONE,
  COMMAND_BEGIN,
  COMMAND_MODE,
  COMMAND_LOCKED,
  COMMAND_TUTORIAL,
  COMMAND_RESTART,
  COMMAND_BOARDS,
  COMMAND_ONLINE,
  COMMAND_ONLINE_LEAVE,
  COMMAND_CAMPAIGN,
  createShell,
  enterScreen,
  isMenuScreen,
  showsTheRace,
  menuFor,
  moveShell,
  confirmShell,
  cancelShell,
} from "../scripts/ui/shell.js";

suite("shell — title, menus, and the flow between them");

/** Confirms repeatedly, following the shell the way the game loop does. */
const confirmTo = (shell, times = 1) => {
  let next = shell;
  for (let i = 0; i < times; i += 1) next = confirmShell(next).shell;
  return next;
};

const walk = (shell, ...directions) => directions.reduce(moveShell, shell);

// ---------------------------------------------------------------------------
// Where the game opens
// ---------------------------------------------------------------------------

test("the game opens on the title screen", () => {
  const shell = createShell();
  assertEqual(shell.screen, SCREEN_TITLE);
  assertEqual(shell.modeId, DEFAULT_MODE_ID);
});

test("every screen is handled by exactly one of the input paths", () => {
  // The game loop dispatches a key press to the menus, to the setup cursor, to
  // the garage editor's cursor, to the collection's cursor, to the leaderboard
  // screen's cursor, to the radio's own cursor, to the online screen's cursor,
  // or to the race. A screen belonging to none of them would swallow input; one
  // belonging to two would double-handle it.
  for (const screen of SCREENS) {
    const paths = [
      isMenuScreen(screen),
      screen === SCREEN_SETUP,
      screen === SCREEN_GARAGE,
      screen === SCREEN_COLLECTION,
      screen === SCREEN_BOARDS,
      screen === SCREEN_RADIO,
      screen === SCREEN_RACE,
      screen === SCREEN_ONLINE,
      screen === SCREEN_CAMPAIGN,
    ];
    assertEqual(paths.filter(Boolean).length, 1, `${screen} is handled by ${paths.filter(Boolean).length} paths`);
  }
});

test("the garage is not a menu screen and does not replace the race", () => {
  // It owns its own cursor and its own ENTER, exactly as the setup and radio
  // screens do, so the shared menu machinery must not claim it.
  assert(!isMenuScreen(SCREEN_GARAGE));
  assert(!showsTheRace(SCREEN_GARAGE));
});

test("backing out of the garage returns to whichever screen opened it", () => {
  // Two ways in now: the setup screen's paint pane, and an online lobby. A
  // hardcoded return would drop a driver out of the room they are sitting in.
  const fromSetup = enterScreen(enterScreen(createShell(), SCREEN_SETUP), SCREEN_GARAGE);
  assertEqual(cancelShell(fromSetup).shell.screen, SCREEN_SETUP);

  const fromLobby = enterScreen(enterScreen(createShell(), SCREEN_ONLINE), SCREEN_GARAGE);
  assertEqual(cancelShell(fromLobby).shell.screen, SCREEN_ONLINE);
});

test("re-entering the garage from itself cannot trap the player there", () => {
  // The radio's rule, for the radio's reason: a return that pointed at the
  // screen you are on is an ESC that goes nowhere.
  const twice = enterScreen(enterScreen(enterScreen(createShell(), SCREEN_ONLINE), SCREEN_GARAGE), SCREEN_GARAGE);
  assertEqual(cancelShell(twice).shell.screen, SCREEN_SETUP);
});

test("the garage declines ENTER, leaving it to the editor's own actions", () => {
  const shell = enterScreen(createShell(), SCREEN_GARAGE);
  assertEqual(confirmShell(shell).shell.screen, SCREEN_GARAGE);
});

test("the title menu opens the collection, and ESC comes back to it", () => {
  // The garage is somewhere a player goes *instead* of racing, so it hangs off
  // the title menu rather than off the pre-race picker alone.
  const title = createShell();
  const index = menuFor(title).items.findIndex((item) => item.id === "garage");
  assert(index >= 0, "the title menu offers no way into the garage");
  const { shell, command } = confirmShell({ ...title, cursor: index });
  assertEqual(shell.screen, SCREEN_COLLECTION);
  assertEqual(command, COMMAND_NONE);
  assertEqual(cancelShell(shell).shell.screen, SCREEN_TITLE);
});

test("the collection is not a menu screen and does not replace the race", () => {
  // It owns its own cursor and its own ENTER, exactly as the setup, garage and
  // radio screens do.
  assert(!isMenuScreen(SCREEN_COLLECTION));
  assert(!showsTheRace(SCREEN_COLLECTION));
  assertEqual(menuFor(enterScreen(createShell(), SCREEN_COLLECTION)), null);
});

test("the collection declines ENTER, leaving it to its own cell action", () => {
  const shell = enterScreen(createShell(), SCREEN_COLLECTION);
  assertEqual(confirmShell(shell).shell.screen, SCREEN_COLLECTION);
});

test("the leaderboards open from the title menu and back out to it", () => {
  const title = createShell();
  const index = menuFor(title).items.findIndex((item) => item.id === "boards");
  assert(index >= 0, "the title menu offers no way to the leaderboards");

  // The command is what points the tabs at the mode the player is set up for and
  // asks for its board — entering the screen alone would show an idle list that
  // never loads.
  const opened = confirmShell({ ...title, cursor: index });
  assertEqual(opened.shell.screen, SCREEN_BOARDS);
  assertEqual(opened.command, COMMAND_BOARDS);
  assertEqual(cancelShell(opened.shell).shell.screen, SCREEN_TITLE);
});

test("the leaderboards own their own cursor and have nothing to confirm", () => {
  const shell = enterScreen(createShell(), SCREEN_BOARDS);
  assert(!isMenuScreen(SCREEN_BOARDS));
  assert(!showsTheRace(SCREEN_BOARDS), "the leaderboards replace the world rather than sitting over a race");
  assertEqual(menuFor(shell), null);
  // Every tab is taken by moving onto it, so ENTER is deliberately inert rather
  // than being given a job to justify the key.
  assertEqual(confirmShell(shell).shell.screen, SCREEN_BOARDS);
  assertEqual(confirmShell(shell).command, COMMAND_NONE);
});

test("the editor opened from the collection backs out to the collection", () => {
  // Third way into the garage, and the reason `garageReturn` exists at all: a
  // hardcoded return would drop the player onto the pre-race picker instead.
  const fromCollection = enterScreen(enterScreen(createShell(), SCREEN_COLLECTION), SCREEN_GARAGE);
  assertEqual(cancelShell(fromCollection).shell.screen, SCREEN_COLLECTION);
});

test("the screens drawn over a live race say so", () => {
  // Pause and results are modals over the world, not replacements for it.
  assert(showsTheRace(SCREEN_RACE));
  assert(showsTheRace(SCREEN_PAUSED));
  assert(showsTheRace(SCREEN_RESULTS));
  assert(!showsTheRace(SCREEN_TITLE));
  assert(!showsTheRace(SCREEN_MODES));
  assert(!showsTheRace(SCREEN_SETUP));
});

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

test("only the screens with a list of choices have a menu", () => {
  assert(menuFor(createShell()), "the title screen still needs its prompt");
  assert(menuFor(enterScreen(createShell(), SCREEN_MODES)));
  assert(menuFor(enterScreen(createShell(), SCREEN_PAUSED)));
  assert(menuFor(enterScreen(createShell(), SCREEN_RESULTS)));
  assertEqual(menuFor(enterScreen(createShell(), SCREEN_SETUP)), null, "the setup screen owns its own cursor");
  assertEqual(menuFor(enterScreen(createShell(), SCREEN_RACE)), null);
});

test("every menu names itself and offers something to choose", () => {
  for (const screen of SCREENS.filter(isMenuScreen)) {
    const menu = menuFor(enterScreen(createShell(), screen));
    assert(menu.title, `${screen} has no heading`);
    assert(menu.items.length > 0, `${screen} offers nothing`);
    for (const item of menu.items) {
      assert(item.id && item.label, `${screen} has a nameless item`);
    }
  }
});

test("exactly one menu item is highlighted, and it is the one the cursor is on", () => {
  const shell = enterScreen(createShell(), SCREEN_PAUSED);
  const menu = menuFor(shell);
  assertEqual(menu.items.filter((item) => item.highlighted).length, 1);
  assert(menu.items[shell.cursor].highlighted);
  assertEqual(menuFor(moveShell(shell, "down")).items[1].highlighted, true);
});

test("the cursor stops at the ends instead of wrapping", () => {
  const shell = enterScreen(createShell(), SCREEN_PAUSED);
  const length = menuFor(shell).items.length;
  assertEqual(walk(shell, "up", "up", "up").cursor, 0);
  assertEqual(walk(shell, ...Array(20).fill("down")).cursor, length - 1);
});

test("left and right do nothing in a vertical menu", () => {
  const shell = enterScreen(createShell(), SCREEN_MODES);
  assertEqual(moveShell(shell, "left").cursor, shell.cursor);
  assertEqual(moveShell(shell, "right").cursor, shell.cursor);
});

test("moving never mutates the shell it was given", () => {
  const shell = enterScreen(createShell(), SCREEN_MODES);
  const before = JSON.stringify(shell);
  moveShell(shell, "down");
  confirmShell(shell);
  cancelShell(shell);
  assertEqual(JSON.stringify(shell), before);
});

test("the cursor cannot point past the end of a shorter menu", () => {
  // Results has fewer entries than pause; landing on it must not leave the
  // cursor dangling off the end of the list.
  const paused = walk(enterScreen(createShell(), SCREEN_PAUSED), "down", "down", "down");
  const results = enterScreen(paused, SCREEN_RESULTS);
  assert(results.cursor < menuFor(results).items.length);
});

// ---------------------------------------------------------------------------
// The forward path: title -> modes -> setup -> race
// ---------------------------------------------------------------------------

test("the title screen leads to the mode list", () => {
  const { shell, command } = confirmShell(createShell());
  assertEqual(shell.screen, SCREEN_MODES);
  assertEqual(command, COMMAND_NONE);
});

/**
 * Where a row sits on the mode list.
 *
 * The list is not `MODES` any more: the campaign is a row at the head of it that
 * is not a mode at all. Locating by id rather than by catalog index is what
 * stops these tests asserting about whichever mode has landed one row down.
 */
function modeCursor(id) {
  const items = menuFor(enterScreen(createShell(), SCREEN_MODES)).items;
  return items.findIndex((item) => item.id === id);
}

test("choosing a mode adopts it and moves on to the setup screen", () => {
  // Walked rather than assumed adjacent: the catalog gains modes, and a test
  // that hardcodes "one down from the top" starts asserting about whichever
  // mode happens to have landed there.
  let timeAttack = confirmTo(createShell());
  const target = modeCursor(MODE_TIME_ATTACK);
  while (timeAttack.cursor < target) timeAttack = moveShell(timeAttack, "down");
  const { shell, command } = confirmShell(timeAttack);
  assertEqual(shell.modeId, MODE_TIME_ATTACK);
  assertEqual(shell.screen, SCREEN_SETUP);
  assertEqual(command, COMMAND_MODE, "the setup screen has to be rebuilt around the new mode");
});

test("the mode list opens on the mode already chosen", () => {
  const onTimeAttack = { ...createShell(), modeId: MODE_TIME_ATTACK };
  const modes = enterScreen(onTimeAttack, SCREEN_MODES);
  assertEqual(menuFor(modes).items[modes.cursor].id, MODE_TIME_ATTACK);
});

test("a locked mode says no and changes nothing", () => {
  // Every shipped mode is playable, so this drives the machinery with a cursor
  // parked past the end of the list — the same path a future locked entry takes.
  // Keeping it exercised is the point: the buzz-and-stay behaviour is what an
  // unfinished mode on the roadmap will rely on.
  const modes = enterScreen(createShell(), SCREEN_MODES);
  const { shell, command } = confirmShell({ ...modes, cursor: MODES.length + 1 });
  assertEqual(command, COMMAND_LOCKED, "the caller needs to know to buzz rather than to advance");
  assertEqual(shell.screen, SCREEN_MODES);
  assertEqual(shell.modeId, DEFAULT_MODE_ID, "and nothing may be adopted on the way");
});

test("each mode says what the setup screen will ask it for", () => {
  // The detail panel lists the objective options, so choosing a mode is not a
  // blind commitment to whatever it turns out to offer.
  for (const item of menuFor(enterScreen(createShell(), SCREEN_MODES)).items) {
    const mode = MODES.find((m) => m.id === item.id);
    // The campaign row is not a mode — an event names its own distance — so it
    // is checked for having *something* to say rather than against the catalog.
    if (!mode) {
      assert(item.objectiveLabel && item.objectiveOptions.length > 0, `${item.id} says nothing`);
      continue;
    }
    assertEqual(item.objectiveLabel, mode.objective.label);
    assertEqual(item.objectiveOptions.join(","), mode.objective.options.map((o) => o.label).join(","));
  }
});

test("every mode is listed, and a note explains any that cannot be entered", () => {
  const menu = menuFor(enterScreen(createShell(), SCREEN_MODES));
  // Every mode, plus the campaign at the head of the list — it is a way to
  // play, which is what this screen is a list of.
  assertEqual(menu.items.length, MODES.length + 1, "the roadmap should be visible, not hidden");
  assertEqual(menu.items[0].id, "campaign", "the campaign heads the list");
  for (const item of menu.items) {
    if (!item.enabled) assert(item.note, `${item.id} is locked with no explanation`);
  }
});

test("online is listed, enabled, and goes to the lobby rather than the setup screen", () => {
  const modes = enterScreen(createShell(), SCREEN_MODES);
  const { shell, command } = confirmShell({ ...modes, cursor: modeCursor(MODE_ONLINE) });

  assertEqual(shell.screen, SCREEN_ONLINE, "the strip belongs to the room, not to one driver");
  assertEqual(command, COMMAND_ONLINE, "and the socket has to be opened");
  assertEqual(shell.modeId, MODE_ONLINE);
});

test("the campaign is on the mode list, not the title menu", () => {
  // It is a way to *play*, and this screen is the list of those. The title menu
  // is for everything that is not racing — the garage, the boards, the stereo.
  const title = menuFor(createShell()).items.map((item) => item.id);
  assert(!title.includes("campaign"), "the campaign does not belong on the title menu");

  const modes = enterScreen(createShell(), SCREEN_MODES);
  const { shell, command } = confirmShell({ ...modes, cursor: modeCursor("campaign") });
  assertEqual(shell.screen, SCREEN_CAMPAIGN);
  assertEqual(command, COMMAND_CAMPAIGN, "the career has to be read off disk on the way in");
  // And picking it must not adopt it as the mode: an event names its own.
  assertEqual(shell.modeId, DEFAULT_MODE_ID);
});

test("backing out of online closes the session as well as the screen", () => {
  // An abandoned lobby nobody left is a room the server keeps alive and an
  // opponent waiting on a driver who is not coming back.
  const online = enterScreen(createShell(), SCREEN_ONLINE);
  const { shell, command } = cancelShell(online);
  assertEqual(shell.screen, SCREEN_MODES);
  assertEqual(command, COMMAND_ONLINE_LEAVE);
});

test("the online screen owns its own ENTER, as the setup and garage screens do", () => {
  const online = enterScreen(createShell(), SCREEN_ONLINE);
  assertEqual(confirmShell(online).command, COMMAND_NONE);
  assertEqual(confirmShell(online).shell.screen, SCREEN_ONLINE);
  assert(!isMenuScreen(SCREEN_ONLINE), "it is not driven by the shared menu machinery");
  assert(!showsTheRace(SCREEN_ONLINE), "and it replaces the world rather than sitting over it");
});

test("confirming the setup screen starts the race", () => {
  const setup = enterScreen(createShell(), SCREEN_SETUP);
  const { shell, command } = confirmShell(setup);
  assertEqual(shell.screen, SCREEN_RACE);
  assertEqual(command, COMMAND_BEGIN);
});

test("confirm does nothing on the race screen — the race owns that key", () => {
  const race = enterScreen(createShell(), SCREEN_RACE);
  const { shell, command } = confirmShell(race);
  assertEqual(shell.screen, SCREEN_RACE);
  assertEqual(command, COMMAND_NONE);
});

// ---------------------------------------------------------------------------
// The way back out
// ---------------------------------------------------------------------------

test("cancel unwinds the flow one screen at a time", () => {
  const back = (screen) => cancelShell(enterScreen(createShell(), screen)).shell.screen;
  assertEqual(back(SCREEN_SETUP), SCREEN_MODES);
  assertEqual(back(SCREEN_MODES), SCREEN_TITLE);
  assertEqual(back(SCREEN_RACE), SCREEN_PAUSED, "backing out of a live race pauses it first");
  assertEqual(back(SCREEN_PAUSED), SCREEN_RACE, "and backing out of the pause menu resumes");
  assertEqual(back(SCREEN_RESULTS), SCREEN_SETUP);
});

test("there is nothing above the title screen to back out to", () => {
  const { shell, command } = cancelShell(createShell());
  assertEqual(shell.screen, SCREEN_TITLE);
  assertEqual(command, COMMAND_NONE);
});

test("backing out never restarts the race behind the menu", () => {
  // Leaving online is the one exception, and it tears a session down rather
  // than building anything — no race is rebuilt on any cancel path.
  for (const screen of SCREENS) {
    const command = cancelShell(enterScreen(createShell(), screen)).command;
    const allowed = screen === SCREEN_ONLINE ? COMMAND_ONLINE_LEAVE : COMMAND_NONE;
    assertEqual(command, allowed, screen);
  }
});

// ---------------------------------------------------------------------------
// Pause and results — the two menus drawn over a race
// ---------------------------------------------------------------------------

test("the pause menu can resume, restart, re-setup, or quit to the mode list", () => {
  const paused = enterScreen(createShell(), SCREEN_PAUSED);
  const outcomes = menuFor(paused).items.map((item, index) => {
    const { shell, command } = confirmShell({ ...paused, cursor: index });
    return `${item.id}:${shell.screen}:${command}`;
  });
  assert(outcomes.includes(`resume:${SCREEN_RACE}:${COMMAND_NONE}`), outcomes.join(" "));
  assert(outcomes.includes(`restart:${SCREEN_RACE}:${COMMAND_RESTART}`), outcomes.join(" "));
  assert(outcomes.includes(`setup:${SCREEN_SETUP}:${COMMAND_NONE}`), outcomes.join(" "));
  assert(outcomes.includes(`menu:${SCREEN_MODES}:${COMMAND_NONE}`), outcomes.join(" "));
});

test("the results menu can run it again, change the setup, or quit to the mode list", () => {
  const results = enterScreen(createShell(), SCREEN_RESULTS);
  const outcomes = menuFor(results).items.map((item, index) => {
    const { shell, command } = confirmShell({ ...results, cursor: index });
    return `${item.id}:${shell.screen}:${command}`;
  });
  assert(outcomes.includes(`again:${SCREEN_RACE}:${COMMAND_RESTART}`), outcomes.join(" "));
  assert(outcomes.includes(`setup:${SCREEN_SETUP}:${COMMAND_NONE}`), outcomes.join(" "));
  assert(outcomes.includes(`menu:${SCREEN_MODES}:${COMMAND_NONE}`), outcomes.join(" "));
});

test("only a deliberate restart rebuilds the race", () => {
  // Resuming from pause must land back in the race that was already running.
  const paused = enterScreen(createShell(), SCREEN_PAUSED);
  const resumeIndex = menuFor(paused).items.findIndex((item) => item.id === "resume");
  assertEqual(confirmShell({ ...paused, cursor: resumeIndex }).command, COMMAND_NONE);
});

test("every menu item resolves to a handled command", () => {
  const handled = new Set([
    COMMAND_NONE,
    COMMAND_BEGIN,
    COMMAND_RESTART,
    COMMAND_MODE,
    COMMAND_LOCKED,
    COMMAND_TUTORIAL,
    COMMAND_BOARDS,
    COMMAND_ONLINE,
    COMMAND_ONLINE_LEAVE,
    COMMAND_CAMPAIGN,
  ]);
  for (const screen of SCREENS.filter(isMenuScreen)) {
    const shell = enterScreen(createShell(), screen);
    menuFor(shell).items.forEach((item, index) => {
      const { command } = confirmShell({ ...shell, cursor: index });
      assert(handled.has(command), `${screen}/${item.id} produced the unhandled ${command}`);
    });
  }
});

test("the chosen mode survives every trip through the menus", () => {
  let shell = { ...createShell(), modeId: MODE_TIME_ATTACK };
  for (const screen of [SCREEN_SETUP, SCREEN_RACE, SCREEN_PAUSED, SCREEN_MODES, SCREEN_TITLE]) {
    shell = enterScreen(shell, screen);
    assertEqual(shell.modeId, MODE_TIME_ATTACK, `${screen} forgot the mode`);
  }
  assertEqual(cancelShell(shell).shell.modeId, MODE_TIME_ATTACK);
});

test("a mode chosen once is still chosen the next time round", () => {
  const chosen = { ...createShell(), modeId: MODE_DISTANCE };
  const modes = enterScreen(chosen, SCREEN_MODES);
  assertEqual(confirmShell(modes).shell.modeId, MODE_DISTANCE);
});

// ---------------------------------------------------------------------------
// The radio
// ---------------------------------------------------------------------------

const itemIndex = (shell, id) => menuFor(shell).items.findIndex((item) => item.id === id);

test("the title screen offers the stereo without starting a race", () => {
  // A folder should be settable before the first run, not only after it.
  const title = createShell();
  const onRadio = { ...title, cursor: itemIndex(title, "radio") };
  assertEqual(confirmShell(onRadio).shell.screen, SCREEN_RADIO);
  assertEqual(confirmShell(onRadio).command, COMMAND_NONE);
});

test("the title screen still starts a race from its first item", () => {
  const title = createShell();
  assertEqual(itemIndex(title, "start"), 0, "START must stay the item ENTER lands on");
  assertEqual(confirmShell(title).shell.screen, SCREEN_MODES);
});

test("the tutorial goes straight to the track, past the mode list and the picker", () => {
  // A guided run is a fixed run: asking a player to choose a car before they
  // have been told how to drive one is the wrong order.
  const title = createShell();
  const onTutorial = { ...title, cursor: itemIndex(title, "tutorial") };
  assertEqual(confirmShell(onTutorial).shell.screen, SCREEN_RACE);
  assertEqual(confirmShell(onTutorial).command, COMMAND_TUTORIAL);
});

test("restarting a run is a different request from building a picked one", () => {
  // RESTART RUN and RUN IT AGAIN mean "the same thing again", which on a guided
  // run is the lesson. Only the setup screen says "build what I just picked", so
  // only it may drop the tutorial. Sharing one command is what made RESTART RUN
  // quietly turn a tutorial into a normal race.
  const paused = enterScreen(createShell(), SCREEN_PAUSED);
  const onRestart = { ...paused, cursor: itemIndex(paused, "restart") };
  assertEqual(confirmShell(onRestart).command, COMMAND_RESTART);

  const results = enterScreen(createShell(), SCREEN_RESULTS);
  const onAgain = { ...results, cursor: itemIndex(results, "again") };
  assertEqual(confirmShell(onAgain).command, COMMAND_RESTART);

  assertEqual(confirmShell(enterScreen(createShell(), SCREEN_SETUP)).command, COMMAND_BEGIN);
});

test("the stereo is reachable from a paused race too", () => {
  const paused = enterScreen(createShell(), SCREEN_PAUSED);
  const onRadio = { ...paused, cursor: itemIndex(paused, "radio") };
  assertEqual(confirmShell(onRadio).shell.screen, SCREEN_RADIO);
});

test("backing out of the radio returns to wherever it was opened from", () => {
  // A race paused behind the stereo is still sitting there and must be returned
  // to, not thrown away.
  const fromTitle = enterScreen(createShell(), SCREEN_RADIO);
  assertEqual(cancelShell(fromTitle).shell.screen, SCREEN_TITLE);

  const fromPause = enterScreen(enterScreen(createShell(), SCREEN_PAUSED), SCREEN_RADIO);
  assertEqual(cancelShell(fromPause).shell.screen, SCREEN_PAUSED);
});

test("re-entering the radio from itself cannot trap the player there", () => {
  const stuck = enterScreen(enterScreen(createShell(), SCREEN_RADIO), SCREEN_RADIO);
  assert(cancelShell(stuck).shell.screen !== SCREEN_RADIO, "ESC left the player on the radio screen");
});

test("the radio screen has no shell menu, because it owns its own cursor", () => {
  assertEqual(menuFor(enterScreen(createShell(), SCREEN_RADIO)), null);
  assertEqual(isMenuScreen(SCREEN_RADIO), false);
});

test("the radio replaces the world rather than sitting over a live race", () => {
  assert(!showsTheRace(SCREEN_RADIO));
});

test("confirm on the radio screen is left to the radio", () => {
  const radio = enterScreen(createShell(), SCREEN_RADIO);
  const { shell, command } = confirmShell(radio);
  assertEqual(shell.screen, SCREEN_RADIO);
  assertEqual(command, COMMAND_NONE);
});

test("the chosen mode survives a trip to the stereo", () => {
  const chosen = { ...createShell(), modeId: MODE_TIME_ATTACK };
  const there = enterScreen(enterScreen(chosen, SCREEN_PAUSED), SCREEN_RADIO);
  assertEqual(cancelShell(there).shell.modeId, MODE_TIME_ATTACK);
});

finish();
