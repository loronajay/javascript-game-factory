// Pre-race setup: pick a car, pick the config you built for it, pick a track,
// pick what you are racing for, go.
//
// Pure. No canvas, no DOM, no images — this owns *where the cursor is* and
// *what is selected*, and `render/setup.js` draws whatever it says. Same split
// as `shifter-gate.js`, and for the same reason: cursor movement is a rule, and
// rules belong somewhere a test can reach without a browser.
//
// **Choosing a car is two panes, not one.** You pick a model, then you pick one
// of the configs you have saved for that model. That replaced a flat grid of 45
// pre-painted cars, which had no room to grow: colour is now a livery rather
// than a sprite, so the same 24 bodies carry every look a player builds. The
// second pane always offers at least `Factory`, so a model with no saved
// configs is still one keypress from the line.
//
// **The model grid is one row per archetype.** That is not a coincidence to be
// tidied away later: the roster genuinely holds five GTs and two hot hatches,
// and a row per group means adding a car is a manifest entry with no layout code
// at all — the same property the old one-row-per-sheet grid had. Nothing wraps:
// with a 24-cell grid, wrapping makes the cursor easy to lose.
//
// **The direction keys never leave a pane.** You lock a pane in with ENTER and
// that is what moves you on to the next one; ESC unlocks the pane behind you.
// An earlier build reached the track strip by walking *off the bottom of the car
// grid*, which meant you could not choose a car on an early sheet and a track in
// the same visit. Movement selects, confirmation commits, and the two are
// separate keys.
//
// **The garage is passed in rather than held here.** A setup is cursor state and
// nothing else, so it stays comparable, serializable and cheap to rebuild; the
// player's saved configs are their own data with their own lifetime. Every
// function that needs to know what presets exist takes the garage as an
// argument, which is also what lets the tests drive this with a fake one.

import { MODEL_GROUPS, DEFAULT_MODEL_ID, modelsByGroup, modelById } from "../assets/car-atlas.js";
import { DEFAULT_MODE_ID, modeById, objectiveOption } from "../sim/modes.js";
import { emptyGarage, presetsForModel, factoryPresetLabel } from "../garage/garage.js";
import { DEFAULT_LIVERY, createLivery } from "../garage/livery.js";
import { boardIdFor } from "../records/records.js";
import { DEFAULT_RIVAL_ID, lineupEntry, lineupFor } from "../rival/lineup.js";
import { TRACKS, DEFAULT_TRACK_ID, trackById } from "./track-layout.js";
import { CIRCUIT_TRACKS, DEFAULT_CIRCUIT_TRACK_ID, circuitTrackById } from "../circuit/tracks.js";
import { hasCircuitAtlas } from "../circuit/assets.js";

export const PANE_MODEL = "model";
export const PANE_PRESET = "preset";
export const PANE_TRACK = "track";
export const PANE_OBJECTIVE = "objective";
/**
 * Who you are racing. Present in Rival Race and nowhere else — see `panesFor`.
 *
 * Last in the order on purpose: which ghost exists depends on the board, and the
 * board is the mode plus the objective. Putting the rival pane before the
 * distance strip would mean offering a ghost for a distance the player has not
 * chosen yet, and taking it away again when they did.
 */
export const PANE_RIVAL = "rival";

/** Every pane, in the order they are locked in. Not every mode uses all of them. */
export const PANES = [PANE_MODEL, PANE_PRESET, PANE_TRACK, PANE_OBJECTIVE, PANE_RIVAL];

/**
 * The panes this mode actually has.
 *
 * A mode declares whether it wants the rival pane; nothing here names a mode.
 * That is the same rule the objective pane already follows — it is one pane in
 * every mode and lists whatever the mode's objective offers — extended to a pane
 * that is present rather than merely different.
 */
export function panesFor(setup) {
  return setupMode(setup).rival ? PANES : PANES.filter((pane) => pane !== PANE_RIVAL);
}

/**
 * What ENTER does on each pane. The *last* pane of the mode always reads START,
 * because locking it is what drops the clutch — there is no separate "go" step
 * to find. Derived rather than stored so a mode with a different pane list
 * cannot end up with two panes claiming to be the last one.
 */
