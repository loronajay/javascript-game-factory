// Garage editor rendering — the control list, the palette, and a live preview of
// the car being painted.
//
// Canvas only. Every position comes from `GARAGE_LAYOUT` and every piece of
// state from the view model `ui/garage-editor.js` hands over; this file decides
// nothing about what is selected and formats no values of its own.
//
// The rect helpers are exported and `hitGarage` is pure, for the same reason
// `menuListBox` is: the hover highlight and the click have to be resolved by the
// same geometry, or the row you click is not the row you saw.

import { WORLD } from "./scene.js";
import { drawMenuBackdrop } from "./menus.js";
import { liverySprite, drawUnderglow } from "./livery.js";
import { CIRCUIT_FRAME_SIZE, circuitModelById } from "../circuit/assets.js";
import { circuitFrameScale, circuitLiveryAtlas } from "../circuit/livery-atlas.js";
import { circuitDrawBox } from "../circuit/sprite-geometry.js";
import { hueToRgb, paintSwatchColour } from "../garage/paint.js";
import {
  ROW_PALETTE, ROW_HUE, ROW_TOGGLE, ROW_CHOICE, ROW_SECTION, ROW_PICK, ROW_BUTTON,
} from "../ui/garage-editor.js";

// Rows are shorter than they were (40px, now 36) because a layer section holds
// twelve of them where the old flat list held ten, and the actions have to stay
// clear of the bottom. The gap closed rather than the row when the curve control
// arrived: the row height is the click target, and the space between rows is
// worth less than a control you can hit. `tests/modules.test.js` sweeps every
// rect for overlaps, so this is checked rather than eyeballed.
export const GARAGE_LAYOUT = {
  title: { x: 64, y: 68 },
  model: { x: 64, y: 94 },
  rows: { x: 64, y: 124, width: 560, rowHeight: 36, gap: 3, labelWidth: 132, valueWidth: 74 },
  actions: { x: 64, y: 620, width: 130, height: 40, gap: 10 },
  preview: { x: 680, y: 124, width: 536, height: 496 },
};

const INK = "#e8e9ee";
const DIM = "#8b8f9c";
const MUTED = "#5c6673";
const ACCENT = "#ff5a2e";

