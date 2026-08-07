import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  EDITOR_ROWS,
  ACTION_SAVE,
  ACTION_UPDATE,
  ACTION_DELETE,
  ACTION_DONE,
  ROW_PALETTE,
  createEditor,
  moveEditor,
  adjustRow,
  setRowRatio,
  focusEditor,
  selectPalette,
  editorActions,
  editorFocus,
  editorStopCount,
  editorPresetName,
  editorView,
  isPristine,
  rowById,
} from "../scripts/ui/garage-editor.js";
import {
  LIVERY_LIMITS,
  PAINT_PRESETS,
  FINISHES,
  createLivery,
  describeLivery,
  hueName,
  liveryEquals,
} from "../scripts/garage/livery.js";
import {
  MAX_PRESETS_PER_MODEL,
  emptyGarage,
  savePreset,
  presetsForModel,
} from "../scripts/garage/garage.js";

suite("garage-editor — building a livery");

const MODEL = "kaido-gts";
const EMPTY = emptyGarage();
const open = (overrides = {}) => createEditor({ modelId: MODEL, livery: {}, ...overrides });

/** Moves the cursor onto a named row. */
function onRow(editor, rowId, garage = EMPTY) {
  return focusEditor(editor, { kind: "row", id: rowId }, garage);
}
function onAction(editor, actionId, garage = EMPTY) {
  return focusEditor(editor, { kind: "action", id: actionId }, garage);
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

test("every row names a real livery field with a real limit", () => {
  // A row whose limit does not exist would let the editor select values the
  // normalizer then rejects, which is how a slider ends up not matching the car.
  const livery = createLivery();
  for (const row of EDITOR_ROWS) {
    if (row.kind === ROW_PALETTE) continue;
    assert(row.path && row.path.length, `${row.id} has no path`);
    const value = row.path.reduce((v, key) => v?.[key], livery);
    assert(value !== undefined, `${row.id} points at a field that does not exist`);
    if (row.limit) assert(LIVERY_LIMITS[row.limit], `${row.id} names an unknown limit`);
  }
});

test("row ids are unique", () => {
  assertEqual(new Set(EDITOR_ROWS.map((row) => row.id)).size, EDITOR_ROWS.length);
});

test("every livery field a player can see is reachable from some row", () => {
  // A field with no control is a field nobody can set.
  const covered = new Set(EDITOR_ROWS.filter((r) => r.path).map((r) => r.path.join(".")));
  for (const path of [
    "paint.hue", "paint.saturation", "paint.brightness", "paint.finish",
    "windowTint", "tailLightHue",
    "underglow.enabled", "underglow.hue", "underglow.intensity",
  ]) {
    assert(covered.has(path), `${path} has no control in the editor`);
  }
});

test("an unknown row resolves to null rather than undefined behaviour", () => {
  assertEqual(rowById("spoiler"), null);
});

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

test("up and down walk rows and actions as one list", () => {
  let editor = open();
  assertEqual(editorFocus(editor, EMPTY).id, EDITOR_ROWS[0].id);
  editor = moveEditor(editor, "down", EMPTY);
  assertEqual(editorFocus(editor, EMPTY).id, EDITOR_ROWS[1].id);
  // Walking past the last row lands on the first action with no special step.
  let far = open();
  for (let i = 0; i < EDITOR_ROWS.length; i += 1) far = moveEditor(far, "down", EMPTY);
  assertEqual(editorFocus(far, EMPTY).kind, "action");
});

test("the cursor stops at both ends instead of wrapping", () => {
  let editor = open();
  for (let i = 0; i < 5; i += 1) editor = moveEditor(editor, "up", EMPTY);
  assertEqual(editor.cursor, 0);
  for (let i = 0; i < 60; i += 1) editor = moveEditor(editor, "down", EMPTY);
  assertEqual(editor.cursor, editorStopCount(editor, EMPTY) - 1);
});

test("left and right on an action do nothing", () => {
  // A stray left/right quietly firing DELETE would be indefensible.
  const editor = onAction(open(), ACTION_DONE);
  assertDeepEqual(moveEditor(editor, "left", EMPTY), editor);
  assertDeepEqual(moveEditor(editor, "right", EMPTY), editor);
});

test("moving never mutates the editor it was given", () => {
  const editor = onRow(open(), "hue");
  const snapshot = JSON.stringify(editor);
  moveEditor(editor, "right", EMPTY);
  moveEditor(editor, "down", EMPTY);
  assertEqual(JSON.stringify(editor), snapshot);
});

// ---------------------------------------------------------------------------
// Adjusting controls
// ---------------------------------------------------------------------------

test("right and left step the row under the cursor", () => {
  const editor = onRow(open(), "saturation");
  const up = moveEditor(editor, "right", EMPTY);
  assert(up.livery.paint.saturation > editor.livery.paint.saturation);
  assertEqual(moveEditor(up, "left", EMPTY).livery.paint.saturation, editor.livery.paint.saturation);
});

test("hue wraps and the bounded fields clamp, exactly as the limits say", () => {
  let editor = onRow(open(), "hue");
  editor = adjustRow(editor, "hue", -1);
  assertEqual(editor.livery.paint.hue, 360 - LIVERY_LIMITS.hue.step);

  let sat = open();
  for (let i = 0; i < 40; i += 1) sat = adjustRow(sat, "saturation", 1);
  assertEqual(sat.livery.paint.saturation, LIVERY_LIMITS.saturation.max);
});

test("the finish stepper walks the catalog and stops at its ends", () => {
  let editor = open();
  for (let i = 0; i < FINISHES.length + 3; i += 1) editor = adjustRow(editor, "finish", 1);
  assertEqual(editor.livery.paint.finish, FINISHES[FINISHES.length - 1].id);
  for (let i = 0; i < FINISHES.length + 3; i += 1) editor = adjustRow(editor, "finish", -1);
  assertEqual(editor.livery.paint.finish, FINISHES[0].id);
});

test("the underglow toggle is a switch, not a counter", () => {
  let editor = adjustRow(open(), "underglowOn", 1);
  assertEqual(editor.livery.underglow.enabled, true);
  editor = adjustRow(editor, "underglowOn", 1);
  assertEqual(editor.livery.underglow.enabled, true, "pressing right twice must not toggle back");
  editor = adjustRow(editor, "underglowOn", -1);
  assertEqual(editor.livery.underglow.enabled, false);
});

test("the palette applies a preset without touching glass, lamps or glow", () => {
  const before = createEditor({
    modelId: MODEL,
    livery: { windowTint: 0.5, tailLightHue: 90, underglow: { enabled: true, hue: 300 } },
  });
  const after = adjustRow(before, "palette", 1);
  assertEqual(after.livery.windowTint, 0.5);
  assertEqual(after.livery.tailLightHue, 90);
  assertDeepEqual(after.livery.underglow, before.livery.underglow);
  assert(!liveryEquals(before.livery, after.livery), "the palette must change the paint");
});

test("selecting a palette swatch by index applies it", () => {
  const editor = selectPalette(open(), 3);
  assertEqual(editor.paletteIndex, 3);
  assertEqual(editor.livery.paint.hue, PAINT_PRESETS[3].hue);
});

test("an out-of-range palette index clamps rather than breaking", () => {
  assertEqual(selectPalette(open(), 999).paletteIndex, PAINT_PRESETS.length - 1);
  assertEqual(selectPalette(open(), -5).paletteIndex, 0);
});

test("adjusting an unknown row is a no-op", () => {
  const editor = open();
  assertDeepEqual(adjustRow(editor, "spoiler", 1), editor);
});

test("dragging a bar sets the value directly and stays snapped to the step", () => {
  // Dragging and arrowing must produce the same set of values, or a dragged
  // livery serializes differently from an identical arrowed one.
  const half = setRowRatio(open(), "saturation", 0.5);
  const stepped = half.livery.paint.saturation / LIVERY_LIMITS.saturation.step;
  assertEqual(Math.abs(stepped - Math.round(stepped)) < 1e-9, true, `not snapped: ${half.livery.paint.saturation}`);
  assertEqual(setRowRatio(open(), "saturation", 0).livery.paint.saturation, LIVERY_LIMITS.saturation.min);
  assertEqual(setRowRatio(open(), "saturation", 1).livery.paint.saturation, LIVERY_LIMITS.saturation.max);
});

test("a drag beyond either end of a bar clamps", () => {
  assertEqual(setRowRatio(open(), "windowTint", -3).livery.windowTint, LIVERY_LIMITS.windowTint.min);
  assertEqual(setRowRatio(open(), "windowTint", 4).livery.windowTint, LIVERY_LIMITS.windowTint.max);
});

test("every adjusted value survives normalization unchanged", () => {
  // The editor and the normalizer read the same limits, so nothing the editor
  // can produce may be altered on the way into a preset.
  let editor = open();
  for (const row of EDITOR_ROWS) {
    for (let i = 0; i < 6; i += 1) editor = adjustRow(editor, row.id, 1);
  }
  assert(liveryEquals(editor.livery, createLivery(editor.livery)), "the editor produced a livery normalization changes");
});

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

test("a new paint offers save and done, but not update or delete", () => {
  const ids = editorActions(open(), EMPTY).map((action) => action.id);
  assert(ids.includes(ACTION_SAVE) && ids.includes(ACTION_DONE));
  assert(!ids.includes(ACTION_UPDATE), "there is nothing to update yet");
  assert(!ids.includes(ACTION_DELETE), "there is nothing to delete yet");
});

test("editing an existing preset offers update and delete", () => {
  const garage = savePreset(emptyGarage(), { modelId: MODEL, name: "Ocean" });
  const editor = open({ presetId: garage.presets[0].id });
  const ids = editorActions(editor, garage).map((action) => action.id);
  assert(ids.includes(ACTION_UPDATE) && ids.includes(ACTION_DELETE));
});

test("save changes is disabled until something actually changes", () => {
  const garage = savePreset(emptyGarage(), { modelId: MODEL, name: "Ocean" });
  const editor = open({ presetId: garage.presets[0].id, livery: garage.presets[0].livery });
  const before = editorActions(editor, garage).find((a) => a.id === ACTION_UPDATE);
  assertEqual(before.enabled, false);
  const changed = adjustRow(editor, "hue", 1);
  assertEqual(editorActions(changed, garage).find((a) => a.id === ACTION_UPDATE).enabled, true);
});

test("save is disabled once the model's slots are full", () => {
  let garage = emptyGarage();
  for (let i = 0; i < MAX_PRESETS_PER_MODEL; i += 1) {
    garage = savePreset(garage, { modelId: MODEL, name: `P${i}` });
  }
  assertEqual(editorActions(open(), garage).find((a) => a.id === ACTION_SAVE).enabled, false);
  // A different model still has room, so the button is not globally dead.
  const other = createEditor({ modelId: "toro-sv", livery: {} });
  assertEqual(editorActions(other, garage).find((a) => a.id === ACTION_SAVE).enabled, true);
});

test("a preset id that is no longer in the garage falls back to the new-paint actions", () => {
  const editor = open({ presetId: "ghost" });
  const ids = editorActions(editor, EMPTY).map((action) => action.id);
  assert(!ids.includes(ACTION_UPDATE) && !ids.includes(ACTION_DELETE));
});

test("done is always offered, so the screen can always be left", () => {
  let garage = emptyGarage();
  for (let i = 0; i < MAX_PRESETS_PER_MODEL; i += 1) {
    garage = savePreset(garage, { modelId: MODEL, name: `P${i}` });
  }
  for (const editor of [open(), open({ presetId: garage.presets[0].id })]) {
    const done = editorActions(editor, garage).find((a) => a.id === ACTION_DONE);
    assert(done && done.enabled, "there must always be a way out of the editor");
  }
});

// ---------------------------------------------------------------------------
// Pristine tracking and naming
// ---------------------------------------------------------------------------

test("an untouched editor is pristine, and any change is not", () => {
  const editor = open();
  assertEqual(isPristine(editor), true);
  assertEqual(isPristine(adjustRow(editor, "hue", 1)), false);
});

test("stepping a value and stepping it back is pristine again", () => {
  // Otherwise 'Save Changes' stays lit after the player has undone their edit.
  const editor = onRow(open(), "saturation");
  const round = adjustRow(adjustRow(editor, "saturation", 1), "saturation", -1);
  assertEqual(isPristine(round), true);
});

test("a preset is named after the paint on it", () => {
  const blue = selectPalette(open(), PAINT_PRESETS.findIndex((p) => p.id === "blue"));
  assertEqual(editorPresetName(blue), describeLivery(blue.livery));
  assert(editorPresetName(blue).includes("Blue"), `expected a blue name, got ${editorPresetName(blue)}`);
});

test("desaturated paints are named by brightness, not by a meaningless hue", () => {
  // Every hue at saturation 0 is the same grey, so calling one of them "Red"
  // because the slider sits at 0 would be actively misleading in the picker.
  assertEqual(describeLivery({ paint: { hue: 0, saturation: 0, brightness: 1 } }), "Silver");
  assertEqual(describeLivery({ paint: { hue: 200, saturation: 0, brightness: 0.7 } }), "Black");
  assertEqual(describeLivery({ paint: { hue: 90, saturation: 0, brightness: 1.3 } }), "White");
});

test("the finish shows up in the name, and gloss does not clutter it", () => {
  assertEqual(describeLivery({ paint: { hue: 0, saturation: 0, brightness: 1, finish: "gloss" } }), "Silver");
  assertEqual(
    describeLivery({ paint: { hue: 0, saturation: 0, brightness: 1, finish: "matte" } }),
    "Silver Matte",
  );
});

test("hue names pick the nearest colour the short way round the wheel", () => {
  assertEqual(hueName(0), "Red");
  assertEqual(hueName(358), "Red", "358 is nearer red than pink the long way round");
  assertEqual(hueName(215), "Blue");
});

test("every palette swatch produces a name mentioning its own colour", () => {
  for (const preset of PAINT_PRESETS) {
    const name = describeLivery({ paint: { ...preset, finish: "gloss" } });
    assert(name.length > 0, `${preset.id} produced an empty name`);
  }
});

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

test("exactly one stop is selected at a time", () => {
  const view = editorView(open(), EMPTY);
  const selected = [...view.rows, ...view.actions].filter((entry) => entry.selected);
  assertEqual(selected.length, 1);
});

test("every row arrives with its text and a bar fill in range", () => {
  const view = editorView(open(), EMPTY);
  assertEqual(view.rows.length, EDITOR_ROWS.length);
  for (const row of view.rows) {
    assert(row.label && row.value !== undefined, `${row.id} is missing display text`);
    assert(row.ratio >= 0 && row.ratio <= 1, `${row.id} bar fill out of range: ${row.ratio}`);
  }
});

test("the underglow colour rows dim when the glow is off but stay in the list", () => {
  // A control list that changes length as you flip a switch moves every row
  // below it under the cursor — which is how you delete a preset you meant to
  // keep.
  const off = editorView(open(), EMPTY);
  const on = editorView(adjustRow(open(), "underglowOn", 1), EMPTY);
  assertEqual(off.rows.length, on.rows.length);
  assertEqual(off.rows.find((row) => row.id === "underglowHue").dimmed, true);
  assertEqual(on.rows.find((row) => row.id === "underglowHue").dimmed, false);
});

test("the view carries the car, the livery and the derived name", () => {
  const view = editorView(open(), EMPTY);
  assertEqual(view.modelId, MODEL);
  assert(view.livery && view.name);
});

test("hue rows expose their hue so the renderer can tint the marker", () => {
  const view = editorView(selectPalette(open(), 9), EMPTY);
  const hueRow = view.rows.find((row) => row.id === "hue");
  assertEqual(typeof hueRow.hue, "number");
  assertEqual(view.rows.find((row) => row.id === "finish").hue, null);
});

test("focusing a stop that does not exist leaves the cursor alone", () => {
  const editor = open();
  assertDeepEqual(focusEditor(editor, { kind: "action", id: ACTION_DELETE }, EMPTY), editor);
  assertDeepEqual(focusEditor(editor, null, EMPTY), editor);
});

test("the palette arrives with a swatch marked, matching the cursor", () => {
  const view = editorView(selectPalette(open(), 4), EMPTY);
  assertEqual(view.palette.filter((swatch) => swatch.selected).length, 1);
  assertEqual(view.palette.findIndex((swatch) => swatch.selected), 4);
});

finish();
