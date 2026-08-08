// The online screen's own cursor: how you get into a match, and the lobby you
// wait in once you are.
//
// PURE, and the same split `setup-menu.js` and `garage-editor.js` follow — the
// shell says *which* screen, this says what the cursor is doing on it, and
// `render/online.js` decides nothing. `online/session.js` holds what the server
// has told us; this holds what the player is pointing at.
//
// Four panes, and which one is live is derived from the session rather than
// stored twice:
//
//   HOME       quick search / create a private room / join by code
//   JOIN       five characters, typed (see ui/text-entry.js for why that needed
//              a capture mode at all)
//   SEARCHING  waiting for an opponent, with a way out
//   LOBBY      who is here, what is being raced, and the ready button
//
// The lobby's config rows are live for the host and inert for the guest, and
// that is a *rendering* difference rather than two different lobbies: the guest
// still sees every row and watches it change, because a race whose settings are
// invisible to one driver is a race they did not agree to.
//
// **The car rows are the exception, and the split is the whole point.** The race
// belongs to the room, so only the host sets it; the car belongs to the driver,
// so both drivers always set their own. They sit in the same list because they
// are answers to the same question — "what am I about to run?" — and the car
// comes first because it is the row a guest can always use, so the cursor never
// opens on something inert.

import { BEST_OF_OPTIONS } from "../sim/match.js";
import { RACE_DISTANCES } from "../sim/constants.js";
import { modelById } from "../assets/car-atlas.js";
import { TRACKS } from "./track-layout.js";
import {
  ROOM_CODE_LENGTH,
  backspace,
  createTextEntry,
  entryView,
  isComplete,
  typeChar,
} from "./text-entry.js";
import {
  STATUS_SEARCHING,
  STATUS_LOBBY,
  STATUS_IDLE,
  STATUS_CONNECTING,
  STATUS_ERROR,
} from "../online/session.js";

export const PANE_HOME = "home";
export const PANE_JOIN = "join";
export const PANE_SEARCHING = "searching";
export const PANE_LOBBY = "lobby";

/**
 * Where everything on the online screen is drawn.
 *
 * Geometry lives here rather than in the renderer for the reason `menuListBox`
 * exists: the mouse and the drawing must not be able to disagree about where a
 * button is. `render/online.js` reads these boxes, `onlineTargets` turns them
 * into click targets, and both come from this one table.
 */
export const ONLINE_LAYOUT = {
  title: { x: 96, y: 92 },
  panel: { x: 96, y: 150, width: 520, height: 420 },
  detail: { x: 664, y: 150, width: 520, height: 420 },
  row: { height: 62, gap: 10 },
  code: { x: 664, y: 250, slot: 74, gap: 14, height: 96 },
  /** Drawn buttons. Every one of these is clickable — that is the whole point. */
  submit: { x: 664, y: 400, width: 260, height: 60 },
  cancel: { x: 96, y: 330, width: 300, height: 60 },
  back: { x: 96, y: 620, width: 200, height: 54 },
  /** The stepper arrows on an adjustable lobby row, relative to its right edge. */
  step: { width: 40, inset: 96 },
  /**
   * The way into the garage from a lobby. A drawn button rather than a row,
   * because the six rows above it are all things you *hold* and this is a thing
   * you *do* — the same reason the setup screen's START is a button.
   */
  customise: { x: 316, y: 620, width: 300, height: 54 },
  footer: { x: 96, y: 640 },
};

/** The result panel, drawn over a live race. Sized to clear the cluster. */
export const RESULT_PANEL = { x: 240, y: 60, width: 800, height: 400 };
export const RESULT_BUTTON = { width: 300, height: 52, gap: 16 };

/** What the home pane offers, in the order it reads. */
export const HOME_ITEMS = [
  {
    id: "search",
    label: "QUICK SEARCH",
    blurb: "Race the next driver looking for a match. The strip and the distance come from the server.",
  },
  {
    id: "create",
    label: "PRIVATE ROOM",
    blurb: "Get a code, send it to someone, and set the race up however you like.",
  },
  {
    id: "join",
    label: "JOIN WITH A CODE",
    blurb: "Someone sent you five characters. Type them in.",
  },
];

/**
 * The lobby's rows. The last is the button; everything above it is a setting.
 * Distances are the full four here — a private room opens every length, where
 * quick search sticks to the two competitive ones.
 *
 * The first two are **yours** and the middle three are the **room's**; see the
 * note at the top of this file for why they share one list.
 */
