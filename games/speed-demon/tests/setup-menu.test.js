import { suite, test, assert, assertEqual, finish } from "./harness.js";

import {
  MODEL_GROUPS,
  DEFAULT_MODEL_ID,
  modelsByGroup,
  allModels,
  modelById,
} from "../scripts/assets/car-atlas.js";
import {
  MODE_DISTANCE,
  MODE_TIME_ATTACK,
  MODE_RIVAL,
  MODE_CIRCUIT,
  DEFAULT_MODE_ID,
  OBJECTIVE_TIME,
  modeById,
  raceOptionsFor,
} from "../scripts/sim/modes.js";
import { TRACKS, DEFAULT_TRACK_ID } from "../scripts/ui/track-layout.js";
import { emptyGarage, savePreset } from "../scripts/garage/garage.js";
import { RIVALS } from "../scripts/rival/rivals.js";
import { GHOST_ID, KIND_CPU } from "../scripts/rival/lineup.js";
import { DEFAULT_LIVERY } from "../scripts/garage/livery.js";
import {
  PANE_MODEL,
  PANE_PRESET,
  PANE_TRACK,
  PANE_OBJECTIVE,
  PANE_DIFFICULTY,
  PANE_RIVAL,
  PANES,
  panesFor,
  setupBoardId,
  setupLineup,
  setupRival,
  createSetup,
  moveSetup,
  cycleSetupModel,
  cycleSetupPreset,
  setupModel,
  setupMode,
  setupTrack,
  setupObjective,
  setupDifficulty,
  setupPreset,
  setupPresetOptions,
  setupPresetRows,
  isPresetActionFocused,
  PRESET_ACTION_CUSTOMISE,
  setupLivery,
  setupSelection,
  presetOptionsFor,
  confirmSetup,
  cancelSetup,
  focusSetup,
  rewindSetup,
  isPaneLocked,
  resolveSelection,
  setupView,
} from "../scripts/ui/setup-menu.js";

suite("setup-menu — pre-race car, paint, track and objective selection");

const EMPTY = emptyGarage();

/** A garage with two saved configs for one model, for the preset-pane tests. */
function stockedGarage(modelId = DEFAULT_MODEL_ID) {
  let garage = savePreset(emptyGarage(), {
    modelId,
    name: "Ocean",
    livery: { paint: { hue: 215, saturation: 0.8 } },
  });
  garage = savePreset(garage, { modelId, name: "Lime", livery: { paint: { hue: 85, saturation: 0.8 } } });
  return garage;
}

/**
 * Walks a sequence of directions. Written as an explicit arrow rather than
 * `directions.reduce(moveSetup)` — reduce passes the index as the third
 * argument, which `moveSetup` now reads as the garage.
 */
const walk = (setup, garage, ...directions) =>
  directions.reduce((current, direction) => moveSetup(current, direction, garage), setup);

/** ENTER, discarding the `done` flag — for the many tests that only want the pane. */
const lock = (setup) => confirmSetup(setup).setup;

/**
 * Locks panes in until the named one is live. The only way to change pane, which
 * is the point: navigating can no longer do it by accident.
 */
const toPane = (setup, pane) => {
  let next = setup;
  for (let i = 0; i < PANES.length && next.pane !== pane; i += 1) {
    next = lock(next);
  }
  assertEqual(next.pane, pane, `never reached the ${pane} pane`);
  return next;
};

// ---------------------------------------------------------------------------
// Opening state
// ---------------------------------------------------------------------------

test("the menu opens on the default car, factory paint and the default track", () => {
  const setup = createSetup();
  assertEqual(setupModel(setup).id, DEFAULT_MODEL_ID);
  assertEqual(setupTrack(setup).id, DEFAULT_TRACK_ID);
  assertEqual(setupPreset(setup, EMPTY).id, null);
  assertEqual(setup.pane, PANE_MODEL);
});

test("the menu opens on a previous selection when given one", () => {
  const target = allModels()[7];
  const setup = createSetup({ modelId: target.id, trackId: TRACKS[2].id });
  assertEqual(setupModel(setup).id, target.id);
  assertEqual(setupTrack(setup).id, TRACKS[2].id);
});

test("an unknown saved selection opens on something valid rather than nothing", () => {
  const setup = createSetup({ modelId: "monster-truck", trackId: "track-z" });
  assert(setupModel(setup), "an unknown model must fall back to a real one");
  assert(setupTrack(setup), "an unknown track must fall back to a real one");
  assert(resolveSelection(setupSelection(setup, EMPTY)), "the fallback must be raceable");
});

test("a saved preset id reopens on that preset", () => {
  const garage = stockedGarage();
  const preset = garage.presets[1];
  const setup = createSetup({ modelId: DEFAULT_MODEL_ID, presetId: preset.id }, garage);
  assertEqual(setupPreset(setup, garage).id, preset.id);
});