function label(ctx, text, x, y, { size = 14, colour = DIM, weight = "600", align = "left" } = {}) {
  ctx.fillStyle = colour;
  ctx.font = `${weight} ${size}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(text, x, y);
}

export function editorRowRect(index) {
  const { x, y, width, rowHeight, gap } = GARAGE_LAYOUT.rows;
  return { x, y: y + index * (rowHeight + gap), width, height: rowHeight };
}

/** The interactive part of a row: the bar or the swatch strip, not the label. */
export function rowControlRect(index) {
  const row = editorRowRect(index);
  const { labelWidth, valueWidth } = GARAGE_LAYOUT.rows;
  return {
    x: row.x + labelWidth,
    y: row.y + 10,
    width: row.width - labelWidth - valueWidth,
    height: row.height - 20,
  };
}

/**
 * How much of a row a strip of cells gets, by row kind.
 *
 * The three strips need different room. The section tabs take the whole row and
 * print no label at all — nine tabs sharing a normal control area would be 39px
 * each, which will not hold the word "Layer 1", and a tab strip is self-
 * describing anyway. The layer picker keeps a short label. The palette is a row
 * of colours with a name beside it and is left where it was.
 */
const STRIP_INSET = {
  [ROW_SECTION]: { left: 14, right: 14 },
  [ROW_PICK]: { left: 62, right: 14 },
};

/** The area a strip row's cells are laid out across. */
export function stripRect(rowIndex, kind) {
  const inset = STRIP_INSET[kind];
  if (!inset) return rowControlRect(rowIndex);
  const row = editorRowRect(rowIndex);
  return {
    x: row.x + inset.left,
    y: row.y + 8,
    width: row.width - inset.left - inset.right,
    height: row.height - 16,
  };
}

/**
 * One cell of a row that is a strip of choices rather than a bar.
 *
 * Three rows use this shape — the section tabs, the paint palette and the layer
 * picker — and they share one function so the hover highlight, the click target
 * and the drawn cell are provably the same rectangle. Two of those went out of
 * step once already on the radio faceplate, and the symptom is that the thing
 * you click is not the thing you saw light up.
 */
export function stripCellRect(rowIndex, kind, index, count) {
  const strip = stripRect(rowIndex, kind);
  const cell = strip.width / count;
  return { x: strip.x + index * cell, y: strip.y - 4, width: cell - 3, height: strip.height + 8 };
}

/**
 * The clickable end of a stepper row — the ◀ or the ▶, plus enough space around
 * it to actually hit with a mouse.
 *
 * A drawn arrow is a promise that clicking it does something, the same promise
 * the radio's transport buttons make, so the glyph is centred in this rect
 * rather than the rect being fitted to the glyph. It spans the full row height
 * (and so stays inside `editorRowRect`) because a 20px-tall target is a target
 * you miss.
 */
export const STEPPER_ARROW_WIDTH = 44;

export function stepperArrowRect(index, step) {
  const row = editorRowRect(index);
  const control = rowControlRect(index);
  const width = Math.min(STEPPER_ARROW_WIDTH, control.width / 2);
  return {
    x: step < 0 ? control.x : control.x + control.width - width,
    y: row.y,
    width,
    height: row.height,
  };
}

export function editorActionRect(index) {
  const { x, y, width, height, gap } = GARAGE_LAYOUT.actions;
  return { x: x + index * (width + gap), y, width, height };
}

const within = (rect, x, y) =>
  x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;

/**
 * What is under the pointer, or null.
 *
 * A hit on a bar carries the `ratio` along the it, which is what lets one code
 * path serve both a click and a drag — the caller does not need to know which
 * gesture produced the point.
 */
export function hitGarage(view, x, y) {
  for (const row of view.rows) {
    const rect = editorRowRect(row.index);
    if (!within(rect, x, y)) continue;

    // A strip row: the cell under the pointer is the answer, and missing every
    // cell still counts as the row, so a click in the gutter moves the cursor
    // rather than doing nothing.
    if (row.kind === ROW_SECTION) {
      for (const section of view.sections) {
        if (within(stripCellRect(row.index, row.kind, section.index, view.sections.length), x, y)) {
          return { kind: "section", id: section.id, rowId: row.id };
        }
      }
      return { kind: "row", id: row.id };
    }

    if (row.kind === ROW_PALETTE) {
      for (const swatch of view.palette) {
        if (within(stripCellRect(row.index, row.kind, swatch.index, view.palette.length), x, y)) {
          return { kind: "palette", index: swatch.index, rowId: row.id };
        }
      }
      return { kind: "row", id: row.id };
    }

    if (row.kind === ROW_PICK) {
      for (const option of row.options) {
        if (within(stripCellRect(row.index, row.kind, option.index, row.options.length), x, y)) {
          // Picking and committing are one gesture with a mouse: pointing at a
          // layer preset is an unambiguous request for it, and there is nowhere
          // to put a separate confirm. The same rule the setup screen follows.
          return { kind: "pick", id: row.id, rowId: row.id, index: option.index };
        }
      }
      return { kind: "row", id: row.id };
    }

    if (row.kind === ROW_BUTTON) {
      return { kind: "activate", id: row.id, rowId: row.id };
    }

    if (row.kind === ROW_TOGGLE || row.kind === ROW_CHOICE) {
      // The arrows are drawn, so they are pressable. A stepper has no bar to
      // drag, so its two ends are the only way the mouse can change the value.
      for (const step of [-1, 1]) {
        if (within(stepperArrowRect(row.index, step), x, y)) {
          return { kind: "step", id: row.id, rowId: row.id, step };
        }
      }
      return { kind: "row", id: row.id };
    }

    const control = rowControlRect(row.index);
    if (within(control, x, y)) {
      return { kind: "bar", id: row.id, rowId: row.id, ratio: (x - control.x) / control.width };
    }
    return { kind: "row", id: row.id };
  }

  for (let index = 0; index < view.actions.length; index += 1) {
    if (within(editorActionRect(index), x, y)) {
      return { kind: "action", id: view.actions[index].id };
    }
  }
  return null;
}

function panel(ctx, rect, { live = false, dimmed = false } = {}) {
  ctx.fillStyle = dimmed ? "rgba(14,16,21,0.55)" : "rgba(14,16,21,0.86)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = live ? ACCENT : "rgba(150,158,178,0.3)";
  ctx.lineWidth = live ? 2 : 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

const rgb = (hue) => {
  const [r, g, b] = hueToRgb(hue);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
};

/** A hue bar is drawn as the wheel itself, so the control shows its own range. */
function drawHueBar(ctx, rect, row) {
  const gradient = ctx.createLinearGradient(rect.x, 0, rect.x + rect.width, 0);
  for (let stop = 0; stop <= 12; stop += 1) {
    gradient.addColorStop(stop / 12, rgb((stop / 12) * 360));
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  const markerX = rect.x + rect.width * row.ratio;
  ctx.fillStyle = "#fff";
  ctx.fillRect(markerX - 2, rect.y - 3, 4, rect.height + 6);
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 1;
  ctx.strokeRect(markerX - 2.5, rect.y - 3.5, 5, rect.height + 7);
}

function drawRatioBar(ctx, rect, row) {
  ctx.fillStyle = "rgba(150,158,178,0.18)";
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.fillStyle = row.selected ? ACCENT : "rgba(200,208,224,0.7)";
  ctx.fillRect(rect.x, rect.y, rect.width * row.ratio, rect.height);
  ctx.strokeStyle = "rgba(150,158,178,0.35)";
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

/**
 * A stepper prints its arrows, so it reads as left/right rather than as a bar.
 *
 * Each arrow is centred in the rect `hitGarage` tests, so what lights up under
 * the pointer is provably what pressing there does — the same rule the radio
 * faceplate follows.
 */
function drawStepper(ctx, rect, row, hover) {
  for (const step of [-1, 1]) {
    const arrow = stepperArrowRect(row.index, step);
    const hot = hover?.kind === "step" && hover.id === row.id && hover.step === step;
    if (hot && !row.dimmed) {
      ctx.fillStyle = "rgba(255,90,46,0.18)";
      ctx.fillRect(arrow.x, arrow.y + 5, arrow.width, arrow.height - 10);
    }
    label(ctx, step < 0 ? "◀" : "▶", arrow.x + arrow.width / 2, arrow.y + arrow.height / 2 + 5, {
      size: 12,
      colour: hot ? INK : row.selected ? ACCENT : MUTED,
      align: "center",
    });
  }
  label(ctx, row.value, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5, {
    size: 13, colour: row.selected ? INK : DIM, align: "center",
  });
}

function drawPaletteRow(ctx, view, row) {
  for (const swatch of view.palette) {
    const rect = stripCellRect(row.index, row.kind, swatch.index, view.palette.length);
    // The painted result, not the tint — see `paintSwatchColour`. Drawing the
    // tint made Silver and White identical blocks.
    ctx.fillStyle = paintSwatchColour(swatch);
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    if (swatch.selected) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2);
    }
  }
}

/** A strip of labelled cells: the section tabs and the layer picker. */
function drawCellStrip(ctx, row, cells, hover, hotKind) {
  for (const cell of cells) {
    const rect = stripCellRect(row.index, row.kind, cell.index, cells.length);
    const hot = hover?.kind === hotKind
      && (hotKind === "section" ? hover.id === cell.id : hover.index === cell.index);

    ctx.fillStyle = cell.selected ? "rgba(255,90,46,0.22)" : hot ? "rgba(150,158,178,0.16)" : "rgba(14,16,21,0.7)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = cell.selected ? ACCENT : "rgba(150,158,178,0.28)";
    ctx.lineWidth = cell.selected ? 2 : 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    label(ctx, cell.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 4, {
      size: 11,
      colour: cell.selected ? INK : hot ? INK : DIM,
      align: "center",
    });
  }
}

/** A row that is a button: no value, fires on ENTER or a click. */
function drawButtonRow(ctx, rect, row, hover) {
  const hot = hover?.kind === "activate" && hover.id === row.id;
  const inner = { x: rect.x + 14, y: rect.y + 6, width: rect.width - 28, height: rect.height - 12 };
  ctx.fillStyle = row.selected || hot ? "rgba(255,90,46,0.16)" : "rgba(14,16,21,0.7)";
  ctx.fillRect(inner.x, inner.y, inner.width, inner.height);
  ctx.strokeStyle = row.selected || hot ? ACCENT : "rgba(150,158,178,0.3)";
  ctx.lineWidth = row.selected ? 2 : 1;
  ctx.strokeRect(inner.x + 0.5, inner.y + 0.5, inner.width - 1, inner.height - 1);
  label(ctx, row.label, inner.x + inner.width / 2, inner.y + inner.height / 2 + 4, {
    size: 12,
    colour: row.selected || hot ? INK : DIM,
    align: "center",
  });
}

/** Rows whose control fills the width and prints no separate value on the right. */
const SILENT_VALUE = new Set([ROW_TOGGLE, ROW_CHOICE, ROW_SECTION, ROW_PICK, ROW_BUTTON]);

function drawRows(ctx, view) {
  for (const row of view.rows) {
    const rect = editorRowRect(row.index);
    if (row.kind === ROW_BUTTON) {
      drawButtonRow(ctx, rect, row, view.hover);
      continue;
    }
    panel(ctx, rect, { live: row.selected, dimmed: row.dimmed });

    // The tab strip spans the whole row, so a label would sit underneath it —
    // and a row of named tabs needs no second name.
    if (row.kind !== ROW_SECTION) {
      label(ctx, row.label, rect.x + 14, rect.y + rect.height / 2 + 5, {
        size: 13,
        colour: row.dimmed ? MUTED : row.selected ? INK : DIM,
      });
    }

    const control = rowControlRect(row.index);
    if (row.kind === ROW_SECTION) {
      drawCellStrip(ctx, row, view.sections, view.hover, "section");
    } else if (row.kind === ROW_PICK) {
      drawCellStrip(ctx, row, row.options, view.hover, "pick");
    } else if (row.kind === ROW_PALETTE) {
      drawPaletteRow(ctx, view, row);
    } else if (row.kind === ROW_TOGGLE || row.kind === ROW_CHOICE) {
      drawStepper(ctx, control, row, view.hover);
    } else if (row.kind === ROW_HUE) {
      drawHueBar(ctx, control, row);
    } else {
      drawRatioBar(ctx, control, row);
    }

    // The add-a-layer section is one row and a lot of empty screen, so it says
    // what pressing something will do. Everywhere else the controls speak for
    // themselves and a caption would just be noise.
    if (row.kind === ROW_PICK) {
      label(
        ctx,
        "choose a shape, then ENTER — you can move and recolour it afterwards",
        rect.x + 14,
        rect.y + rect.height + 22,
        { size: 12, colour: MUTED },
      );
    }

    if (!SILENT_VALUE.has(row.kind)) {
      label(ctx, row.value, rect.x + rect.width - 14, rect.y + rect.height / 2 + 5, {
        size: 12,
        colour: row.dimmed ? MUTED : row.selected ? INK : DIM,
        align: "right",
      });
    }
  }
}

function drawActions(ctx, view) {
  view.actions.forEach((action, index) => {
    const rect = editorActionRect(index);
    // A disabled action stays drawn rather than vanishing: a button list that
    // changes length would move every other button under the pointer.
    ctx.fillStyle = action.selected && action.enabled ? "rgba(255,90,46,0.16)" : "rgba(14,16,21,0.86)";
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeStyle = !action.enabled
      ? "rgba(150,158,178,0.18)"
      : action.selected
        ? ACCENT
        : "rgba(150,158,178,0.35)";
    ctx.lineWidth = action.selected ? 2 : 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

    label(ctx, action.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 5, {
      size: 13,
      colour: !action.enabled ? MUTED : action.selected ? INK : DIM,
      align: "center",
    });
  });
}

/**
 * The car, in the colours being chosen, updating as the controls move. Drawn
 * from the same baked sprite the race uses, so what is previewed here is
 * literally what reaches the road.
 */
function drawPreview(
  ctx,
  view,
  model,
  sheetImages,
  liveryCache,
  circuitImages,
  circuitLiveryCache,
) {
  const box = GARAGE_LAYOUT.preview;
  panel(ctx, box);
  if (!model) return;

  const image = sheetImages.get(model.sheetId);
  const sprite = liveryCache
    ? liverySprite(liveryCache, { image, model, livery: view.livery })
    : null;

  const maxWidth = box.width - 180;
  const maxHeight = 220;
  const scale = Math.min(maxWidth / model.sw, maxHeight / model.sh);
  const width = model.sw * scale;
  const height = model.sh * scale;
  const x = box.x + box.width / 2;
  const top = box.y + 28;

  drawUnderglow(ctx, { x, top, width, height }, view.livery);
  if (sprite) {
    ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, x - width / 2, top, width, height);
  } else if (image && image.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, model.sx, model.sy, model.sw, model.sh, x - width / 2, top, width, height);
  }

  const circuitModel = circuitModelById(model.id);
  const circuitImage = circuitImages?.get(model.id) ?? null;
  const circuitAtlas = circuitModel && circuitLiveryCache
    ? circuitLiveryAtlas(circuitLiveryCache, {
      image: circuitImage,
      modelId: model.id,
      livery: view.livery,
    })
    : null;
  const frame = Math.max(0, Math.min(7, view.circuitFrame ?? 0));
  label(ctx, "CIRCUIT TURNAROUND", box.x + 32, box.y + 300, {
    size: 12,
    colour: view.circuitAvailable ? ACCENT : MUTED,
  });
  label(ctx, view.circuitAvailable ? `${frame + 1} / 8` : "ATLAS UNAVAILABLE", box.x + box.width - 32, box.y + 300, {
    size: 12,
    colour: view.circuitAvailable ? DIM : ACCENT,
    align: "right",
  });

  if (circuitAtlas) {
    const size = 88;
    const circuitX = box.x + box.width / 2;
    const circuitTop = box.y + 308;
    const circuitBox = circuitDrawBox(
      circuitX,
      circuitTop + size / 2,
      size,
      circuitFrameScale(circuitLiveryCache, model.id, frame),
    );
    drawUnderglow(ctx, {
      x: circuitX,
      top: circuitBox.y,
      width: circuitBox.width,
      height: circuitBox.height,
    }, view.livery);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      circuitAtlas,
      frame * CIRCUIT_FRAME_SIZE,
      0,
      CIRCUIT_FRAME_SIZE,
      CIRCUIT_FRAME_SIZE,
      circuitBox.x,
      circuitBox.y,
      circuitBox.width,
      circuitBox.height,
    );
    ctx.imageSmoothingEnabled = true;
  }

  label(ctx, view.name.toUpperCase(), box.x + box.width / 2, box.y + box.height - 46, {
    size: 24,
    colour: INK,
    align: "center",
  });
  label(
    ctx,
    view.pristine ? "unchanged" : "unsaved changes",
    box.x + box.width / 2,
    box.y + box.height - 22,
    { size: 12, colour: view.pristine ? MUTED : ACCENT, align: "center" },
  );
}

export function drawGarage(ctx, view, {
  model,
  sheetImages,
  trackImages,
  liveryCache = null,
  circuitImages = null,
  circuitLiveryCache = null,
}) {
  drawMenuBackdrop(ctx, trackImages.get(view.trackId));

  label(ctx, "GARAGE", GARAGE_LAYOUT.title.x, GARAGE_LAYOUT.title.y, {
    size: 32, colour: INK, weight: "800",
  });
  label(ctx, (model?.label ?? "").toUpperCase(), GARAGE_LAYOUT.model.x, GARAGE_LAYOUT.model.y, {
    size: 14, colour: ACCENT,
  });
  // How many layer slots are spent, so the player is not left guessing why the
  // add tab has gone. It disappears at the ceiling rather than going inert.
  label(
    ctx,
    `${view.layerCount} / ${view.maxLayers} LAYERS`,
    GARAGE_LAYOUT.rows.x + GARAGE_LAYOUT.rows.width,
    GARAGE_LAYOUT.model.y,
    { size: 12, colour: view.layerCount >= view.maxLayers ? MUTED : DIM, align: "right" },
  );

  drawRows(ctx, view);
  drawActions(ctx, view);
  drawPreview(
    ctx,
    view,
    model,
    sheetImages,
    liveryCache,
    circuitImages,
    circuitLiveryCache,
  );

  label(
    ctx,
    "ARROWS / WASD  move and adjust       ENTER  choose       ESC  back       drag a bar or click anything",
    GARAGE_LAYOUT.title.x,
    WORLD.height - 14,
    { size: 13 },
  );
}