const PANE_LOCK_LABELS = {
  [PANE_MODEL]: "LOCK CAR",
  [PANE_PRESET]: "LOCK PAINT",
  [PANE_TRACK]: "LOCK TRACK",
  [PANE_OBJECTIVE]: "LOCK DISTANCE",
  [PANE_RIVAL]: "LOCK RIVAL",
};

function panePrompt(setup) {
  const panes = panesFor(setup);
  return setup.pane === panes[panes.length - 1] ? "START" : PANE_LOCK_LABELS[setup.pane] ?? "LOCK CAR";
}

/** The mode being set up, always a real one even if a stale id was handed in. */
export function setupMode(setup) {
  return modeById(setup.modeId) ?? modeById(DEFAULT_MODE_ID);
}

export function setupTracks(setup) {
  return setupMode(setup).runtime === "circuit" ? CIRCUIT_TRACKS : TRACKS;
}

/**
 * The board this setup's runs would file to, which is what decides whether the
 * player has a ghost to race. Null in a mode that keeps no records.
 */
export function setupBoardId(setup) {
  return boardIdFor(setupMode(setup).id, setupObjective(setup).id);
}

/**
 * Who is on offer, ghost included when one exists for the board being set up.
 *
 * The ghost is passed in rather than read here for exactly the reason the garage
 * is: a setup is cursor state, and the player's saved runs are their own data
 * with their own lifetime and their own storage seam.
 */
export function setupLineup(setup, ghost = null) {
  return lineupFor(setupBoardId(setup), ghost);
}

/** The rival the cursor is on. Falls back through the lineup — see `lineupEntry`. */
export function setupRival(setup, ghost = null) {
  return lineupEntry(setupLineup(setup, ghost), setup.rivalId);
}

const clamp = (value, max) => Math.max(0, Math.min(max, value));

/** Grid position of a model id, as { row, column } over the grouped roster. */
function gridPositionOf(modelId) {
  const groups = modelsByGroup();
  for (let row = 0; row < groups.length; row += 1) {
    const column = groups[row].models.findIndex((model) => model.id === modelId);
    if (column >= 0) return { row, column };
  }
  return { row: 0, column: 0 };
}

/**
 * Cursor position is stored per pane, so stepping down to the tracks and back up
 * returns to the car you were on rather than resetting to the first.
 */
export function createSetup({
  modeId = DEFAULT_MODE_ID,
  modelId = DEFAULT_MODEL_ID,
  presetId = null,
  trackId = DEFAULT_TRACK_ID,
  objectiveId = null,
  rivalId = DEFAULT_RIVAL_ID,
} = {}, garage = emptyGarage()) {
  const mode = modeById(modeId) ?? modeById(DEFAULT_MODE_ID);
  const model = modelById(modelId) ?? modelById(DEFAULT_MODEL_ID);
  const tracks = mode.runtime === "circuit" ? CIRCUIT_TRACKS : TRACKS;
  const fallbackTrackId = mode.runtime === "circuit" ? DEFAULT_CIRCUIT_TRACK_ID : DEFAULT_TRACK_ID;
  const trackIndex = Math.max(0, tracks.findIndex((track) => track.id === (trackId ?? fallbackTrackId)));

  // The objective is carried between modes by id where it makes sense, and
  // falls back to the new mode's default where it does not — a distance id
  // means nothing to a mode measured on a clock.
  const objectiveIndex = Math.max(
    0,
    mode.objective.options.indexOf(objectiveOption(mode, objectiveId)),
  );

  const options = presetOptionsFor(model.id, garage);
  const chosenPresetIndex = Math.max(0, options.findIndex((option) => option.id === presetId));

  return {
    modeId: mode.id,
    pane: PANE_MODEL,
    model: gridPositionOf(model.id),
    // The cursor and the pick are separate: the cursor can sit on the
    // `Customise…` action, which is not a config and cannot be raced.
    presetIndex: chosenPresetIndex,
    chosenPresetIndex,
    trackIndex,
    objectiveIndex,
    // The rival is held as an id rather than an index, because the list it
    // indexes into changes length under it: a ghost exists for one distance and
    // not the next, so an index would silently mean a different driver after a
    // walk along the objective strip.
    rivalId,
  };
}

