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
import { paintSwatchColour } from "../garage/paint.js";
import { inputHintsFor } from "../mobile-ui.js";

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
  // The right column carries four boxes now rather than three, so the preview
  // and the two strips each gave up a little height. The preview was 300 and
  // generous with it; a car still reads at 230.
  preview: { x: 740, y: 138, width: 476, height: 230 },
  // Six tracks now, in the same 476px the preview above them occupies, so the
  // cards narrowed rather than the strip growing into the column beside it.
  // `tests/modules.test.js` is what catches the seventh: at that point this
  // wants wrapping into two rows, the way the rival grid already does, rather
  // than cards too thin to tell a verge apart.
  tracks: { x: 740, y: 406, width: 71, height: 56, gap: 9 },
  objective: { x: 740, y: 500, width: 113, height: 38, gap: 8 },
  /**
   * Who you are racing. Drawn only in a mode that has the pane, but the rect
   * exists in every mode — a layout that moved when you changed mode would make
   * the whole right column jump, and the empty space costs nothing.
   *
   * **A grid rather than a strip, because eleven faces do not fit in a row.**
   * Ten rivals plus a ghost across 476px is 43px a card, which is too small for
   * a face to be recognisable — and recognising the face is the entire job here.
   * Six columns at 56px reads, and wraps to a second row.
   *
   * The cards carry no text. A name under a 56px portrait would be four pixels
   * tall; the *selected* rival's name is printed on the pane's heading line
   * instead, where there is room for it and where the eye already is.
   */
  rivals: { x: 740, y: 572, width: 56, height: 56, gap: 8, columns: 6 },
  // Under the summary, because that panel is what it acts on: the summary says
  // what the run is, and the button starts it.
  start: { x: 512, y: 620, width: 200, height: 46 },
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
 *
 * `hovered` is a fourth, and deliberately not one of the three: the pointer is
 * pointing, not choosing. It borrows the accent so what lights up is what a
 * click would take, and lifts the fill so it cannot be read as the cursor.
 */
function panel(ctx, x, y, width, height, { live = false, chosen = false, locked = false, hovered = false } = {}) {
  ctx.fillStyle = hovered ? "rgba(40,30,26,0.92)" : "rgba(14,16,21,0.86)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = live || hovered
    ? ACCENT
    : locked
      ? LOCKED
      : chosen
        ? "rgba(226,232,240,0.75)"
        : "rgba(150,158,178,0.35)";
  ctx.lineWidth = live || chosen || locked || hovered ? 2 : 1;
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

/** Screen rect of one rival card, by index. Wraps across `columns`. */
export function rivalCardRect(index) {
  const { x, y, width, height, gap, columns } = SETUP_LAYOUT.rivals;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return { x: x + column * (width + gap), y: y + row * (height + gap), width, height };
}

/** Screen rect of the START button. */
export function startButtonRect() {
  return { ...SETUP_LAYOUT.start };
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
 *
 * START is the one target that is not a pane, so it reports a `target` instead.
 */
export function hitSetup(view, x, y) {
  if (within(startButtonRect(), x, y)) {
    return { target: "start" };
  }
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
  // Null in every mode but Rival Race. Hit-testing a strip that is not drawn
  // would put a click target over empty space — the dead-control rule.
  for (const entry of view.rivals ?? []) {
    if (within(rivalCardRect(entry.index), x, y)) {
      return { pane: "rival", index: entry.index };
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
        hovered: cell.hovered,
      });

      const image = sheetImages.get(cell.sheetId);
      if (image && image.complete && image.naturalWidth > 0) {
        const fit = fitContain(cell.sw, cell.sh, rect, 6);
        ctx.drawImage(image, cell.sx, cell.sy, cell.sw, cell.sh, fit.x, fit.y, fit.width, fit.height);
      }
      if (cell.locked) {
        lockTick(ctx, rect);
      }
      if (cell.available === false) {
        ctx.fillStyle = "rgba(8,10,14,0.68)";
        ctx.fillRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
        label(ctx, "NO ATLAS", rect.x + rect.width / 2, rect.y + rect.height / 2 + 4, {
          size: 8,
          colour: MUTED,
          align: "center",
        });
      }
    }
  }
}

/**
 * A dot in a preset's own paint, so the list reads as colours not just names.
 *
 * The dot is the *painted* colour rather than the tint, which is the only way
 * Silver and White are distinguishable � both tints are pure white. A layered
 * car shows its base paint here; the list is a row of names and a full preview
 * lives one pane over.
 */
function paintSwatch(ctx, x, y, livery) {
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.fillStyle = paintSwatchColour(livery.paint);
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
      hovered: option.hovered,
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
      hovered: track.hovered,
    });

    const image = trackImages.get(track.id);
    if (image && image.complete && image.naturalWidth > 0 && track.circuit) {
      const scale = Math.max((rect.width - 2) / image.naturalWidth, (rect.height - 24) / image.naturalHeight);
      const sw = (rect.width - 2) / scale;
      const sh = (rect.height - 24) / scale;
      ctx.drawImage(
        image,
        (image.naturalWidth - sw) / 2,
        (image.naturalHeight - sh) / 2,
        sw,
        sh,
        rect.x + 1,
        rect.y + 1,
        rect.width - 2,
        rect.height - 24,
      );
    } else if (image && image.complete && image.naturalWidth > 0) {
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
      hovered: option.hovered,
    });
    label(ctx, option.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 6, {
      size: 15,
      colour: option.selected ? INK : option.chosen ? "#c6ccd8" : MUTED,
      align: "center",
    });
  }
}

