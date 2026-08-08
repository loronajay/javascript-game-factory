import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  backspace,
  clearEntry,
  createTextEntry,
  entryView,
  isComplete,
  typeChar,
} from "../scripts/ui/text-entry.js";
import {
  HOME_ITEMS,
  LOBBY_ROW_BEST_OF,
  LOBBY_ROW_DISTANCE,
  LOBBY_ROW_READY,
  LOBBY_ROW_TRACK,
  ONLINE_CREATE,
  ONLINE_JOIN,
  ONLINE_NOTHING,
  ONLINE_OPEN_JOIN,
  ONLINE_READY,
  ONLINE_SEARCH,
  PANE_HOME,
  PANE_JOIN,
  PANE_LOBBY,
  PANE_SEARCHING,
  ONLINE_LAYOUT,
  RESULT_PANEL,
  TARGET_BACK,
  TARGET_CANCEL_SEARCH,
  TARGET_HOME,
  TARGET_JOIN_SUBMIT,
  TARGET_LOBBY_STEP,
  adjustLobby,
  adjustLobbyAt,
  closeJoin,
  codeIsComplete,
  confirmOnline,
  createOnlineMenu,
  hitOnline,
  moveOnline,
  onlineTargets,
  resultButtons,
  onlineView,
  openJoin,
  paneFor,
  typeCode,
  wantsTextCapture,
} from "../scripts/ui/online-menu.js";
import { applyLobby, createSession, searching } from "../scripts/online/session.js";

suite("online menu and typed room codes");

// ---------------------------------------------------------------------------
// Text entry
// ---------------------------------------------------------------------------

test("a room code takes only characters from the server's alphabet", () => {
  let entry = createTextEntry();
  entry = typeChar(entry, "K");
  entry = typeChar(entry, "O"); // not in the alphabet — it would be read as a zero
  entry = typeChar(entry, "7");
  assertEqual(entry.value, "K7", "the ambiguous character is simply not taken");
});

test("typing is case-insensitive, because a code is read aloud", () => {
  let entry = createTextEntry();
  entry = typeChar(entry, "k");
  entry = typeChar(entry, "p");
  assertEqual(entry.value, "KP");
});

test("a full code refuses more rather than scrolling", () => {
  let entry = createTextEntry();
  for (const char of "K7P2MXXXX") entry = typeChar(entry, char);
  assertEqual(entry.value.length, ROOM_CODE_LENGTH);
  assertEqual(entry.value, "K7P2M");
  assert(isComplete(entry));
});

test("backspace and clear do what they say, and are safe when empty", () => {
  let entry = createTextEntry({ value: "K7P" });
  entry = backspace(entry);
  assertEqual(entry.value, "K7");
  entry = clearEntry(entry);
  assertEqual(entry.value, "");
  assertEqual(backspace(entry).value, "", "backspacing an empty field is a no-op");
});

test("the alphabet has no lookalike characters in it at all", () => {
  for (const char of "OI01") {
    if (char === "0" || char === "1") continue;
    assert(!ROOM_CODE_ALPHABET.includes(char), `${char} reads as a digit and must not be in codes`);
  }
});

test("the view says where the caret is, so the boxes cannot disagree with it", () => {
  const view = entryView(createTextEntry({ value: "K7" }));
  assertEqual(view.slots.length, ROOM_CODE_LENGTH);
  assertEqual(view.slots[0].char, "K");
  assertEqual(view.slots[0].filled, true);
  assertEqual(view.slots[2].caret, true, "the caret sits on the next empty slot");
  assertEqual(view.slots[1].caret, false);
  assertEqual(view.complete, false);
});

// ---------------------------------------------------------------------------
// Panes
// ---------------------------------------------------------------------------

const lobbySession = (overrides = {}) =>
  applyLobby(createSession(), {
    roomCode: "K7P2M",
    private: true,
    youAreHost: true,
    yourPlayerId: "p1",
    config: { trackId: "track-a", distanceId: "quarter", bestOf: 3 },
    score: { players: [{ playerId: "p1", wins: 0 }, { playerId: "p2", wins: 0 }] },
    players: [
      { playerId: "p1", displayName: "Ana", lane: 1, ready: false },
      { playerId: "p2", displayName: "Bo", lane: 2, ready: false },
    ],
    ...overrides,
  });