export const LOBBY_ROW_CAR = "car";
export const LOBBY_ROW_PAINT = "paint";
export const LOBBY_ROW_TRACK = "track";
export const LOBBY_ROW_DISTANCE = "distance";
export const LOBBY_ROW_BEST_OF = "bestOf";
export const LOBBY_ROW_READY = "ready";

const DISTANCE_IDS = ["eighth", "quarter", "half", "mile"];
const TRACK_IDS = TRACKS.map((track) => track.id);

const LOBBY_ROWS = [
  LOBBY_ROW_CAR,
  LOBBY_ROW_PAINT,
  LOBBY_ROW_TRACK,
  LOBBY_ROW_DISTANCE,
  LOBBY_ROW_BEST_OF,
  LOBBY_ROW_READY,
];

/** Rows the driver always owns, host or not. */
const OWN_ROWS = new Set([LOBBY_ROW_CAR, LOBBY_ROW_PAINT]);

export function createOnlineMenu() {
  return { cursor: 0, entry: createTextEntry(), lobbyCursor: 0, joining: false };
}

/**
 * Which pane the screen is on. Derived from the session so it cannot disagree
 * with what the server thinks is happening — an earlier cut stored it and spent
 * its life being corrected.
 *
 * The one thing the menu owns is whether the *join* pane is open, because
 * nothing about the session distinguishes "idle" from "idle, typing a code".
 */
export function paneFor(menu, session) {
  if (session.status === STATUS_SEARCHING) return PANE_SEARCHING;
  if (session.status === STATUS_LOBBY) return PANE_LOBBY;
  if (menu.joining) return PANE_JOIN;
  return PANE_HOME;
}

/** True while the keyboard should be typing letters rather than driving. */
export function wantsTextCapture(menu, session) {
  return paneFor(menu, session) === PANE_JOIN;
}

export function openJoin(menu) {
  return { ...menu, joining: true, entry: createTextEntry() };
}

