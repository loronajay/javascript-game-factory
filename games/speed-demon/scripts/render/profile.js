// The driver screen: the card, and the two pickers behind it.
//
// Canvas only. Every position comes from `PROFILE_LAYOUT` and every piece of
// state from the view model `ui/profile.js` hands over; this file decides
// nothing about what is selected, what is pinned or how many rows fit — the
// last of those is a scrolling rule and lives with the cursor.
//
// It also owns `hitProfile`, for the `menuListBox` reason: the geometry the
// renderer draws and the geometry the mouse reads have to be one thing, or the
// cell you click is not the cell you saw.

import { WORLD } from "./scene.js";
import { drawMenuBackdrop } from "./menus.js";
import { fitContain } from "./setup.js";
import { liverySprite, hasLiverySprite, drawUnderglow } from "./livery.js";
import { ellipsize } from "./radio.js";
import { paintSwatchColour } from "../garage/paint.js";
import { AVATAR_VISIBLE_ROWS, CAR_VISIBLE_ROWS, STAGE_AVATAR, STAGE_CARD, STAGE_CARS, STAGE_NAME } from "../ui/profile.js";

/**
 * The backdrop. `garage-2.png` rather than the collection's `garage-1.png` so
 * the two garage-side screens are not the same picture — it is authored the same
 * way, night already and composed around an empty foreground, which is what lets
 * it be drawn near full strength.
 */
export const PROFILE_SPLASH = "assets/garage-2.png";

/**
 * Where everything sits. One object, so `tests/modules.test.js` can sweep it for
 * overlaps and overruns without a canvas, exactly as it does the setup screen's
 * and the collection's.
 */
export const PROFILE_LAYOUT = {
  title: { x: 64, y: 64 },
  // The card: a square photograph, the name under it, and the three rows that
  // change them.
  card: { x: 64, y: 88, width: 380, height: 404 },
  photo: { x: 96, y: 120, width: 316, height: 316 },
  rows: { x: 64, y: 508, width: 380, height: 56, gap: 8 },
  // The right column: what the player has done.
  favourites: { x: 476, y: 88, width: 740, height: 158 },
  favouriteCell: { width: 138, height: 118, gap: 12 },
  bests: { x: 476, y: 268, width: 740, height: 330 },
  bestRow: { height: 38, gap: 2 },
  summary: { x: 476, y: 614, width: 740, height: 82 },
  legend: { x: 64, y: WORLD.height - 14 },

  // The avatar picker, drawn over the card.
  avatarGrid: { x: 122, y: 128, cell: 112, gap: 10, caption: 20, rowGap: 8 },
  avatarScroll: { x: WORLD.width - 96, y: 128, width: 36, height: 36 },
  // The car picker, drawn over the card. A row per model and a cell per paint,
  // so it is laid out like the collection rather than like a grid of bodies —
  // which is what it is now showing.
  carRows: { x: 64, y: 132, width: 1092, height: 100, gap: 8, labelWidth: 208 },
  carCells: { width: 96, height: 88, gap: 8 },
  carScroll: { x: WORLD.width - 100, y: 132, width: 36, height: 36 },
};

/**
 * How many sprites may be baked in one frame — the collection's budget, for the
 * collection's reason: a bake is ~7ms and this screen can ask for five at once.
 */
export const BAKE_BUDGET = 3;

const INK = "#e8e9ee";
const TEXT = "#dfe6ee";
const DIM = "#8b8f9c";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";
const GOOD = "#57d98a";