// ---------------------------------------------------------------------------
// The model grid
// ---------------------------------------------------------------------------

test("left and right walk along an archetype's row of cars", () => {
  const setup = createSetup();
  const moved = walk(setup, EMPTY, "right");
  assertEqual(moved.model.column, 1);
  assertEqual(walk(moved, EMPTY, "left").model.column, 0);
});

test("up and down walk between archetypes", () => {
  const setup = createSetup();
  assertEqual(walk(setup, EMPTY, "down").model.row, 1);
  assertEqual(walk(setup, EMPTY, "down", "up").model.row, 0);
});

test("the cursor stops at the edges instead of wrapping", () => {
  // With a 24-cell grid, wrapping makes the cursor easy to lose.
  const setup = createSetup();
  assertEqual(walk(setup, EMPTY, "up").model.row, 0);
  assertEqual(walk(setup, EMPTY, "left").model.column, 0);
  const groups = modelsByGroup();
  let bottom = setup;
  for (let i = 0; i < groups.length + 3; i += 1) bottom = moveSetup(bottom, "down", EMPTY);
  assertEqual(bottom.model.row, groups.length - 1);
});

test("moving into a shorter archetype row lands on a real car", () => {
  // The groups are deliberately different lengths — five GTs, two hot hatches —
  // so walking down from the sixth car in a row has to clamp somewhere real.
  const groups = modelsByGroup();
  let setup = createSetup();
  for (let column = 0; column < 8; column += 1) setup = moveSetup(setup, "right", EMPTY);
  for (let row = 0; row < groups.length; row += 1) {
    assert(setupModel(setup), `row ${setup.model.row} column ${setup.model.column} resolved to nothing`);
    setup = moveSetup(setup, "down", EMPTY);
  }
});

test("every model in the roster is reachable with the four direction keys", () => {
  const groups = modelsByGroup();
  const seen = new Set();
  let setup = createSetup();
  for (let row = 0; row < groups.length; row += 1) {
    for (let column = 0; column < groups[row].models.length; column += 1) {
      seen.add(setupModel(setup).id);
      setup = moveSetup(setup, "right", EMPTY);
    }
    setup = walk(setup, EMPTY, ...Array(groups[row].models.length).fill("left"));
    setup = moveSetup(setup, "down", EMPTY);
  }
  assertEqual(seen.size, allModels().length, "some models cannot be reached by walking");
});

test("no direction key can leave the model pane", () => {
  let setup = createSetup();
  for (const direction of ["up", "down", "left", "right"]) {
    for (let i = 0; i < 12; i += 1) setup = moveSetup(setup, direction, EMPTY);
    assertEqual(setup.pane, PANE_MODEL, `${direction} escaped the model pane`);
  }
});

test("a car chosen in the first archetype survives the walk to the other panes", () => {
  // The old flat grid reached the track strip by walking off its bottom, which
  // made an early-row car and a chosen track mutually exclusive.
  const chosen = createSetup();
  const modelId = setupModel(chosen).id;
  const atObjective = toPane(chosen, PANE_OBJECTIVE);
  assertEqual(setupModel(atObjective).id, modelId);
});

// ---------------------------------------------------------------------------
// The preset pane
// ---------------------------------------------------------------------------

test("factory is always offered, even with nothing saved", () => {
  const options = presetOptionsFor(DEFAULT_MODEL_ID, EMPTY);
  assertEqual(options.length, 1);
  assertEqual(options[0].id, null);
  assertEqual(options[0].factory, true);
});

test("saved configs follow factory in the list", () => {
  const garage = stockedGarage();
  const options = presetOptionsFor(DEFAULT_MODEL_ID, garage);
  assertEqual(options.length, 3);
  assertEqual(options[0].factory, true);
  assertEqual(options[1].name, "Ocean");
  assertEqual(options[2].name, "Lime");
});

test("only the chosen model's configs are offered", () => {
  const garage = stockedGarage(allModels()[3].id);
  assertEqual(presetOptionsFor(DEFAULT_MODEL_ID, garage).length, 1);
  assertEqual(presetOptionsFor(allModels()[3].id, garage).length, 3);
});

test("up and down walk the config list once the preset pane is live", () => {
  const garage = stockedGarage();
  const setup = toPane(createSetup({}, garage), PANE_PRESET);
  assertEqual(setupPreset(setup, garage).id, null);
  const moved = moveSetup(setup, "down", garage);
  assertEqual(setupPreset(moved, garage).name, "Ocean");
  assertEqual(setupPreset(moveSetup(moved, "up", garage), garage).id, null);
});

test("the config cursor stops at the ends of the list", () => {
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_PRESET);
  for (let i = 0; i < 8; i += 1) setup = moveSetup(setup, "down", garage);
  assertEqual(setupPreset(setup, garage).name, "Lime");
  for (let i = 0; i < 8; i += 1) setup = moveSetup(setup, "up", garage);
  assertEqual(setupPreset(setup, garage).id, null);
});

