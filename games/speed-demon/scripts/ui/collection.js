// The collection: every model you own, with every paint you have built for it,
// on one scrolling screen.
//
// Pure. No canvas, no DOM — this owns *where the cursor is* and *what is
// picked*, and `render/collection.js` draws whatever it says. Same split as
// `setup-menu.js` and `garage-editor.js`.
//
// **This is a way of looking at the garage, not a second copy of it.** The
// editor is reached from here exactly as it is reached from the setup screen's
// paint pane — `SCREEN_GARAGE` with a working copy — and the car the cursor
// lands on is fed back into the same `setup` the solo picker steps, so there is
// still one answer to "what am I driving". The lobby's car rows make the same
// argument for the same reason.
//
// **A row is a model and its cells are that model's configs**, in the order the
// paint pane lists them: `Factory` first (which is not a stored preset — it is
// what the garage means by no selection), then whatever has been saved, then the
// one action that adds another. That is deliberately the same list
// `presetOptionsFor` builds for the setup screen rather than a second one, so a
// paint cannot appear in one picker and not the other.
//
// **Every model gets a row, whether it has been painted or not.** The screen's
// job is to show the whole roster at a glance, and hiding the untouched ones
// would make "which cars have I not done anything with" — the question that
// sends a player into the garage in the first place — unanswerable.
//
// **Moving the cursor picks; the action cell does not.** Landing on a config
// makes it the car you are taking to the line, which is the paint pane's rule;
// landing on `+ New` leaves the pick alone, which is the `Customise…` rule.
// Browsing past a button must never repaint the car.

import { modelsByGroup, modelById, DEFAULT_MODEL_ID } from "../assets/car-atlas.js";
import { emptyGarage, canSavePreset, presetsForModel } from "../garage/garage.js";
import { presetOptionsFor } from "./setup-menu.js";

/**
 * How many model rows are on screen at once.
 *
 * It lives here rather than in the renderer because scrolling is a rule — the
 * cursor may never leave the window — and rules belong somewhere a test can
 * reach without a canvas. `render/collection.js` imports it rather than keeping
 * a second copy, the same argument `menuListBox` makes about the menus.
 */
export const COLLECTION_VISIBLE_ROWS = 5;

/** The cell that opens the editor on a fresh paint. Not a config; has no livery. */
export const CELL_NEW = "new";

const clamp = (value, max) => Math.max(0, Math.min(max, value));

/**
 * The roster in the order the setup screen's grid reads it — archetype by
 * archetype, left to right. Derived from `modelsByGroup` rather than from
 * `allModels` so the two screens stay in the same order when a model's
 * archetype changes.
 */
export function collectionModels() {
  return modelsByGroup().flatMap((group) =>
    group.models.map((model) => ({ ...model, groupLabel: group.label })));
}

/**
 * One model's cells: its configs, then the action that adds another.
 *
 * `+ New` disappears at the per-model ceiling rather than going inert, which is
 * the `+ LAYER` tab's rule — an add that never adds is worse than one that is
 * not offered, because the player presses it, nothing happens, and they go
 * looking for the bug. It is absent signed out for the same reason the paint
 * pane's action row is disabled there: there is nowhere to save a config.
 */
export function collectionCells(modelId, garage = emptyGarage(), { canCustomise = true } = {}) {
  const cells = presetOptionsFor(modelId, garage).map((option, index) => ({
    ...option,
    index,
    action: false,
  }));
  if (canCustomise && canSavePreset(garage, modelId)) {
    cells.push({ id: CELL_NEW, name: "New paint", action: true, livery: null, factory: false, index: cells.length });
  }
  return cells;
}

function rowIndexOf(modelId) {
  const index = collectionModels().findIndex((model) => model.id === modelId);
  return index >= 0 ? index : 0;
}

/** Keeps `scroll` such that `row` is on screen, and never past the last page. */
function windowFor(row, scroll, rows) {
  const last = Math.max(0, rows - COLLECTION_VISIBLE_ROWS);
  const held = clamp(scroll, last);
  if (row < held) return row;
  if (row > held + COLLECTION_VISIBLE_ROWS - 1) return clamp(row - COLLECTION_VISIBLE_ROWS + 1, last);
  return held;
}

/**
 * Opens the collection on a car. The cursor lands on the config that car is
 * already wearing, so arriving from a chosen loadout shows it selected rather
 * than dropping you on Factory and quietly changing the pick on the first move.
 */
export function createCollection(
  { modelId = DEFAULT_MODEL_ID, presetId = null } = {},
  garage = emptyGarage(),
  { canCustomise = true } = {},
) {
  const model = modelById(modelId) ?? modelById(DEFAULT_MODEL_ID);
  const row = rowIndexOf(model.id);
  const cells = collectionCells(model.id, garage, { canCustomise });
  const column = Math.max(0, cells.findIndex((cell) => !cell.action && cell.id === presetId));
  return {
    row,
    column,
    scroll: windowFor(row, 0, collectionModels().length),
    chosen: { modelId: model.id, presetId: cells[column]?.id ?? null },
  };
}

/** The model whose row the cursor is on. */
export function collectionModel(collection) {
  const models = collectionModels();
  return models[clamp(collection.row, models.length - 1)];
}

/** The cell the cursor is on — a config, or the action that adds one. */
export function collectionCell(collection, garage = emptyGarage(), options = {}) {
  const cells = collectionCells(collectionModel(collection).id, garage, options);
  return cells[clamp(collection.column, cells.length - 1)] ?? null;
}

/**
 * The car being taken to the line, as ids. Read from `chosen` rather than from
 * the cursor, because the cursor can be parked on the action cell — and the car
 * does not stop having paint on it because you are pointing at a button.
 */
