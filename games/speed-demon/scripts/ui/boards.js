// The leaderboard screen: what a player is looking at, and what the cursor is on.
//
// Pure. No canvas, no DOM, no network — this owns the tabs, the cursor and the
// scroll window, and `render/boards.js` draws whatever it says. The same split
// as `setup-menu.js`, `collection.js` and `garage-editor.js`, and it is what
// lets every rule below be tested without a browser.
//
// ## One screen, two things to look at
//
// **GLOBAL** is the board itself: everybody's best on it, ranked. **PERSONAL**
// is the player's own bests, one row per board. They are deliberately the same
// screen rather than two, because they answer halves of one question — "how fast
// am I, and how fast is that" — and a player who has to remember which of two
// menu items holds their own time will pick wrong every time.
//
// The scope is therefore a *tab*, not a screen, and the board tabs keep meaning
// the same thing across it. Switching scope never changes which board you are
// looking at, so GLOBAL → PERSONAL → GLOBAL lands you back where you started.
//
// ## Three strips, and each is a real filter
//
//   SCOPE   global | personal
//   MODE    distance | time attack
//   BOARD   that mode's objectives
//
// The mode strip is not decoration in either scope. In GLOBAL it narrows the
// board strip; in PERSONAL it also filters the list, so "how are my distance
// times" is one tab away rather than a scan down seven rows. Seven boards in one
// flat strip was the alternative and it reads as a wall — the split into mode
// and objective is the one the rest of the cabinet already uses (the setup
// screen's third and fourth panes).
//
// **There are no track tabs and there never will be.** A board is a mode plus an
// objective and nothing else — the five tracks are one road in five settings, so
// splitting them would be five boards competing for one time. `records.js` has
// the measurements. The track a record was set on is still shown per row, as the
// metadata it is.

import { MODE_DISTANCE, MODE_TIME_ATTACK, MODES, modeById, objectiveOption } from "../sim/modes.js";
import {
  BOARD_EMPTY,
  BOARD_IDLE,
  BOARD_READY,
  boardDirection,
  boardUnit,
  formatValue,
} from "../records/records.js";
import { modelById } from "../assets/car-atlas.js";
import { TRACKS } from "./track-layout.js";

export const SCOPE_GLOBAL = "global";
export const SCOPE_PERSONAL = "personal";

/**
 * GLOBAL is first because it is the one that needs an explanation: a player who
 * opens this screen already knows what their own best is, and does not know
 * where it stands. Personal is a click away either way.
 */
export const SCOPES = [
  { id: SCOPE_GLOBAL, label: "GLOBAL" },
  { id: SCOPE_PERSONAL, label: "MY BESTS" },
];

/**
 * The modes that keep records, in catalog order. Derived from `MODES` rather
 * than listed again, so a mode that gains a board appears here without this file
 * being touched — the same property `boardIdFor` has.
 */
const RECORDED_MODE_IDS = [MODE_DISTANCE, MODE_TIME_ATTACK];

/** The cursor's rows: three tab strips, then the list itself. */
export const ROW_SCOPE = 0;
export const ROW_MODE = 1;
export const ROW_BOARD = 2;
export const ROW_LIST = 3;

/**
 * How many result rows are on screen at once.
 *
 * Here rather than in the renderer for `COLLECTION_VISIBLE_ROWS`' reason:
 * scrolling is a rule — the window may never be left behind by the cursor — and
 * a rule belongs where a test can reach it. The renderer imports this rather
 * than keeping a second copy.
 */
export const BOARD_VISIBLE_ROWS = 9;

const clamp = (value, max) => Math.max(0, Math.min(max, value));

export function recordedModes() {
  return RECORDED_MODE_IDS.map((id) => modeById(id)).filter(Boolean);
}

/**
 * The boards for one mode, as the screen reads them: a board id, the objective
 * it came from, and how it is measured.
 *
 * Built from the mode catalog rather than from a list of its own — this is the
 * same derivation `boardIdFor` performs, so the ids the screen shows and the ids
 * a finished run files against cannot drift apart.
 */
export function boardsForMode(modeId) {
  const mode = modeById(modeId);
  if (!mode || !RECORDED_MODE_IDS.includes(modeId)) return [];
  return mode.objective.options.map((option) => ({
    id: `${mode.id}:${option.id}`,
    label: option.label,
    modeId: mode.id,
    objectiveId: option.id,
    direction: boardDirection(mode.id),
    unit: boardUnit(mode.id),
  }));
}

