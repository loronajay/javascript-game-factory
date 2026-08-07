// Setup screen rendering — the model grid, the config list, the track strip, the
// objective strip, and the preview.
//
// Canvas only. Every position here comes from `SETUP_LAYOUT`, and every piece of
// state from the view model `ui/setup-menu.js` hands over; this file decides
// nothing about what is selected, including which options the objective strip
// offers — those come from the mode.

import { WORLD } from "./scene.js";
import { ROAD } from "../ui/track-layout.js";
import { drawMenuBackdrop } from "./menus.js";
import { liverySprite, drawUnderglow } from "./livery.js";
import { hueToRgb } from "../garage/paint.js";

/**
 * Where everything sits. Kept as one object so the layout can be checked by a
 * test without a canvas, the same way the dashboard's boxes are.
 *
 * Four panes now, in three columns. The model grid takes the left and is the
 * tall one; the config list and the run summary stack in the middle; the
 * preview, tracks and objective stack down the right.
 *
 * The old layout stacked three panes down the left with a preview beside them,
 * which worked while the car pane was five rows. Seven archetype rows plus a
 * config list do not fit that way — the grid would have run into the track
 * strip. `tests/modules.test.js` sweeps every rect here for overlaps and
 * overruns, so moving a box is checked rather than eyeballed.
 */
// Cells are taller than they are wide because the car sprites are — a landscape
// cell would letterbox every one of them.
export const SETUP_LAYOUT = {
  title: { x: 64, y: 72 },
  mode: { x: 64, y: 100 },
  // `labelWidth` is the left gutter the archetype names sit in. Putting them
  // beside their row rather than above it is what keeps seven rows on screen.
  grid: { x: 120, y: 138, cellWidth: 56, cellHeight: 62, gap: 5, labelWidth: 56 },
  presets: { x: 512, y: 138, width: 200, rowHeight: 30, gap: 4 },
  summary: { x: 512, y: 420, width: 200, height: 182 },
  preview: { x: 740, y: 138, width: 476, height: 300 },
  tracks: { x: 740, y: 476, width: 88, height: 62, gap: 9 },
  objective: { x: 740, y: 576, width: 113, height: 44, gap: 8 },
};

const INK = "#e8e9ee";
const DIM = "#8b8f9c";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";
const LOCKED = "#57d98a";

/**
 * `live` is the cursor; `chosen` is the pick that stands while the cursor is off
 * in another pane; `locked` is that pick once ENTER has settled it. Three
 * borders, so a glance answers "where am I", "what have I got" and "what is
 * still up for grabs" separately.
 */