/** Where the cursor is in the lock order. Everything before it is locked. */
function paneIndex(setup) {
  const index = panesFor(setup).indexOf(setup.pane);
  return index >= 0 ? index : 0;
}

/**
 * Whether a pane is locked in. Derived from where the cursor is rather than
 * stored: you can only ever be standing on the pane you have not settled yet, so
 * a second copy of that fact could only go stale.
 *
 * A pane the mode does not have is never locked — it is not there to lock.
 */
export function isPaneLocked(setup, pane) {
  const panes = panesFor(setup);
  const index = panes.indexOf(pane);
  return index >= 0 && index < paneIndex(setup);
}

/** The model the cursor is on. */
export function setupModel(setup) {
  const groups = modelsByGroup();
  const row = clamp(setup.model.row, groups.length - 1);
  const models = groups[row].models;
  return models[clamp(setup.model.column, models.length - 1)];
}

/**
 * The configs offered for a model: `Factory` first, then whatever the player has
 * saved. Factory is a real option here but not a stored preset — its id is null,
 * which is what the garage means by "no preset selected". Building the list this
 * way is what keeps every model raceable before anything has been saved for it.
 */
export function presetOptionsFor(modelId, garage = emptyGarage()) {
  return [
    { id: null, name: factoryPresetLabel(), livery: createLivery(DEFAULT_LIVERY), factory: true },
    ...presetsForModel(garage, modelId).map((preset) => ({
      id: preset.id,
      name: preset.name,
      livery: preset.livery,
      factory: false,
    })),
  ];
}

export function setupPresetOptions(setup, garage = emptyGarage()) {
  return presetOptionsFor(setupModel(setup).id, garage);
}

/** The action that opens the garage editor. Not a config — it has no livery. */
export const PRESET_ACTION_CUSTOMISE = "customise";

/**
 * The paint pane's rows: the configs, then the one action.
 *
 * `Customise…` covers both "build a new paint" and "edit this one" because it
 * opens the garage on whatever config is *chosen* — from Factory that is a new
 * paint, from a saved preset it is that preset, and the editor works out which
 * actions to offer from the preset id it is handed. One row, both jobs, and no
 * hidden keystroke to discover.
 */
export function setupPresetRows(setup, garage = emptyGarage()) {
  return [
    ...setupPresetOptions(setup, garage),
    { id: PRESET_ACTION_CUSTOMISE, name: "Customise…", action: true, livery: null },
  ];
}

/**
 * The paint pane, told whether the garage can be used at all.
 *
 * Customization is account-backed, so signed out there is nowhere to save a
 * config. The row stays in the list and says why rather than disappearing:
 * a control that vanishes teaches nothing, and one that accepts a paint and
 * then silently fails to keep it is worse than either.
 */
export function setupPresetRowsFor(setup, garage, canCustomise) {
  const rows = setupPresetRows(setup, garage);
  if (canCustomise) return rows;
  return rows.map((row) =>
    row.action ? { ...row, name: "Sign in to customise", disabled: true } : row,
  );
}

/** True when the cursor is on the action row rather than on a config. */
export function isPresetActionFocused(setup, garage = emptyGarage()) {
  const rows = setupPresetRows(setup, garage);
  return Boolean(rows[clamp(setup.presetIndex, rows.length - 1)]?.action);
}

/**
 * The config being taken to the line. Read from `chosenPresetIndex` rather than
 * from the cursor, because the cursor can be parked on the action row — and the
 * car does not stop having paint on it because you are pointing at a button.
 */
export function setupPreset(setup, garage = emptyGarage()) {
  const options = setupPresetOptions(setup, garage);
  return options[clamp(setup.chosenPresetIndex ?? 0, options.length - 1)];
}

export function setupLivery(setup, garage = emptyGarage()) {
  return setupPreset(setup, garage).livery;
}

export function setupTrack(setup) {
  const tracks = setupTracks(setup);
  return tracks[clamp(setup.trackIndex, tracks.length - 1)];
}

/** The objective option the cursor is on — a distance, or a clock. */
export function setupObjective(setup) {
  const mode = setupMode(setup);
  return mode.objective.options[setup.objectiveIndex] ?? objectiveOption(mode, null);
}