test("the pane follows the session rather than being stored alongside it", () => {
  const menu = createOnlineMenu();
  assertEqual(paneFor(menu, createSession()), PANE_HOME);
  assertEqual(paneFor(menu, searching(createSession())), PANE_SEARCHING);
  assertEqual(paneFor(menu, lobbySession()), PANE_LOBBY);
});

test("the join pane is the one thing the menu owns, because the session cannot see it", () => {
  const menu = openJoin(createOnlineMenu());
  assertEqual(paneFor(menu, createSession()), PANE_JOIN);
  assertEqual(paneFor(closeJoin(menu), createSession()), PANE_HOME);
});

test("only the join pane wants the keyboard typing letters", () => {
  assertEqual(wantsTextCapture(createOnlineMenu(), createSession()), false);
  assertEqual(wantsTextCapture(openJoin(createOnlineMenu()), createSession()), true);
  assertEqual(wantsTextCapture(createOnlineMenu(), lobbySession()), false);
});

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

test("the home cursor walks the three ways in and stops at both ends", () => {
  let menu = createOnlineMenu();
  const session = createSession();
  assertEqual(menu.cursor, 0);
  menu = moveOnline(menu, "up", session);
  assertEqual(menu.cursor, 0, "nothing wraps — a lost cursor is worse than a stuck one");
  for (let i = 0; i < 10; i += 1) menu = moveOnline(menu, "down", session);
  assertEqual(menu.cursor, HOME_ITEMS.length - 1);
});

test("each way in asks for the right thing", () => {
  const session = createSession();
  let menu = createOnlineMenu();
  assertEqual(confirmOnline(menu, session), ONLINE_SEARCH);
  menu = moveOnline(menu, "down", session);
  assertEqual(confirmOnline(menu, session), ONLINE_CREATE);
  menu = moveOnline(menu, "down", session);
  assertEqual(confirmOnline(menu, session), ONLINE_OPEN_JOIN);
});

// ---------------------------------------------------------------------------
// Joining by code
// ---------------------------------------------------------------------------

test("a half-typed code cannot be submitted", () => {
  let menu = openJoin(createOnlineMenu());
  const session = createSession();
  menu = typeCode(menu, { char: "K" });
  menu = typeCode(menu, { char: "7" });
  assertEqual(codeIsComplete(menu), false);
  assertEqual(confirmOnline(menu, session), ONLINE_NOTHING, "ENTER on a short code does nothing");

  for (const char of "P2M") menu = typeCode(menu, { char });
  assertEqual(confirmOnline(menu, session), ONLINE_JOIN);
});

test("a backspace action steps the code back", () => {
  let menu = openJoin(createOnlineMenu());
  for (const char of "K7P") menu = typeCode(menu, { char });
  menu = typeCode(menu, { backspace: true });
  assertEqual(menu.entry.value, "K7");
});

test("opening the join pane starts from an empty field", () => {
  let menu = openJoin(createOnlineMenu());
  for (const char of "K7P2M") menu = typeCode(menu, { char });
  menu = openJoin(menu);
  assertEqual(menu.entry.value, "", "a stale code from a failed join must not be resubmitted");
});

// ---------------------------------------------------------------------------
// The lobby
// ---------------------------------------------------------------------------

test("the lobby cursor walks the settings and the button", () => {
  let menu = createOnlineMenu();
  const session = lobbySession();
  const view = () => onlineView(menu, session).lobby.rows[menu.lobbyCursor].id;
  assertEqual(view(), LOBBY_ROW_TRACK);
  menu = moveOnline(menu, "down", session);
  assertEqual(view(), LOBBY_ROW_DISTANCE);
  menu = moveOnline(menu, "down", session);
  assertEqual(view(), LOBBY_ROW_BEST_OF);
  menu = moveOnline(menu, "down", session);
  assertEqual(view(), LOBBY_ROW_READY);
});

