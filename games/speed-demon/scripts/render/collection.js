// The collection screen: the whole roster, a row per model, every paint you have
// built for it in that row.
//
// Canvas only. Every position comes from `COLLECTION_LAYOUT` and every piece of
// state from the view model `ui/collection.js` hands over; this file decides
// nothing about what is selected or what is on screen — including how many rows
// fit, which is a scrolling rule and therefore lives with the cursor.

import { WORLD } from "./scene.js";
import { drawMenuBackdrop } from "./menus.js";
import { fitContain } from "./setup.js";
import { liverySprite, hasLiverySprite, drawUnderglow } from "./livery.js";
import { paintSwatchColour } from "../garage/paint.js";
import { COLLECTION_VISIBLE_ROWS } from "../ui/collection.js";

/**
 * Where everything sits. One object, so `tests/modules.test.js` can sweep it for
 * overlaps and overruns without a canvas, exactly as it does the setup screen's.
 *
 * The row is a name gutter and then a strip of cells. Cells are portrait because
 * the car sprites are, and the strip is sized for the widest row the garage can
 * produce — `Factory`, six saved paints and the add cell — so a full row cannot
 * run off the right edge.
 */
export const COLLECTION_LAYOUT = {
  title: { x: 64, y: 72 },
  chosen: { x: WORLD.width - 64, y: 72 },
  // Narrow enough to leave the scroll column beside it clear: a row that ran
  // under the arrows would put a cell and a button on the same pixel.
  rows: { x: 64, y: 120, width: 1092, height: 106, gap: 8, labelWidth: 208 },
  cells: { width: 96, height: 94, gap: 8 },
  scroll: { x: WORLD.width - 100, y: 120, width: 36, height: 36, gap: 8 },
  legend: { x: 64, y: WORLD.height - 14 },
};

/**
 * How many sprites may be baked in one frame.
 *
 * A bake is ~7ms and a scroll changes five rows at once, so painting every miss
 * would drop several frames in a row. The rest of the cells draw the bare body
 * for a frame or two and fill in — the same way every renderer in the cabinet
 * degrades on a cold cache, and far less noticeable than the stall.
 */
export const BAKE_BUDGET = 3;

/**
 * The screen's own backdrop: a workshop, rather than the two cars on a strip
 * that stand behind the title and the mode list.
 *
 * Like `menu-splash.png` it is authored *as* a backdrop — already night, already
 * lit around an empty foreground floor — so it is drawn near full strength and
 * needs almost no scrim. A track aerial is the opposite kind of image and is
 * held right back; that is why `drawMenuBackdrop` takes both as arguments.
 */
export const GARAGE_SPLASH = "assets/garage-1.png";

const INK = "#e8e9ee";
const DIM = "#8b8f9c";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";
const CHOSEN = "#57d98a";

