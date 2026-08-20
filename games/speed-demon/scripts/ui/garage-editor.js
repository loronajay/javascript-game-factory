// The garage editor: where a livery is actually built.
//
// Pure. No canvas, no DOM — this owns *which control the cursor is on* and *what
// each control does to the livery*, and `render/garage.js` draws whatever it
// says. Same split as `setup-menu.js` and `shifter-gate.js`.
//
// **Controls are a catalog, not a screen full of branches.** Every row in
// `SECTION_ROWS` names the livery field it edits and how that field behaves, so
// adding a control — a second underglow mode, a decal layer once there is art
// for one — is a row here plus a case in the renderer's `kind` switch. The
// cursor, the value stepping, the mouse hit-testing and the view model all read
// the catalog and need no changes at all. `moveEditor` never mentions "hue".
//
// A `ROW_CHOICE` carries its own `choices`, which is what lets one control serve
// the finish, the fade direction and a layer's shape. An earlier cut hardcoded
// `FINISHES` inside the stepper, and the second choice control could only be
// added by copying it.
//
// **The cursor walks one flat list of rows and actions.** Rows adjust with
// left/right; actions fire with ENTER. Keeping them in one list is what makes
// up/down mean the same thing everywhere on the screen — a separate "button
// area" you have to escape into is the kind of thing that makes a pad-driven
// menu feel stuck.
//
// **That list is one section's worth, and row zero is the tab strip.** A livery
// grew from ten controls to well over fifty — a base paint, a fade, glass and
// lamp tints, underglow, and up to four layers of ten each — where about eleven
// rows fit on screen. Sections are how that stays navigable without giving up
// the flat-list rule: within a section nothing has changed, and the strip is
// itself a row, so left/right still adjusts whatever the cursor is on.
//
// **Two row kinds do something rather than hold something.** `ROW_PICK` (choose
// a layer preset) and `ROW_BUTTON` (remove this layer) commit on ENTER, and
// `activateEditorRow` is the one place that happens. They are separate from the
// action list at the bottom because they belong to a section rather than to the
// screen — "remove this layer" makes no sense while the paint section is open.
//
// **The editor holds a working copy, not the garage.** You are always editing a
// livery that has not been committed, and saving is an explicit action. That is
// what makes backing out safe: ESC throws the working copy away and the garage
// is untouched, so experimenting with a colour cannot cost you the preset you
// arrived with.

import {
  FINISHES,
  FADE_AXES,
  LAYER_KINDS,
  LAYER_PRESETS,
  LIVERY_LIMITS,
  MAX_LAYERS,
  PAINT_PRESETS,
  createLivery,
  clampField,
  stepField,
  findLayerKind,
  describeLivery,
  applyPaintPreset,
  liveryEquals,
  addLayer,
  removeLayer,
  canAddLayer,
} from "../garage/livery.js";
import { canSavePreset, presetById } from "../garage/garage.js";

/** How a row reads and writes its slice of the livery. */
export const ROW_HUE = "hue";
export const ROW_RATIO = "ratio";
export const ROW_RANGE = "range";
export const ROW_CHOICE = "choice";
export const ROW_TOGGLE = "toggle";
export const ROW_PALETTE = "palette";
/** Left/right moves a highlight; ENTER commits it. See `activateEditorRow`. */
export const ROW_PICK = "pick";
/** No value at all — ENTER fires it. A button that lives in the row list. */
export const ROW_BUTTON = "button";

/**
 * The sections the cursor walks, in order.
 *
 * **Sections exist because the control list outgrew the screen.** A livery now
 * holds a base paint, a fade, glass and lamp tints, underglow and up to four
 * layers of ten controls each — well over fifty rows, where about eleven fit.
 * Splitting them is what keeps every section short enough to see at once and,
 * more importantly, keeps up/down meaning one thing: within a section the cursor
 * still walks one flat list of rows and then actions, exactly as it did when
 * that list was the whole screen.
 *
 * The layer sections are not listed here — they are generated from the livery,
 * because how many there are is a property of the car rather than of the editor.
 */
export const SECTION_PAINT = "paint";
export const SECTION_FADE = "fade";
export const SECTION_TRIM = "trim";
export const SECTION_GLOW = "glow";
/** The pseudo-section that adds a layer. Present only while one would fit. */
export const SECTION_NEW_LAYER = "new-layer";

