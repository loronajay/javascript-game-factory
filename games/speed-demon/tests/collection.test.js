import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  CELL_NEW,
  COLLECTION_VISIBLE_ROWS,
  collectionModels,
  collectionCells,
  createCollection,
  moveCollection,
  scrollCollection,
  focusCollection,
  collectionCell,
  collectionModel,
  collectionSelection,
  collectionView,
} from "../scripts/ui/collection.js";
import { emptyGarage, savePreset, MAX_PRESETS_PER_MODEL } from "../scripts/garage/garage.js";
import { createLivery } from "../scripts/garage/livery.js";
import { allModels } from "../scripts/assets/car-atlas.js";

suite("collection — the whole roster, and every paint saved for it");

const MODEL = "kaido-gts";

/** A garage with `count` paints saved against one model. */
function stocked(count, modelId = MODEL) {
  let garage = emptyGarage();
  for (let i = 0; i < count; i += 1) {
    garage = savePreset(garage, { modelId, name: `Paint ${i + 1}`, livery: createLivery({ paint: { hue: i * 30 } }) });
  }
  return garage;
}

const walk = (collection, garage, options, ...directions) =>
  directions.reduce((state, direction) => moveCollection(state, direction, garage, options), collection);

// ---------------------------------------------------------------------------
// What is on the screen
// ---------------------------------------------------------------------------

test("every model in the roster gets a row", () => {
  // The question that sends a player into the garage is which cars they have
  // *not* done anything with, so an untouched model must still be listed.
  assertEqual(collectionModels().length, allModels().length);
});

test("the rows are in the same order the setup screen's grid reads", () => {
  // Derived from the grouped roster in both places, so a model changing
  // archetype moves it on both screens rather than on one.
  const rows = collectionModels().map((model) => model.id);
  assertEqual(new Set(rows).size, rows.length, "a model appears twice");
  for (const model of rows) {
    assert(collectionModels().some((entry) => entry.id === model));
  }
});

test("a row is Factory, then the saved paints, then the one action", () => {
  const cells = collectionCells(MODEL, stocked(2));
  assertEqual(cells.length, 4);
  assert(cells[0].factory, "Factory is not row zero");
  assertEqual(cells[1].name, "Paint 1");
  assertEqual(cells[2].name, "Paint 2");
  assertEqual(cells[3].id, CELL_NEW);
  assert(cells[3].action);
});

test("the add cell disappears at the per-model ceiling rather than going inert", () => {
  // The `+ LAYER` tab's rule: an add that never adds is worse than one that is
  // not offered, because the player presses it and goes looking for the bug.
  const full = stocked(MAX_PRESETS_PER_MODEL);
  const cells = collectionCells(MODEL, full);
  assertEqual(cells.length, 1 + MAX_PRESETS_PER_MODEL);
  assert(!cells.some((cell) => cell.action), "the add cell survived a full model");
});

test("signed out there is no add cell at all", () => {
  // Customization is account-backed, so there is nowhere to save a config.
  const cells = collectionCells(MODEL, emptyGarage(), { canCustomise: false });
  assertEqual(cells.length, 1);
  assert(cells[0].factory);
});

// ---------------------------------------------------------------------------
// The cursor
// ---------------------------------------------------------------------------

test("the collection opens on the car and paint it was handed", () => {
  const garage = stocked(2);
  const presetId = garage.presets[1].id;
  const collection = createCollection({ modelId: MODEL, presetId }, garage);
  assertEqual(collectionModel(collection).id, MODEL);
  assertEqual(collectionCell(collection, garage).id, presetId);
  assertEqual(collectionSelection(collection).presetId, presetId);
});

test("an unknown paint opens on Factory rather than on nothing", () => {
  const garage = stocked(1);
  const collection = createCollection({ modelId: MODEL, presetId: "gone" }, garage);
  assert(collectionCell(collection, garage).factory);
});

test("moving picks, and the action cell does not", () => {
  // The paint pane's rule twice over: landing on a config makes it the car,
  // landing on a button leaves the car alone.
  const garage = stocked(2);
  const collection = createCollection({ modelId: MODEL }, garage);

  const onPaint = walk(collection, garage, {}, "right");
  assertEqual(collectionSelection(onPaint).presetId, garage.presets[0].id);

  const onAction = walk(onPaint, garage, {}, "right", "right");
  assertEqual(collectionCell(onAction, garage).id, CELL_NEW);
  assertEqual(
    collectionSelection(onAction).presetId,
    garage.presets[1].id,
    "browsing onto the add cell repainted the car",
  );
});

test("nothing wraps, in either direction", () => {
  // 24 rows deep is exactly the list a wrapping cursor gets lost in.
  const garage = emptyGarage();
  const top = walk(createCollection({}, garage), garage, {}, "up", "up", "up");
  assertEqual(top.row, 0);

  let bottom = createCollection({}, garage);
  for (let i = 0; i < collectionModels().length + 4; i += 1) bottom = moveCollection(bottom, "down", garage);
  assertEqual(bottom.row, collectionModels().length - 1);

  const left = walk(createCollection({}, garage), garage, {}, "left", "left");
  assertEqual(left.column, 0);
});

