// The leaderboard screen: three tab strips and a list.
//
// Canvas only. Every position comes from `BOARDS_LAYOUT` and every piece of
// state from the view model `ui/boards.js` hands over; this file decides nothing
// about what is selected, what is on screen or how many rows fit — that last one
// is a scrolling rule and lives with the cursor.
//
// `hitBoards` is exported from here, beside the rects it tests, for the
// `menuListBox` reason: the hover highlight and the click must resolve from one
// copy of the geometry, or the row that lights up is not the row that acts.

import { WORLD } from "./scene.js";
import { drawMenuBackdrop } from "./menus.js";
import {
  BOARD_EMPTY,
  BOARD_ERROR,
  BOARD_LOADING,
  BOARD_OFFLINE,
  BOARD_VISIBLE_ROWS,
  ROW_BOARD,
  ROW_MODE,
  ROW_SCOPE,
} from "../ui/boards.js";

/**
 * Where everything sits. One object, so `tests/modules.test.js` can sweep it for
 * overlaps and overruns without a canvas, exactly as it does the setup screen's
 * and the collection's.
 *
 * Tab widths are fixed per strip rather than measured from the text, so the hit
 * test stays pure: a rect that depends on `ctx.measureText` cannot be resolved
 * by anything but a canvas, and then the click geometry would live in the draw
 * call again.
 */
export const BOARDS_LAYOUT = {
  title: { x: 64, y: 72 },
  status: { x: WORLD.width - 64, y: 72 },
  strips: {
    x: 64,
    height: 34,
    gap: 8,
    // One entry per cursor row, in row order. The pitch is 58 against a 34px
    // box because each strip carries its caption *above* it, in the 24px gap —
    // at 46 the caption printed through the box above it, which read as the
    // words belonging to the wrong strip.
    rows: [
      { y: 102, width: 168, label: "VIEW" },
      { y: 160, width: 196, label: "MODE" },
      { y: 218, width: 156, label: "BOARD" },
    ],
    captionOffset: 10,
  },
  head: { x: 64, y: 268, width: 1092 },
  list: { x: 64, y: 282, width: 1092, height: 40, gap: 4 },
  scroll: { x: WORLD.width - 100, y: 282, width: 36, height: 36 },
  legend: { x: 64, y: WORLD.height - 14 },
};

/** Columns inside a list row, as offsets from its left edge. */
const COLUMN = { rank: 18, name: 76, meta: 430, date: 760, value: 1092 - 18 };

const INK = "#e8e9ee";
const DIM = "#8b8f9c";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";
const CHOSEN = "#57d98a";