/**
 * The fixed sections' controls. `path` is where the value lives in a livery;
 * `limit` names the entry in `LIVERY_LIMITS` that bounds it, so the editor and
 * the normalizer can never disagree about a range.
 */
export const SECTION_ROWS = {
  [SECTION_PAINT]: [
    { id: "palette", label: "Palette", kind: ROW_PALETTE },
    { id: "hue", label: "Colour", kind: ROW_HUE, path: ["paint", "hue"], limit: "hue" },
    { id: "saturation", label: "Depth", kind: ROW_RATIO, path: ["paint", "saturation"], limit: "saturation" },
    { id: "brightness", label: "Brightness", kind: ROW_RANGE, path: ["paint", "brightness"], limit: "brightness" },
    { id: "finish", label: "Finish", kind: ROW_CHOICE, path: ["paint", "finish"], choices: FINISHES },
  ],
  [SECTION_FADE]: [
    { id: "fadeOn", label: "Fade", kind: ROW_TOGGLE, path: ["fade", "enabled"] },
    { id: "fadeAxis", label: "Direction", kind: ROW_CHOICE, path: ["fade", "axis"], choices: FADE_AXES },
    { id: "fadeHue", label: "Fade To", kind: ROW_HUE, path: ["fade", "hue"], limit: "hue" },
    { id: "fadeSaturation", label: "Fade Depth", kind: ROW_RATIO, path: ["fade", "saturation"], limit: "saturation" },
    { id: "fadeBrightness", label: "Fade Bright", kind: ROW_RANGE, path: ["fade", "brightness"], limit: "brightness" },
  ],
  [SECTION_TRIM]: [
    { id: "windowTint", label: "Window Tint", kind: ROW_RATIO, path: ["windowTint"], limit: "windowTint" },
    { id: "tailLightHue", label: "Tail Lights", kind: ROW_HUE, path: ["tailLightHue"], limit: "tailLightHue" },
  ],
  [SECTION_GLOW]: [
    { id: "underglowOn", label: "Underglow", kind: ROW_TOGGLE, path: ["underglow", "enabled"] },
    { id: "underglowHue", label: "Glow Colour", kind: ROW_HUE, path: ["underglow", "hue"], limit: "underglowHue" },
    {
      id: "underglowIntensity",
      label: "Glow Strength",
      kind: ROW_RATIO,
      path: ["underglow", "intensity"],
      limit: "underglowIntensity",
    },
  ],
  [SECTION_NEW_LAYER]: [
    { id: "layerPreset", label: "Add", kind: ROW_PICK, options: LAYER_PRESETS },
  ],
};

/**
 * One layer's controls. Generated per layer rather than listed, because the
 * `path` has to reach into a particular entry of the layer list — but the shape
 * is otherwise a plain `SECTION_ROWS` entry and every other part of the editor
 * treats it as one.
 */
export function layerRows(index) {
  const into = (...rest) => ["layers", index, ...rest];
  return [
    { id: "layerKind", label: "Shape", kind: ROW_CHOICE, path: into("kind"), choices: LAYER_KINDS },
    { id: "layerPosition", label: "Position", kind: ROW_RATIO, path: into("position"), limit: "layerPosition" },
    { id: "layerSize", label: "Size", kind: ROW_RATIO, path: into("size"), limit: "layerSize" },
    // Signed, so it is a `ROW_RANGE` like brightness rather than a `ROW_RATIO`:
    // the bar reads as a position within the range, which puts straight in the
    // middle and either bow at an end. A percentage of nothing would be a
    // percentage that reads 0% halfway along its own bar.
    { id: "layerCurve", label: "Curve", kind: ROW_RANGE, path: into("curve"), limit: "layerCurve" },
    { id: "layerFeather", label: "Soft Edge", kind: ROW_RATIO, path: into("feather"), limit: "layerFeather" },
    { id: "layerMirrored", label: "Mirror", kind: ROW_TOGGLE, path: into("mirrored") },
    { id: "layerHue", label: "Colour", kind: ROW_HUE, path: into("paint", "hue"), limit: "hue" },
    { id: "layerSaturation", label: "Depth", kind: ROW_RATIO, path: into("paint", "saturation"), limit: "saturation" },
    { id: "layerBrightness", label: "Brightness", kind: ROW_RANGE, path: into("paint", "brightness"), limit: "brightness" },
    { id: "layerFinish", label: "Finish", kind: ROW_CHOICE, path: into("paint", "finish"), choices: FINISHES },
    { id: "layerRemove", label: "Remove Layer", kind: ROW_BUTTON },
  ];
}