export function closeJoin(menu) {
  return { ...menu, joining: false, entry: createTextEntry() };
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

const clamp = (value, max) => Math.max(0, Math.min(max, value));

export function moveOnline(menu, direction, session) {
  const pane = paneFor(menu, session);

  if (pane === PANE_HOME) {
    if (direction !== "up" && direction !== "down") return menu;
    const step = direction === "up" ? -1 : 1;
    return { ...menu, cursor: clamp(menu.cursor + step, HOME_ITEMS.length - 1) };
  }

  if (pane === PANE_LOBBY) {
    if (direction === "up" || direction === "down") {
      const step = direction === "up" ? -1 : 1;
      return { ...menu, lobbyCursor: clamp(menu.lobbyCursor + step, LOBBY_ROWS.length - 1) };
    }
    // Left and right adjust the row under the cursor, and only the host's
    // adjustments go anywhere — see `adjustLobby`.
    return menu;
  }

  return menu;
}

/**
 * What stepping a lobby row is a request for. Two kinds, because two different
 * things own the rows: the room's settings go to the server as a config the host
 * is asking for, and the driver's car is a local pick that is then published as a
 * loadout. A single "here is a config" return could not express the second, and
 * the version that tried made the car rows silently inert for the guest.
 */
export const LOBBY_SET_CONFIG = "config";
export const LOBBY_STEP_CAR = "car";
export const LOBBY_STEP_PAINT = "paint";

/**
 * Steps whatever is under the lobby cursor. Returns the request the composition
 * root should carry out, or null when there is nothing to do — a guest on one of
 * the host's rows, or the cursor sitting on the button.
 *
 * A config is *returned* rather than applied because the server owns it: the
 * host asks, the server decides, and both clients redraw from the frame that
 * comes back. A lobby that applied its own change locally would flicker every
 * time the server disagreed.
 */
export function adjustLobby(menu, direction, session) {
  return adjustLobbyAt(menu.lobbyCursor, direction, session);
}

/**
 * The same step, against an explicit row.
 *
 * A click names the row it landed on, which is not necessarily the one the
 * keyboard cursor is parked on — clicking a distance arrow while the cursor sits
 * on the track row must step the distance, not the track.
 */
export function adjustLobbyAt(rowIndex, direction, session) {
  if (direction !== "left" && direction !== "right") return null;
  const step = direction === "left" ? -1 : 1;
  const row = LOBBY_ROWS[rowIndex];

  // Your car is yours in either seat. Checked before the host gate, which is
  // what these rows exist to sit outside of.
  if (row === LOBBY_ROW_CAR) return { kind: LOBBY_STEP_CAR, step };
  if (row === LOBBY_ROW_PAINT) return { kind: LOBBY_STEP_PAINT, step };

  if (!session.isHost || !session.config) return null;

  if (row === LOBBY_ROW_TRACK) {
    return config(session, { trackId: cycle(TRACK_IDS, session.config.trackId, step) });
  }
  if (row === LOBBY_ROW_DISTANCE) {
    return config(session, { distanceId: cycle(DISTANCE_IDS, session.config.distanceId, step) });
  }
  if (row === LOBBY_ROW_BEST_OF) {
    return config(session, { bestOf: cycle(BEST_OF_OPTIONS, session.config.bestOf, step) });
  }
  return null;
}

const config = (session, patch) => ({ kind: LOBBY_SET_CONFIG, config: { ...session.config, ...patch } });

/** Wraps, because these are short lists where wrapping is the fast way round. */
function cycle(values, current, step) {
  const index = values.indexOf(current);
  const from = index < 0 ? 0 : index;
  return values[(from + step + values.length) % values.length];
}

// ---------------------------------------------------------------------------
// Typing a code
// ---------------------------------------------------------------------------

export function typeCode(menu, action) {
  if (action?.backspace) return { ...menu, entry: backspace(menu.entry) };
  if (typeof action?.char === "string") return { ...menu, entry: typeChar(menu.entry, action.char) };
  return menu;
}

export function codeIsComplete(menu) {
  return isComplete(menu.entry);
}

// ---------------------------------------------------------------------------
// Confirming
// ---------------------------------------------------------------------------

/** What ENTER means on this screen, as a request for the composition root. */
export const ONLINE_SEARCH = "online-search";
export const ONLINE_CREATE = "online-create";
export const ONLINE_JOIN = "online-join";
export const ONLINE_OPEN_JOIN = "online-open-join";
export const ONLINE_READY = "online-ready";
/** Open the garage on the car this driver is taking to the line. */
export const ONLINE_CUSTOMISE = "online-customise";
export const ONLINE_NOTHING = "online-nothing";

export function confirmOnline(menu, session) {
  const pane = paneFor(menu, session);

  if (pane === PANE_HOME) {
    const id = HOME_ITEMS[menu.cursor]?.id;
    if (id === "search") return ONLINE_SEARCH;
    if (id === "create") return ONLINE_CREATE;
    if (id === "join") return ONLINE_OPEN_JOIN;
    return ONLINE_NOTHING;
  }
  if (pane === PANE_JOIN) {
    return codeIsComplete(menu) ? ONLINE_JOIN : ONLINE_NOTHING;
  }
  if (pane === PANE_LOBBY) {
    // Only the button *starts anything*. A setting row's ENTER does not ready up,
    // because arriving on a row and pressing the key you press everywhere else
    // should not start a race you were still configuring.
    //
    // The paint row is the one row with somewhere to go: ENTER opens the garage
    // on the car you are about to run, which is what keeps the editor reachable
    // without a mouse — the CUSTOMISE button is a pointer convenience, not the
    // only way in.
    const row = LOBBY_ROWS[menu.lobbyCursor];
    if (row === LOBBY_ROW_READY) return ONLINE_READY;
    if (row === LOBBY_ROW_PAINT) return ONLINE_CUSTOMISE;
    return ONLINE_NOTHING;
  }
  return ONLINE_NOTHING;
}

// ---------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------

/**
 * Everything the renderer needs, already shaped. It performs no lookups of its
 * own — no track catalog, no distance table — for the same reason `setupView`
 * hands over source rects: a renderer that resolves ids is a renderer that can
 * disagree with the screen it is drawing.
 */
/**
 * The car this driver is taking to the line, as the lobby needs to show it.
 *
 * Passed in rather than read from the session, because the session is what the
 * *server* has said and this is a local pick the player is still making. The
 * model and paint names come from the same place the setup screen's do, so the
 * two screens cannot disagree about what you are driving — there is one answer
 * to that question in the cabinet, and this is a second way to change it rather
 * than a second copy of it.
 */
const NO_CAR = { modelLabel: "—", paintLabel: "—", canCustomise: false };

export function onlineView(menu, session, { pointer = null, car = NO_CAR } = {}) {
  const view = buildView(menu, session, car ?? NO_CAR);
  if (!pointer) return { ...view, hover: null };
  // Resolved from the finished view by the very function that resolves a click,
  // so what lights up under the pointer is provably what pressing there does.
  const hover = hitOnline(view, pointer.x, pointer.y);
  return { ...view, hover, ...highlightFor(view, hover) };
}

/** Marks whichever target the pointer is over, without touching any cursor. */
function highlightFor(view, hover) {
  if (!hover) return {};
  if (hover.kind === TARGET_HOME) {
    return { home: view.home.map((item, index) => ({ ...item, hovered: index === hover.index })) };
  }
  if ((hover.kind === TARGET_LOBBY_ROW || hover.kind === TARGET_LOBBY_STEP) && view.lobby) {
    return {
      lobby: {
        ...view.lobby,
        rows: view.lobby.rows.map((row, index) => ({ ...row, hovered: index === hover.index })),
      },
    };
  }
  return {};
}

function buildView(menu, session, car) {
  const pane = paneFor(menu, session);
  return {
    pane,
    status: session.status,
    error: session.error,
    connecting: session.status === STATUS_CONNECTING,
    offline: session.status === STATUS_IDLE || session.status === STATUS_ERROR,
    home: HOME_ITEMS.map((item, index) => ({
      ...item,
      index,
      highlighted: index === menu.cursor,
      hovered: false,
    })),
    join: {
      ...entryView(menu.entry),
      length: ROOM_CODE_LENGTH,
      hint: "Letters and numbers only. No O or I — they are 0 and 1.",
    },
    lobby: lobbyView(menu, session, car),
  };
}

function lobbyView(menu, session, car) {
  if (!session.config) return null;
  const track = TRACKS.find((entry) => entry.id === session.config.trackId) ?? TRACKS[0];
  const distance = RACE_DISTANCES[session.config.distanceId] ?? RACE_DISTANCES.quarter;

  const rows = [
    { id: LOBBY_ROW_CAR, label: "YOUR CAR", value: car.modelLabel, own: true },
    { id: LOBBY_ROW_PAINT, label: "PAINT", value: car.paintLabel, own: true },
    { id: LOBBY_ROW_TRACK, label: "STRIP", value: track.label ?? track.id },
    { id: LOBBY_ROW_DISTANCE, label: "DISTANCE", value: distance.label },
    { id: LOBBY_ROW_BEST_OF, label: "MATCH", value: `BEST OF ${session.config.bestOf}` },
    {
      id: LOBBY_ROW_READY,
      label: null,
      // Named for what pressing it does next, so a driver who has already
      // readied up is not invited to do it again.
      value: readyLabel(session),
      button: true,
    },
  ].map((row, index) => ({
    ...row,
    index,
    highlighted: index === menu.lobbyCursor,
    hovered: false,
    // A guest sees every setting and watches it change, but cannot move it — with
    // the deliberate exception of their own car, which no host owns.
    adjustable: !row.button && (row.own || session.isHost),
    dimmed: !row.button && !row.own && !session.isHost,
  }));

  return {
    roomCode: session.roomCode,
    isPrivate: session.isPrivate,
    isHost: session.isHost,
    full: session.players.length === 2,
    waitingFor: session.players.length < 2 ? "Waiting for another driver…" : null,
    // Always this driver first, so the left-hand card is always yours.
    drivers: [...session.players]
      .sort((a, b) => Number(b.playerId === session.youPlayerId) - Number(a.playerId === session.youPlayerId))
      .map((player) => ({
        ...player,
        you: player.playerId === session.youPlayerId,
        // Resolved here so the renderer looks nothing up. It printed the raw
        // `modelId` before, which meant the driver cards read "kaido-gts" while
        // the row two panels over read "Kaido GTS".
        modelLabel: modelById(player.modelId)?.label ?? "Factory car",
        wins: session.score?.players.find((entry) => entry.playerId === player.playerId)?.wins ?? 0,
      })),
    rows,
    // Stays in the list and says why rather than disappearing when there is no
    // account to save a paint against — the setup screen's rule, for the same
    // reason: a control that vanishes teaches nothing.
    customise: {
      label: car.canCustomise ? "CUSTOMISE CAR" : "SIGN IN TO CUSTOMISE",
      enabled: car.canCustomise,
    },
    score: session.score,
  };
}

// ---------------------------------------------------------------------------
// The mouse
// ---------------------------------------------------------------------------
//
// Every drawn control on this screen is clickable. The rest of the cabinet works
// that way — menus, the radio faceplate, the setup screen and the garage are all
// fully mousable — and an online lobby that could only be driven from the
// keyboard would be the one screen that behaved differently.
//
// The targets are derived from the *finished view*, and `onlineView` runs the
// same hit test on itself to decide what to highlight. That is the radio's rule
// and it exists because two separate hit tests is exactly the bug where the row
// you click is not the row you saw light up.

export const TARGET_HOME = "home";
export const TARGET_JOIN_SUBMIT = "join-submit";
export const TARGET_BACK = "back";
export const TARGET_CANCEL_SEARCH = "cancel-search";
export const TARGET_LOBBY_ROW = "lobby-row";
export const TARGET_LOBBY_STEP = "lobby-step";
export const TARGET_CUSTOMISE = "customise";

const inside = (rect, x, y) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * Everything clickable on the screen as it currently stands, with its box.
 *
 * Built from the view rather than from the session so that a control which is
 * not drawn is not a target — a dimmed guest setting has no stepper arrows, so
 * clicking where they would be must do nothing rather than silently publishing
 * a config the server would refuse.
 */
export function onlineTargets(view) {
  const targets = [];
  const { panel, detail, row, submit, cancel, back, step } = ONLINE_LAYOUT;

  if (view.pane === PANE_HOME) {
    view.home.forEach((item, index) => {
      targets.push({
        kind: TARGET_HOME,
        index,
        rect: { x: panel.x, y: panel.y + index * (row.height + row.gap), width: panel.width, height: row.height },
      });
    });
    return targets;
  }

  if (view.pane === PANE_JOIN) {
    if (view.join.complete) targets.push({ kind: TARGET_JOIN_SUBMIT, rect: { ...submit } });
    targets.push({ kind: TARGET_BACK, rect: { ...back } });
    return targets;
  }

  if (view.pane === PANE_SEARCHING) {
    targets.push({ kind: TARGET_CANCEL_SEARCH, rect: { ...cancel } });
    return targets;
  }

  if (view.pane === PANE_LOBBY && view.lobby) {
    view.lobby.rows.forEach((entry, index) => {
      const y = detail.y + index * (row.height + row.gap);
      // A settable row carries its two arrows as targets of their own, so a
      // click can step either way rather than only forwards.
      if (entry.adjustable) {
        targets.push({
          kind: TARGET_LOBBY_STEP,
          index,
          direction: "left",
          rect: { x: detail.x + detail.width - step.inset - step.width, y, width: step.width, height: row.height },
        });
        targets.push({
          kind: TARGET_LOBBY_STEP,
          index,
          direction: "right",
          rect: { x: detail.x + detail.width - step.inset, y, width: step.width, height: row.height },
        });
      }
      targets.push({
        kind: TARGET_LOBBY_ROW,
        index,
        rect: { x: detail.x, y, width: detail.width, height: row.height },
      });
    });
    // Drawn muted and inert when there is no account behind it, so — like a
    // guest's stepper arrows — it is not a target when it cannot act.
    if (view.lobby.customise.enabled) {
      targets.push({ kind: TARGET_CUSTOMISE, rect: { ...ONLINE_LAYOUT.customise } });
    }
    targets.push({ kind: TARGET_BACK, rect: { ...back } });
  }
  return targets;
}

/**
 * What is under the pointer. The arrows are pushed before the row that contains
 * them, and the first match wins, so a click on an arrow steps that setting
 * rather than merely selecting the row it sits in.
 */
/**
 * The buttons on the result panel drawn over the strip, with their boxes.
 *
 * Derived from the session rather than passed in, so the renderer and the click
 * handler cannot end up offering different things — a "REMATCH" you can see but
 * not press is the exact failure this whole seam exists to prevent.
 */
export function resultButtons(session) {
  const matchOver = session.status === "match-result";
  const labels = matchOver
    ? [
        { id: "rematch", label: session.rematch?.asked ? "WAITING FOR THEM…" : "REMATCH" },
        { id: "leave", label: "LEAVE MATCH" },
      ]
    : [{ id: "next", label: "STAGE FOR THE NEXT ROUND" }];

  const totalWidth = labels.length * RESULT_BUTTON.width + (labels.length - 1) * RESULT_BUTTON.gap;
  const left = RESULT_PANEL.x + (RESULT_PANEL.width - totalWidth) / 2;
  const y = RESULT_PANEL.y + RESULT_PANEL.height - RESULT_BUTTON.height - 22;

  return labels.map((button, index) => ({
    ...button,
    rect: {
      x: left + index * (RESULT_BUTTON.width + RESULT_BUTTON.gap),
      y,
      width: RESULT_BUTTON.width,
      height: RESULT_BUTTON.height,
    },
  }));
}

export function hitOnline(view, x, y) {
  for (const target of onlineTargets(view)) {
    if (inside(target.rect, x, y)) return target;
  }
  return null;
}

function readyLabel(session) {
  if (session.players.length < 2) return "WAITING FOR AN OPPONENT";
  const me = session.players.find((player) => player.playerId === session.youPlayerId);
  return me?.ready ? "READY — WAITING FOR THEM" : "STAGE THE CAR";
}