/**
 * Moves the cursor **within the live pane only**. Left/right and up/down both
 * stay inside it, and the edges clamp — walking the car grid can no longer carry
 * you into the track strip, which is what used to make choosing a car on an
 * early sheet impossible.
 *
 * Returns a new setup — callers may hold the old one.
 */
export function moveSetup(setup, direction, garage = emptyGarage(), { ghost = null } = {}) {
  if (setup.pane === PANE_RIVAL) {
    // A single row that wraps, for the reason the online lobby's car row wraps
    // and the model grid does not: there is no edge here to lose a cursor
    // against, and the list is short enough to walk right round in a second.
    const lineup = setupLineup(setup, ghost);
    const step = direction === "left" ? -1 : direction === "right" ? 1 : 0;
    if (step === 0 || lineup.length === 0) return setup;
    const from = Math.max(0, lineup.findIndex((entry) => entry.id === setupRival(setup, ghost)?.id));
    return { ...setup, rivalId: lineup[(from + step + lineup.length) % lineup.length].id };
  }

  if (setup.pane === PANE_MODEL) {
    const groups = modelsByGroup();
    const row = clamp(setup.model.row, groups.length - 1);
    switch (direction) {
      case "left":
        return withModel(setup, row, setup.model.column - 1, garage);
      case "right":
        return withModel(setup, row, setup.model.column + 1, garage);
      case "up":
        return withModel(setup, row - 1, setup.model.column, garage);
      case "down":
        return withModel(setup, row + 1, setup.model.column, garage);
      default:
        return setup;
    }
  }

  // The preset pane is a vertical list, so it reads up/down. The strips below
  // are single rows and read left/right; giving each pane only the axis it
  // actually has is what stops a stray key from looking like a dead one.
  if (setup.pane === PANE_PRESET) {
    const step = direction === "up" ? -1 : direction === "down" ? 1 : 0;
    if (step === 0) return setup;
    return withPresetCursor(setup, setup.presetIndex + step, garage);
  }

  if (setup.pane === PANE_TRACK) {
    switch (direction) {
      case "left":
        return { ...setup, trackIndex: clamp(setup.trackIndex - 1, setupTracks(setup).length - 1) };
      case "right":
        return { ...setup, trackIndex: clamp(setup.trackIndex + 1, setupTracks(setup).length - 1) };
      default:
        return setup;
    }
  }

  const options = setupMode(setup).objective.options.length;
  switch (direction) {
    case "left":
      return { ...setup, objectiveIndex: clamp(setup.objectiveIndex - 1, options - 1) };
    case "right":
      return { ...setup, objectiveIndex: clamp(setup.objectiveIndex + 1, options - 1) };
    default:
      return setup;
  }
}

/**
 * Moves the model cursor, clamping the column into whatever the destination row
 * actually holds — the groups are different lengths, so walking down from the
 * sixth GT into a two-car row has to land somewhere real.
 *
 * Changing model resets the preset cursor, because a preset belongs to one model
 * and index 2 in another model's list is a different car's paint.
 */
/**
 * Moves the paint cursor. Landing on a config makes it the pick; landing on the
 * action row leaves the pick alone, so browsing down to `Customise…` does not
 * silently change the car's paint on the way past.
 */
function withPresetCursor(setup, index, garage) {
  const rows = setupPresetRows(setup, garage);
  const options = setupPresetOptions(setup, garage);
  const presetIndex = clamp(index, rows.length - 1);
  const chosen = presetIndex < options.length ? presetIndex : setup.chosenPresetIndex;
  return { ...setup, presetIndex, chosenPresetIndex: clamp(chosen ?? 0, options.length - 1) };
}

function withModel(setup, row, column, garage) {
  const groups = modelsByGroup();
  const nextRow = clamp(row, groups.length - 1);
  const nextColumn = clamp(column, groups[nextRow].models.length - 1);
  if (nextRow === setup.model.row && nextColumn === setup.model.column) return setup;

  const moved = { ...setup, model: { row: nextRow, column: nextColumn } };
  const options = presetOptionsFor(setupModel(moved).id, garage);
  const chosen = clamp(setup.chosenPresetIndex ?? 0, options.length - 1);
  return { ...moved, presetIndex: chosen, chosenPresetIndex: chosen };
}

