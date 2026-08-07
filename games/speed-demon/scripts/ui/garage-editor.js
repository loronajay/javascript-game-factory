// The garage editor: where a livery is actually built.
//
// Pure. No canvas, no DOM — this owns *which control the cursor is on* and *what
// each control does to the livery*, and `render/garage.js` draws whatever it
// says. Same split as `setup-menu.js` and `shifter-gate.js`.
//
// **Controls are a catalog, not a screen full of branches.** Every row in
// `EDITOR_ROWS` names the livery field it edits and how that field behaves, so
// adding a control — a second underglow mode, a decal layer once there is art
// for one — is a row here plus a case in the renderer's `kind` switch. The
// cursor, the value stepping, the mouse hit-testing and the view model all read
// the catalog and need no changes at all. `moveEditor` never mentions "hue".
//
// **The cursor walks one flat list of rows and actions.** Rows adjust with
// left/right; actions fire with ENTER. Keeping them in one list is what makes
// up/down mean the same thing everywhere on the screen — a separate "button
// area" you have to escape into is the kind of thing that makes a pad-driven
// menu feel stuck.
//
// **The editor holds a working copy, not the garage.** You are always editing a
// livery that has not been committed, and saving is an explicit action. That is
// what makes backing out safe: ESC throws the working copy away and the garage
// is untouched, so experimenting with a colour cannot cost you the preset you
// arrived with.

import {
  FINISHES,
  LIVERY_LIMITS,
  PAINT_PRESETS,
  createLivery,
  clampField,
  stepField,
  findFinish,
  describeLivery,
  applyPaintPreset,
  liveryEquals,
} from "../garage/livery.js";
import { canSavePreset, presetById } from "../garage/garage.js";

/** How a row reads and writes its slice of the livery. */
export const ROW_HUE = "hue";
export const ROW_RATIO = "ratio";
export const ROW_RANGE = "range";
export const ROW_CHOICE = "choice";
export const ROW_TOGGLE = "toggle";
export const ROW_PALETTE = "palette";

/**
 * The controls, in the order they are shown. `path` is where the value lives in
 * a livery; `limit` names the entry in `LIVERY_LIMITS` that bounds it, so the
 * editor and the normalizer can never disagree about a range.
 */
export const EDITOR_ROWS = [
  { id: "palette", label: "Palette", kind: ROW_PALETTE },
  { id: "hue", label: "Colour", kind: ROW_HUE, path: ["paint", "hue"], limit: "hue" },
  { id: "saturation", label: "Depth", kind: ROW_RATIO, path: ["paint", "saturation"], limit: "saturation" },
  { id: "brightness", label: "Brightness", kind: ROW_RANGE, path: ["paint", "brightness"], limit: "brightness" },
  { id: "finish", label: "Finish", kind: ROW_CHOICE, path: ["paint", "finish"] },
  { id: "windowTint", label: "Window Tint", kind: ROW_RATIO, path: ["windowTint"], limit: "windowTint" },
  { id: "tailLightHue", label: "Tail Lights", kind: ROW_HUE, path: ["tailLightHue"], limit: "tailLightHue" },
  { id: "underglowOn", label: "Underglow", kind: ROW_TOGGLE, path: ["underglow", "enabled"] },
  { id: "underglowHue", label: "Glow Colour", kind: ROW_HUE, path: ["underglow", "hue"], limit: "underglowHue" },
  {
    id: "underglowIntensity",
    label: "Glow Strength",
    kind: ROW_RATIO,
    path: ["underglow", "intensity"],
    limit: "underglowIntensity",
  },
];

export const ACTION_SAVE = "save";
export const ACTION_UPDATE = "update";
export const ACTION_DELETE = "delete";
export const ACTION_DONE = "done";

const readPath = (livery, path) => path.reduce((value, key) => value?.[key], livery);

function writePath(livery, path, value) {
  if (path.length === 1) return { ...livery, [path[0]]: value };
  const [head, ...rest] = path;
  return { ...livery, [head]: writePath(livery[head], rest, value) };
}

export function rowById(id) {
  return EDITOR_ROWS.find((row) => row.id === id) ?? null;
}

/**
 * Opens the editor on a livery.
 *
 * `presetId` is what the player arrived from, and it decides which actions are
 * offered: an existing preset can be updated or deleted in place, while a new
 * one can only be saved. `null` means they are building from Factory.
 */