test("changing model resets the config cursor rather than keeping an index", () => {
  // Index 2 in one model's list is a different car's paint entirely.
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_PRESET);
  setup = moveSetup(setup, "down", garage);
  setup = moveSetup(setup, "down", garage);
  assertEqual(setupPreset(setup, garage).name, "Lime");

  // Walk back to the model pane and move to a car with nothing saved.
  setup = cancelSetup(setup).setup;
  setup = moveSetup(setup, "down", garage);
  assert(setupPreset(setup, garage), "the config cursor must still resolve after a model change");
  assertEqual(setupPreset(setup, garage).id, null, "a model with no configs must sit on Factory");
});

test("factory paint is the default livery", () => {
  assertEqual(setupLivery(createSetup(), EMPTY).paint.saturation, DEFAULT_LIVERY.paint.saturation);
});

test("selecting a saved config changes the livery taken to the line", () => {
  const garage = stockedGarage();
  const setup = moveSetup(toPane(createSetup({}, garage), PANE_PRESET), "down", garage);
  assertEqual(setupLivery(setup, garage).paint.hue, 215);
});

// ---------------------------------------------------------------------------
// Panes, locking and cancelling
// ---------------------------------------------------------------------------

test("confirming locks the live pane in and moves to the next", () => {
  const setup = createSetup();
  assertEqual(lock(setup).pane, PANE_PRESET);
  assertEqual(lock(lock(setup)).pane, PANE_TRACK);
  assertEqual(lock(lock(lock(setup))).pane, PANE_OBJECTIVE);
});

test("confirming the last pane reports done rather than looping round", () => {
  const setup = toPane(createSetup(), PANE_OBJECTIVE);
  const { done, setup: after } = confirmSetup(setup);
  assertEqual(done, true);
  assertEqual(after.pane, PANE_OBJECTIVE);
});

test("a pane is locked exactly when the cursor has moved past it", () => {
  const setup = toPane(createSetup(), PANE_TRACK);
  assertEqual(isPaneLocked(setup, PANE_MODEL), true);
  assertEqual(isPaneLocked(setup, PANE_PRESET), true);
  assertEqual(isPaneLocked(setup, PANE_TRACK), false);
  assertEqual(isPaneLocked(setup, PANE_OBJECTIVE), false);
});

test("cancelling unlocks the pane behind you and keeps what was picked there", () => {
  const garage = stockedGarage();
  let setup = createSetup({}, garage);
  setup = moveSetup(setup, "right", garage);
  const modelId = setupModel(setup).id;
  setup = lock(setup);
  const back = cancelSetup(setup).setup;
  assertEqual(back.pane, PANE_MODEL);
  assertEqual(setupModel(back).id, modelId);
});

test("cancelling out of the first pane means leaving the screen", () => {
  const { exit } = cancelSetup(createSetup());
  assertEqual(exit, true);
});

test("every pane is reachable by locking forwards and unlocking back again", () => {
  // Walked per mode, because the pane list is the mode's: Rival Race has a
  // fifth pane and nothing else does.
  for (const modeId of [MODE_DISTANCE, MODE_TIME_ATTACK, MODE_RIVAL]) {
    let setup = createSetup({ modeId });
    const panes = panesFor(setup);
    for (const pane of panes) {
      assertEqual(setup.pane, pane);
      setup = lock(setup);
    }
    for (const pane of [...panes].reverse()) {
      setup = pane === panes[panes.length - 1] ? setup : cancelSetup(setup).setup;
    }
    assertEqual(setup.pane, PANE_MODEL);
  }
});

test("only Rival Race has a rival pane, and it is the last one", () => {
  assert(!panesFor(createSetup({ modeId: MODE_DISTANCE })).includes(PANE_RIVAL));
  assert(!panesFor(createSetup({ modeId: MODE_TIME_ATTACK })).includes(PANE_RIVAL));
  const panes = panesFor(createSetup({ modeId: MODE_RIVAL }));
  assertEqual(panes[panes.length - 1], PANE_RIVAL);
});

test("the last pane of the mode is the one that says START", () => {
  // Locking the last pane *is* dropping the clutch, so exactly one pane per
  // mode may claim it — a second would be a step that looks like it starts the
  // race and does not.
  for (const modeId of [MODE_DISTANCE, MODE_TIME_ATTACK, MODE_RIVAL]) {
    const panes = panesFor(createSetup({ modeId }));
    const prompts = panes.map((pane) => setupView(toPane(createSetup({ modeId }), pane)).prompt);
    assertEqual(prompts.filter((prompt) => prompt === "START").length, 1);
    assertEqual(prompts[prompts.length - 1], "START");
  }
});