/** A layer section's id. Derived from the index so the cursor can address it. */
export const layerSectionId = (index) => `layer-${index}`;

const layerIndexOf = (sectionId) => {
  const match = /^layer-(\d+)$/.exec(sectionId ?? "");
  return match ? Number(match[1]) : -1;
};

/**
 * Every section the cursor can stand on, for this livery.
 *
 * Computed rather than stored: how many layer sections exist is a fact about the
 * car, and a stored copy could only get it wrong after an add or a remove.
 */
export function editorSections(livery) {
  const { layers } = createLivery(livery);
  const sections = [
    { id: SECTION_PAINT, label: "Paint" },
    { id: SECTION_FADE, label: "Fade" },
    ...layers.map((layer, index) => ({
      id: layerSectionId(index),
      label: `Layer ${index + 1}`,
      layerIndex: index,
    })),
    { id: SECTION_TRIM, label: "Trim" },
    { id: SECTION_GLOW, label: "Glow" },
  ];
  // The add button is a section rather than an action so it sits next to the
  // layers it makes, and it disappears at the ceiling rather than going inert —
  // an "add" that never adds is worse than one that is not offered.
  if (layers.length < MAX_LAYERS) sections.push({ id: SECTION_NEW_LAYER, label: "+ Layer" });
  return sections;
}

/** The rows of whichever section is open. */
export function rowsForSection(livery, sectionId) {
  const index = layerIndexOf(sectionId);
  if (index >= 0) return layerRows(index);
  return SECTION_ROWS[sectionId] ?? SECTION_ROWS[SECTION_PAINT];
}

/**
 * Which section owns a row, or null.
 *
 * Everything that edits a row — the cursor, the stepper, the hit test — is
 * scoped to the section that is open, because that is the only section whose
 * rows are on screen and therefore the only one a key or a click can be talking
 * about. This is the way back for the two callers that legitimately start from a
 * row id instead: a test, and the debug handle. Neither can be expected to know
 * which tab a control lives behind, and both would otherwise fail silently by
 * addressing a row that is not currently visible.
 */
export function sectionForRow(livery, rowId) {
  for (const section of editorSections(livery)) {
    if (rowsForSection(livery, section.id).some((row) => row.id === rowId)) return section.id;
  }
  return null;
}

export const ACTION_SAVE = "save";
export const ACTION_UPDATE = "update";
export const ACTION_DELETE = "delete";
export const ACTION_DONE = "done";

/** Slow fixed-timestep turntable for the circuit preview; rendering reads it. */
export function circuitPreviewFrame(tick, ticksPerHeading = 24) {
  const safeTick = Number.isFinite(tick) ? Math.max(0, Math.trunc(tick)) : 0;
  const dwell = Number.isFinite(ticksPerHeading) && ticksPerHeading > 0
    ? Math.max(1, Math.trunc(ticksPerHeading))
    : 24;
  return Math.floor(safeTick / dwell) % 8;
}

/** The section tab strip, always row zero. Left/right walks sections. */
export const ROW_SECTION = "section";
const SECTION_ROW = { id: "section", label: "Editing", kind: ROW_SECTION };

const readPath = (livery, path) => path.reduce((value, key) => value?.[key], livery);

/**
 * An immutable write down a path, through objects *and arrays*.
 *
 * The array case is not decoration: a layer control's path runs through
 * `layers[2]`, and spreading an array into an object literal turns it into
 * `{0: …, 1: …}` — which normalizes straight back to a car with no layers on it,
 * because `Array.isArray` then says no. That failure is silent and total.
 */
function writePath(target, path, value) {
  const [head, ...rest] = path;
  const next = rest.length === 0 ? value : writePath(target[head], rest, value);
  if (Array.isArray(target)) {
    const copy = target.slice();
    copy[head] = next;
    return copy;
  }
  return { ...target, [head]: next };
}

/** The row with this id in the section that is open, or null. */
export function rowById(editor, id) {
  return rowsForSection(editor.livery, editor.section).find((row) => row.id === id) ?? null;
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
    section: SECTION_PAINT,
    cursor: 0,
    paletteIndex: 0,
    // Which entry of a `ROW_PICK` row is highlighted. Committing it is a
    // separate press, so this is a highlight and not a choice.
    pickIndex: 0,
  };
}