export function collectionSelection(collection) {
  return { ...collection.chosen };
}

/** Adopts the cell under the cursor as the pick, unless it is the action. */
function withPick(collection, garage, options) {
  const cell = collectionCell(collection, garage, options);
  if (!cell || cell.action) return collection;
  return { ...collection, chosen: { modelId: collectionModel(collection).id, presetId: cell.id } };
}

function withCursor(collection, row, column, garage, options) {
  const models = collectionModels();
  const nextRow = clamp(row, models.length - 1);
  const cells = collectionCells(models[nextRow].id, garage, options);
  const moved = {
    ...collection,
    row: nextRow,
    // Rows are different lengths — a car with six paints sits above one with
    // none — so a column has to land somewhere real in the row it arrives in.
    column: clamp(column, cells.length - 1),
    scroll: windowFor(nextRow, collection.scroll, models.length),
  };
  return withPick(moved, garage, options);
}

/**
 * Walks the cursor. Up and down change model, left and right walk that model's
 * configs, and nothing wraps: 24 rows deep is exactly the kind of list a
 * wrapping cursor gets lost in.
 */
export function moveCollection(collection, direction, garage = emptyGarage(), options = {}) {
  switch (direction) {
    case "up":
      return withCursor(collection, collection.row - 1, collection.column, garage, options);
    case "down":
      return withCursor(collection, collection.row + 1, collection.column, garage, options);
    case "left":
      return withCursor(collection, collection.row, collection.column - 1, garage, options);
    case "right":
      return withCursor(collection, collection.row, collection.column + 1, garage, options);
    default:
      return collection;
  }
}

/**
 * Scrolls the window without the cursor having to walk there — what the drawn
 * arrows do.
 *
 * The cursor is pulled along rather than left behind, because a cursor parked
 * off screen would make ENTER act on a car nobody can see. Its column is
 * re-clamped for the same reason `withCursor` clamps it.
 */
export function scrollCollection(collection, step, garage = emptyGarage(), options = {}) {
  const models = collectionModels();
  const last = Math.max(0, models.length - COLLECTION_VISIBLE_ROWS);
  const scroll = clamp(collection.scroll + step, last);
  if (scroll === collection.scroll) return collection;
  const row = clamp(collection.row, models.length - 1);
  const pulled = row < scroll ? scroll : row > scroll + COLLECTION_VISIBLE_ROWS - 1
    ? scroll + COLLECTION_VISIBLE_ROWS - 1
    : row;
  const cells = collectionCells(models[pulled].id, garage, options);
  return withPick(
    { ...collection, scroll, row: pulled, column: clamp(collection.column, cells.length - 1) },
    garage,
    options,
  );
}

/**
 * Puts the cursor on something the player clicked. A click carries an absolute
 * row, so it can reach any visible one directly; the window does not move,
 * because what was clicked is by definition already in it.
 */
export function focusCollection(collection, target, garage = emptyGarage(), options = {}) {
  if (!target || !Number.isFinite(target.row) || !Number.isFinite(target.column)) return collection;
  return withCursor(collection, target.row, target.column, garage, options);
}

const isHovered = (hover, row, column) =>
  Boolean(hover && hover.kind === "cell" && hover.row === row && hover.column === column);

/**
 * Everything the renderer needs, with no atlas or garage lookups of its own: the
 * visible slice of the roster as rows of cells, which cell is the cursor and
 * which is the pick, whether there is more above or below, and what the player
 * is currently taking to the line.
 *
 * `hover` rides through here rather than through the collection so that pointing
 * at a car can never be mistaken for choosing it — the setup screen's rule, and
 * it applies for the same reason: this cursor *is* the pick.
 */
export function collectionView(collection, garage = emptyGarage(), { canCustomise = true, hover = null } = {}) {
  const models = collectionModels();
  const options = { canCustomise };
  const scroll = clamp(collection.scroll, Math.max(0, models.length - COLLECTION_VISIBLE_ROWS));
  const visible = models.slice(scroll, scroll + COLLECTION_VISIBLE_ROWS);
  const chosenModel = modelById(collection.chosen.modelId) ?? models[0];
  const chosenCells = collectionCells(chosenModel.id, garage, options);
  const chosenCell = chosenCells.find((cell) => !cell.action && cell.id === collection.chosen.presetId)
    ?? chosenCells[0];

  return {
    scroll,
    totalRows: models.length,
    visibleRows: COLLECTION_VISIBLE_ROWS,
    canScrollUp: scroll > 0,
    canScrollDown: scroll + COLLECTION_VISIBLE_ROWS < models.length,
    canCustomise,
    rows: visible.map((model, screenRow) => {
      const row = scroll + screenRow;
      return {
        modelId: model.id,
        label: model.label,
        groupLabel: model.groupLabel,
        model,
        row,
        screenRow,
        // How many paints this car carries, so a row can say "3 paints" without
        // the renderer counting cells and having to know Factory is not one.
        savedCount: presetsForModel(garage, model.id).length,
        cells: collectionCells(model.id, garage, options).map((cell) => ({
          ...cell,
          row,
          screenRow,
          column: cell.index,
          selected: collection.row === row && collection.column === cell.index,
          hovered: isHovered(hover, row, cell.index),
          chosen: !cell.action
            && collection.chosen.modelId === model.id
            && collection.chosen.presetId === cell.id,
        })),
      };
    }),
    // What is going to the line, named rather than left to be worked out from
    // the grid — the cursor may be several rows away from it.
    chosen: {
      modelId: chosenModel.id,
      label: chosenModel.label,
      presetId: chosenCell?.id ?? null,
      presetName: chosenCell?.name ?? "",
      livery: chosenCell?.livery ?? null,
    },
    savedTotal: garage.presets.length,
  };
}