function label(ctx, value, x, y, { size = 14, colour = DIM, weight = "600", align = "left", mono = false, maxWidth = 0 } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px ${mono ? '"Consolas", "SF Mono", monospace' : '"Segoe UI", system-ui, sans-serif'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  // Clipped, not condensed: canvas's own maxWidth squashes the glyphs, which at
  // 10px reads as a rendering fault. Paint names have no length a cell can be
  // sized against.
  ctx.fillText(maxWidth > 0 ? ellipsize(ctx, value, maxWidth) : value, x, y);
}

function panel(ctx, rect, { live = false } = {}) {
  ctx.fillStyle = "rgba(10,13,19,0.86)";
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 10);
  ctx.fill();
  ctx.strokeStyle = live ? ACCENT : "rgba(150,158,178,0.28)";
  ctx.lineWidth = live ? 2 : 1;
  ctx.stroke();
}

const ready = (image) => Boolean(image && image.complete && image.naturalWidth > 0);

/**
 * A face, filling its rect.
 *
 * **Cover, not contain**, and that is the manifest's decision rather than this
 * file's: the sources are square and the slots are not, so containing one would
 * letterbox every single cell. Cover loses a little off the sides, which is
 * where a portrait's subject almost never is.
 *
 * A file that has not arrived — or does not exist — draws a plate with the
 * driver's initial on it, which is the cabinet's placeholder rule everywhere
 * else. These files are ~2MB apiece and load on demand, so an unresolved image
 * is the *ordinary* first frame here, not an error.
 */
export function drawAvatarInto(ctx, rect, avatar, image, { radius = 8, accent = ACCENT } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.clip();

  if (ready(image)) {
    const scale = Math.max(rect.width / image.naturalWidth, rect.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, rect.x + (rect.width - width) / 2, rect.y + (rect.height - height) / 2, width, height);
  } else {
    ctx.fillStyle = "rgba(18,22,30,0.95)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    label(ctx, avatar?.initial ?? "?", rect.x + rect.width / 2, rect.y + rect.height / 2 + rect.height * 0.14, {
      size: Math.max(14, rect.height * 0.4),
      colour: accent,
      weight: "800",
      align: "center",
    });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Geometry — shared by the drawing and the hit test
// ---------------------------------------------------------------------------

export function profileRowRect(index) {
  const { x, y, width, height, gap } = PROFILE_LAYOUT.rows;
  return { x, y: y + index * (height + gap), width, height };
}

export function favouriteCellRect(index) {
  const { x, y } = PROFILE_LAYOUT.favourites;
  const { width, height, gap } = PROFILE_LAYOUT.favouriteCell;
  return { x: x + index * (width + gap), y: y + 34, width, height };
}

export function bestRowRect(index) {
  const { x, y, width } = PROFILE_LAYOUT.bests;
  const { height, gap } = PROFILE_LAYOUT.bestRow;
  return { x: x + 12, y: y + 44 + index * (height + gap), width: width - 24, height };
}

/** A face's cell, by its position in the visible window. */
export function avatarCellRect(screenRow, column) {
  const { x, y, cell, gap, caption, rowGap } = PROFILE_LAYOUT.avatarGrid;
  return {
    x: x + column * (cell + gap),
    y: y + screenRow * (cell + caption + rowGap) + caption,
    width: cell,
    height: cell,
  };
}

export function avatarScrollRect(step) {
  const { x, y, width, height } = PROFILE_LAYOUT.avatarScroll;
  const last = avatarCellRect(AVATAR_VISIBLE_ROWS - 1, 0);
  return { x, y: step < 0 ? y : last.y + last.height - height, width, height };
}

/** One model's row, by its position in the visible window. */
export function carRowRect(screenRow) {
  const { x, y, width, height, gap } = PROFILE_LAYOUT.carRows;
  return { x, y: y + screenRow * (height + gap), width, height };
}

/** One paint's cell, by visible row and column. */
export function carCellRect(screenRow, column) {
  const row = carRowRect(screenRow);
  const { width, height, gap } = PROFILE_LAYOUT.carCells;
  return {
    x: row.x + PROFILE_LAYOUT.carRows.labelWidth + column * (width + gap),
    y: row.y + (row.height - height) / 2,
    width,
    height,
  };
}