test("a distance mode offers no rival strip at all", () => {
  assertEqual(setupView(createSetup({ modeId: MODE_DISTANCE })).rivals, null);
  assertEqual(setupView(createSetup({ modeId: MODE_DISTANCE })).chosenRival, null);
});

test("the rival strip lists the roster, and the cursor wraps along it", () => {
  const setup = toPane(createSetup({ modeId: MODE_RIVAL }), PANE_RIVAL);
  const view = setupView(setup);
  assertEqual(view.rivals.length, RIVALS.length);
  assertEqual(view.rivals.every((entry) => entry.kind === KIND_CPU), true);

  // Wrapping backwards off the front lands on the last, which is the online
  // lobby's rule for a one-row picker.
  const atFirst = { ...setup, rivalId: RIVALS[0].id };
  assertEqual(setupRival(moveSetup(atFirst, "left")).id, RIVALS[RIVALS.length - 1].id);
  assertEqual(setupRival(moveSetup(moveSetup(atFirst, "left"), "right")).id, RIVALS[0].id);
});

test("a ghost for this board heads the strip and a ghost for another does not", () => {
  const setup = createSetup({ modeId: MODE_RIVAL, objectiveId: "quarter" });
  const ghost = { boardId: "distance:quarter", value: 12345, modelId: "toro-sv", events: [{ t: 0, k: "s", v: 0 }] };

  assertEqual(setupBoardId(setup), "distance:quarter");
  assertEqual(setupLineup(setup, ghost)[0].id, GHOST_ID);
  assertEqual(setupLineup(setup, ghost).length, RIVALS.length + 1);

  // The same ghost against a different distance is not this board's ghost.
  const mile = createSetup({ modeId: MODE_RIVAL, objectiveId: "mile" });
  assertEqual(setupLineup(mile, ghost).length, RIVALS.length);
});

test("walking off a board that has a ghost falls the cursor back to the roster", () => {
  // A stale rival id is normal rather than exceptional: the ghost is offered on
  // one distance and not the next, so it legitimately goes out from under the
  // cursor. Landing on nothing would leave the pane unraceable.
  const ghost = { boardId: "distance:quarter", value: 12345, modelId: "toro-sv", events: [{ t: 0, k: "s", v: 0 }] };
  const onGhost = { ...createSetup({ modeId: MODE_RIVAL, objectiveId: "quarter" }), rivalId: GHOST_ID };
  assertEqual(setupRival(onGhost, ghost).id, GHOST_ID);

  const moved = { ...onGhost, objectiveIndex: 3 }; // the mile, which has no ghost
  assert(setupRival(moved, ghost) !== null);
  assertEqual(setupRival(moved, ghost).kind, KIND_CPU);
});

test("a rival run files to the distance boards, not to boards of its own", () => {
  // The other car is in the other lane and there is no lateral axis in the sim
  // for it to reach across, so the run is physically a solo distance run and
  // belongs on the same board. Splitting it would break the loop the mode
  // exists for: beat your ghost, set a best, race the new ghost.
  assertEqual(setupBoardId(createSetup({ modeId: MODE_RIVAL, objectiveId: "quarter" })), "distance:quarter");
  assertEqual(
    setupBoardId(createSetup({ modeId: MODE_RIVAL, objectiveId: "half" })),
    setupBoardId(createSetup({ modeId: MODE_DISTANCE, objectiveId: "half" })),
  );
});

test("clicking a rival takes it and locks every pane behind it", () => {
  const setup = createSetup({ modeId: MODE_RIVAL });
  const clicked = focusSetup(setup, { pane: PANE_RIVAL, index: 2 });
  assertEqual(clicked.pane, PANE_RIVAL);
  assertEqual(setupRival(clicked).id, RIVALS[2].id);
  assertEqual(isPaneLocked(clicked, PANE_OBJECTIVE), true);
  assertEqual(isPaneLocked(clicked, PANE_MODEL), true);
});

test("the rival pane cannot be clicked into from a mode that has no rivals", () => {
  const setup = createSetup({ modeId: MODE_DISTANCE });
  assertEqual(focusSetup(setup, { pane: PANE_RIVAL, index: 1 }), setup);
});

test("rewinding reopens the first pane without touching a single choice", () => {
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_OBJECTIVE);
  const before = setupSelection(setup, garage);
  const rewound = rewindSetup(setup);
  assertEqual(rewound.pane, PANE_MODEL);
  assertEqual(setupSelection(rewound, garage).modelId, before.modelId);
  assertEqual(setupSelection(rewound, garage).trackId, before.trackId);
  assertEqual(setupSelection(rewound, garage).objectiveId, before.objectiveId);
});

test("moving never mutates the setup it was given", () => {
  const setup = createSetup();
  const snapshot = JSON.stringify(setup);
  moveSetup(setup, "right", EMPTY);
  moveSetup(setup, "down", EMPTY);
  assertEqual(JSON.stringify(setup), snapshot);
});

