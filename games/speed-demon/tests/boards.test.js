import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  BOARD_EMPTY,
  BOARD_ERROR,
  BOARD_LOADING,
  BOARD_READY,
  BOARD_VISIBLE_ROWS,
  ROW_BOARD,
  ROW_LIST,
  ROW_MODE,
  ROW_SCOPE,
  SCOPE_GLOBAL,
  SCOPE_PERSONAL,
  allBoards,
  boardById,
  boardsForMode,
  boardsSelection,
  boardsView,
  createBoards,
  focusBoards,
  formatRecordedAt,
  listedBoards,
  moveBoards,
  scrollBoards,
} from "../scripts/ui/boards.js";
import { boardIdFor } from "../scripts/records/records.js";
import { MODES } from "../scripts/sim/modes.js";
import { boardsRowRect, boardsScrollRect, boardsTabRect, hitBoards, BOARDS_LAYOUT } from "../scripts/render/boards.js";
import { WORLD } from "../scripts/render/scene.js";

suite("boards — the leaderboard screen");

const QUARTER = "distance:quarter";
const SPRINT = "time-attack:sprint";

/** A view with no data behind it, which is what the screen opens on. */
const view = (boards, options = {}) => boardsView(boards, options);

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("the board list is derived from the mode catalog, not listed again", () => {
  // The ids a run files against and the ids the screen offers have to be one
  // list. Anything else is a board a player can look at but never set a time on.
  for (const board of allBoards()) {
    assertEqual(boardIdFor(board.modeId, board.objectiveId), board.id, `${board.id} is not a board a run can reach`);
  }
});

test("every recorded mode's objectives are all offered", () => {
  for (const modeId of ["distance", "time-attack"]) {
    const mode = MODES.find((entry) => entry.id === modeId);
    assertEqual(boardsForMode(modeId).length, mode.objective.options.length, `${modeId} lost an objective`);
  }
  assertEqual(allBoards().length, 7, "the registry holds seven boards");
});

test("online keeps no board, so it is not a tab", () => {
  // An online race belongs to the room: its distance and its strip are the
  // host's choice, and its result is a match rather than a time.
  assertEqual(boardsForMode("online").length, 0);
  assert(!allBoards().some((board) => board.modeId === "online"));
});

test("a board knows which way it runs and what it is measured in", () => {
  assertEqual(boardById(QUARTER).direction, "lower", "a distance race wants the lowest time");
  assertEqual(boardById(QUARTER).unit, "ms");
  assertEqual(boardById(SPRINT).direction, "higher", "a time attack wants the greatest distance");
  assertEqual(boardById(SPRINT).unit, "cm");
});

// ---------------------------------------------------------------------------
// Opening it
// ---------------------------------------------------------------------------

test("the screen opens on the board the setup would race for", () => {
  const boards = createBoards({ modeId: "time-attack", objectiveId: "endurance" });
  assertEqual(boardsSelection(boards).boardId, "time-attack:endurance");
  // On the board strip, because that is the tab a player has come to change.
  assertEqual(boards.row, ROW_BOARD);
});

test("a selection that names no board falls back rather than inventing one", () => {
  // Online has no board, and neither does a stale objective id.
  assertEqual(boardsSelection(createBoards({ modeId: "online" })).modeId, "distance");
  assertEqual(boardsSelection(createBoards({ modeId: "distance", objectiveId: "sprint" })).objectiveId, "quarter");
});

// ---------------------------------------------------------------------------
// The tabs
// ---------------------------------------------------------------------------

test("switching scope never changes which board is being read", () => {
  // GLOBAL and PERSONAL are two views of one selection. A round trip that landed
  // somewhere else would make the scope tab feel like a different screen.
  const start = createBoards({ modeId: "distance", objectiveId: "half" });
  const personal = moveBoards({ ...start, row: ROW_SCOPE }, "right");
  assertEqual(personal.scope, SCOPE_PERSONAL);
  assertEqual(boardsSelection(personal).boardId, "distance:half");
  const back = moveBoards(personal, "left");
  assertEqual(back.scope, SCOPE_GLOBAL);
  assertEqual(boardsSelection(back).boardId, "distance:half");
});

test("changing mode carries the objective where it still means something", () => {
  // "quarter" is not a clock, so it falls back to the new mode's default — the
  // setup screen's rule when the mode changes underneath it.
  const boards = moveBoards({ ...createBoards(), row: ROW_MODE }, "right");
  assertEqual(boards.modeId, "time-attack");
  assertEqual(boardsSelection(boards).objectiveId, "standard", "the time attack default");
});