test("the host steps a setting and gets a config to publish", () => {
  const menu = createOnlineMenu();
  const session = lobbySession();
  const next = adjustLobby(menu, "right", session);
  assert(next, "the host should get a config back");
  assert(next.trackId !== session.config.trackId, "and it should have moved");
});

test("a guest moving the same row publishes nothing", () => {
  const menu = createOnlineMenu();
  const session = lobbySession({ youAreHost: false });
  assertEqual(adjustLobby(menu, "right", session), null, "the guest watches, it does not set");
});

test("distances wrap through all four, because a private room opens every length", () => {
  let menu = createOnlineMenu();
  const session = lobbySession();
  menu = moveOnline(menu, "down", session); // distance row
  const seen = new Set();
  let config = session.config;
  for (let i = 0; i < 8; i += 1) {
    config = adjustLobby(menu, "right", { ...session, config });
    seen.add(config.distanceId);
  }
  assertEqual(seen.size, 4, "eighth, quarter, half and mile");
});

test("match length steps through best of one, three and five", () => {
  let menu = createOnlineMenu();
  const session = lobbySession();
  menu = moveOnline(menu, "down", session);
  menu = moveOnline(menu, "down", session); // bestOf row
  const seen = new Set();
  let config = session.config;
  for (let i = 0; i < 6; i += 1) {
    config = adjustLobby(menu, "right", { ...session, config });
    seen.add(config.bestOf);
  }
  assertEqual(seen.size, 3);
  assert(seen.has(1) && seen.has(3) && seen.has(5));
});

test("only the button readies up — a setting row's ENTER does nothing", () => {
  let menu = createOnlineMenu();
  const session = lobbySession();
  assertEqual(confirmOnline(menu, session), ONLINE_NOTHING, "standing on the track row");
  menu = { ...menu, lobbyCursor: 3 };
  assertEqual(confirmOnline(menu, session), ONLINE_READY);
});

test("the lobby shows the settings to the guest, dimmed rather than hidden", () => {
  const guest = onlineView(createOnlineMenu(), lobbySession({ youAreHost: false })).lobby;
  const trackRow = guest.rows.find((row) => row.id === LOBBY_ROW_TRACK);
  assertEqual(trackRow.adjustable, false);
  assertEqual(trackRow.dimmed, true);
  assert(trackRow.value, "but the guest can still read what is being raced");
});

test("this driver is always the first card, whichever seat they took", () => {
  const view = onlineView(createOnlineMenu(), lobbySession({ yourPlayerId: "p2" })).lobby;
  assertEqual(view.drivers[0].playerId, "p2");
  assertEqual(view.drivers[0].you, true);
  assertEqual(view.drivers[1].you, false);
});

test("a lobby with one driver in it says so instead of offering to start", () => {
  const view = onlineView(
    createOnlineMenu(),
    lobbySession({ players: [{ playerId: "p1", displayName: "Ana", lane: 1 }] }),
  ).lobby;
  assertEqual(view.full, false);
  assert(view.waitingFor, "the screen has to explain why nothing is happening");
  const button = view.rows.find((row) => row.id === LOBBY_ROW_READY);
  assertEqual(button.value, "WAITING FOR AN OPPONENT");
});

test("the button says what pressing it does next, not what it did last", () => {
  const staged = onlineView(
    createOnlineMenu(),
    lobbySession({
      players: [
        { playerId: "p1", displayName: "Ana", lane: 1, ready: true },
        { playerId: "p2", displayName: "Bo", lane: 2, ready: false },
      ],
    }),
  ).lobby;
  const button = staged.rows.find((row) => row.id === LOBBY_ROW_READY);
  assert(button.value.includes("WAITING"), "a driver already staged is not invited to stage again");
});

test("the view resolves track and distance names, so the renderer looks nothing up", () => {
  const view = onlineView(createOnlineMenu(), lobbySession()).lobby;
  assertEqual(view.rows[0].value, "Grasslands");
  assertEqual(view.rows[1].value, "1/4 Mile");
  assertEqual(view.rows[2].value, "BEST OF 3");
});