// ---------------------------------------------------------------------------
// Tracks and objectives
// ---------------------------------------------------------------------------

test("left and right walk the track strip once the track pane is live", () => {
  const setup = toPane(createSetup(), PANE_TRACK);
  assertEqual(setupTrack(moveSetup(setup, "right", EMPTY)).id, TRACKS[1].id);
});

test("moving in the track pane leaves the chosen car alone", () => {
  const setup = toPane(createSetup(), PANE_TRACK);
  const modelId = setupModel(setup).id;
  assertEqual(setupModel(moveSetup(setup, "right", EMPTY)).id, modelId);
});

test("the menu opens on the default mode and that mode's default objective", () => {
  const setup = createSetup();
  assertEqual(setupMode(setup).id, DEFAULT_MODE_ID);
  assert(setupObjective(setup), "a mode must always offer an objective");
});

test("the objective pane offers the mode's options, not one fixed list", () => {
  const distance = setupView(toPane(createSetup({ modeId: MODE_DISTANCE }), PANE_OBJECTIVE), EMPTY);
  const attack = setupView(toPane(createSetup({ modeId: MODE_TIME_ATTACK }), PANE_OBJECTIVE), EMPTY);
  assertEqual(distance.objective.options.length, modeById(MODE_DISTANCE).objective.options.length);
  assertEqual(attack.objective.options.length, modeById(MODE_TIME_ATTACK).objective.options.length);
  assert(distance.objective.kind !== attack.objective.kind, "the two modes measure different things");
});

test("switching modes falls back to the new mode's default rather than an alien id", () => {
  // "quarter" means nothing to a mode measured on a clock.
  const setup = createSetup({ modeId: MODE_TIME_ATTACK, objectiveId: "quarter" });
  assertEqual(setupObjective(setup).kind ?? OBJECTIVE_TIME, setupObjective(setup).kind ?? OBJECTIVE_TIME);
  assert(
    modeById(MODE_TIME_ATTACK).objective.options.some((o) => o.id === setupObjective(setup).id),
    "the objective must belong to the mode being set up",
  );
});

test("an unknown mode opens on a real one rather than on nothing", () => {
  const setup = createSetup({ modeId: "drift-king" });
  assertEqual(setupMode(setup).id, DEFAULT_MODE_ID);
});

test("left and right walk the objective options once that pane is live", () => {
  // The default objective is not necessarily the first option, so this steps
  // relative to wherever the cursor opens rather than assuming index zero.
  const setup = toPane(createSetup({ modeId: MODE_DISTANCE }), PANE_OBJECTIVE);
  const options = modeById(MODE_DISTANCE).objective.options;
  const start = options.findIndex((option) => option.id === setupObjective(setup).id);
  assertEqual(setupObjective(moveSetup(setup, "right", EMPTY)).id, options[start + 1].id);
  assertEqual(setupObjective(moveSetup(setup, "left", EMPTY)).id, options[start - 1].id);
});

// ---------------------------------------------------------------------------
// Selection and resolution
// ---------------------------------------------------------------------------

test("the selection names every part of the race by id", () => {
  const garage = stockedGarage();
  const selection = setupSelection(createSetup({}, garage), garage);
  assert(selection.modeId && selection.modelId && selection.trackId && selection.objectiveId);
  assert(selection.livery, "the selection must carry the livery, not just its id");
});

test("a selection carries straight through to the race the mode describes", () => {
  const selection = setupSelection(createSetup({ modeId: MODE_TIME_ATTACK }), EMPTY);
  const options = raceOptionsFor(selection.modeId, selection.objectiveId);
  assert(options, "a selection must build race options");
});

test("a selection resolves to the model, livery and track needed to race it", () => {
  const garage = stockedGarage();
  const setup = moveSetup(toPane(createSetup({}, garage), PANE_PRESET), "down", garage);
  const resolved = resolveSelection(setupSelection(setup, garage));
  assert(resolved.model && resolved.track && resolved.livery);
  assertEqual(resolved.livery.paint.hue, 215);
});

test("every reachable selection resolves, so no cursor position can fail to start", () => {
  const groups = modelsByGroup();
  for (let row = 0; row < groups.length; row += 1) {
    for (let column = 0; column < groups[row].models.length; column += 1) {
      const setup = { ...createSetup(), model: { row, column } };
      assert(
        resolveSelection(setupSelection(setup, EMPTY)),
        `row ${row} column ${column} does not resolve`,
      );
    }
  }
});

test("a stale selection fails loudly rather than half-loading", () => {
  assertEqual(resolveSelection({ modelId: DEFAULT_MODEL_ID, trackId: "track-z" }), null);
  assertEqual(resolveSelection({ modelId: "monster-truck", trackId: DEFAULT_TRACK_ID }), null);
  assertEqual(resolveSelection({}), null);
});