test("nothing wraps on the strips", () => {
  const boards = { ...createBoards({ objectiveId: "eighth" }), row: ROW_BOARD };
  assertEqual(boardsSelection(moveBoards(boards, "left")).objectiveId, "eighth", "stops at the first board");
  const last = { ...createBoards({ objectiveId: "mile" }), row: ROW_BOARD };
  assertEqual(boardsSelection(moveBoards(last, "right")).objectiveId, "mile", "stops at the last");
});

test("taking a tab resets the scroll", () => {
  // A list left scrolled to row 20 when the new board holds three shows an empty
  // screen. Every path that changes a tab goes through one place for this.
  const scrolled = { ...createBoards(), row: ROW_BOARD, scroll: 6 };
  assertEqual(moveBoards(scrolled, "right").scroll, 0);
  assertEqual(moveBoards({ ...scrolled, row: ROW_SCOPE }, "right").scroll, 0);
  assertEqual(moveBoards({ ...scrolled, row: ROW_MODE }, "right").scroll, 0);
});

// ---------------------------------------------------------------------------
// The cursor and the list window
// ---------------------------------------------------------------------------

const longList = { rowCount: BOARD_VISIBLE_ROWS + 5 };

test("up and down walk the strips and then into the list", () => {
  let boards = { ...createBoards(), row: ROW_SCOPE };
  boards = moveBoards(boards, "down", longList);
  assertEqual(boards.row, ROW_MODE);
  boards = moveBoards(boards, "down", longList);
  assertEqual(boards.row, ROW_BOARD);
  boards = moveBoards(boards, "down", longList);
  assertEqual(boards.row, ROW_LIST);
  // In the list, the same key scrolls it.
  assertEqual(moveBoards(boards, "down", longList).scroll, 1);
});

test("the list takes the cursor only when there is something to scroll", () => {
  // An "enter the list" that cannot move anything is worse than one that is not
  // offered — the `+ LAYER` tab's rule.
  const boards = { ...createBoards(), row: ROW_BOARD };
  assertEqual(moveBoards(boards, "down", { rowCount: 3 }).row, ROW_BOARD);
  assertEqual(moveBoards(boards, "down", longList).row, ROW_LIST);
});

test("going up off the top of the list returns to the board strip", () => {
  const inList = { ...createBoards(), row: ROW_LIST, scroll: 2 };
  assertEqual(moveBoards(inList, "up", longList).scroll, 1, "scrolls first");
  const atTop = { ...inList, scroll: 0 };
  assertEqual(moveBoards(atTop, "up", longList).row, ROW_BOARD, "then leaves");
});

test("the scroll cannot run past the end of the list", () => {
  const boards = { ...createBoards(), row: ROW_LIST, scroll: 5 };
  assertEqual(scrollBoards(boards, 99, longList).scroll, 5, "five rows over the window");
  assertEqual(scrollBoards(boards, -99, longList).scroll, 0);
});

test("left and right do nothing in the list — it has no strip", () => {
  const boards = { ...createBoards(), row: ROW_LIST, scroll: 1 };
  assertEqual(moveBoards(boards, "left", longList).scroll, 1);
  assertEqual(boardsSelection(moveBoards(boards, "right", longList)).boardId, QUARTER);
});

test("moving never mutates the cursor it was given", () => {
  const boards = createBoards();
  const before = JSON.stringify(boards);
  moveBoards(boards, "right", longList);
  scrollBoards(boards, 1, longList);
  focusBoards(boards, { kind: "tab", row: ROW_SCOPE, index: 1 }, longList);
  assertEqual(JSON.stringify(boards), before);
});

// ---------------------------------------------------------------------------
// What the list shows
// ---------------------------------------------------------------------------

const standings = {
  entries: [
    { rank: 1, playerId: "ace", displayName: "ACE", value: 11924, modelId: "kaido-gts", trackId: "track-a",
      verified: false, recordedAt: "2026-08-01T10:00:00.000Z" },
    { rank: 2, playerId: "me", displayName: "ME", value: 12040, modelId: "toro-sv", trackId: "track-c",
      verified: true, recordedAt: "2026-08-02T10:00:00.000Z" },
  ],
};

test("the global view is the board, with the viewer's own row marked", () => {
  const shown = view(createBoards(), { standings, status: BOARD_READY, playerId: "me" });
  assertEqual(shown.rows.length, 2);
  assertEqual(shown.rows[0].name, "ACE");
  assertEqual(shown.rows[0].value, "11.924s", "formatted by the cabinet's own formatter");
  assertEqual(shown.rows[0].you, false);
  assertEqual(shown.rows[1].you, true, "a player has to be able to find themselves");
  assertEqual(shown.rows[1].verified, true);
});