export function createEditor({ modelId, presetId = null, livery } = {}) {
  return {
    modelId,
    presetId,
    // The livery as it was when the editor opened, kept so "has anything
    // changed" is answerable without consulting the garage — which matters
    // because the working copy may be based on Factory, which is not in it.
    original: createLivery(livery),
    livery: createLivery(livery),
    cursor: 0,
    paletteIndex: 0,
  };
}

/**
 * The actions offered right now. Computed rather than stored: whether UPDATE
 * makes sense depends on where the editor was opened from, and whether SAVE does
 * depends on how full the model's slots are — both of which a stored list could
 * only get wrong.
 */
export function editorActions(editor, garage) {
  const actions = [];
  const editing = editor.presetId ? presetById(garage, editor.presetId) : null;
  if (editing) {
    actions.push({ id: ACTION_UPDATE, label: "Save Changes", enabled: !isPristine(editor) });
  }
  actions.push({
    id: ACTION_SAVE,
    label: editing ? "Save As New" : "Save Paint",
    enabled: canSavePreset(garage, editor.modelId),
  });
  if (editing) {
    actions.push({ id: ACTION_DELETE, label: "Delete", enabled: true });
  }
  actions.push({ id: ACTION_DONE, label: "Done", enabled: true });
  return actions;
}

/** Whether the working copy still matches what the editor opened on. */
export function isPristine(editor) {
  return liveryEquals(editor.original, editor.livery);
}

/** Every cursor stop, rows first then actions — one list, so up/down is uniform. */
function stops(editor, garage) {
  return [
    ...EDITOR_ROWS.map((row) => ({ kind: "row", id: row.id })),
    ...editorActions(editor, garage).map((action) => ({ kind: "action", id: action.id })),
  ];
}

export function editorStopCount(editor, garage) {
  return stops(editor, garage).length;
}

/** What the cursor is on: a control to adjust, or an action to fire. */
export function editorFocus(editor, garage) {
  const all = stops(editor, garage);
  return all[Math.max(0, Math.min(all.length - 1, editor.cursor))] ?? null;
}

const clampCursor = (value, count) => Math.max(0, Math.min(count - 1, value));

/**
 * Up/down walks the controls; left/right adjusts the one under the cursor.
 * Adjusting an action does nothing — actions commit, and a stray left/right on
 * DELETE quietly deleting something would be indefensible.
 */
export function moveEditor(editor, direction, garage) {
  const count = editorStopCount(editor, garage);
  if (direction === "up") return { ...editor, cursor: clampCursor(editor.cursor - 1, count) };
  if (direction === "down") return { ...editor, cursor: clampCursor(editor.cursor + 1, count) };

  const focus = editorFocus(editor, garage);
  if (!focus || focus.kind !== "row") return editor;
  const step = direction === "right" ? 1 : direction === "left" ? -1 : 0;
  return step === 0 ? editor : adjustRow(editor, focus.id, step);
}

/**
 * Steps one control. Every numeric field goes through `stepField`, so the
 * editor's increments and the normalizer's clamps come from the same table and
 * a slider can never select a value that normalization would then reject.
 */
export function adjustRow(editor, rowId, step) {
  const row = rowById(rowId);
  if (!row) return editor;

  if (row.kind === ROW_PALETTE) {
    const next = Math.max(0, Math.min(PAINT_PRESETS.length - 1, editor.paletteIndex + step));
    return {
      ...editor,
      paletteIndex: next,
      livery: applyPaintPreset(editor.livery, PAINT_PRESETS[next].id),
    };
  }

  if (row.kind === ROW_TOGGLE) {
    return { ...editor, livery: writePath(editor.livery, row.path, step > 0) };
  }

  if (row.kind === ROW_CHOICE) {
    const current = FINISHES.findIndex((finish) => finish.id === readPath(editor.livery, row.path));
    const next = Math.max(0, Math.min(FINISHES.length - 1, (current < 0 ? 0 : current) + step));
    return { ...editor, livery: writePath(editor.livery, row.path, FINISHES[next].id) };
  }

  const stepped = stepField(row.limit, readPath(editor.livery, row.path), step);
  return { ...editor, livery: writePath(editor.livery, row.path, stepped) };
}