function label(ctx, text, x, y, { size = 14, colour = DIM, weight = "600", align = "left" } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

/** Screen rect of one model row, by its position in the visible window. */
export function collectionRowRect(screenRow) {
  const { x, y, width, height, gap } = COLLECTION_LAYOUT.rows;
  return { x, y: y + screenRow * (height + gap), width, height };
}

/** Screen rect of one config cell, by visible row and column. */
export function collectionCellRect(screenRow, column) {
  const row = collectionRowRect(screenRow);
  const { width, height, gap } = COLLECTION_LAYOUT.cells;
  return {
    x: row.x + COLLECTION_LAYOUT.rows.labelWidth + column * (width + gap),
    y: row.y + (row.height - height) / 2,
    width,
    height,
  };
}

/** Screen rect of a scroll arrow. `step` is -1 for up, 1 for down. */
export function collectionScrollRect(step) {
  const { x, y, width, height, gap } = COLLECTION_LAYOUT.scroll;
  const rows = collectionRowRect(COLLECTION_VISIBLE_ROWS - 1);
  return {
    x,
    y: step < 0 ? y : rows.y + rows.height - height,
    width,
    height,
    gap,
  };
}

const within = (rect, x, y) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * What is under the pointer, or null.
 *
 * Pure, and exported from the module that draws the rects, so the hover
 * highlight and the click cannot disagree about where a cell is — the
 * `menuListBox` rule. It takes the finished view because a row is as long as
 * that model's garage.
 *
 * A cell reports its *absolute* row, not its position in the window, because
 * that is the only thing that still means something once the list has scrolled.
 */
export function hitCollection(view, x, y) {
  for (const step of [-1, 1]) {
    const rect = collectionScrollRect(step);
    const live = step < 0 ? view.canScrollUp : view.canScrollDown;
    if (live && within(rect, x, y)) return { kind: "scroll", step };
  }
  for (const row of view.rows) {
    for (const cell of row.cells) {
      if (within(collectionCellRect(row.screenRow, cell.column), x, y)) {
        return { kind: "cell", row: row.row, column: cell.column };
      }
    }
  }
  return null;
}

/**
 * `selected` is the cursor, `chosen` is the car going to the line, `hovered` is
 * what a click would take. Three states, three borders — the setup screen's
 * vocabulary, so a player who has used that screen can read this one.
 */
function cellPanel(ctx, rect, { selected = false, chosen = false, hovered = false } = {}) {
  ctx.fillStyle = hovered ? "rgba(40,30,26,0.92)" : "rgba(14,16,21,0.86)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = selected || hovered ? ACCENT : chosen ? CHOSEN : "rgba(150,158,178,0.35)";
  ctx.lineWidth = selected || chosen || hovered ? 2 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

/**
 * One saved config: the car in that paint, its name, and a dot of the paint
 * itself. The dot is the *painted* result rather than the tint, which is the
 * only way Silver and White are ever distinguishable.
 */
function drawConfigCell(ctx, rect, cell, model, { image, liveryCache, budget }) {
  cellPanel(ctx, rect, cell);

  const art = { x: rect.x, y: rect.y + 4, width: rect.width, height: rect.height - 26 };
  const ready = image && image.complete && image.naturalWidth > 0;

  // Spend the frame's bake budget on misses only. A hit costs nothing, so a
  // screen the player has been sitting on is fully painted; the frame after a
  // scroll is the only one that shows bare bodies, and it fills itself in.
  let sprite = null;
  if (liveryCache && ready) {
    const cached = hasLiverySprite(liveryCache, { model, livery: cell.livery });
    if (cached || budget.left > 0) {
      if (!cached) budget.left -= 1;
      sprite = liverySprite(liveryCache, { image, model, livery: cell.livery });
    }
  }

  if (sprite) {
    const fit = fitContain(model.sw, model.sh, art, 6);
    drawUnderglow(ctx, { x: fit.x + fit.width / 2, top: fit.y, width: fit.width, height: fit.height }, cell.livery);
    ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, fit.x, fit.y, fit.width, fit.height);
  } else if (ready) {
    const fit = fitContain(model.sw, model.sh, art, 6);
    ctx.drawImage(image, model.sx, model.sy, model.sw, model.sh, fit.x, fit.y, fit.width, fit.height);
  }

  ctx.beginPath();
  ctx.arc(rect.x + 11, rect.y + rect.height - 12, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = paintSwatchColour(cell.livery.paint);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  label(ctx, cell.name, rect.x + 21, rect.y + rect.height - 8, {
    size: 11,
    colour: cell.selected ? INK : cell.chosen ? CHOSEN : DIM,
  });
}

/** The add cell. Present only while this model can take another config. */
function drawNewCell(ctx, rect, cell) {
  cellPanel(ctx, rect, cell);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = cell.selected || cell.hovered ? ACCENT : "rgba(150,158,178,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 8.5, rect.y + 8.5, rect.width - 17, rect.height - 17);
  ctx.setLineDash([]);
  label(ctx, "+", rect.x + rect.width / 2, rect.y + rect.height / 2 + 2, {
    size: 26,
    weight: "700",
    colour: cell.selected || cell.hovered ? ACCENT : MUTED,
    align: "center",
  });
  label(ctx, "NEW PAINT", rect.x + rect.width / 2, rect.y + rect.height - 12, {
    size: 10,
    colour: cell.selected || cell.hovered ? INK : MUTED,
    align: "center",
  });
}

function drawRow(ctx, row, { sheetImages, liveryCache, budget }) {
  const rect = collectionRowRect(row.screenRow);
  ctx.fillStyle = "rgba(9,11,15,0.55)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  label(ctx, row.groupLabel.toUpperCase(), rect.x + 16, rect.y + 30, { size: 10, colour: MUTED });
  label(ctx, row.label.toUpperCase(), rect.x + 16, rect.y + 54, { size: 17, colour: INK });
  label(
    ctx,
    row.savedCount === 0 ? "no paints saved" : row.savedCount === 1 ? "1 paint" : `${row.savedCount} paints`,
    rect.x + 16,
    rect.y + 76,
    { size: 11, colour: row.savedCount === 0 ? MUTED : DIM },
  );

  const image = sheetImages.get(row.model.sheetId);
  for (const cell of row.cells) {
    const cellRect = collectionCellRect(row.screenRow, cell.column);
    if (cell.action) {
      drawNewCell(ctx, cellRect, cell);
    } else {
      drawConfigCell(ctx, cellRect, cell, row.model, { image, liveryCache, budget });
    }
  }
}

function drawScrollButton(ctx, step, live) {
  const rect = collectionScrollRect(step);
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

export function drawCollection(ctx, view, { sheetImages, splashImage, liveryCache = null }) {
  // The rows carry their own panel fill, so the picture behind them can be left
  // legible — the empty floor it is composed around is exactly where they land.
  drawMenuBackdrop(ctx, splashImage, { alpha: 0.85, scrim: 0.42 });

  const wordmark = "GARAGE";
  label(ctx, wordmark, COLLECTION_LAYOUT.title.x, COLLECTION_LAYOUT.title.y, {
    size: 32,
    colour: INK,
    weight: "800",
  });
  // Measured rather than offset by a guessed constant: `label` has just left the
  // wordmark's font on the context, so this is the width actually drawn. A fixed
  // gap was wrong the moment the type was set at 32px — the count printed
  // through the last glyph — and it would be wrong again at any other size.
  label(
    ctx,
    view.savedTotal === 1 ? "1 PAINT SAVED" : `${view.savedTotal} PAINTS SAVED`,
    COLLECTION_LAYOUT.title.x + ctx.measureText(wordmark).width + 16,
    COLLECTION_LAYOUT.title.y,
    { size: 13, colour: ACCENT },
  );

  // What is going to the line, said in words: the cursor can be several rows
  // away from the pick, and a screen this long needs to keep answering it.
  label(ctx, "TAKING TO THE LINE", COLLECTION_LAYOUT.chosen.x, COLLECTION_LAYOUT.chosen.y - 20, {
    size: 11,
    colour: MUTED,
    align: "right",
  });
  label(
    ctx,
    `${view.chosen.label.toUpperCase()}  ·  ${view.chosen.presetName}`,
    COLLECTION_LAYOUT.chosen.x,
    COLLECTION_LAYOUT.chosen.y,
    { size: 15, colour: CHOSEN, align: "right" },
  );

  const budget = { left: BAKE_BUDGET };
  for (const row of view.rows) {
    drawRow(ctx, row, { sheetImages, liveryCache, budget });
  }

  drawScrollButton(ctx, -1, view.canScrollUp);
  drawScrollButton(ctx, 1, view.canScrollDown);
  label(
    ctx,
    `${view.scroll + 1}–${Math.min(view.scroll + view.visibleRows, view.totalRows)} of ${view.totalRows}`,
    COLLECTION_LAYOUT.scroll.x + COLLECTION_LAYOUT.scroll.width / 2,
    collectionRowRect(2).y + 54,
    { size: 11, colour: MUTED, align: "center" },
  );

  label(
    ctx,
    view.canCustomise
      ? "CLICK a car to take it to the line       ARROWS  move       ENTER  customise it       ESC  back"
      : "SIGN IN TO CUSTOMISE — your paints are saved to your account       ARROWS  move       ESC  back",
    COLLECTION_LAYOUT.legend.x,
    COLLECTION_LAYOUT.legend.y,
    { size: 13, colour: view.canCustomise ? DIM : ACCENT },
  );
}