test("a global row says which car and track set the time", () => {
  // The board is not split by either — the five tracks are one road and the
  // roster is cosmetic — but a row saying so is worth having as metadata.
  const shown = view(createBoards(), { standings, status: BOARD_READY });
  assert(shown.rows[0].meta.includes("Kaido"), `expected a car in ${shown.rows[0].meta}`);
  assert(shown.rows[0].meta.includes("Cape Run") === false);
  assert(shown.rows[1].meta.includes("Cape Run"), `expected a track in ${shown.rows[1].meta}`);
});

test("the personal view lists every board in the mode, driven or not", () => {
  // The question that brings a player here is which boards they have *not* done
  // anything with, and hiding the blanks makes it unanswerable.
  const boards = { ...createBoards(), scope: SCOPE_PERSONAL };
  const shown = view(boards, {
    records: { [QUARTER]: { boardId: QUARTER, value: 12040, modelId: "toro-sv", trackId: "track-a", recordedAt: "" } },
  });
  assertEqual(shown.rows.length, 4, "four distances");
  const quarter = shown.rows.find((row) => row.boardId === QUARTER);
  assertEqual(quarter.value, "12.040s");
  const undriven = shown.rows.find((row) => row.boardId === "distance:mile");
  assertEqual(undriven.value, "—");
  assertEqual(undriven.empty, true);
});

test("the mode tab filters the personal view, so it is a real tab in both scopes", () => {
  const boards = { ...createBoards(), scope: SCOPE_PERSONAL, modeId: "time-attack", objectiveId: "sprint" };
  assertEqual(listedBoards(boards).length, 3, "three clocks");
  assertEqual(view(boards).rows.length, 3);
});

test("the board strip still points at one personal row", () => {
  const boards = { ...createBoards({ objectiveId: "half" }), scope: SCOPE_PERSONAL };
  const shown = view(boards);
  assertEqual(shown.rows.filter((row) => row.you).length, 1);
  assertEqual(shown.rows.find((row) => row.you).boardId, "distance:half");
});

test("a personal rank is shown only for a board that has been fetched", () => {
  // Deliberately not seven requests on opening the screen: walking onto a
  // board's tab is what fills its rank in.
  const boards = { ...createBoards(), scope: SCOPE_PERSONAL };
  const shown = view(boards, { ranks: { [QUARTER]: 2 } });
  assertEqual(shown.rows.find((row) => row.boardId === QUARTER).rank, 2);
  assertEqual(shown.rows.find((row) => row.boardId === "distance:mile").rank, null);
});

test("personal bests never wait on the network", () => {
  // They are held locally, and signed out they are the whole record. A loading
  // state over them would be a lie.
  const boards = { ...createBoards(), scope: SCOPE_PERSONAL };
  assertEqual(view(boards, { status: BOARD_LOADING }).status, BOARD_READY);
});

test("an empty global board is told apart from one that has not arrived", () => {
  // "Nobody has set a time yet" printed over a network fault is exactly the
  // wrong conclusion — the same distinction the route makes with its 404.
  assertEqual(view(createBoards(), { standings: null, status: BOARD_LOADING }).status, BOARD_LOADING);
  assertEqual(view(createBoards(), { standings: { entries: [] }, status: BOARD_READY }).status, BOARD_EMPTY);
  assertEqual(view(createBoards(), { standings: null, status: BOARD_ERROR }).status, BOARD_ERROR);
});

test("signed out the screen says the times are kept but not ranked", () => {
  // Not "offline": a signed-out player's bests are real, and it is only the
  // ranking they are missing. `records-store.js` makes the same distinction.
  assertEqual(view(createBoards(), { ranked: false }).note, "SIGN IN TO RANK YOUR TIMES");
  assertEqual(view(createBoards(), { ranked: true }).note, "");
});

test("the window shows one page and says whether there is more", () => {
  const entries = Array.from({ length: BOARD_VISIBLE_ROWS + 4 }, (_, index) => ({
    rank: index + 1, playerId: `p${index}`, displayName: `P${index}`, value: 12000 + index,
  }));
  const shown = view({ ...createBoards(), scroll: 2 }, { standings: { entries }, status: BOARD_READY });
  assertEqual(shown.rows.length, BOARD_VISIBLE_ROWS);
  assertEqual(shown.rows[0].name, "P2");
  assert(shown.canScrollUp && shown.canScrollDown);
  assertEqual(shown.totalRows, BOARD_VISIBLE_ROWS + 4);
});

test("a scroll past the end of a shorter list is clamped by the view too", () => {
  // The cursor is bounded when it moves, but a board can also *shrink* under a
  // held scroll when a tab changes — the view is the backstop.
  const shown = view({ ...createBoards(), scroll: 40 }, { standings, status: BOARD_READY });
  assertEqual(shown.scroll, 0);
  assertEqual(shown.rows.length, 2);
});

test("a malformed date reads as nothing rather than as Invalid Date", () => {
  assertEqual(formatRecordedAt("2026-08-08T00:00:00.000Z").slice(3), "AUG 2026");
  assertEqual(formatRecordedAt(""), "");
  assertEqual(formatRecordedAt(null), "");
  assertEqual(formatRecordedAt("not a date"), "");
});