/**
 * The roster in the order the grid reads it — archetype by archetype, left to
 * right across each row.
 *
 * The online lobby picks a car from a *single row* rather than a grid, and it
 * steps through this, so "the next car" means the same thing on both screens.
 * Deriving it from `modelsByGroup` rather than from `allModels` is what keeps
 * that true when a model's archetype changes.
 */
function rosterOrder() {
  return modelsByGroup().flatMap((group) => group.models);
}

/**
 * The car one step along the roster, wrapping.
 *
 * Wrapping is right here and wrong on the grid, and that is not an
 * inconsistency: a one-row picker has no edge to lose the cursor against, where
 * a 24-cell grid with uneven rows very much does.
 */
export function cycleSetupModel(setup, step, garage = emptyGarage()) {
  const roster = rosterOrder();
  if (roster.length === 0 || (step !== 1 && step !== -1)) return setup;
  const current = roster.findIndex((model) => model.id === setupModel(setup).id);
  const next = roster[((current < 0 ? 0 : current) + step + roster.length) % roster.length];
  // The grid position is set directly rather than through `withModel`, which
  // short-circuits when the cell has not moved: a roster of one would then wrap
  // onto itself and never reset the paint pick.
  const moved = { ...setup, model: gridPositionOf(next.id) };
  const options = presetOptionsFor(next.id, garage);
  const chosen = clamp(setup.chosenPresetIndex ?? 0, options.length - 1);
  return { ...moved, presetIndex: chosen, chosenPresetIndex: chosen };
}

/**
 * The next config saved for this car, wrapping through `Factory`.
 *
 * This steps the *pick* rather than a browsing cursor, unlike `moveSetup` on the
 * paint pane. There is no `Customise…` row to walk past in a one-row picker, so
 * landing on a config is the whole gesture and the two indices stay together.
 */
export function cycleSetupPreset(setup, step, garage = emptyGarage()) {
  const options = setupPresetOptions(setup, garage);
  if (options.length === 0 || (step !== 1 && step !== -1)) return setup;
  const from = clamp(setup.chosenPresetIndex ?? 0, options.length - 1);
  const index = (from + step + options.length) % options.length;
  return { ...setup, presetIndex: index, chosenPresetIndex: index };
}

/**
 * Puts the cursor on something the player clicked.
 *
 * A click carries its own pane, so unlike a direction key it *can* change pane —
 * pointing at a track means you want that track, and refusing until two panes
 * have been locked with the keyboard would read as a dead control. Everything
 * before the clicked pane is locked in, which is exactly what walking there with
 * ENTER would have done, so the two input paths leave the same state behind.
 *
 * An unknown target returns the setup unchanged rather than resetting anything.
 */
export function focusSetup(setup, target, garage = emptyGarage(), { ghost = null } = {}) {
  if (!target || !panesFor(setup).includes(target.pane)) return setup;

  if (target.pane === PANE_RIVAL) {
    const lineup = setupLineup(setup, ghost);
    const entry = lineup[clamp(target.index, lineup.length - 1)];
    return entry ? { ...setup, pane: PANE_RIVAL, rivalId: entry.id } : { ...setup, pane: PANE_RIVAL };
  }

  if (target.pane === PANE_MODEL) {
    const moved = withModel({ ...setup, pane: PANE_MODEL }, target.row, target.column, garage);
    return { ...moved, pane: PANE_MODEL };
  }
  if (target.pane === PANE_PRESET) {
    return withPresetCursor({ ...setup, pane: PANE_PRESET }, target.index, garage);
  }
  if (target.pane === PANE_TRACK) {
    return { ...setup, pane: PANE_TRACK, trackIndex: clamp(target.index, setupTracks(setup).length - 1) };
  }
  const options = setupMode(setup).objective.options.length;
  return { ...setup, pane: PANE_OBJECTIVE, objectiveIndex: clamp(target.index, options - 1) };
}