/** The section that is open, resolved against the sections that exist. */
export function currentSection(editor) {
  const sections = editorSections(editor.livery);
  return sections.find((section) => section.id === editor.section) ?? sections[0];
}

/**
 * Moves to a named section, putting the cursor back on the tab strip.
 *
 * Landing on row zero rather than keeping the old cursor is deliberate: sections
 * have different numbers of rows, so a preserved index means arriving somewhere
 * arbitrary — and the player who just changed section is, by definition, still
 * choosing where to go.
 */
export function selectSection(editor, sectionId) {
  const sections = editorSections(editor.livery);
  if (!sections.some((section) => section.id === sectionId)) return editor;
  return { ...editor, section: sectionId, cursor: 0, pickIndex: 0 };
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

/** Every row on screen: the section tabs, then whatever that section holds. */
export function visibleRows(editor) {
  return [SECTION_ROW, ...rowsForSection(editor.livery, editor.section)];
}

/** Every cursor stop, rows first then actions — one list, so up/down is uniform. */
function stops(editor, garage) {
  return [
    ...visibleRows(editor).map((row) => ({ kind: "row", id: row.id })),
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
  const row = rowId === SECTION_ROW.id ? SECTION_ROW : rowById(editor, rowId);
  if (!row) return editor;

  if (row.kind === ROW_SECTION) {
    const sections = editorSections(editor.livery);
    const current = sections.findIndex((section) => section.id === editor.section);
    const next = Math.max(0, Math.min(sections.length - 1, (current < 0 ? 0 : current) + step));
    return selectSection(editor, sections[next].id);
  }

  if (row.kind === ROW_PICK) {
    // A highlight, not a choice — committing is `activateEditorRow`. Stepping
    // this must not add a layer, or holding ▶ would fill every slot.
    return { ...editor, pickIndex: Math.max(0, Math.min(row.options.length - 1, editor.pickIndex + step)) };
  }

  // A button has no value to step. Left/right on one does nothing rather than
  // firing it, for the same reason a stray arrow must not hit DELETE.
  if (row.kind === ROW_BUTTON) return editor;

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
    // The catalog rides on the row, so a finish, a fade axis and a layer shape
    // are one control rather than three — `moveEditor` still never mentions any
    // of them by name.
    const choices = row.choices;
    const current = choices.findIndex((choice) => choice.id === readPath(editor.livery, row.path));
    const next = Math.max(0, Math.min(choices.length - 1, (current < 0 ? 0 : current) + step));
    return { ...editor, livery: writePath(editor.livery, row.path, choices[next].id) };
  }

  const stepped = stepField(row.limit, readPath(editor.livery, row.path), step);
  return { ...editor, livery: writePath(editor.livery, row.path, stepped) };
}

/**
 * ENTER on a row that does something rather than holds a value.
 *
 * Only two rows have this: the layer picker adds a layer, and a layer's own
 * Remove button takes it away. Both change which sections exist, so both have to
 * say where the cursor lands afterwards — adding jumps to the new layer, because
 * the player's next move is certainly to colour it, and removing steps back to
 * the paint section rather than to whatever slid into the empty slot.
 */
export function activateEditorRow(editor, rowId) {
  const row = rowById(editor, rowId);
  if (!row) return editor;

  if (row.kind === ROW_PICK) {
    if (!canAddLayer(editor.livery)) return editor;
    const preset = row.options[Math.max(0, Math.min(row.options.length - 1, editor.pickIndex))];
    const livery = addLayer(editor.livery, preset.id);
    const index = livery.layers.length - 1;
    return selectSection({ ...editor, livery }, layerSectionId(index));
  }

  if (row.kind === ROW_BUTTON && row.id === "layerRemove") {
    const section = currentSection(editor);
    const layer = createLivery(editor.livery).layers[section.layerIndex];
    if (!layer) return editor;
    return selectSection({ ...editor, livery: removeLayer(editor.livery, layer.id) }, SECTION_PAINT);
  }

  return editor;
}

/** Whether ENTER on this row means anything. Asked before the key is consumed. */
export function rowIsActionable(editor, rowId) {
  const row = rowById(editor, rowId);
  return row ? row.kind === ROW_PICK || row.kind === ROW_BUTTON : false;
}

/**
 * Sets a control straight to a value — what a click or a drag on a bar does, as
 * opposed to stepping it. `ratio` is 0..1 across the bar's width; the field's
 * own limits turn that back into a real value, and it is snapped to the field's
 * step so dragging and arrowing produce the same set of values.
 */
export function setRowRatio(editor, rowId, ratio) {
  const row = rowById(editor, rowId);
  if (!row || !row.limit) return editor;
  const limit = LIVERY_LIMITS[row.limit];
  const clamped = Math.max(0, Math.min(1, ratio));
  const raw = limit.min + clamped * (limit.max - limit.min);
  const snapped = Math.round(raw / limit.step) * limit.step;
  return { ...editor, livery: writePath(editor.livery, row.path, clampField(row.limit, snapped)) };
}

/** Puts the highlight of a `ROW_PICK` row straight on one entry — what a click does. */
export function selectPick(editor, index) {
  return { ...editor, pickIndex: Math.max(0, index) };
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
  if (row.kind === ROW_SECTION) return currentSection(editor).label;
  if (row.kind === ROW_PICK) {
    const option = row.options[Math.max(0, Math.min(row.options.length - 1, editor.pickIndex))];
    return option ? option.label : "";
  }
  if (row.kind === ROW_BUTTON) return "";
  if (row.kind === ROW_PALETTE) return PAINT_PRESETS[editor.paletteIndex].label;
  if (row.kind === ROW_TOGGLE) return readPath(livery, row.path) ? "On" : "Off";
  if (row.kind === ROW_CHOICE) {
    const value = readPath(livery, row.path);
    return row.choices.find((choice) => choice.id === value)?.label ?? "";
  }
  const value = readPath(livery, row.path);
  if (row.kind === ROW_HUE) return `${Math.round(value)}°`;
  // A field that runs through zero prints its sign, because on a signed bar the
  // fill alone cannot say which side of the middle it is on — and for a curve
  // the sign is the whole question of which way the layer bends.
  const percent = Math.round(value * 100);
  const signed = row.limit && LIVERY_LIMITS[row.limit].min < 0 && percent > 0;
  return `${signed ? "+" : ""}${percent}%`;
}

/**
 * Which rows are shown but inert, and why.
 *
 * Dimming rather than hiding is a rule the editor has held from the start: a
 * list that changes length moves every row below it under the cursor, which is
 * how a player deletes a preset they meant to keep. The fade's colour stops obey
 * it for the same reason the underglow's always did.
 */
function isDimmed(livery, row) {
  if (row.id.startsWith("fade") && row.id !== "fadeOn") return livery.fade.enabled !== true;
  if (row.id === "underglowHue" || row.id === "underglowIntensity") {
    return livery.underglow.enabled !== true;
  }
  // A band has no second side, so mirroring one is meaningless rather than off.
  if (row.id === "layerMirrored") {
    const kind = readPath(livery, [...row.path.slice(0, 2), "kind"]);
    return findLayerKind(kind)?.id !== "stripe";
  }
  return false;
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
  const sections = editorSections(editor.livery);
  const open = currentSection(editor);

  return {
    modelId: editor.modelId,
    livery: editor.livery,
    presetId: editor.presetId,
    name: editorPresetName(editor),
    pristine: isPristine(editor),
    section: open.id,
    sections: sections.map((section, index) => ({
      ...section,
      index,
      selected: section.id === open.id,
    })),
    layerCount: editor.livery.layers.length,
    maxLayers: MAX_LAYERS,
    palette: PAINT_PRESETS.map((preset, index) => ({
      ...preset,
      index,
      selected: index === editor.paletteIndex,
    })),
    rows: visibleRows(editor).map((row, index) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      index,
      value: rowText(editor.livery, row, editor),
      ratio: row.limit ? Math.max(0, Math.min(1, rowRatio(editor.livery, row))) : 0,
      hue: row.kind === ROW_HUE ? readPath(editor.livery, row.path) : null,
      // A pick row hands over its whole option list already marked, so the
      // renderer resolves nothing and the hover and the click cannot disagree.
      options: row.kind === ROW_PICK
        ? row.options.map((option, at) => ({
          id: option.id,
          label: option.label,
          index: at,
          selected: at === Math.max(0, Math.min(row.options.length - 1, editor.pickIndex)),
        }))
        : null,
      selected: focus?.kind === "row" && focus.id === row.id,
      dimmed: row.kind === ROW_SECTION ? false : isDimmed(editor.livery, row),
    })),
    actions: editorActions(editor, garage).map((action) => ({
      ...action,
      selected: focus?.kind === "action" && focus.id === action.id,
    })),
  };
}