/** Every board, in the order the tabs walk them. */
export function allBoards() {
  return RECORDED_MODE_IDS.flatMap((id) => boardsForMode(id));
}

export function boardById(boardId) {
  return allBoards().find((board) => board.id === boardId) ?? null;
}

/**
 * Opens the screen on a board.
 *
 * Takes a mode and objective rather than a board id so the caller can hand it
 * the live setup selection — arriving here after a run should show the board
 * that run went on, not whatever the screen was last left on. A selection that
 * names no board (online, say) falls back to the first one.
 */
export function createBoards({ scope = SCOPE_GLOBAL, modeId = MODE_DISTANCE, objectiveId = null } = {}) {
  const mode = RECORDED_MODE_IDS.includes(modeId) ? modeById(modeId) : modeById(MODE_DISTANCE);
  return {
    scope: scope === SCOPE_PERSONAL ? SCOPE_PERSONAL : SCOPE_GLOBAL,
    modeId: mode.id,
    // Resolved through the catalog, so a stale objective lands on the mode's
    // default instead of selecting a board that does not exist.
    objectiveId: objectiveOption(mode, objectiveId).id,
    row: ROW_BOARD,
    scroll: 0,
  };
}

/** The board the tabs currently name. */
export function boardsSelection(boards) {
  const mode = modeById(boards.modeId);
  const objectiveId = objectiveOption(mode, boards.objectiveId).id;
  return {
    scope: boards.scope,
    modeId: boards.modeId,
    objectiveId,
    boardId: `${boards.modeId}:${objectiveId}`,
  };
}

/**
 * Which boards the list is showing, which is what makes the mode strip a filter
 * in both scopes: GLOBAL is always exactly one board, PERSONAL is every board in
 * the chosen mode with the chosen one marked.
 */
export function listedBoards(boards) {
  const { boardId } = boardsSelection(boards);
  return boards.scope === SCOPE_PERSONAL
    ? boardsForMode(boards.modeId)
    : [boardById(boardId)].filter(Boolean);
}

/** The strip on a cursor row, as ids. Empty on the list row, which has no strip. */
function stripFor(boards, row) {
  switch (row) {
    case ROW_SCOPE:
      return SCOPES.map((scope) => scope.id);
    case ROW_MODE:
      return RECORDED_MODE_IDS;
    case ROW_BOARD:
      return boardsForMode(boards.modeId).map((board) => board.id);
    default:
      return [];
  }
}

function selectedIndex(boards, row) {
  const { boardId } = boardsSelection(boards);
  const strip = stripFor(boards, row);
  const current = row === ROW_SCOPE ? boards.scope : row === ROW_MODE ? boards.modeId : boardId;
  return Math.max(0, strip.indexOf(current));
}

/**
 * Adopts one entry of a strip. Every path that changes a tab comes through here,
 * so the scroll reset cannot be forgotten on one of them — a list left scrolled
 * to row 20 when the new board holds three would show an empty screen.
 */
function withStrip(boards, row, index) {
  const strip = stripFor(boards, row);
  if (strip.length === 0) return boards;
  const id = strip[clamp(index, strip.length - 1)];
  switch (row) {
    case ROW_SCOPE:
      return { ...boards, scope: id, scroll: 0 };
    case ROW_MODE: {
      // The objective is carried across where it still means something and falls
      // back to the new mode's default where it does not — "quarter" is not a
      // clock. The setup screen's rule when the mode changes underneath it.
      const mode = modeById(id);
      return { ...boards, modeId: id, objectiveId: objectiveOption(mode, boards.objectiveId).id, scroll: 0 };
    }
    case ROW_BOARD: {
      const board = boardById(id);
      return board ? { ...boards, objectiveId: board.objectiveId, scroll: 0 } : boards;
    }
    default:
      return boards;
  }
}

/** The last cursor row: the list only takes the cursor when it can scroll. */
function lastRow(rowCount) {
  return rowCount > BOARD_VISIBLE_ROWS ? ROW_LIST : ROW_BOARD;
}

function maxScroll(rowCount) {
  return Math.max(0, rowCount - BOARD_VISIBLE_ROWS);
}

