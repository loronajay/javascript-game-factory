import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  SECTION_ROWS,
  SECTION_PAINT,
  SECTION_FADE,
  SECTION_TRIM,
  SECTION_GLOW,
  SECTION_NEW_LAYER,
  ROW_SECTION,
  ROW_PICK,
  ROW_BUTTON,
  layerRows,
  layerSectionId,
  editorSections,
  rowsForSection,
  visibleRows,
  selectSection,
  selectPick,
  currentSection,
  activateEditorRow,
  rowIsActionable,
  sectionForRow,
  ACTION_SAVE,
  ACTION_UPDATE,
  ACTION_DELETE,
  ACTION_DONE,
  ROW_PALETTE,
  ROW_CHOICE,
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
  LAYER_PRESETS,
  MAX_LAYERS,
  createLivery,
  describeLivery,
  hueName,
  liveryEquals,
  addLayer,
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

/**
 * Moves the cursor onto a named row, opening the section that holds it.
 *
 * The editor scopes every row lookup to the open section, so a test that
 * addressed a row behind another tab would quietly do nothing rather than fail.
 */
function onRow(editor, rowId, garage = EMPTY) {
  const section = sectionForRow(editor.livery, rowId);
  const open = section ? selectSection(editor, section) : editor;
  return focusEditor(open, { kind: "row", id: rowId }, garage);
}
/** The editor with whichever section owns `rowId` open. */
function withRow(editor, rowId) {
  const section = sectionForRow(editor.livery, rowId);
  return section ? selectSection(editor, section) : editor;
}
function onAction(editor, actionId, garage = EMPTY) {
  return focusEditor(editor, { kind: "action", id: actionId }, garage);
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

/** Every row the editor can ever show, across every section, for one livery. */
function allRows(livery) {
  const rows = [];
  for (const section of editorSections(livery)) {
    rows.push(...rowsForSection(livery, section.id));
  }
  return rows;
}

const LAYERED = addLayer(createLivery(), "stripes");

test("every row names a real livery field with a real limit", () => {
  // A row whose limit does not exist would let the editor select values the
  // normalizer then rejects, which is how a slider ends up not matching the car.
  for (const row of allRows(LAYERED)) {
    if (row.kind === ROW_PALETTE || row.kind === ROW_PICK || row.kind === ROW_BUTTON) continue;
    assert(row.path && row.path.length, `${row.id} has no path`);
    const value = row.path.reduce((v, key) => v?.[key], LAYERED);
    assert(value !== undefined, `${row.id} points at a field that does not exist`);
    if (row.limit) assert(LIVERY_LIMITS[row.limit], `${row.id} names an unknown limit`);
  }
});

test("every choice row carries the catalog it steps through", () => {
  // The catalog rides on the row so one control can serve the finish, the fade
  // direction and a layer's shape. A choice row with no catalog would step
  // through nothing and read as a dead control.
  for (const row of allRows(LAYERED)) {
    if (row.kind !== ROW_CHOICE) continue;
    assert(Array.isArray(row.choices) && row.choices.length > 1, `${row.id} has no choices`);
    for (const choice of row.choices) assert(choice.id && choice.label, `${row.id} has a nameless choice`);
  }
});

test("row ids are unique within every section", () => {
  // Only within: a layer's "Colour" and the base paint's are different controls
  // that legitimately share a name, and they never appear at the same time.
  for (const section of editorSections(LAYERED)) {
    const rows = visibleRows({ livery: LAYERED, section: section.id });
    assertEqual(new Set(rows.map((row) => row.id)).size, rows.length, `${section.id} repeats a row id`);
  }
});

test("every livery field a player can see is reachable from some row", () => {
  // A field with no control is a field nobody can set.
  const covered = new Set(allRows(LAYERED).filter((r) => r.path).map((r) => r.path.join(".")));
  for (const path of [
    "paint.hue", "paint.saturation", "paint.brightness", "paint.finish",
    "fade.enabled", "fade.axis", "fade.hue", "fade.saturation", "fade.brightness",
    "windowTint", "tailLightHue",
    "underglow.enabled", "underglow.hue", "underglow.intensity",
    "layers.0.kind", "layers.0.position", "layers.0.size", "layers.0.feather",
    "layers.0.mirrored", "layers.0.paint.hue", "layers.0.paint.saturation",
    "layers.0.paint.brightness", "layers.0.paint.finish",
  ]) {
    assert(covered.has(path), `${path} has no control in the editor`);
  }
});

test("an unknown row resolves to null rather than undefined behaviour", () => {
  assertEqual(rowById(open(), "spoiler"), null);
});

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

test("up and down walk rows and actions as one list", () => {
  let editor = open();
  const rows = visibleRows(editor);
  // Row zero is the section tab strip, so it is where the cursor starts.
  assertEqual(editorFocus(editor, EMPTY).id, rows[0].id);
  assertEqual(rows[0].kind, ROW_SECTION);
  editor = moveEditor(editor, "down", EMPTY);
  assertEqual(editorFocus(editor, EMPTY).id, rows[1].id);
  // Walking past the last row lands on the first action with no special step.
  let far = open();
  for (let i = 0; i < rows.length; i += 1) far = moveEditor(far, "down", EMPTY);
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
  let editor = adjustRow(withRow(open(), "underglowOn"), "underglowOn", 1);
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
  assertEqual(setRowRatio(withRow(open(), "windowTint"), "windowTint", -3).livery.windowTint, LIVERY_LIMITS.windowTint.min);
  assertEqual(setRowRatio(withRow(open(), "windowTint"), "windowTint", 4).livery.windowTint, LIVERY_LIMITS.windowTint.max);
});

test("every adjusted value survives normalization unchanged", () => {
  // The editor and the normalizer read the same limits, so nothing the editor
  // can produce may be altered on the way into a preset.
  let editor = open();
  for (const row of visibleRows(open())) {
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
  //
  // The bands moved when the brightness floor came down to reach real black:
  // 0.7 used to be the darkest paint there was and so was called black, and is
  // now an unremarkable mid grey with a genuinely black one far below it.
  assertEqual(describeLivery({ paint: { hue: 0, saturation: 0, brightness: 1 } }), "Silver");
  assertEqual(describeLivery({ paint: { hue: 200, saturation: 0, brightness: 0.7 } }), "Silver");
  assertEqual(describeLivery({ paint: { hue: 200, saturation: 0, brightness: 0.16 } }), "Black");
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
  assertEqual(view.rows.length, visibleRows(open()).length);
  for (const row of view.rows) {
    assert(row.label && row.value !== undefined, `${row.id} is missing display text`);
    assert(row.ratio >= 0 && row.ratio <= 1, `${row.id} bar fill out of range: ${row.ratio}`);
  }
});

test("the underglow colour rows dim when the glow is off but stay in the list", () => {
  // A control list that changes length as you flip a switch moves every row
  // below it under the cursor — which is how you delete a preset you meant to
  // keep.
  const glow = withRow(open(), "underglowOn");
  const off = editorView(glow, EMPTY);
  const on = editorView(adjustRow(glow, "underglowOn", 1), EMPTY);
  assertEqual(off.rows.length, on.rows.length);
  assertEqual(off.rows.find((row) => row.id === "underglowHue").dimmed, true);
  assertEqual(on.rows.find((row) => row.id === "underglowHue").dimmed, false);
});

test("the fade colour rows dim when the fade is off but stay in the list", () => {
  // Same rule one section over. Turning a fade off keeps its stops, so the rows
  // still hold real values and still have to be there to hold them.
  const fade = withRow(open(), "fadeOn");
  const off = editorView(fade, EMPTY);
  const on = editorView(adjustRow(fade, "fadeOn", 1), EMPTY);
  assertEqual(off.rows.length, on.rows.length);
  assertEqual(off.rows.find((row) => row.id === "fadeHue").dimmed, true);
  assertEqual(on.rows.find((row) => row.id === "fadeHue").dimmed, false);
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

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

test("the editor opens on the paint section with the cursor on the tab strip", () => {
  const editor = open();
  assertEqual(currentSection(editor).id, SECTION_PAINT);
  assertEqual(visibleRows(editor)[0].kind, ROW_SECTION);
  assertEqual(editor.cursor, 0);
});

test("left and right on the tab strip walk the sections", () => {
  let editor = open();
  const sections = editorSections(editor.livery);
  editor = moveEditor(editor, "right", EMPTY);
  assertEqual(currentSection(editor).id, sections[1].id);
  editor = moveEditor(editor, "left", EMPTY);
  assertEqual(currentSection(editor).id, sections[0].id);
  // ...and stop rather than wrapping, like every other cursor in the cabinet.
  for (let i = 0; i < 20; i += 1) editor = moveEditor(editor, "left", EMPTY);
  assertEqual(currentSection(editor).id, sections[0].id);
  for (let i = 0; i < 40; i += 1) editor = moveEditor(editor, "right", EMPTY);
  assertEqual(currentSection(editor).id, sections.at(-1).id);
});

test("changing section puts the cursor back on the strip", () => {
  // Sections hold different numbers of rows, so a preserved index would land
  // somewhere arbitrary — and someone who just changed tab is still choosing.
  let editor = onRow(open(), "finish");
  assert(editor.cursor > 0, "the fixture did not move the cursor");
  editor = selectSection(editor, SECTION_TRIM);
  assertEqual(editor.cursor, 0);
});

test("selecting a section that does not exist leaves the editor alone", () => {
  const editor = open();
  assertDeepEqual(selectSection(editor, "exhaust"), editor);
  // ...including a layer section on a car with no layers.
  assertDeepEqual(selectSection(editor, layerSectionId(0)), editor);
});

test("every section has rows, and only the fixed ones are listed as a catalog", () => {
  const livery = addLayer(createLivery(), "roof");
  for (const section of editorSections(livery)) {
    const rows = rowsForSection(livery, section.id);
    assert(rows.length > 0, `${section.id} has no controls`);
  }
  for (const id of [SECTION_PAINT, SECTION_FADE, SECTION_TRIM, SECTION_GLOW, SECTION_NEW_LAYER]) {
    assert(SECTION_ROWS[id], `${id} is not in the row catalog`);
  }
});

test("an unknown section falls back to paint rather than showing nothing", () => {
  assertDeepEqual(rowsForSection(createLivery(), "exhaust"), SECTION_ROWS[SECTION_PAINT]);
});

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

test("a car with no layers offers the add tab and no layer tabs", () => {
  const ids = editorSections(createLivery()).map((section) => section.id);
  assert(ids.includes(SECTION_NEW_LAYER), "there is no way to add a layer");
  assert(!ids.some((id) => id.startsWith("layer-")), "an empty car showed a layer tab");
});

test("the add tab disappears at the ceiling rather than going inert", () => {
  // An "add" that never adds is worse than one that is not offered — the player
  // presses it, nothing happens, and they go looking for the bug.
  let livery = createLivery();
  for (let i = 0; i < MAX_LAYERS; i += 1) livery = addLayer(livery, "stripes");
  const ids = editorSections(livery).map((section) => section.id);
  assert(!ids.includes(SECTION_NEW_LAYER), "the add tab survived a full car");
  assertEqual(ids.filter((id) => id.startsWith("layer-")).length, MAX_LAYERS);
});

test("adding a layer jumps to it, because colouring it is the next thing", () => {
  let editor = selectSection(open(), SECTION_NEW_LAYER);
  const roof = LAYER_PRESETS.findIndex((preset) => preset.id === "roof");
  editor = activateEditorRow(selectPick(editor, roof), "layerPreset");

  assertEqual(editor.livery.layers.length, 1);
  assertEqual(currentSection(editor).id, layerSectionId(0));
  assertEqual(editor.livery.layers[0].kind, LAYER_PRESETS[roof].kind);
});

test("stepping the layer picker highlights without adding anything", () => {
  // Holding ▶ on a picker that committed as it moved would fill every slot.
  let editor = selectSection(open(), SECTION_NEW_LAYER);
  for (let i = 0; i < 6; i += 1) editor = adjustRow(editor, "layerPreset", 1);
  assertEqual(editor.livery.layers.length, 0);
  assert(editor.pickIndex > 0, "the highlight did not move");
  assertEqual(currentSection(editor).id, SECTION_NEW_LAYER);
});

test("the picker's highlight stops at both ends of the catalog", () => {
  let editor = selectSection(open(), SECTION_NEW_LAYER);
  for (let i = 0; i < 40; i += 1) editor = adjustRow(editor, "layerPreset", 1);
  assertEqual(editor.pickIndex, LAYER_PRESETS.length - 1);
  for (let i = 0; i < 40; i += 1) editor = adjustRow(editor, "layerPreset", -1);
  assertEqual(editor.pickIndex, 0);
});

test("removing a layer takes the cursor somewhere that still exists", () => {
  // The section it was standing in is gone, so staying put would leave the
  // cursor addressing a tab that no longer has rows.
  let editor = { ...open(), livery: addLayer(createLivery(), "roof") };
  editor = selectSection(editor, layerSectionId(0));
  editor = activateEditorRow(editor, "layerRemove");

  assertEqual(editor.livery.layers.length, 0);
  assertEqual(currentSection(editor).id, SECTION_PAINT);
});

test("a layer's controls write into that layer and not another", () => {
  // The path runs through an array index, and spreading an array into an object
  // literal turns it into a plain object — which normalizes back to no layers at
  // all, silently and completely.
  let editor = { ...open(), livery: addLayer(addLayer(createLivery(), "roof"), "stripes") };
  editor = selectSection(editor, layerSectionId(1));
  editor = adjustRow(editor, "layerPosition", 1);

  assertEqual(Array.isArray(editor.livery.layers), true, "the layer list stopped being an array");
  assertEqual(editor.livery.layers.length, 2);
  assert(editor.livery.layers[1].position !== editor.livery.layers[0].position,
    "the control wrote into the wrong layer");
});

test("a layer's colour is its own, not the body's", () => {
  let editor = { ...open(), livery: addLayer(createLivery(), "roof") };
  editor = selectSection(editor, layerSectionId(0));
  const before = editor.livery.paint.hue;
  editor = adjustRow(editor, "layerHue", 3);
  assertEqual(editor.livery.paint.hue, before, "a layer control moved the body paint");
  assert(editor.livery.layers[0].paint.hue !== before);
});

test("mirror dims on a band, because a band has no other side", () => {
  let editor = { ...open(), livery: addLayer(createLivery(), "roof") };
  editor = selectSection(editor, layerSectionId(0));
  const band = editorView(editor, EMPTY);
  assertEqual(band.rows.find((row) => row.id === "layerMirrored").dimmed, true);

  const striped = editorView(adjustRow(editor, "layerKind", 1), EMPTY);
  assertEqual(striped.rows.find((row) => row.id === "layerMirrored").dimmed, false);
  assertEqual(band.rows.length, striped.rows.length, "the row vanished instead of dimming");
});

// ---------------------------------------------------------------------------
// Rows that do something rather than hold something
// ---------------------------------------------------------------------------

test("only the picker and the remove button answer to ENTER", () => {
  const paint = open();
  for (const row of visibleRows(paint)) {
    assertEqual(rowIsActionable(paint, row.id), false, `${row.id} claimed to be actionable`);
  }
  const adding = selectSection(paint, SECTION_NEW_LAYER);
  assertEqual(rowIsActionable(adding, "layerPreset"), true);

  let layered = { ...open(), livery: addLayer(createLivery(), "roof") };
  layered = selectSection(layered, layerSectionId(0));
  assertEqual(rowIsActionable(layered, "layerRemove"), true);
  assertEqual(rowIsActionable(layered, "layerHue"), false);
});

test("left and right on a button do nothing", () => {
  // The same rule that keeps a stray arrow off DELETE.
  let editor = { ...open(), livery: addLayer(createLivery(), "roof") };
  editor = selectSection(editor, layerSectionId(0));
  const parked = onRow(editor, "layerRemove");
  assertDeepEqual(moveEditor(parked, "left", EMPTY), parked);
  assertDeepEqual(moveEditor(parked, "right", EMPTY), parked);
});

test("activating a row that does nothing leaves the editor untouched", () => {
  const editor = onRow(open(), "hue");
  assertDeepEqual(activateEditorRow(editor, "hue"), editor);
  assertDeepEqual(activateEditorRow(editor, "nonsense"), editor);
});

test("the view hands the renderer a marked option list, resolving nothing itself", () => {
  const editor = selectPick(selectSection(open(), SECTION_NEW_LAYER), 2);
  const row = editorView(editor, EMPTY).rows.find((entry) => entry.kind === ROW_PICK);
  assertEqual(row.options.length, LAYER_PRESETS.length);
  assertEqual(row.options.filter((option) => option.selected).length, 1);
  assertEqual(row.options.findIndex((option) => option.selected), 2);
});

test("the view says how many layer slots are spent", () => {
  const editor = { ...open(), livery: addLayer(createLivery(), "roof") };
  const view = editorView(editor, EMPTY);
  assertEqual(view.layerCount, 1);
  assertEqual(view.maxLayers, MAX_LAYERS);
  assertEqual(view.sections.filter((section) => section.selected).length, 1);
});

finish();