/** What the cursor is on, as ids — the shape the race is built from. */
export function setupSelection(setup, garage = emptyGarage()) {
  const preset = setupPreset(setup, garage);
  return {
    modeId: setupMode(setup).id,
    modelId: setupModel(setup).id,
    presetId: preset.id,
    livery: preset.livery,
    trackId: setupTrack(setup).id,
    objectiveId: setupObjective(setup).id,
    // Carried as the raw id rather than resolved through the lineup, because
    // resolving needs the ghost and a selection is meant to be cheap enough to
    // rebuild a setup from. `setupRival` is what resolves it, at the point the
    // race is actually built.
    rivalId: setup.rivalId ?? DEFAULT_RIVAL_ID,
  };
}

/**
 * ENTER. Locks the live pane in and moves on to the next one, and reports
 * `done` when there is no next one — which is the caller's cue to build the
 * race. The lock is the move: nothing else can advance the cursor between
 * panes, so a pick can never be disturbed by navigating away from it.
 */
export function confirmSetup(setup, garage = emptyGarage()) {
  if (setupMode(setup).runtime === "circuit" && !hasCircuitAtlas(setupModel(setup).id)) {
    return { setup, done: false, unavailable: true };
  }
  // The paint pane's last row is an action, not a config. Confirming it opens
  // the garage rather than locking the pane, so the caller is told which.
  if (setup.pane === PANE_PRESET && isPresetActionFocused(setup, garage)) {
    return { setup, done: false, customise: true };
  }
  const next = panesFor(setup)[paneIndex(setup) + 1];
  return next ? { setup: { ...setup, pane: next }, done: false } : { setup, done: true };
}

/**
 * ESC. Unlocks the pane behind you and steps back into it, and reports `exit`
 * from the first pane — the point at which backing out means leaving the screen
 * rather than undoing a lock. Choices are untouched: coming back up to the car
 * grid puts the cursor on the car you locked.
 */
export function cancelSetup(setup) {
  const previous = panesFor(setup)[paneIndex(setup) - 1];
  return previous ? { setup: { ...setup, pane: previous }, exit: false } : { setup, exit: true };
}

/**
 * Back to the first pane with every choice intact. Called when a race is built,
 * so returning to setup afterwards (`CHANGE CAR / TRACK`) always starts the walk
 * from the top rather than dropping you on the last pane with everything locked
 * and no obvious way back up.
 */
export function rewindSetup(setup) {
  return { ...setup, pane: PANE_MODEL };
}

/**
 * Resolves a selection back into the objects needed to race it. Returns null if
 * either half is unknown, so a stale saved selection fails loudly at the seam
 * rather than half-loading.
 */
export function resolveSelection({ modelId, trackId, livery } = {}) {
  const model = modelById(modelId);
  const track = trackById(trackId) ?? circuitTrackById(trackId);
  return model && track ? { model, track, livery: createLivery(livery) } : null;
}

/** The START button, which is a target rather than a pane — see `setupView`. */
export const TARGET_START = "start";

/**
 * Whether a hover target is this cell. Hover is **highlight only**: it marks
 * what a click would take and changes nothing else.
 *
 * It used to move the cursor, which quietly made the mouse unusable. The cursor
 * is also the pick, so dragging the pointer across the grid on the way somewhere
 * else changed your car — and because hover was re-applied every frame, it put
 * the pane back under the mouse immediately after a click had advanced it, so
 * clicking a car, a paint or a track appeared to do nothing at all.
 */
function isHovered(hover, pane, match) {
  return Boolean(hover && hover.pane === pane && match(hover));
}

/**
 * Everything the renderer needs, with no atlas, garage or catalog lookups of its
 * own: the model grid as rows of cells, the config list, the track strip, the
 * objective strip, and which cell is live in each.
 *
 * `hover` is what the pointer is over, if anything. It rides through the view
 * rather than through the setup so that pointing at something can never be
 * mistaken for choosing it.
 */