/**
 * A rival's face, or a stand-in for one.
 *
 * **The stand-in is the shipping state, not a fallback for a mistake.** Portrait
 * art is authored per rival and a roster grows faster than art does, so a
 * missing file draws the rival's initial on a plate in their own accent colour —
 * the repo's placeholder rule. That is legible, distinct between rivals, and
 * costs nothing; a blank square would read as a broken image.
 *
 * The ghost never has a file at all: it is the player, and there is no portrait
 * of them to load.
 */
/**
 * How much of a portrait to show.
 *
 * The art is a full scene — a driver standing by a car in a lit car park — and
 * drawn whole into a 56px cell the face is about eight pixels across, which is
 * not a face. This takes the upper-middle square instead, which is where a head
 * sits in every one of these renders, so the cell shows a person rather than a
 * colourful smudge.
 *
 * A framing constant rather than per-rival data on purpose: the renders share
 * this composition, and the moment they do not the answer is a crop rect on the
 * row, not a looser constant here.
 */
const PORTRAIT_CROP = { scale: 0.56, top: 0.06 };

/**
 * A rival's face, or a stand-in for one.
 *
 * **The stand-in is a real state, not a fallback for a mistake.** A roster grows
 * faster than art does, so a missing file draws the rival's initial on a plate in
 * their own accent colour — the repo's placeholder rule. That is legible and
 * distinct between rivals; a blank square would read as a broken image.
 *
 * The ghost never has a file at all: it is the player, and there is no portrait
 * of them to load.
 */
export function drawRivalPortrait(ctx, entry, box, image) {
  if (image && image.complete && image.naturalWidth > 0) {
    const side = Math.min(image.naturalWidth, image.naturalHeight) * PORTRAIT_CROP.scale;
    const sx = (image.naturalWidth - side) / 2;
    const sy = image.naturalHeight * PORTRAIT_CROP.top;
    ctx.drawImage(image, sx, sy, side, side, box.x, box.y, box.width, box.height);
    return;
  }

  const accent = entry.accent ?? ACCENT;
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.globalAlpha = 1;
  const initial = entry.initial ?? (entry.name ?? "?").trim().charAt(0).toUpperCase();
  label(ctx, initial, box.x + box.width / 2, box.y + box.height / 2 + 7, {
    size: initial.length > 1 ? 17 : 22,
    weight: "800",
    colour: accent,
    align: "center",
  });
}

/**
 * The rival grid. Drawn only in a mode that has the pane — everything else
 * leaves the space empty rather than the layout moving.
 *
 * The cards are faces and nothing else; the name belongs to whichever one is
 * picked, and it goes on the heading line where there is room to read it.
 */
function drawRivalStrip(ctx, view, rivalImages) {
  if (!view.rivals) return;

  paneLabel(ctx, "RIVAL", SETUP_LAYOUT.rivals, {
    live: view.pane === "rival",
    locked: view.locked.rival,
    prompt: view.prompt,
  });

  const chosen = view.chosenRival;
  if (chosen) {
    const right = SETUP_LAYOUT.preview.x + SETUP_LAYOUT.preview.width;
    label(ctx, chosen.tier, right, SETUP_LAYOUT.rivals.y - 13, {
      size: 11,
      colour: chosen.accent ?? MUTED,
      align: "right",
    });
    label(ctx, chosen.name.toUpperCase(), right - ctx.measureText(chosen.tier).width - 12, SETUP_LAYOUT.rivals.y - 13, {
      size: 13,
      colour: INK,
      align: "right",
    });
  }

  for (const entry of view.rivals) {
    const rect = rivalCardRect(entry.index);
    panel(ctx, rect.x, rect.y, rect.width, rect.height, {
      live: entry.selected,
      chosen: entry.chosen,
      locked: entry.locked,
      hovered: entry.hovered,
    });
    drawRivalPortrait(
      ctx,
      entry,
      { x: rect.x + 3, y: rect.y + 3, width: rect.width - 6, height: rect.height - 6 },
      rivalImages?.get(entry.id),
    );
    if (entry.locked) {
      lockTick(ctx, rect);
    }
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
function drawSummary(ctx, view, mobile = false) {
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
  const hints = inputHintsFor("setup", { mobile });
  label(ctx, `${hints.promptPrefix}  ${view.prompt}`, box.x + box.width - 16, box.y + 26, {
    size: 12,
    colour: ACCENT,
    align: "right",
  });
}

/**
 * The button that drops you onto the grid.
 *
 * The keyboard reaches the line by locking the last pane, which is a fine rule
 * for a key that already means "commit" — but a mouse has no ENTER, and making
 * the only way to start be a click on an objective card means clicking a
 * distance to look at it launches the race. So the go-anywhere control is drawn.
 */
function drawStartButton(ctx, view) {
  const box = startButtonRect();
  ctx.fillStyle = view.start.hovered ? "rgba(255,90,46,0.28)" : "rgba(255,90,46,0.14)";
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1);
  label(ctx, view.start.label, box.x + box.width / 2, box.y + box.height / 2 + 7, {
    size: 20,
    weight: "800",
    colour: view.start.hovered ? "#fff2ec" : INK,
    align: "center",
  });
}

export function drawSetup(ctx, view, {
  sheetImages,
  trackImages,
  liveryCache = null,
  rivalImages = null,
  mobile = false,
}) {
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
  drawRivalStrip(ctx, view, rivalImages);
  drawPreview(ctx, view, sheetImages, liveryCache);
  drawSummary(ctx, view, mobile);
  drawStartButton(ctx, view);

  label(
    ctx,
    inputHintsFor("setup", { mobile }).footer,
    SETUP_LAYOUT.title.x,
    WORLD.height - 14,
    { size: 13 },
  );
}