/**
 * Walks the cursor.
 *
 * Up and down move between the strips and then into the list; once the cursor is
 * *in* the list they scroll it, and going up off the top of it returns to the
 * board strip. That is one guessable behaviour rather than a separate pair of
 * scroll keys, and it means the list is unreachable — rather than inert — when
 * everything already fits, which is the `+ LAYER` tab's rule.
 *
 * Left and right walk whichever strip the cursor is on. Nothing wraps: the board
 * strip is the pick, and a wrapping pick is one you lose track of.
 */
export function moveBoards(boards, direction, { rowCount = 0 } = {}) {
  const last = lastRow(rowCount);
  switch (direction) {
    case "up":
      if (boards.row === ROW_LIST && boards.scroll > 0) {
        return { ...boards, scroll: boards.scroll - 1 };
      }
      return { ...boards, row: Math.max(ROW_SCOPE, boards.row - 1) };
    case "down":
      if (boards.row === ROW_LIST) {
        return { ...boards, scroll: clamp(boards.scroll + 1, maxScroll(rowCount)) };
      }
      return { ...boards, row: Math.min(last, boards.row + 1) };
    case "left":
      return withStrip(boards, boards.row, selectedIndex(boards, boards.row) - 1);
    case "right":
      return withStrip(boards, boards.row, selectedIndex(boards, boards.row) + 1);
    default:
      return boards;
  }
}

/**
 * Scrolls the list without the cursor having to walk there — what the drawn
 * arrows do. The cursor is not dragged along, because unlike the collection's
 * this one picks nothing: the list rows are read, not chosen.
 */
export function scrollBoards(boards, step, { rowCount = 0 } = {}) {
  return { ...boards, scroll: clamp(boards.scroll + step, maxScroll(rowCount)) };
}

/**
 * Puts the cursor on something the player clicked. A tab click both moves the
 * cursor and takes the tab, which is the cabinet's one-gesture rule: a mouse has
 * nowhere to put a separate commit, so a click that only highlighted would read
 * as a dead control.
 */
export function focusBoards(boards, target, { rowCount = 0 } = {}) {
  if (!target) return boards;
  if (target.kind === "scroll") return scrollBoards(boards, target.step, { rowCount });
  if (target.kind !== "tab" || !Number.isFinite(target.row) || !Number.isFinite(target.index)) return boards;
  return { ...withStrip(boards, target.row, target.index), row: Math.min(target.row, lastRow(rowCount)) };
}

// ---------------------------------------------------------------------------
// The view
// ---------------------------------------------------------------------------

/**
 * Re-exported rather than redeclared: the statuses belong to `records.js`, which
 * both this screen and the fetch layer already depend on, and the renderer has
 * one import to reach the whole screen's vocabulary.
 */
export { BOARD_IDLE, BOARD_LOADING, BOARD_READY, BOARD_EMPTY, BOARD_ERROR, BOARD_OFFLINE } from "../records/records.js";

const modelLabel = (id) => modelById(id)?.label ?? "";
const trackLabel = (id) => TRACKS.find((track) => track.id === id)?.label ?? "";

/** A record's car and track, as the one line of metadata a row carries. */
function metaFor({ modelId, trackId }) {
  return [modelLabel(modelId), trackLabel(trackId)].filter(Boolean).join(" · ");
}

/** `2026-08-08T…` → `08 AUG 2026`. Empty rather than "Invalid Date" on junk. */
export function formatRecordedAt(value) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) return "";
  const month = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][date.getMonth()];
  return `${String(date.getDate()).padStart(2, "0")} ${month} ${date.getFullYear()}`;
}

const isTabHovered = (hover, row, index) =>
  Boolean(hover && hover.kind === "tab" && hover.row === row && hover.index === index);

function tabsFor(boards, row, entries, hover) {
  const selected = selectedIndex(boards, row);
  return entries.map((entry, index) => ({
    ...entry,
    row,
    index,
    selected: index === selected,
    hovered: isTabHovered(hover, row, index),
  }));
}

/**
 * The global board's rows: everybody's best, ranked, with the viewer's own entry
 * marked so they can find themselves without reading every name.
 */
function globalRows(standings, { playerId, unit }) {
  return (standings?.entries ?? []).map((entry, index) => ({
    key: `${entry.playerId}:${index}`,
    rank: Number.isFinite(Number(entry.rank)) ? Number(entry.rank) : index + 1,
    name: entry.displayName || "DRIVER",
    // The server formats too, but the client's formatter is the one the rest of
    // the cabinet uses — a board reading `11.924s` where the results panel reads
    // something else would look like two different numbers.
    value: formatValue(unit, entry.value),
    meta: metaFor(entry),
    date: formatRecordedAt(entry.recordedAt),
    verified: entry.verified === true,
    you: Boolean(playerId) && entry.playerId === playerId,
  }));
}