// ---------------------------------------------------------------------------
// Geometry — the mouse and the renderer read one copy of it
// ---------------------------------------------------------------------------

test("every tab, row and arrow fits on screen and nothing collides", () => {
  const rects = [];
  const shown = view(createBoards(), { standings, status: BOARD_READY });
  for (const [row, tabs] of [[ROW_SCOPE, shown.tabs.scope], [ROW_MODE, shown.tabs.mode], [ROW_BOARD, shown.tabs.board]]) {
    for (const tab of tabs) rects.push({ what: `tab ${row}/${tab.index}`, ...boardsTabRect(row, tab.index) });
  }
  for (let screenRow = 0; screenRow < BOARD_VISIBLE_ROWS; screenRow += 1) {
    rects.push({ what: `row ${screenRow}`, ...boardsRowRect(screenRow) });
  }
  // Each strip's caption sits in the gap above its boxes. At a tighter pitch it
  // printed through the strip above it, which read as the words belonging to the
  // wrong one — so the caption band is swept as a rect like everything else.
  for (const [row, strip] of BOARDS_LAYOUT.strips.rows.entries()) {
    rects.push({
      what: `caption ${row}`,
      x: BOARDS_LAYOUT.strips.x,
      y: strip.y - BOARDS_LAYOUT.strips.captionOffset - 10,
      width: 90,
      height: 12,
    });
  }
  rects.push({ what: "scroll up", ...boardsScrollRect(-1) });
  rects.push({ what: "scroll down", ...boardsScrollRect(1) });

  for (const rect of rects) {
    assert(rect.x >= 0 && rect.y >= 0, `${rect.what} starts off screen`);
    assert(rect.x + rect.width <= WORLD.width, `${rect.what} runs off the right edge`);
    assert(rect.y + rect.height <= WORLD.height, `${rect.what} runs off the bottom`);
  }
  // The list must clear the legend printed under it.
  const last = boardsRowRect(BOARD_VISIBLE_ROWS - 1);
  assert(last.y + last.height < BOARDS_LAYOUT.legend.y - 14, "the list runs into the controls legend");

  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const a = rects[i];
      const b = rects[j];
      const clear = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert(clear, `${a.what} overlaps ${b.what}`);
    }
  }
});

test("clicking a tab hits the tab that was drawn there", () => {
  const shown = view(createBoards(), { standings, status: BOARD_READY });
  for (const [row, tabs] of [[ROW_SCOPE, shown.tabs.scope], [ROW_MODE, shown.tabs.mode], [ROW_BOARD, shown.tabs.board]]) {
    for (const tab of tabs) {
      const rect = boardsTabRect(row, tab.index);
      const hit = hitBoards(shown, rect.x + rect.width / 2, rect.y + rect.height / 2);
      assertEqual(hit?.kind, "tab", `no hit on tab ${row}/${tab.index}`);
      assertEqual(hit.row, row);
      assertEqual(hit.index, tab.index);
    }
  }
});

test("a dead scroll arrow is not a target", () => {
  // The arrows are drawn either way, so an inert one must not swallow a click
  // and read as a button that does nothing.
  const shown = view(createBoards(), { standings, status: BOARD_READY });
  const rect = boardsScrollRect(1);
  assertEqual(shown.canScrollDown, false);
  assertEqual(hitBoards(shown, rect.x + 2, rect.y + 2), null);
});

test("a list row is not a click target", () => {
  // Rows are read, never chosen. Highlighting something a click cannot act on is
  // how a dead control gets drawn.
  const shown = view(createBoards(), { standings, status: BOARD_READY });
  const rect = boardsRowRect(0);
  assertEqual(hitBoards(shown, rect.x + rect.width / 2, rect.y + rect.height / 2), null);
});

test("a click takes the tab as well as moving the cursor onto it", () => {
  // One gesture: a mouse has nowhere to put a separate commit, so a click that
  // only highlighted would read as a dead control.
  const boards = createBoards();
  const clicked = focusBoards(boards, { kind: "tab", row: ROW_SCOPE, index: 1 }, longList);
  assertEqual(clicked.scope, SCOPE_PERSONAL);
  assertEqual(clicked.row, ROW_SCOPE);
});

test("a click on an arrow scrolls without dragging the cursor into the list", () => {
  const boards = { ...createBoards(), row: ROW_BOARD };
  const scrolled = focusBoards(boards, { kind: "scroll", step: 1 }, longList);
  assertEqual(scrolled.scroll, 1);
  assertEqual(scrolled.row, ROW_BOARD, "the list picks nothing, so the cursor has no reason to follow");
});

finish();