test("a resolved livery is normalized, so a hostile preset cannot reach the road", () => {
  const resolved = resolveSelection({
    modelId: DEFAULT_MODEL_ID,
    trackId: DEFAULT_TRACK_ID,
    livery: { paint: { hue: 9999, finish: "chrome" } },
  });
  assertEqual(resolved.livery.paint.finish, "gloss");
  assert(resolved.livery.paint.hue >= 0 && resolved.livery.paint.hue <= 359);
});

// ---------------------------------------------------------------------------
// The view model
// ---------------------------------------------------------------------------

test("the view model lays the grid out one row per archetype", () => {
  const view = setupView(createSetup(), EMPTY);
  assertEqual(view.groups.length, MODEL_GROUPS.length);
  view.groups.forEach((group, row) => {
    assertEqual(group.row, row);
    assertEqual(group.id, MODEL_GROUPS[row].id);
    assert(group.cells.length > 0, `${group.id} draws as an empty row`);
  });
});

test("exactly one cell is selected, and only in the live pane", () => {
  const live = setupView(createSetup(), EMPTY);
  const selected = live.groups.flatMap((g) => g.cells).filter((cell) => cell.selected);
  assertEqual(selected.length, 1);

  const elsewhere = setupView(toPane(createSetup(), PANE_TRACK), EMPTY);
  assertEqual(elsewhere.groups.flatMap((g) => g.cells).filter((cell) => cell.selected).length, 0);
});

test("what is chosen stays marked after the cursor leaves its pane", () => {
  // Collapse `selected` into `chosen` and leaving a pane silently loses all
  // trace of what was picked in it.
  const view = setupView(toPane(createSetup(), PANE_TRACK), EMPTY);
  const chosen = view.groups.flatMap((g) => g.cells).filter((cell) => cell.chosen);
  assertEqual(chosen.length, 1);
  assertEqual(chosen[0].id, DEFAULT_MODEL_ID);
});

test("the view model marks the locked pick apart from the one still being browsed", () => {
  const browsing = setupView(createSetup(), EMPTY);
  assertEqual(browsing.groups.flatMap((g) => g.cells).filter((cell) => cell.locked).length, 0);

  const locked = setupView(toPane(createSetup(), PANE_TRACK), EMPTY);
  assertEqual(locked.groups.flatMap((g) => g.cells).filter((cell) => cell.locked).length, 1);
  assertEqual(locked.locked.model, true);
  assertEqual(locked.locked.track, false);
});

test("the view model says what ENTER will do on the pane you are standing on", () => {
  assertEqual(setupView(createSetup(), EMPTY).prompt, "LOCK CAR");
  assertEqual(setupView(toPane(createSetup(), PANE_PRESET), EMPTY).prompt, "LOCK PAINT");
  assertEqual(setupView(toPane(createSetup(), PANE_OBJECTIVE), EMPTY).prompt, "START");
});

test("every cell carries the source rect and sheet the renderer needs", () => {
  for (const cell of setupView(createSetup(), EMPTY).groups.flatMap((g) => g.cells)) {
    assert(cell.sheetId && cell.src, `${cell.id} cannot be drawn`);
    assert(cell.sw > 0 && cell.sh > 0, `${cell.id} has no source rect`);
    assert(cell.label, `${cell.id} has no label`);
  }
});

test("the config list arrives pre-shaped, with no garage lookup left to the renderer", () => {
  const garage = stockedGarage();
  const view = setupView(createSetup({}, garage), garage);
  // Factory, two saved configs, and the Customise action.
  assertEqual(view.presets.options.length, 4);
  for (const option of view.presets.options) {
    assert(option.name, "every config row needs a name");
    assertEqual(typeof option.index, "number");
    if (!option.action) {
      assert(option.livery, "every config row needs a livery to draw its swatch from");
    }
  }
  assertEqual(view.presets.options[3].action, true);
  assertEqual(view.presets.options[3].livery, null, "the action row has no paint to swatch");
});

test("signed out, the Customise row says why rather than disappearing", () => {
  // Customization is account-backed, so there is nowhere to save a config. A
  // control that vanishes teaches nothing, and one that accepts a paint and then
  // silently fails to keep it is worse than either.
  const garage = stockedGarage();
  const setup = createSetup({}, garage);
  const signedIn = setupView(setup, garage, { canCustomise: true });
  const signedOut = setupView(setup, garage, { canCustomise: false });

  assertEqual(signedIn.presets.options.length, signedOut.presets.options.length);
  const row = signedOut.presets.options.find((option) => option.action);
  assertEqual(row.disabled, true);
  assert(row.name.toLowerCase().includes("sign in"), `expected a sign-in prompt, got "${row.name}"`);
  assertEqual(signedIn.presets.options.find((option) => option.action).disabled, undefined);
});