export function setupView(setup, garage = emptyGarage(), { canCustomise = true, hover = null, ghost = null } = {}) {
  const mode = setupMode(setup);
  const locked = Object.fromEntries(PANES.map((pane) => [pane, isPaneLocked(setup, pane)]));
  const model = setupModel(setup);
  const presetOptions = setupPresetOptions(setup, garage);
  const chosenIndex = clamp(setup.chosenPresetIndex ?? 0, presetOptions.length - 1);
  // Null rather than an empty list in a mode with no rival pane, so a renderer
  // that forgets to check draws nothing rather than drawing an empty strip.
  const chosenRival = mode.rival ? setupRival(setup, ghost) : null;
  const rivals = mode.rival
    ? setupLineup(setup, ghost).map((entry, index) => ({
        ...entry,
        index,
        selected: setup.pane === PANE_RIVAL && chosenRival?.id === entry.id,
        hovered: isHovered(hover, PANE_RIVAL, (h) => h.index === index),
        chosen: chosenRival?.id === entry.id,
        locked: locked[PANE_RIVAL] && chosenRival?.id === entry.id,
      }))
    : null;

  return {
    pane: setup.pane,
    // Which panes are settled, and what ENTER will do about the one that is
    // not — the renderer prints both rather than working either out.
    locked,
    // The panes this mode has, so the renderer draws the rival strip in Rival
    // Race and leaves the space empty everywhere else without naming a mode.
    panes: panesFor(setup),
    prompt: panePrompt(setup),
    mode: { id: mode.id, label: mode.label, blurb: mode.blurb },
    objective: {
      kind: mode.objective.kind,
      label: mode.objective.label,
      locked: locked[PANE_OBJECTIVE],
      options: mode.objective.options.map((option, index) => ({
        ...option,
        index,
        selected: setup.pane === PANE_OBJECTIVE && setup.objectiveIndex === index,
        hovered: isHovered(hover, PANE_OBJECTIVE, (h) => h.index === index),
        chosen: setup.objectiveIndex === index,
        locked: locked[PANE_OBJECTIVE] && setup.objectiveIndex === index,
      })),
    },
    chosenObjective: setupObjective(setup),
    // One row per archetype. `selected` is where the cursor is; `chosen` is what
    // you are taking to the line. They differ the moment the cursor moves to
    // another pane, and the renderer needs both — otherwise leaving a pane loses
    // all trace of what was picked in it.
    groups: modelsByGroup().map((group, row) => ({
      id: group.id,
      label: group.label,
      row,
      cells: group.models.map((entry, column) => ({
        ...entry,
        row,
        column,
        selected: setup.pane === PANE_MODEL && setup.model.row === row && setup.model.column === column,
        hovered: isHovered(hover, PANE_MODEL, (h) => h.row === row && h.column === column),
        chosen: model.id === entry.id,
        // `locked` is `chosen` once the pane behind you is settled — the pick
        // that is no longer up for debate, drawn differently from the one you
        // are still browsing.
        locked: locked[PANE_MODEL] && model.id === entry.id,
        available: mode.runtime !== "circuit" || hasCircuitAtlas(entry.id),
      })),
    })),
    presets: {
      locked: locked[PANE_PRESET],
      options: setupPresetRowsFor(setup, garage, canCustomise).map((option, index) => ({
        ...option,
        index,
        selected: setup.pane === PANE_PRESET && setup.presetIndex === index,
        hovered: isHovered(hover, PANE_PRESET, (h) => h.index === index),
        chosen: !option.action && chosenIndex === index,
        locked: locked[PANE_PRESET] && chosenIndex === index,
      })),
    },
    tracks: setupTracks(setup).map((track, index) => ({
      ...track,
      index,
      selected: setup.pane === PANE_TRACK && setup.trackIndex === index,
      hovered: isHovered(hover, PANE_TRACK, (h) => h.index === index),
      chosen: setup.trackIndex === index,
      locked: locked[PANE_TRACK] && setup.trackIndex === index,
    })),
    // A drawn button, because the mouse has no ENTER. The keyboard reaches the
    // line by locking the last pane; a pointer needs somewhere to press that
    // means "go" from any pane, since every pane always holds a valid pick.
    start: {
      label: mode.runtime === "circuit" && !hasCircuitAtlas(model.id) ? "ATLAS UNAVAILABLE" : "START",
      disabled: mode.runtime === "circuit" && !hasCircuitAtlas(model.id),
      hovered: hover?.target === TARGET_START,
    },
    rivals,
    chosenRival,
    chosenModel: model,
    chosenPreset: presetOptions[chosenIndex],
    chosenLivery: presetOptions[chosenIndex].livery,
    chosenTrack: setupTrack(setup),
    groupLabels: MODEL_GROUPS.map((group) => group.label),
  };
}