function label(ctx, text, x, y, { size = 14, colour = DIM, weight = "600", align = "left", mono = false } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${mono ? '"Consolas", "SF Mono", monospace' : '"Segoe UI", system-ui, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

/** Screen rect of one tab. `row` is a cursor row; the list row has no strip. */
export function boardsTabRect(row, index) {
  const strip = BOARDS_LAYOUT.strips.rows[row];
  if (!strip) return null;
  const { x, height, gap } = BOARDS_LAYOUT.strips;
  return { x: x + index * (strip.width + gap), y: strip.y, width: strip.width, height };
}

/** Screen rect of one list row, by its position in the visible window. */
export function boardsRowRect(screenRow) {
  const { x, y, width, height, gap } = BOARDS_LAYOUT.list;
  return { x, y: y + screenRow * (height + gap), width, height };
}

/** Screen rect of a scroll arrow. `step` is -1 for up, 1 for down. */
export function boardsScrollRect(step) {
  const { x, y, width, height } = BOARDS_LAYOUT.scroll;
  const last = boardsRowRect(BOARD_VISIBLE_ROWS - 1);
  return { x, y: step < 0 ? y : last.y + last.height - height, width, height };
}

const within = (rect, x, y) =>
  Boolean(rect) && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * What is under the pointer, or null. Pure, and takes the finished view because
 * a strip is as long as the mode it is showing.
 *
 * List rows are deliberately not targets: they are read, not chosen, and a
 * highlight on something a click cannot act on reads as a dead control.
 */
export function hitBoards(view, x, y) {
  for (const step of [-1, 1]) {
    const live = step < 0 ? view.canScrollUp : view.canScrollDown;
    if (live && within(boardsScrollRect(step), x, y)) return { kind: "scroll", step };
  }
  for (const [row, tabs] of [[ROW_SCOPE, view.tabs.scope], [ROW_MODE, view.tabs.mode], [ROW_BOARD, view.tabs.board]]) {
    for (const tab of tabs) {
      if (within(boardsTabRect(row, tab.index), x, y)) return { kind: "tab", row, index: tab.index };
    }
  }
  return null;
}

/**
 * `selected` is the tab in force, `hovered` is what a click would take, and the
 * cursor row gets a brighter frame so the keyboard can be told where it is
 * without a caret that would fight the selection.
 */
function drawTab(ctx, rect, tab, { live }) {
  ctx.fillStyle = tab.selected
    ? "rgba(74,22,10,0.94)"
    : tab.hovered
      ? "rgba(40,30,26,0.92)"
      : "rgba(12,15,20,0.88)";
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
  ctx.fill();
  ctx.strokeStyle = tab.selected || tab.hovered ? ACCENT : live ? "rgba(150,158,178,0.55)" : "rgba(150,158,178,0.24)";
  ctx.lineWidth = tab.selected ? 2 : 1;
  ctx.stroke();
  label(ctx, tab.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5, {
    size: 13,
    colour: tab.selected ? INK : tab.hovered ? INK : DIM,
    align: "center",
  });
}

function drawStrip(ctx, row, tabs, cursorRow) {
  const strip = BOARDS_LAYOUT.strips.rows[row];
  label(ctx, strip.label, BOARDS_LAYOUT.strips.x, strip.y - BOARDS_LAYOUT.strips.captionOffset, {
    size: 10,
    colour: MUTED,
  });
  for (const tab of tabs) {
    drawTab(ctx, boardsTabRect(row, tab.index), tab, { live: cursorRow === row });
  }
}

/** The one line printed instead of a list when there is nothing to show. */
const EMPTY_LINES = {
  [BOARD_LOADING]: "LOADING THE BOARD…",
  [BOARD_EMPTY]: "NOBODY HAS SET A TIME ON THIS BOARD YET",
  [BOARD_ERROR]: "THE BOARD COULD NOT BE REACHED — IT WILL RETRY",
  [BOARD_OFFLINE]: "SIGN IN TO SEE THE GLOBAL BOARD",
};

function drawRow(ctx, view, row) {
  const rect = boardsRowRect(row.screenRow);
  // The viewer's own entry on a global board, and the selected board on the
  // personal one — the same mark, because both answer "which of these is me".
  const mine = row.you === true;
  ctx.fillStyle = mine ? "rgba(20,44,30,0.88)" : row.screenRow % 2 === 0 ? "rgba(12,15,20,0.82)" : "rgba(9,11,15,0.7)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  if (mine) {
    ctx.strokeStyle = CHOSEN;
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }

  const baseline = rect.y + rect.height / 2 + 5;
  const ink = row.empty ? MUTED : mine ? CHOSEN : INK;

  if (row.rank !== null && row.rank !== undefined) {
    label(ctx, String(row.rank), rect.x + COLUMN.rank, baseline, { size: 14, colour: mine ? CHOSEN : DIM, mono: true });
  }
  label(ctx, row.name, rect.x + COLUMN.name, baseline, { size: 15, colour: ink });
  label(ctx, row.meta, rect.x + COLUMN.meta, baseline, { size: 12, colour: row.empty ? MUTED : DIM });
  label(ctx, row.date, rect.x + COLUMN.date, baseline, { size: 12, colour: MUTED });
  label(ctx, row.value, rect.x + COLUMN.value, baseline, {
    size: 17,
    colour: ink,
    align: "right",
    mono: true,
    weight: "700",
  });

  // A record is a *claim* until the server has replayed its input log, and the
  // screen says which is which rather than presenting every row as checked.
  // Nothing is verified yet — that pass is not built — so this is deliberately
  // an absence of a mark rather than a warning on every row.
  if (row.verified) {
    label(ctx, "✓", rect.x + COLUMN.value + 14, baseline, { size: 12, colour: CHOSEN });
  }
}

function drawScrollButton(ctx, step, live) {
  const rect = boardsScrollRect(step);
  ctx.fillStyle = live ? "rgba(255,90,46,0.14)" : "rgba(14,16,21,0.6)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = live ? ACCENT : "rgba(150,158,178,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  label(ctx, step < 0 ? "▲" : "▼", rect.x + rect.width / 2, rect.y + rect.height / 2 + 6, {
    size: 14,
    colour: live ? INK : MUTED,
    align: "center",
  });
}

export function drawBoards(ctx, view, { splashImage } = {}) {
  drawMenuBackdrop(ctx, splashImage, { alpha: 0.85, scrim: 0.5 });

  label(ctx, "LEADERBOARDS", BOARDS_LAYOUT.title.x, BOARDS_LAYOUT.title.y, {
    size: 32,
    colour: INK,
    weight: "800",
  });
  label(ctx, view.note || (view.personal ? "YOUR BESTS" : view.boardLabel.toUpperCase()),
    BOARDS_LAYOUT.status.x, BOARDS_LAYOUT.status.y, {
      size: 13,
      colour: view.note ? ACCENT : DIM,
      align: "right",
    });

  drawStrip(ctx, ROW_SCOPE, view.tabs.scope, view.row);
  drawStrip(ctx, ROW_MODE, view.tabs.mode, view.row);
  drawStrip(ctx, ROW_BOARD, view.tabs.board, view.row);

  // Column headings change with the scope, because the columns genuinely mean
  // different things: a global row is a driver, a personal row is a board.
  const head = BOARDS_LAYOUT.head;
  label(ctx, view.personal ? "RANK" : "#", head.x + COLUMN.rank, head.y, { size: 10, colour: MUTED });
  label(ctx, view.personal ? "BOARD" : "DRIVER", head.x + COLUMN.name, head.y, { size: 10, colour: MUTED });
  label(ctx, "CAR · TRACK", head.x + COLUMN.meta, head.y, { size: 10, colour: MUTED });
  label(ctx, "SET", head.x + COLUMN.date, head.y, { size: 10, colour: MUTED });
  label(ctx, view.unit === "cm" ? "DISTANCE" : "TIME", head.x + COLUMN.value, head.y, {
    size: 10,
    colour: MUTED,
    align: "right",
  });

  if (view.rows.length === 0) {
    const rect = boardsRowRect(0);
    ctx.fillStyle = "rgba(12,15,20,0.82)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height * 2);
    label(ctx, EMPTY_LINES[view.status] ?? "NOTHING TO SHOW", rect.x + rect.width / 2, rect.y + rect.height, {
      size: 14,
      colour: view.status === BOARD_ERROR ? ACCENT : DIM,
      align: "center",
    });
  } else {
    for (const row of view.rows) drawRow(ctx, view, row);
  }

  drawScrollButton(ctx, -1, view.canScrollUp);
  drawScrollButton(ctx, 1, view.canScrollDown);
  if (view.totalRows > BOARD_VISIBLE_ROWS) {
    label(
      ctx,
      `${view.scroll + 1}–${Math.min(view.scroll + view.visibleRows, view.totalRows)} of ${view.totalRows}`,
      BOARDS_LAYOUT.scroll.x + BOARDS_LAYOUT.scroll.width / 2,
      boardsRowRect(4).y + 24,
      { size: 11, colour: MUTED, align: "center" },
    );
  }

  label(
    ctx,
    "← →  change tab       ↑ ↓  move, then scroll the list       ESC  back",
    BOARDS_LAYOUT.legend.x,
    BOARDS_LAYOUT.legend.y,
    { size: 13, colour: DIM },
  );
}