test("the sign-in state changes nothing about the saved configs themselves", () => {
  // A cached garage from a previous session must still be listed and raceable.
  const garage = stockedGarage();
  const view = setupView(createSetup({}, garage), garage, { canCustomise: false });
  const configs = view.presets.options.filter((option) => !option.action);
  assertEqual(configs.length, 3);
  assertEqual(configs[1].name, "Ocean");
});

test("the Customise row is last, so a config is never a keypress further away", () => {
  const garage = stockedGarage();
  const rows = setupPresetRows(createSetup({}, garage), garage);
  assertEqual(rows[rows.length - 1].id, PRESET_ACTION_CUSTOMISE);
  assertEqual(rows.filter((row) => row.action).length, 1);
});

test("walking onto the Customise row does not change the paint being raced", () => {
  // Browsing past the action must not silently repaint the car.
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_PRESET);
  setup = moveSetup(setup, "down", garage);          // Ocean
  assertEqual(setupPreset(setup, garage).name, "Ocean");
  setup = moveSetup(setup, "down", garage);          // Lime
  setup = moveSetup(setup, "down", garage);          // Customise…
  assertEqual(isPresetActionFocused(setup, garage), true);
  assertEqual(setupPreset(setup, garage).name, "Lime", "the pick must survive parking on the action");
});

test("confirming the Customise row asks for the garage instead of locking the pane", () => {
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_PRESET);
  for (let i = 0; i < 4; i += 1) setup = moveSetup(setup, "down", garage);
  const result = confirmSetup(setup, garage);
  assertEqual(result.customise, true);
  assertEqual(result.done, false);
  assertEqual(result.setup.pane, PANE_PRESET, "the pane must not advance");
});

test("confirming a real config still locks the pane and moves on", () => {
  const garage = stockedGarage();
  const setup = toPane(createSetup({}, garage), PANE_PRESET);
  const result = confirmSetup(setup, garage);
  assertEqual(result.customise, undefined);
  assertEqual(result.setup.pane, PANE_TRACK);
});

test("the cursor and the pick are marked separately on the action row", () => {
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_PRESET);
  for (let i = 0; i < 4; i += 1) setup = moveSetup(setup, "down", garage);
  const view = setupView(setup, garage);
  const selected = view.presets.options.filter((option) => option.selected);
  const chosen = view.presets.options.filter((option) => option.chosen);
  assertEqual(selected.length, 1);
  assertEqual(selected[0].action, true);
  assertEqual(chosen.length, 1);
  assertEqual(chosen[0].action, undefined, "an action row can never be the chosen paint");
});

test("changing model keeps the cursor on a real config rather than an action", () => {
  const garage = stockedGarage();
  let setup = toPane(createSetup({}, garage), PANE_PRESET);
  for (let i = 0; i < 4; i += 1) setup = moveSetup(setup, "down", garage);
  setup = cancelSetup(setup).setup;
  setup = moveSetup(setup, "down", garage);
  assertEqual(isPresetActionFocused(setup, garage), false);
  assert(setupPreset(setup, garage), "the new model must still resolve a paint");
});

test("the view model carries the chosen car, config, livery and track", () => {
  const garage = stockedGarage();
  const view = setupView(createSetup({}, garage), garage);
  assertEqual(view.chosenModel.id, DEFAULT_MODEL_ID);
  assert(view.chosenPreset && view.chosenLivery && view.chosenTrack);
});

test("the objective pane is only live when the cursor is in it", () => {
  const early = setupView(createSetup(), EMPTY);
  assertEqual(early.objective.options.some((option) => option.selected), false);
  const late = setupView(toPane(createSetup(), PANE_OBJECTIVE), EMPTY);
  assertEqual(late.objective.options.filter((option) => option.selected).length, 1);
});

test("every objective option carries the label the renderer prints", () => {
  for (const option of setupView(createSetup(), EMPTY).objective.options) {
    assert(option.label, `${option.id} has no label`);
  }
});

test("every track offers a label and a blurb to show under the preview", () => {
  for (const track of setupView(createSetup(), EMPTY).tracks) {
    assert(track.label && track.blurb, `${track.id} is missing display text`);
  }
});

test("the view model says which mode is being set up", () => {
  const view = setupView(createSetup({ modeId: MODE_TIME_ATTACK }), EMPTY);
  assertEqual(view.mode.id, MODE_TIME_ATTACK);
  assert(view.mode.label && view.mode.blurb);
});

// ---------------------------------------------------------------------------
// The one-row pickers (the online lobby's car and paint rows)
// ---------------------------------------------------------------------------
//
// The lobby picks a car from a single row rather than a grid, and it steps the
// same setup the solo picker does — there is one answer in this cabinet to "what
// am I driving", and the lobby is a second way to change it rather than a second
// copy of it.