export function carScrollRect(step) {
  const { x, y, width, height } = PROFILE_LAYOUT.carScroll;
  const last = carRowRect(CAR_VISIBLE_ROWS - 1);
  return { x, y: step < 0 ? y : last.y + last.height - height, width, height };
}

const within = (rect, x, y) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * What is under the pointer, or null. Pure, and exported from the module that
 * draws the rects.
 *
 * Only the live stage answers: a picker is drawn *over* the card, so a click
 * that fell through to a row behind it would fire a control the player cannot
 * see. A cell reports its absolute row, which is the only thing that still means
 * something once the grid has scrolled — the collection's rule.
 */
export function hitProfile(view, x, y) {
  if (view.stage === STAGE_AVATAR) {
    for (const step of [-1, 1]) {
      const live = step < 0 ? view.avatarPicker.canScrollUp : view.avatarPicker.canScrollDown;
      if (live && within(avatarScrollRect(step), x, y)) return { kind: "scroll", step };
    }
    for (const row of view.avatarPicker.rows) {
      for (const cell of row.cells) {
        if (within(avatarCellRect(row.screenRow, cell.column), x, y)) {
          return { kind: "avatar", row: cell.row, column: cell.column };
        }
      }
    }
    return null;
  }

  if (view.stage === STAGE_CARS) {
    for (const step of [-1, 1]) {
      const live = step < 0 ? view.carPicker.canScrollUp : view.carPicker.canScrollDown;
      if (live && within(carScrollRect(step), x, y)) return { kind: "scroll", step };
    }
    for (const row of view.carPicker.rows) {
      for (const cell of row.cells) {
        if (within(carCellRect(row.screenRow, cell.column), x, y)) {
          return { kind: "car", row: cell.row, column: cell.column };
        }
      }
    }
    return null;
  }

  // The name stage is a field and a caret: there is nothing on it to click, and
  // offering a target that only closed it would be a button nobody asked for.
  if (view.stage === STAGE_NAME) return null;

  for (const row of view.rows) {
    if (within(profileRowRect(row.index), x, y)) return { kind: "row", index: row.index };
  }
  return null;
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

function drawCard(ctx, view, { faces }) {
  panel(ctx, PROFILE_LAYOUT.card);
  // The card-sized face, not the master and not the grid thumb: this is drawn
  // at 316px, where a 256px thumb would visibly soften.
  drawAvatarInto(ctx, PROFILE_LAYOUT.photo, view.avatar, faces.get(view.avatar?.cardSrc));

  const { x, y, width } = PROFILE_LAYOUT.card;
  label(ctx, view.name.toUpperCase(), x + width / 2, y + 372, {
    size: 30,
    colour: INK,
    weight: "800",
    align: "center",
  });
  // Whether the driver is going anywhere. Signed out this is the honest state
  // rather than a failure — the records screen's rule about ranking.
  label(ctx, view.synced ? "SAVED TO YOUR ACCOUNT" : "ON THIS MACHINE — SIGN IN TO KEEP IT", x + width / 2, y + 392, {
    size: 11,
    colour: view.synced ? GOOD : MUTED,
    align: "center",
  });
}

function drawCardRows(ctx, view) {
  for (const row of view.rows) {
    const rect = profileRowRect(row.index);
    const live = row.selected || row.hovered;
    ctx.fillStyle = live ? "rgba(58,20,11,0.94)" : "rgba(16,20,27,0.86)";
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
    ctx.fill();
    ctx.strokeStyle = live ? ACCENT : "rgba(150,158,178,0.22)";
    ctx.lineWidth = live ? 2 : 1;
    ctx.stroke();
    if (live) {
      ctx.fillStyle = ACCENT;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
      ctx.clip();
      ctx.fillRect(rect.x, rect.y, 4, rect.height);
      ctx.restore();
    }
    label(ctx, row.label, rect.x + 18, rect.y + 24, { size: 12, colour: live ? ACCENT : MUTED });
    label(ctx, row.value.toUpperCase(), rect.x + 18, rect.y + 44, { size: 16, colour: live ? "#ffffff" : TEXT });
    label(ctx, row.hint, rect.x + rect.width - 16, rect.y + 44, { size: 11, colour: MUTED, align: "right" });
  }
}

function drawFavourites(ctx, view, { sheetImages, liveryCache, budget }) {
  const box = PROFILE_LAYOUT.favourites;
  panel(ctx, box);
  label(ctx, "FAVOURITE CARS", box.x + 12, box.y + 22, { size: 12, colour: MUTED });

  for (const slot of view.favourites) {
    const rect = favouriteCellRect(slot.index);
    ctx.fillStyle = "rgba(14,16,21,0.86)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = slot.model ? "rgba(150,158,178,0.35)" : "rgba(150,158,178,0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    if (!slot.model) {
      // An empty slot says what would fill it. A blank box reads as a bug.
      label(ctx, "EMPTY", rect.x + rect.width / 2, rect.y + rect.height / 2 + 4, {
        size: 11,
        colour: MUTED,
        align: "center",
      });
      continue;
    }

    const art = { x: rect.x, y: rect.y + 2, width: rect.width, height: rect.height - 34 };
    const image = sheetImages.get(slot.model.sheetId);
    let sprite = null;
    if (liveryCache && ready(image) && slot.livery) {
      const cached = hasLiverySprite(liveryCache, { model: slot.model, livery: slot.livery });
      if (cached || budget.left > 0) {
        if (!cached) budget.left -= 1;
        sprite = liverySprite(liveryCache, { image, model: slot.model, livery: slot.livery });
      }
    }
    const fit = fitContain(slot.model.sw, slot.model.sh, art, 6);
    if (sprite) {
      ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, fit.x, fit.y, fit.width, fit.height);
    } else if (ready(image)) {
      ctx.drawImage(image, slot.model.sx, slot.model.sy, slot.model.sw, slot.model.sh, fit.x, fit.y, fit.width, fit.height);
    }
    label(ctx, slot.label.toUpperCase(), rect.x + rect.width / 2, rect.y + rect.height - 20, {
      size: 10,
      colour: TEXT,
      align: "center",
      maxWidth: rect.width - 10,
    });
    // Which paint, not just which body — a card showing two Kaidos in different
    // colours has to say which is which, and that is the whole point of a pin
    // being a car as painted rather than a model id.
    label(ctx, slot.presetName.toUpperCase(), rect.x + rect.width / 2, rect.y + rect.height - 7, {
      size: 9,
      colour: MUTED,
      align: "center",
      maxWidth: rect.width - 10,
    });
  }
}

function drawBests(ctx, view) {
  const box = PROFILE_LAYOUT.bests;
  panel(ctx, box);
  label(ctx, "PERSONAL BESTS", box.x + 12, box.y + 22, { size: 12, colour: MUTED });
  label(ctx, `${view.summary.boardsDriven} OF ${view.summary.boardsTotal} BOARDS DRIVEN`, box.x + box.width - 12, box.y + 22, {
    size: 12,
    colour: view.summary.boardsDriven > 0 ? GOOD : MUTED,
    align: "right",
  });

  view.bests.forEach((best, index) => {
    const rect = bestRowRect(index);
    ctx.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    label(ctx, best.modeLabel, rect.x + 8, rect.y + 24, { size: 11, colour: MUTED });
    label(ctx, best.label, rect.x + 108, rect.y + 24, { size: 14, colour: best.driven ? TEXT : MUTED });
    label(ctx, best.value, rect.x + 330, rect.y + 24, {
      size: 16,
      colour: best.driven ? INK : MUTED,
      align: "right",
      mono: true,
    });
    // The rank is only there for a board the leaderboard screen has fetched, so
    // its absence is normal and prints as nothing rather than as a dash.
    if (best.rank) {
      label(ctx, `#${best.rank}`, rect.x + 386, rect.y + 24, { size: 13, colour: GOOD, align: "right" });
    }
    if (best.driven) {
      label(ctx, `${best.carLabel}${best.trackLabel ? `  ·  ${best.trackLabel}` : ""}`.toUpperCase(), rect.x + 404, rect.y + 24, {
        size: 11,
        colour: DIM,
      });
    }
  });
}

function drawSummary(ctx, view) {
  const box = PROFILE_LAYOUT.summary;
  panel(ctx, box);
  const cells = [
    { label: "CAMPAIGN", value: `${view.summary.eventsCleared}/${view.summary.eventsTotal}`, sub: "EVENTS CLEARED" },
    { label: "RACES", value: String(view.summary.races), sub: "CAREER STARTS" },
    { label: "PAINTS", value: String(view.summary.paints), sub: "SAVED IN THE GARAGE" },
    { label: "CARS", value: String(view.summary.carsPainted), sub: "PAINTED" },
  ];
  const width = box.width / cells.length;
  cells.forEach((cell, index) => {
    const cx = box.x + width * index + width / 2;
    label(ctx, cell.label, cx, box.y + 22, { size: 11, colour: MUTED, align: "center" });
    label(ctx, cell.value, cx, box.y + 54, { size: 26, colour: INK, weight: "700", align: "center" });
    label(ctx, cell.sub, cx, box.y + 72, { size: 10, colour: MUTED, align: "center" });
  });
}

// ---------------------------------------------------------------------------
// The stages drawn over the card
// ---------------------------------------------------------------------------

function drawNameStage(ctx, view) {
  ctx.fillStyle = "rgba(4,6,9,0.72)";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  const box = { x: WORLD.width / 2 - 300, y: 240, width: 600, height: 220 };
  panel(ctx, box, { live: true });
  label(ctx, "DRIVER NAME", box.x + box.width / 2, box.y + 44, { size: 13, colour: MUTED, align: "center" });

  const typed = view.entry?.value ?? "";
  label(ctx, typed || "…", box.x + box.width / 2, box.y + 118, {
    size: 44,
    colour: typed ? INK : MUTED,
    weight: "800",
    align: "center",
  });
  // An underline the width of the field rather than of the text, so the caret
  // has somewhere to sit and the field does not appear to shrink as it empties.
  ctx.fillStyle = "rgba(255,90,46,0.55)";
  ctx.fillRect(box.x + 80, box.y + 134, box.width - 160, 2);
  label(ctx, `${typed.length}/${view.entry?.slots?.length ?? 0}`, box.x + box.width - 80, box.y + 160, {
    size: 11,
    colour: MUTED,
    align: "right",
  });
  label(ctx, "ENTER  keep it        ESC  leave it as it was", box.x + box.width / 2, box.y + 190, {
    size: 12,
    colour: DIM,
    align: "center",
  });
}

function drawAvatarStage(ctx, view, { faces }) {
  ctx.fillStyle = "rgba(4,6,9,0.93)";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  label(ctx, "PICK A FACE", 64, 72, { size: 26, colour: INK, weight: "800" });

  for (const row of view.avatarPicker.rows) {
    if (row.groupLabel) {
      const first = avatarCellRect(row.screenRow, 0);
      label(ctx, row.groupLabel, first.x, first.y - 8, { size: 12, colour: ACCENT });
    }
    for (const cell of row.cells) {
      const rect = avatarCellRect(row.screenRow, cell.column);
      const live = cell.selected || cell.hovered;
      // The thumb: a 112px cell, and there are up to 32 of them on screen.
      drawAvatarInto(ctx, rect, cell, faces.get(cell.thumbSrc), { radius: 6 });
      ctx.strokeStyle = live ? ACCENT : cell.worn ? GOOD : "rgba(150,158,178,0.28)";
      ctx.lineWidth = live || cell.worn ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1, 6);
      ctx.stroke();
      if (cell.worn) {
        label(ctx, "WORN", rect.x + rect.width / 2, rect.y + rect.height - 8, {
          size: 10,
          colour: GOOD,
          align: "center",
        });
      }
    }
  }

  for (const step of [-1, 1]) {
    const live = step < 0 ? view.avatarPicker.canScrollUp : view.avatarPicker.canScrollDown;
    const rect = avatarScrollRect(step);
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

  label(ctx, "ARROWS  move       ENTER  wear it       ESC  back", PROFILE_LAYOUT.legend.x, PROFILE_LAYOUT.legend.y, {
    size: 13,
    colour: DIM,
  });
}

/**
 * One paint: the car wearing it, its name, and a dot of the paint itself — the
 * collection's cell, because this is the same list of the same things.
 */
function drawCarCell(ctx, rect, cell, { image, liveryCache, budget }) {
  const live = cell.selected || cell.hovered;
  ctx.fillStyle = live ? "rgba(40,30,26,0.92)" : "rgba(14,16,21,0.86)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = live ? ACCENT : cell.pinned ? GOOD : "rgba(150,158,178,0.28)";
  ctx.lineWidth = live || cell.pinned ? 2 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

  const art = { x: rect.x, y: rect.y + 4, width: rect.width, height: rect.height - 26 };
  // Spend the frame's bake budget on misses only — the collection's rule, for
  // the collection's reason: a bake is ~7ms and a scroll changes five rows.
  let sprite = null;
  if (liveryCache && ready(image) && cell.livery) {
    const cached = hasLiverySprite(liveryCache, { model: cell.model, livery: cell.livery });
    if (cached || budget.left > 0) {
      if (!cached) budget.left -= 1;
      sprite = liverySprite(liveryCache, { image, model: cell.model, livery: cell.livery });
    }
  }
  const fit = fitContain(cell.model.sw, cell.model.sh, art, 6);
  if (sprite) {
    drawUnderglow(ctx, { x: fit.x + fit.width / 2, top: fit.y, width: fit.width, height: fit.height }, cell.livery);
    ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, fit.x, fit.y, fit.width, fit.height);
  } else if (ready(image)) {
    ctx.drawImage(image, cell.model.sx, cell.model.sy, cell.model.sw, cell.model.sh, fit.x, fit.y, fit.width, fit.height);
  }

  ctx.beginPath();
  ctx.arc(rect.x + 11, rect.y + rect.height - 12, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = paintSwatchColour(cell.livery.paint);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();

  const nameX = rect.x + 21;
  label(ctx, cell.pinned ? `#${cell.pin} ${cell.name}` : cell.name, nameX, rect.y + rect.height - 8, {
    size: 11,
    colour: cell.pinned ? GOOD : live ? INK : DIM,
    maxWidth: rect.x + rect.width - 6 - nameX,
  });
}

function drawCarStage(ctx, view, { sheetImages, liveryCache, budget }) {
  ctx.fillStyle = "rgba(4,6,9,0.93)";
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  label(ctx, "FAVOURITE CARS", 64, 72, { size: 26, colour: INK, weight: "800" });
  label(
    ctx,
    view.carPicker.full
      ? `${view.carPicker.pinned} OF ${view.carPicker.limit} PINNED — UNPIN ONE TO SWAP`
      : `${view.carPicker.pinned} OF ${view.carPicker.limit} PINNED`,
    WORLD.width - 64,
    72,
    { size: 14, colour: view.carPicker.full ? ACCENT : GOOD, align: "right" },
  );
  // Why the list may be nothing but factory silver. Without this the screen
  // looks like the bug it used to be.
  label(
    ctx,
    view.carPicker.paints > 0
      ? "PIN A CAR IN THE PAINT YOU BUILT FOR IT"
      : "NO PAINTS SAVED YET — BUILD ONE IN THE GARAGE AND IT SHOWS UP HERE",
    64,
    100,
    { size: 12, colour: view.carPicker.paints > 0 ? MUTED : ACCENT },
  );

  for (const row of view.carPicker.rows) {
    const rect = carRowRect(row.screenRow);
    ctx.fillStyle = "rgba(9,11,15,0.55)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

    if (row.bandLabel) {
      label(ctx, row.bandLabel, rect.x + 16, rect.y - 6, { size: 11, colour: ACCENT });
    }
    label(ctx, row.groupLabel.toUpperCase(), rect.x + 16, rect.y + 28, { size: 10, colour: MUTED });
    label(ctx, row.label.toUpperCase(), rect.x + 16, rect.y + 52, {
      size: 17,
      colour: INK,
      maxWidth: PROFILE_LAYOUT.carRows.labelWidth - 32,
    });
    label(
      ctx,
      row.savedCount === 0 ? "no paints saved" : row.savedCount === 1 ? "1 paint" : `${row.savedCount} paints`,
      rect.x + 16,
      rect.y + 74,
      { size: 11, colour: row.savedCount === 0 ? MUTED : DIM },
    );

    const image = sheetImages.get(row.model.sheetId);
    for (const cell of row.cells) {
      drawCarCell(ctx, carCellRect(row.screenRow, cell.column), cell, { image, liveryCache, budget });
    }
  }

  for (const step of [-1, 1]) {
    const live = step < 0 ? view.carPicker.canScrollUp : view.carPicker.canScrollDown;
    const rect = carScrollRect(step);
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
  label(
    ctx,
    `${view.carPicker.scroll + 1}–${Math.min(view.carPicker.scroll + view.carPicker.visibleRows, view.carPicker.totalRows)} of ${view.carPicker.totalRows}`,
    PROFILE_LAYOUT.carScroll.x + PROFILE_LAYOUT.carScroll.width / 2,
    carRowRect(2).y + 54,
    { size: 11, colour: MUTED, align: "center" },
  );

  label(
    ctx,
    "ARROWS  move       ENTER  pin or unpin       ESC  back",
    PROFILE_LAYOUT.legend.x,
    PROFILE_LAYOUT.legend.y,
    { size: 13, colour: DIM },
  );
}

export function drawProfile(ctx, view, { faces, sheetImages, liveryCache = null, splashImage = null }) {
  drawMenuBackdrop(ctx, splashImage, { alpha: 0.8, scrim: 0.5 });

  label(ctx, "DRIVER", PROFILE_LAYOUT.title.x, PROFILE_LAYOUT.title.y, { size: 30, colour: INK, weight: "800" });

  const budget = { left: BAKE_BUDGET };
  drawCard(ctx, view, { faces });
  drawCardRows(ctx, view);
  drawFavourites(ctx, view, { sheetImages, liveryCache, budget });
  drawBests(ctx, view);
  drawSummary(ctx, view);
  // The legend belongs to whichever surface is on top, and a picker draws its
  // own on the same line — which is exactly what it looked like the first time
  // it was seen: one sentence printed through another.
  if (view.stage === STAGE_CARD) {
    label(ctx, "ARROWS  move       ENTER  change it       ESC  back", PROFILE_LAYOUT.legend.x, PROFILE_LAYOUT.legend.y, {
      size: 13,
      colour: DIM,
    });
  }

  // The pickers are drawn over the card rather than instead of it, the way pause
  // and results sit over a live race: the card is the thing being edited, and
  // seeing it behind the choice is what says so.
  if (view.stage === STAGE_NAME) drawNameStage(ctx, view);
  else if (view.stage === STAGE_AVATAR) drawAvatarStage(ctx, view, { faces });
  else if (view.stage === STAGE_CARS) drawCarStage(ctx, view, { sheetImages, liveryCache, budget });
}