function panel(ctx, x, y, width, height, { live = false, chosen = false, locked = false } = {}) {
  ctx.fillStyle = "rgba(14,16,21,0.86)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = live
    ? ACCENT
    : locked
      ? LOCKED
      : chosen
        ? "rgba(226,232,240,0.75)"
        : "rgba(150,158,178,0.35)";
  ctx.lineWidth = live || chosen || locked ? 2 : 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

/** The tick on a settled pick, so a lock reads without relying on colour. */
function lockTick(ctx, rect) {
  label(ctx, "✓", rect.x + rect.width - 7, rect.y + 15, { size: 13, colour: LOCKED, align: "right" });
}

function label(ctx, text, x, y, { size = 14, colour = DIM, weight = "600", align = "left" } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

/** Screen rect of one model cell, by grid position (archetype row, car column). */
export function modelCellRect(row, column) {
  const { x, y, cellWidth, cellHeight, gap } = SETUP_LAYOUT.grid;
  return {
    x: x + column * (cellWidth + gap),
    y: y + row * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  };
}

/** Screen rect of one saved-config row, by index. Index 0 is always Factory. */
export function presetRowRect(index) {
  const { x, y, width, rowHeight, gap } = SETUP_LAYOUT.presets;
  return { x, y: y + index * (rowHeight + gap), width, height: rowHeight };
}

/** Screen rect of one track card, by index. */
export function trackCardRect(index) {
  const { x, y, width, height, gap } = SETUP_LAYOUT.tracks;
  return { x: x + index * (width + gap), y, width, height };
}

/** Screen rect of one objective card — a distance, or a clock. */
export function objectiveCardRect(index) {
  const { x, y, width, height, gap } = SETUP_LAYOUT.objective;
  return { x: x + index * (width + gap), y, width, height };
}

const within = (rect, x, y) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * What is under the pointer on the setup screen, or null.
 *
 * Pure, and exported from the same module that draws the rects, so the hover
 * highlight and the click can never disagree about where a cell is — the same
 * reason `menuListBox` exists. It takes the finished view because pane contents
 * vary: the config list is as long as the player's garage, and the objective
 * strip is as long as the mode's option list.
 *
 * Returns the *pane* as well as the index, because clicking is allowed to reach
 * a pane the cursor has not walked to yet. With a keyboard you lock your way
 * forward; with a mouse, pointing at a track means you want that track, and
 * making the click a no-op until you have locked two panes first would read as a
 * dead control.
 */
export function hitSetup(view, x, y) {
  for (const group of view.groups) {
    for (const cell of group.cells) {
      if (within(modelCellRect(cell.row, cell.column), x, y)) {
        return { pane: "model", row: cell.row, column: cell.column };
      }
    }
  }
  for (const option of view.presets.options) {
    if (within(presetRowRect(option.index), x, y)) {
      return { pane: "preset", index: option.index };
    }
  }
  for (const track of view.tracks) {
    if (within(trackCardRect(track.index), x, y)) {
      return { pane: "track", index: track.index };
    }
  }
  for (const option of view.objective.options) {
    if (within(objectiveCardRect(option.index), x, y)) {
      return { pane: "objective", index: option.index };
    }
  }
  return null;
}

/**
 * Fits a source rect inside a destination box without distorting it. Car frames
 * and track crops have very different proportions, so both go through this
 * rather than being stretched to their slot.
 */
export function fitContain(sw, sh, box, padding = 0) {
  const maxWidth = box.width - padding * 2;
  const maxHeight = box.height - padding * 2;
  const scale = Math.min(maxWidth / sw, maxHeight / sh);
  const width = sw * scale;
  const height = sh * scale;
  return {
    x: box.x + (box.width - width) / 2,
    y: box.y + (box.height - height) / 2,
    width,
    height,
  };
}

/**
 * Pane heading, carrying its own state: lit while the cursor is in it and
 * showing what ENTER will do, ticked once it is locked. One pane is always live,
 * so the screen always says what the next keypress commits to.
 */
function paneLabel(ctx, text, box, { live = false, locked = false, prompt = null } = {}) {
  const colour = live ? ACCENT : locked ? LOCKED : DIM;
  label(ctx, text, box.x, box.y - 13, { colour, size: 13 });

  const width = ctx.measureText(text).width;
  if (locked) {
    label(ctx, "✓ LOCKED", box.x + width + 12, box.y - 13, { colour: LOCKED, size: 12 });
  } else if (live && prompt) {
    label(ctx, `ENTER  ${prompt}`, box.x + width + 12, box.y - 13, { colour: DIM, size: 12 });
  }
}

/**
 * The model grid: one row per archetype, its name in the gutter to the left.
 *
 * Cells show the bare body rather than the player's colours. The grid is where
 * you choose a *shape*, and 24 cells all wearing the same livery would make the
 * near-duplicate silhouettes — four GTs, three Euro coupes — much harder to tell
 * apart than they already are.
 */
function drawModelGrid(ctx, view, sheetImages) {
  paneLabel(ctx, "CAR", SETUP_LAYOUT.grid, {
    live: view.pane === "model",
    locked: view.locked.model,
    prompt: view.prompt,
  });

  for (const group of view.groups) {
    const rowRect = modelCellRect(group.row, 0);
    label(ctx, group.label.toUpperCase(), SETUP_LAYOUT.grid.x - 12, rowRect.y + rowRect.height / 2 + 4, {
      size: 11,
      colour: MUTED,
      align: "right",
    });

    for (const cell of group.cells) {
      const rect = modelCellRect(cell.row, cell.column);
      panel(ctx, rect.x, rect.y, rect.width, rect.height, {
        live: cell.selected,
        chosen: cell.chosen,
        locked: cell.locked,
      });

      const image = sheetImages.get(cell.sheetId);
      if (image && image.complete && image.naturalWidth > 0) {
        const fit = fitContain(cell.sw, cell.sh, rect, 6);
        ctx.drawImage(image, cell.sx, cell.sy, cell.sw, cell.sh, fit.x, fit.y, fit.width, fit.height);
      }
      if (cell.locked) {
        lockTick(ctx, rect);
      }
    }
  }
}

/** A dot in a preset's own paint, so the list reads as colours not just names. */
function paintSwatch(ctx, x, y, livery) {
  const [r, g, b] = hueToRgb(livery.paint.hue);
  const s = livery.paint.saturation;
  const shade = livery.paint.brightness;
  const mix = (channel) => Math.round(Math.min(255, (255 + (channel - 255) * s) * shade));
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * The configs saved for the chosen model. `Factory` is always row zero and is
 * not a stored preset — it is what the garage means by "no preset selected", and
 * having it here is what keeps a model raceable before anything is saved for it.
 */
function drawPresetList(ctx, view) {
  paneLabel(ctx, "PAINT", SETUP_LAYOUT.presets, {
    live: view.pane === "preset",
    locked: view.presets.locked,
    prompt: view.prompt,
  });

  for (const option of view.presets.options) {
    const rect = presetRowRect(option.index);
    panel(ctx, rect.x, rect.y, rect.width, rect.height, {
      live: option.selected,
      chosen: option.chosen,
      locked: option.locked,
    });

    // The last row is the action that opens the garage. It has no livery, so it
    // gets an accent glyph where the configs get their paint swatch.
    if (option.action) {
      label(ctx, option.disabled ? "🔒" : "✎", rect.x + 14, rect.y + rect.height / 2 + 5, {
        size: 14,
        colour: option.disabled ? MUTED : option.selected ? ACCENT : MUTED,
      });
    } else {
      paintSwatch(ctx, rect.x + 18, rect.y + rect.height / 2, option.livery);
    }

    label(ctx, option.name, rect.x + 34, rect.y + rect.height / 2 + 5, {
      size: 13,
      colour: option.disabled
        ? MUTED
        : option.selected
          ? INK
          : option.locked
            ? LOCKED
            : option.chosen
              ? "#c6ccd8"
              : option.action ? MUTED : DIM,
    });
    if (option.locked) {
      lockTick(ctx, rect);
    }
  }
}

function drawTrackStrip(ctx, view, trackImages) {
  paneLabel(ctx, "TRACK", SETUP_LAYOUT.tracks, {
    live: view.pane === "track",
    locked: view.locked.track,
    prompt: view.prompt,
  });

  for (const track of view.tracks) {
    const rect = trackCardRect(track.index);
    panel(ctx, rect.x, rect.y, rect.width, rect.height, {
      live: track.selected,
      chosen: track.chosen,
      locked: track.locked,
    });

    const image = trackImages.get(track.id);
    if (image && image.complete && image.naturalWidth > 0) {
      // The full image width, not the race's barrier-to-barrier crop. What tells
      // these five apart is the verge — grass, sand, forest, surf — and the race
      // crop is deliberately tight enough to leave almost all of it out.
      const artWidth = rect.width - 2;
      const artHeight = rect.height - 24;
      const sh = ROAD.width * (artHeight / artWidth);
      ctx.drawImage(image, 0, track.dash.firstY, ROAD.width, sh, rect.x + 1, rect.y + 1, artWidth, artHeight);
    }

    ctx.fillStyle = "rgba(10,11,15,0.9)";
    ctx.fillRect(rect.x + 1, rect.y + rect.height - 23, rect.width - 2, 22);
    label(ctx, track.label, rect.x + 9, rect.y + rect.height - 8, {
      size: 12,
      colour: track.selected ? INK : track.locked ? LOCKED : track.chosen ? "#c6ccd8" : DIM,
    });
    if (track.locked) {
      lockTick(ctx, rect);
    }
  }
}

/**
 * The objective strip. One pane for every mode: a distance race fills it with
 * distances, a time attack with clocks, and neither needs its own layout.
 */
function drawObjectiveStrip(ctx, view) {
  paneLabel(ctx, view.objective.label, SETUP_LAYOUT.objective, {
    live: view.pane === "objective",
    locked: view.objective.locked,
    prompt: view.prompt,
  });

  for (const option of view.objective.options) {
    const rect = objectiveCardRect(option.index);
    panel(ctx, rect.x, rect.y, rect.width, rect.height, {
      live: option.selected,
      chosen: option.chosen,
      locked: option.locked,
    });
    label(ctx, option.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6, {
      size: 15,
      colour: option.selected ? INK : option.chosen ? "#c6ccd8" : MUTED,
      align: "center",
    });
  }
}

/**
 * The chosen car in the chosen colours — the one place on this screen showing
 * what will actually reach the track, which is why it draws the baked livery
 * sprite rather than the bare frame the grid uses.
 */
function drawPreview(ctx, view, sheetImages, liveryCache) {
  const box = SETUP_LAYOUT.preview;
  panel(ctx, box.x, box.y, box.width, box.height);

  const model = view.chosenModel;
  const image = sheetImages.get(model.sheetId);
  const sprite = liveryCache
    ? liverySprite(liveryCache, { image, model, livery: view.chosenLivery })
    : null;

  if (sprite) {
    const fit = fitContain(model.sw, model.sh, { ...box, height: box.height - 46 }, 22);
    // Underglow goes down first, and is drawn here as well as in the garage so
    // the two previews of the same livery cannot disagree about what it looks
    // like — a car that loses its glow on the way to the line reads as a bug.
    drawUnderglow(ctx, { x: fit.x + fit.width / 2, top: fit.y, width: fit.width, height: fit.height }, view.chosenLivery);
    ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, fit.x, fit.y, fit.width, fit.height);
  } else if (image && image.complete && image.naturalWidth > 0) {
    // The sheet is here but the cache is not — draw the bare body rather than
    // nothing, the same way every other renderer degrades on a cold cache.
    const fit = fitContain(model.sw, model.sh, { ...box, height: box.height - 46 }, 22);
    ctx.drawImage(image, model.sx, model.sy, model.sw, model.sh, fit.x, fit.y, fit.width, fit.height);
  }

  label(ctx, model.label.toUpperCase(), box.x + 20, box.y + box.height - 20, { size: 22, colour: INK });
  label(ctx, view.chosenPreset.name, box.x + box.width - 20, box.y + box.height - 20, {
    size: 14,
    colour: DIM,
    align: "right",
  });
}

/** The run about to be started, in one place: car, track, objective, and the key. */
function drawSummary(ctx, view) {
  const box = SETUP_LAYOUT.summary;
  panel(ctx, box.x, box.y, box.width, box.height);

  label(ctx, "RUNNING", box.x + 16, box.y + 26, { size: 11, colour: MUTED });
  label(ctx, view.chosenModel.label.toUpperCase(), box.x + 16, box.y + 48, { size: 16, colour: INK });
  label(ctx, view.chosenPreset.name, box.x + 16, box.y + 68, { size: 12 });

  ctx.fillStyle = "rgba(150,158,178,0.22)";
  ctx.fillRect(box.x + 16, box.y + 84, box.width - 32, 1);

  label(ctx, view.chosenTrack.label.toUpperCase(), box.x + 16, box.y + 108, { size: 16, colour: INK });
  label(ctx, view.objective.label, box.x + 16, box.y + 132, { size: 11, colour: MUTED });
  label(ctx, view.chosenObjective.label, box.x + 16, box.y + 158, { size: 24, colour: INK, weight: "700" });

  // The prompt is the live pane's, not a fixed "START" — ENTER means lock while
  // there is anything left to lock, and the screen has to say which it is.
  label(ctx, `ENTER  ${view.prompt}`, box.x + box.width - 16, box.y + 26, {
    size: 12,
    colour: ACCENT,
    align: "right",
  });
}

export function drawSetup(ctx, view, { sheetImages, trackImages, liveryCache = null }) {
  drawMenuBackdrop(ctx, trackImages.get(view.chosenTrack.id));

  label(ctx, "SPEED DEMON", SETUP_LAYOUT.title.x, SETUP_LAYOUT.title.y, { size: 32, colour: INK, weight: "800" });
  label(ctx, view.mode.label.toUpperCase(), SETUP_LAYOUT.mode.x, SETUP_LAYOUT.mode.y, {
    size: 14,
    colour: ACCENT,
  });

  drawModelGrid(ctx, view, sheetImages);
  drawPresetList(ctx, view);
  drawTrackStrip(ctx, view, trackImages);
  drawObjectiveStrip(ctx, view);
  drawPreview(ctx, view, sheetImages, liveryCache);
  drawSummary(ctx, view);

  label(
    ctx,
    "ARROWS / WASD  move within a pane       ENTER  lock in       ESC  unlock / back       R  reset choices",
    SETUP_LAYOUT.title.x,
    WORLD.height - 14,
    { size: 13 },
  );
}