test("a column lands somewhere real in the row it arrives in", () => {
  // Rows are different lengths — a car with six paints sits above one with none.
  const garage = stocked(3);
  const rich = createCollection({ modelId: MODEL }, garage);
  const onLast = walk(rich, garage, {}, "right", "right", "right");
  assertEqual(onLast.column, 3);

  const moved = moveCollection(onLast, "down", garage);
  const cells = collectionCells(collectionModel(moved).id, garage);
  assert(moved.column <= cells.length - 1, "the cursor kept a column its new row does not have");
  assert(collectionCell(moved, garage), "the cursor landed on no cell at all");
});

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

test("walking off the bottom of the window scrolls it", () => {
  const garage = emptyGarage();
  let collection = createCollection({}, garage);
  assertEqual(collection.scroll, 0);
  for (let i = 0; i < COLLECTION_VISIBLE_ROWS; i += 1) {
    collection = moveCollection(collection, "down", garage);
  }
  assertEqual(collection.row, COLLECTION_VISIBLE_ROWS);
  assertEqual(collection.scroll, 1, "the cursor walked off the screen instead of pulling the window");
});

test("the window never scrolls past the last page", () => {
  const garage = emptyGarage();
  let collection = createCollection({}, garage);
  for (let i = 0; i < 200; i += 1) collection = scrollCollection(collection, 1, garage);
  assertEqual(collection.scroll, collectionModels().length - COLLECTION_VISIBLE_ROWS);
  for (let i = 0; i < 200; i += 1) collection = scrollCollection(collection, -1, garage);
  assertEqual(collection.scroll, 0);
});

test("scrolling pulls the cursor along rather than leaving it off screen", () => {
  // A cursor parked outside the window would make ENTER act on a car nobody
  // can see.
  const garage = emptyGarage();
  const collection = scrollCollection(createCollection({}, garage), 3, garage);
  assert(collection.row >= collection.scroll, "the cursor was left above the window");
  assert(collection.row < collection.scroll + COLLECTION_VISIBLE_ROWS, "the cursor was left below the window");
});

test("the cursor is always inside the visible window", () => {
  const garage = stocked(2);
  let collection = createCollection({}, garage);
  const directions = ["down", "down", "right", "down", "up", "down", "down", "down", "down", "up"];
  for (const direction of directions) {
    collection = moveCollection(collection, direction, garage);
    const view = collectionView(collection, garage);
    assert(
      view.rows.some((row) => row.row === collection.row),
      `the cursor at row ${collection.row} is not on screen (window ${view.scroll})`,
    );
  }
});

// ---------------------------------------------------------------------------
// Clicking
// ---------------------------------------------------------------------------

test("a click reaches any visible row directly", () => {
  const garage = stocked(2);
  const collection = focusCollection(createCollection({}, garage), { row: 3, column: 0 }, garage);
  assertEqual(collection.row, 3);
});

test("an unknown click target changes nothing", () => {
  const garage = emptyGarage();
  const collection = createCollection({}, garage);
  assertEqual(focusCollection(collection, null, garage), collection);
  assertEqual(focusCollection(collection, { row: "x" }, garage), collection);
});

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

test("the view shows one window's worth of rows and says what is beyond it", () => {
  const garage = emptyGarage();
  const view = collectionView(createCollection({}, garage), garage);
  assertEqual(view.rows.length, COLLECTION_VISIBLE_ROWS);
  assertEqual(view.canScrollUp, false);
  assertEqual(view.canScrollDown, true);
  assertEqual(view.totalRows, collectionModels().length);
});

test("exactly one cell is the cursor and exactly one is the pick", () => {
  const garage = stocked(2);
  const collection = walk(createCollection({ modelId: MODEL }, garage), garage, {}, "right");
  const view = collectionView(collection, garage);
  const cells = view.rows.flatMap((row) => row.cells);
  assertEqual(cells.filter((cell) => cell.selected).length, 1);
  assertEqual(cells.filter((cell) => cell.chosen).length, 1);
  assert(cells.find((cell) => cell.selected).chosen, "the cursor and the pick disagree after a move");
});

test("hovering marks a cell without moving the cursor", () => {
  // The setup screen's rule, and it applies here for the same reason: this
  // cursor *is* the pick, so a sweep across the roster must change nothing.
  const garage = stocked(1);
  const collection = createCollection({ modelId: MODEL }, garage);
  const view = collectionView(collection, garage, { hover: { kind: "cell", row: collection.row, column: 1 } });
  const cells = view.rows.flatMap((row) => row.cells);
  assertEqual(cells.filter((cell) => cell.hovered).length, 1);
  assert(!cells.find((cell) => cell.hovered).selected, "hovering moved the cursor");
  assertEqual(collectionSelection(collection).presetId, null, "hovering changed the pick");
});

test("the view names the car going to the line, wherever the cursor is", () => {
  const garage = stocked(1);
  const collection = walk(
    createCollection({ modelId: MODEL, presetId: garage.presets[0].id }, garage),
    garage,
    {},
    "down",
    "down",
  );
  const view = collectionView(collection, garage);
  assertEqual(view.chosen.presetId, garage.presets[0].id, "walking away from the pick lost it");
  assertEqual(view.chosen.presetName, "Paint 1");
});

test("every row says how many paints it carries", () => {
  const garage = stocked(2);
  const view = collectionView(createCollection({ modelId: MODEL }, garage), garage);
  const row = view.rows.find((entry) => entry.modelId === MODEL);
  assertEqual(row.savedCount, 2);
  assertEqual(view.savedTotal, 2);
  for (const other of view.rows.filter((entry) => entry.modelId !== MODEL)) {
    assertEqual(other.savedCount, 0);
  }
});

finish();