test("stepping the car walks the whole roster in the order the grid reads it", () => {
  const roster = modelsByGroup().flatMap((group) => group.models);
  let setup = createSetup({ modelId: roster[0].id }, EMPTY);
  const seen = [setupModel(setup).id];
  for (let i = 1; i < roster.length; i += 1) {
    setup = cycleSetupModel(setup, 1, EMPTY);
    seen.push(setupModel(setup).id);
  }
  assertEqual(seen.join(","), roster.map((model) => model.id).join(","));
});

test("the car row wraps, because a one-row picker has no edge to lose a cursor against", () => {
  const roster = modelsByGroup().flatMap((group) => group.models);
  const first = createSetup({ modelId: roster[0].id }, EMPTY);
  assertEqual(setupModel(cycleSetupModel(first, -1, EMPTY)).id, roster.at(-1).id);
  const last = createSetup({ modelId: roster.at(-1).id }, EMPTY);
  assertEqual(setupModel(cycleSetupModel(last, 1, EMPTY)).id, roster[0].id);
});

test("stepping the car does not disturb the track or the objective", () => {
  const before = createSetup({ trackId: "track-d", objectiveId: "half" }, EMPTY);
  const after = cycleSetupModel(before, 1, EMPTY);
  assertEqual(setupTrack(after).id, "track-d");
  assertEqual(setupObjective(after).id, "half");
});

test("stepping the paint moves the pick, not just a browsing cursor", () => {
  const garage = stockedGarage();
  const options = presetOptionsFor(DEFAULT_MODEL_ID, garage);
  assertEqual(options.length, 3, "Factory plus the two saved configs");

  let setup = createSetup({ modelId: DEFAULT_MODEL_ID }, garage);
  assertEqual(setupPreset(setup, garage).factory, true, "starts on Factory");
  setup = cycleSetupPreset(setup, 1, garage);
  assertEqual(setupPreset(setup, garage).name, options[1].name);
  assertEqual(setup.presetIndex, setup.chosenPresetIndex, "the cursor and the pick stay together");
});

test("the paint row wraps through Factory rather than stopping on it", () => {
  const garage = stockedGarage();
  const setup = createSetup({ modelId: DEFAULT_MODEL_ID }, garage);
  assertEqual(setupPreset(cycleSetupPreset(setup, -1, garage), garage).name, "Lime");
});

test("a car with nothing saved for it still has a paint row that does not break", () => {
  // Factory is the only option, so stepping it is a no-op rather than an index
  // walking off the end of a one-item list.
  const setup = createSetup({ modelId: DEFAULT_MODEL_ID }, EMPTY);
  for (const step of [1, -1]) {
    assertEqual(setupPreset(cycleSetupPreset(setup, step, EMPTY), EMPTY).factory, true);
  }
});

test("Circuit Race defaults to Old Town, offers Docklands, and blocks models without directional art", () => {
  const available = createSetup({ modeId: MODE_CIRCUIT, modelId: "kaido-gts" });
  assertEqual(setupTrack(available).id, "old-town-shrine-loop");
  assertEqual(setupTrack(moveSetup({ ...available, pane: PANE_TRACK }, "right", EMPTY)).id, "docklands-freight-loop");
  assertEqual(setupView(available, EMPTY).start.disabled, false);

  const unavailable = createSetup({ modeId: MODE_CIRCUIT, modelId: "shutter-z" });
  const view = setupView(unavailable, EMPTY);
  assertEqual(view.start.disabled, true);
  assertEqual(view.start.label, "ATLAS UNAVAILABLE");
  const result = confirmSetup({ ...unavailable, pane: PANE_OBJECTIVE }, EMPTY);
  assertEqual(result.done, false);
  assertEqual(result.unavailable, true);
});

test("Circuit Race setup lets the player choose CPU difficulty", () => {
  let setup = createSetup({ modeId: MODE_CIRCUIT, difficultyId: "easy" });
  assert(panesFor(setup).includes(PANE_DIFFICULTY));
  assertEqual(setupDifficulty(setup).id, "easy");
  assertEqual(setupSelection(setup).difficultyId, "easy");

  setup = toPane(setup, PANE_DIFFICULTY);
  setup = moveSetup(setup, "right", EMPTY);
  assertEqual(setupDifficulty(setup).id, "normal");
  assertEqual(setupView(setup, EMPTY).prompt, "START");

  assert(!panesFor(createSetup({ modeId: MODE_DISTANCE })).includes(PANE_DIFFICULTY));
  assertEqual(setupSelection(createSetup({ modeId: MODE_DISTANCE })).difficultyId, null);
});

test("changing car clamps a paint pick that the new car does not have", () => {
  const garage = stockedGarage();
  let setup = createSetup({ modelId: DEFAULT_MODEL_ID }, garage);
  setup = cycleSetupPreset(setup, -1, garage); // the last of three
  const moved = cycleSetupModel(setup, 1, garage); // a car with only Factory
  assertEqual(setupPreset(moved, garage).factory, true, "a preset belongs to one model");
});

finish();
