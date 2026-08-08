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

import { BEST_OF_OPTIONS } from "../sim/match.js";
import { RACE_DISTANCES } from "../sim/constants.js";
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
 */
export const LOBBY_ROW_TRACK = "track";
export const LOBBY_ROW_DISTANCE = "distance";
export const LOBBY_ROW_BEST_OF = "bestOf";
export const LOBBY_ROW_READY = "ready";

const DISTANCE_IDS = ["eighth", "quarter", "half", "mile"];
const TRACK_IDS = TRACKS.map((track) => track.id);

const LOBBY_ROWS = [LOBBY_ROW_TRACK, LOBBY_ROW_DISTANCE, LOBBY_ROW_BEST_OF, LOBBY_ROW_READY];

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
 * Steps the setting under the lobby cursor. Returns the config the host should
 * publish, or null when there is nothing to publish — a guest moving the cursor,
 * or the cursor sitting on the button.
 *
 * The config is returned rather than applied because the server owns it: the
 * host asks, the server decides, and both clients redraw from the frame that
 * comes back. A lobby that applied its own change locally would flicker every
 * time the server disagreed.
 */
export function adjustLobby(menu, direction, session) {
  if (!session.isHost || !session.config) return null;
  if (direction !== "left" && direction !== "right") return null;
  const step = direction === "left" ? -1 : 1;
  const row = LOBBY_ROWS[menu.lobbyCursor];

  if (row === LOBBY_ROW_TRACK) {
    return { ...session.config, trackId: cycle(TRACK_IDS, session.config.trackId, step) };
  }
  if (row === LOBBY_ROW_DISTANCE) {
    return { ...session.config, distanceId: cycle(DISTANCE_IDS, session.config.distanceId, step) };
  }
  if (row === LOBBY_ROW_BEST_OF) {
    return { ...session.config, bestOf: cycle(BEST_OF_OPTIONS, session.config.bestOf, step) };
  }
  return null;
}

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
    // Only the button commits. A setting row's ENTER does nothing rather than
    // readying up, because arriving on a row and pressing the key you press
    // everywhere else should not start a race you were still configuring.
    const row = LOBBY_ROWS[menu.lobbyCursor];
    return row === LOBBY_ROW_READY ? ONLINE_READY : ONLINE_NOTHING;
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
export function onlineView(menu, session, { pointer = null } = {}) {
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
      hovered: pointer?.homeIndex === index,
    })),
    join: {
      ...entryView(menu.entry),
      length: ROOM_CODE_LENGTH,
      hint: "Letters and numbers only. No O or I — they are 0 and 1.",
    },
    lobby: lobbyView(menu, session, pointer),
  };
}

function lobbyView(menu, session, pointer) {
  if (!session.config) return null;
  const track = TRACKS.find((entry) => entry.id === session.config.trackId) ?? TRACKS[0];
  const distance = RACE_DISTANCES[session.config.distanceId] ?? RACE_DISTANCES.quarter;

  const rows = [
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
    hovered: pointer?.lobbyIndex === index,
    // A guest sees every setting and watches it change, but cannot move it.
    adjustable: !row.button && session.isHost,
    dimmed: !row.button && !session.isHost,
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
        wins: session.score?.players.find((entry) => entry.playerId === player.playerId)?.wins ?? 0,
      })),
    rows,
    score: session.score,
  };
}

function readyLabel(session) {
  if (session.players.length < 2) return "WAITING FOR AN OPPONENT";
  const me = session.players.find((player) => player.playerId === session.youPlayerId);
  return me?.ready ? "READY — WAITING FOR THEM" : "STAGE THE CAR";
}