/**
 * Sets a control straight to a value — what a click or a drag on a bar does, as
 * opposed to stepping it. `ratio` is 0..1 across the bar's width; the field's
 * own limits turn that back into a real value, and it is snapped to the field's
 * step so dragging and arrowing produce the same set of values.
 */
export function setRowRatio(editor, rowId, ratio) {
  const row = rowById(rowId);
  if (!row || !row.limit) return editor;
  const limit = LIVERY_LIMITS[row.limit];
  const clamped = Math.max(0, Math.min(1, ratio));
  const raw = limit.min + clamped * (limit.max - limit.min);
  const snapped = limit.wraps
    ? Math.round(raw / limit.step) * limit.step
    : Math.round(raw / limit.step) * limit.step;
  return { ...editor, livery: writePath(editor.livery, row.path, clampField(row.limit, snapped)) };
}

/** Puts the cursor on a named stop — what a click does before it acts. */
export function focusEditor(editor, target, garage) {
  if (!target) return editor;
  const index = stops(editor, garage).findIndex(
    (stop) => stop.kind === target.kind && stop.id === target.id,
  );
  return index < 0 ? editor : { ...editor, cursor: index };
}

/** Jumps the palette to one of its swatches, applying it. */
export function selectPalette(editor, index) {
  const clamped = Math.max(0, Math.min(PAINT_PRESETS.length - 1, index));
  return {
    ...editor,
    paletteIndex: clamped,
    livery: applyPaintPreset(editor.livery, PAINT_PRESETS[clamped].id),
  };
}

/** The name a saved config gets — derived from the paint. See `describeLivery`. */
export function editorPresetName(editor) {
  return describeLivery(editor.livery);
}

/** How full a bar should be drawn, 0..1, for a numeric row. */
function rowRatio(livery, row) {
  if (!row.limit) return 0;
  const limit = LIVERY_LIMITS[row.limit];
  const value = readPath(livery, row.path);
  return (value - limit.min) / (limit.max - limit.min);
}

/** The value as the row prints it, so the renderer formats nothing itself. */
function rowText(livery, row, editor) {
  if (row.kind === ROW_PALETTE) return PAINT_PRESETS[editor.paletteIndex].label;
  if (row.kind === ROW_TOGGLE) return readPath(livery, row.path) ? "On" : "Off";
  if (row.kind === ROW_CHOICE) return findFinish(readPath(livery, row.path)).label;
  const value = readPath(livery, row.path);
  if (row.kind === ROW_HUE) return `${Math.round(value)}°`;
  if (row.kind === ROW_RANGE) return `${Math.round(value * 100)}%`;
  return `${Math.round(value * 100)}%`;
}

/**
 * Everything the renderer needs, pre-shaped: every row with its value, its bar
 * fill and whether it is live, plus the actions and the car being painted.
 *
 * Underglow's colour and strength are marked `dimmed` when the glow is switched
 * off. They stay in the list rather than disappearing — a control list that
 * changes length as you toggle a switch moves every row below it under the
 * cursor, which is exactly how you end up deleting a preset you meant to keep.
 */
export function editorView(editor, garage) {
  const focus = editorFocus(editor, garage);
  const glowOn = readPath(editor.livery, ["underglow", "enabled"]);

  return {
    modelId: editor.modelId,
    livery: editor.livery,
    presetId: editor.presetId,
    name: editorPresetName(editor),
    pristine: isPristine(editor),
    palette: PAINT_PRESETS.map((preset, index) => ({
      ...preset,
      index,
      selected: index === editor.paletteIndex,
    })),
    rows: EDITOR_ROWS.map((row, index) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      index,
      value: rowText(editor.livery, row, editor),
      ratio: row.limit ? Math.max(0, Math.min(1, rowRatio(editor.livery, row))) : 0,
      hue: row.kind === ROW_HUE ? readPath(editor.livery, row.path) : null,
      selected: focus?.kind === "row" && focus.id === row.id,
      dimmed: !glowOn && (row.id === "underglowHue" || row.id === "underglowIntensity"),
    })),
    actions: editorActions(editor, garage).map((action) => ({
      ...action,
      selected: focus?.kind === "action" && focus.id === action.id,
    })),
  };
}