/**
 * The personal rows: one per board in the chosen mode, whether it has been
 * driven or not.
 *
 * An undriven board is a row saying so rather than an absent one, for the reason
 * the collection gives every model a row: "which of these have I not done yet"
 * is the question that brings a player to this screen, and hiding the blanks
 * makes it unanswerable.
 */
function personalRows(boards, { records, ranks, selectedBoardId }) {
  return listedBoards(boards).map((board) => {
    const record = records?.[board.id] ?? null;
    const rank = ranks?.[board.id] ?? null;
    return {
      key: board.id,
      boardId: board.id,
      // `Number(null)` is 0 and rank 0 would print as a placing — the same trap
      // `records.js` keeps `toNumber` for. An unfetched board has no rank, and
      // that has to stay distinguishable from being top of one.
      rank: typeof rank === "number" && Number.isFinite(rank) ? rank : null,
      name: board.label,
      value: record ? formatValue(board.unit, record.value) : "—",
      meta: record ? metaFor(record) : "not driven yet",
      date: record ? formatRecordedAt(record.recordedAt) : "",
      verified: record?.verified === true,
      empty: !record,
      // The board strip still points at one of these rows in this scope, so the
      // strip and the list agree about what is selected.
      you: board.id === selectedBoardId,
    };
  });
}

/**
 * Everything the renderer needs, pre-shaped: the three strips with the cursor
 * already resolved onto them, the visible slice of the list, and one status that
 * says what to print when there is nothing to show.
 *
 * `standings` is what the store has fetched for the selected board (null while
 * it is still in flight), `records` the player's own bests, `ranked` the sign-in
 * state. `hover` rides through here rather than through the cursor so the
 * renderer and the hit test resolve highlighting from one place.
 */
export function boardsView(
  boards,
  { records = {}, standings = null, status = BOARD_IDLE, ranks = {}, playerId = "", ranked = false, hover = null } = {},
) {
  const selection = boardsSelection(boards);
  const board = boardById(selection.boardId);
  const personal = boards.scope === SCOPE_PERSONAL;

  const rows = personal
    ? personalRows(boards, { records, ranks, selectedBoardId: selection.boardId })
    : globalRows(standings, { playerId, unit: board?.unit });

  // Personal bests are held locally and are always ready; only the global board
  // has anything to wait for.
  const listStatus = personal
    ? BOARD_READY
    : status === BOARD_READY && rows.length === 0
      ? BOARD_EMPTY
      : status;

  const scroll = clamp(boards.scroll, maxScroll(rows.length));
  const cursorRow = Math.min(boards.row, lastRow(rows.length));

  return {
    ...selection,
    boardLabel: board?.label ?? "",
    modeLabel: modeById(boards.modeId)?.label ?? "",
    unit: board?.unit ?? "",
    personal,
    ranked,
    row: cursorRow,
    status: listStatus,
    tabs: {
      scope: tabsFor(boards, ROW_SCOPE, SCOPES, hover),
      mode: tabsFor(boards, ROW_MODE, recordedModes().map((mode) => ({ id: mode.id, label: mode.label.toUpperCase() })), hover),
      board: tabsFor(boards, ROW_BOARD, boardsForMode(boards.modeId), hover),
    },
    scroll,
    totalRows: rows.length,
    visibleRows: BOARD_VISIBLE_ROWS,
    canScrollUp: scroll > 0,
    canScrollDown: scroll + BOARD_VISIBLE_ROWS < rows.length,
    listFocused: cursorRow === ROW_LIST,
    // A list row is read, never chosen, so it carries no hover and no selection.
    // Only the tabs and the scroll arrows are click targets on this screen —
    // highlighting something a click cannot act on is how a dead control gets
    // drawn.
    rows: rows.slice(scroll, scroll + BOARD_VISIBLE_ROWS).map((row, screenRow) => ({ ...row, screenRow })),
    // Said on the screen rather than left to be inferred from an empty board: a
    // signed-out player's own bests are real and kept, and it is only the
    // *ranking* they are missing. `records-store.js` makes the same distinction.
    note: ranked ? "" : "SIGN IN TO RANK YOUR TIMES",
  };
}