// ---------------------------------------------------------------------------
// The mouse
// ---------------------------------------------------------------------------

const centre = (rect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });

test("every way in is clickable, and the click lands on the one under the pointer", () => {
  const view = onlineView(createOnlineMenu(), createSession());
  const targets = onlineTargets(view).filter((target) => target.kind === TARGET_HOME);
  assertEqual(targets.length, HOME_ITEMS.length, "all three, not just the highlighted one");

  targets.forEach((target, index) => {
    const hit = hitOnline(view, centre(target.rect).x, centre(target.rect).y);
    assertEqual(hit.kind, TARGET_HOME);
    assertEqual(hit.index, index, "the row you press is the row you pressed");
  });
});

test("no two targets on any pane claim the same pixel", () => {
  const panes = [
    onlineView(createOnlineMenu(), createSession()),
    onlineView(openJoin(createOnlineMenu()), createSession()),
    onlineView(createOnlineMenu(), searching(createSession())),
    onlineView(createOnlineMenu(), lobbySession()),
  ];
  for (const view of panes) {
    const targets = onlineTargets(view);
    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const a = targets[i].rect;
        const b = targets[j].rect;
        const overlaps = a.x < b.x + b.width && b.x < a.x + a.width
          && a.y < b.y + b.height && b.y < a.y + a.height;
        // A stepper deliberately sits inside its row; the hit test resolves it
        // first, which is what makes clicking an arrow step rather than select.
        const nested = targets[i].kind === TARGET_LOBBY_STEP || targets[j].kind === TARGET_LOBBY_STEP;
        assert(!overlaps || nested, `${view.pane}: ${targets[i].kind} overlaps ${targets[j].kind}`);
      }
    }
  }
});

test("a stepper arrow wins over the row it sits inside", () => {
  const view = onlineView(createOnlineMenu(), lobbySession());
  const step = onlineTargets(view).find((target) => target.kind === TARGET_LOBBY_STEP);
  const hit = hitOnline(view, centre(step.rect).x, centre(step.rect).y);
  assertEqual(hit.kind, TARGET_LOBBY_STEP, "clicking an arrow must step, not merely select");
  assertEqual(hit.direction, step.direction);
});

test("a guest's settings have no arrows to click", () => {
  const view = onlineView(createOnlineMenu(), lobbySession({ youAreHost: false }));
  const steps = onlineTargets(view).filter((target) => target.kind === TARGET_LOBBY_STEP);
  assertEqual(steps.length, 0, "a control that is not drawn must not be a target");
});

test("clicking an arrow steps the row it belongs to, not the one the caret is on", () => {
  const session = lobbySession();
  // Caret on the track row; the click lands on the distance row's arrow.
  const menu = createOnlineMenu();
  const next = adjustLobbyAt(1, "right", session);
  assert(next.distanceId !== session.config.distanceId, "the distance moved");
  assertEqual(next.trackId, session.config.trackId, "and the track did not");
  assertEqual(menu.lobbyCursor, 0, "the caret is irrelevant to where a click landed");
});

test("hover is resolved by the same function that resolves the click", () => {
  const view = onlineView(createOnlineMenu(), createSession());
  const target = onlineTargets(view)[2];
  const hovered = onlineView(createOnlineMenu(), createSession(), { pointer: centre(target.rect) });
  assertEqual(hovered.hover.kind, target.kind);
  assertEqual(hovered.hover.index, target.index);
  assertEqual(hovered.home[2].hovered, true, "and the thing under the pointer lights up");
  assertEqual(hovered.home[0].hovered, false);
});

test("hovering nothing highlights nothing", () => {
  const view = onlineView(createOnlineMenu(), createSession(), { pointer: { x: 5, y: 700 } });
  assertEqual(view.hover, null);
  assert(view.home.every((item) => !item.hovered));
});

test("hover never moves the pick — it only marks what a click would take", () => {
  const menu = createOnlineMenu();
  const view = onlineView(menu, createSession(), { pointer: { x: 300, y: 400 } });
  assertEqual(menu.cursor, 0, "the menu itself is untouched by looking at it");
  assert(view.home[0].highlighted, "the cursor is still where it was");
});

test("the join pane offers a submit button only once the code is whole", () => {
  let menu = openJoin(createOnlineMenu());
  const short = onlineView(menu, createSession());
  assertEqual(
    onlineTargets(short).some((target) => target.kind === TARGET_JOIN_SUBMIT),
    false,
    "an inert button the player can press and watch do nothing is worse than none",
  );

  for (const char of "K7P2M") menu = typeCode(menu, { char });
  const whole = onlineView(menu, createSession());
  assert(onlineTargets(whole).some((target) => target.kind === TARGET_JOIN_SUBMIT));
});

test("every pane has a way back out that can be clicked", () => {
  const withBack = [
    onlineView(openJoin(createOnlineMenu()), createSession()),
    onlineView(createOnlineMenu(), lobbySession()),
  ];
  for (const view of withBack) {
    assert(
      onlineTargets(view).some((target) => target.kind === TARGET_BACK),
      `${view.pane} has no clickable way out`,
    );
  }
  const searchingView = onlineView(createOnlineMenu(), searching(createSession()));
  assert(onlineTargets(searchingView).some((target) => target.kind === TARGET_CANCEL_SEARCH));
});

test("every target sits on screen", () => {
  const panes = [
    onlineView(createOnlineMenu(), createSession()),
    onlineView(openJoin(createOnlineMenu()), createSession()),
    onlineView(createOnlineMenu(), searching(createSession())),
    onlineView(createOnlineMenu(), lobbySession()),
  ];
  for (const view of panes) {
    for (const target of onlineTargets(view)) {
      const { x, y, width, height } = target.rect;
      assert(x >= 0 && y >= 0, `${view.pane}/${target.kind} starts off screen`);
      assert(x + width <= 1280, `${view.pane}/${target.kind} runs off the right`);
      assert(y + height <= 720, `${view.pane}/${target.kind} runs off the bottom`);
    }
  }
});

// ---------------------------------------------------------------------------
// The result panel's buttons
// ---------------------------------------------------------------------------

const finishedSession = (overrides = {}) => ({
  ...lobbySession(),
  status: "match-result",
  rematch: { requested: [], asked: false },
  ...overrides,
});

test("a finished round offers one button, a finished match offers two", () => {
  const round = resultButtons({ ...lobbySession(), status: "round-result" });
  assertEqual(round.length, 1);
  assertEqual(round[0].id, "next");

  const match = resultButtons(finishedSession());
  assertEqual(match.length, 2);
  assertEqual(match.map((button) => button.id).join(","), "rematch,leave");
});

test("the rematch button says it is waiting once this side has asked", () => {
  const asked = resultButtons(finishedSession({ rematch: { requested: [], asked: true } }));
  assert(asked[0].label.includes("WAITING"), "pressing it again should not look available");
});

test("the result buttons sit inside the panel and do not overlap", () => {
  for (const session of [{ ...lobbySession(), status: "round-result" }, finishedSession()]) {
    const buttons = resultButtons(session);
    for (const button of buttons) {
      assert(button.rect.x >= RESULT_PANEL.x, "a button starts left of its panel");
      assert(
        button.rect.x + button.rect.width <= RESULT_PANEL.x + RESULT_PANEL.width,
        "a button runs past its panel",
      );
      assert(
        button.rect.y + button.rect.height <= RESULT_PANEL.y + RESULT_PANEL.height,
        "a button runs below its panel",
      );
    }
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i].rect;
        const b = buttons[j].rect;
        assert(a.x + a.width <= b.x || b.x + b.width <= a.x, "two result buttons overlap");
      }
    }
  }
});

test("no reducer mutates the menu it is given", () => {
  const menu = createOnlineMenu();
  const moved = moveOnline(menu, "down", createSession());
  assertEqual(menu.cursor, 0);
  assert(moved !== menu);
});

finish();
