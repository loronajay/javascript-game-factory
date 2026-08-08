import { suite, test, assert, assertEqual, assertThrows, finish } from "./harness.js";

import { RACE_DISTANCES } from "../scripts/sim/constants.js";
import {
  MODES,
  MODE_DISTANCE,
  MODE_TIME_ATTACK,
  MODE_ONLINE,
  OBJECTIVE_DISTANCE,
  OBJECTIVE_TIME,
  DEFAULT_MODE_ID,
  modeById,
  playableModes,
  objectiveOption,
  raceOptionsFor,
} from "../scripts/sim/modes.js";

suite("modes — the catalog the menu and the race are both built from");

// ---------------------------------------------------------------------------
// Catalog integrity
// ---------------------------------------------------------------------------

test("every mode is uniquely identified", () => {
  const ids = MODES.map((mode) => mode.id);
  assertEqual(new Set(ids).size, ids.length, "an id is what a menu selection and a save file store");
});

test("every mode carries the copy the menu needs", () => {
  for (const mode of MODES) {
    assert(mode.label, `${mode.id} has no label`);
    assert(mode.blurb, `${mode.id} has no blurb to explain itself with`);
  }
});

test("an unavailable mode says why, and an available one does not need to", () => {
  for (const mode of MODES) {
    if (!mode.available) {
      assert(mode.note, `${mode.id} is locked with no explanation`);
    }
  }
});

test("the default mode is one that can actually be played", () => {
  const mode = modeById(DEFAULT_MODE_ID);
  assert(mode, "the default must name a real mode");
  assert(mode.available, "opening the menu on a locked mode would be a dead end");
});

test("an unknown id resolves to nothing rather than to something plausible", () => {
  assertEqual(modeById("drift"), null);
});

test("the playable list is exactly the available modes", () => {
  assert(playableModes().every((mode) => mode.available));
  assertEqual(
    playableModes().length,
    MODES.filter((mode) => mode.available).length,
    "nothing available should be missing from the list",
  );
});

// ---------------------------------------------------------------------------
// Objectives — the third setup pane's options
// ---------------------------------------------------------------------------

test("every mode offers at least one objective option", () => {
  for (const mode of MODES) {
    assert(mode.objective.options.length > 0, `${mode.id} offers nothing to pick`);
    assert(mode.objective.label, `${mode.id}'s objective pane has no heading`);
  }
});

test("every objective option is uniquely identified within its mode", () => {
  for (const mode of MODES) {
    const ids = mode.objective.options.map((option) => option.id);
    assertEqual(new Set(ids).size, ids.length, `${mode.id} has duplicate option ids`);
  }
});

test("every mode's default option is one of the options it offers", () => {
  for (const mode of MODES) {
    const found = mode.objective.options.some((option) => option.id === mode.objective.defaultId);
    assert(found, `${mode.id} defaults to an option it does not list`);
  }
});

test("an unknown option falls back to the mode's default rather than to nothing", () => {
  const mode = modeById(MODE_DISTANCE);
  assertEqual(objectiveOption(mode, "furlong").id, mode.objective.defaultId);
  assertEqual(objectiveOption(mode, undefined).id, mode.objective.defaultId);
});

test("distance modes measure in metres and time modes measure in seconds", () => {
  for (const mode of MODES) {
    for (const option of mode.objective.options) {
      if (mode.objective.kind === OBJECTIVE_DISTANCE) {
        assert(option.metres > 0, `${mode.id}/${option.id} has no distance`);
      } else {
        assert(option.seconds > 0, `${mode.id}/${option.id} has no clock`);
      }
      assert(option.label, `${mode.id}/${option.id} has no label`);
    }
  }
});

test("the distance modes offer the distances the race constants define", () => {
  const mode = modeById(MODE_DISTANCE);
  assertEqual(mode.objective.kind, OBJECTIVE_DISTANCE);
  for (const option of mode.objective.options) {
    assertEqual(option.metres, RACE_DISTANCES[option.id].metres, `${option.id} drifted from the constant`);
  }
});

test("time attack is measured on a clock", () => {
  assertEqual(modeById(MODE_TIME_ATTACK).objective.kind, OBJECTIVE_TIME);
});

// ---------------------------------------------------------------------------
// Handing an objective to the race
// ---------------------------------------------------------------------------

test("a distance mode produces a distance and no clock", () => {
  const options = raceOptionsFor(MODE_DISTANCE, "quarter");
  assertEqual(options.distanceMetres, RACE_DISTANCES.quarter.metres);
  assertEqual(options.timeLimitSeconds, null);
});

test("time attack produces a clock and no distance", () => {
  const mode = modeById(MODE_TIME_ATTACK);
  const first = mode.objective.options[0];
  const options = raceOptionsFor(MODE_TIME_ATTACK, first.id);
  assertEqual(options.timeLimitSeconds, first.seconds);
  assertEqual(options.distanceMetres, null);
});

test("every mode and option pair produces exactly one objective", () => {
  // A race with both, or with neither, is not a race — see createRace.
  for (const mode of MODES) {
    for (const option of mode.objective.options) {
      const produced = raceOptionsFor(mode.id, option.id);
      const named = [produced.distanceMetres, produced.timeLimitSeconds].filter((v) => v !== null);
      assertEqual(named.length, 1, `${mode.id}/${option.id} named ${named.length} objectives`);
    }
  }
});

test("online is playable and shapes a real race", () => {
  const online = modeById(MODE_ONLINE);
  assertEqual(online.available, true, "casual online is shipped");
  const options = raceOptionsFor(MODE_ONLINE, online.objective.defaultId);
  assert(options.distanceMetres > 0);
  assertEqual(options.timeLimitSeconds, null, "a versus race ends at a line, not on a clock");
});

test("online is the one mode that skips the solo setup screen", () => {
  // The strip, the distance and the match length belong to the room both drivers
  // are in, so the shell sends this mode to the lobby instead. Every other mode
  // picks its own, and must not carry the flag.
  assertEqual(modeById(MODE_ONLINE).online, true);
  for (const mode of MODES) {
    if (mode.id === MODE_ONLINE) continue;
    assert(!mode.online, `${mode.id} picks its own race and belongs on the setup screen`);
  }
});

test("an unknown mode fails loudly rather than racing something arbitrary", () => {
  assertThrows(() => raceOptionsFor("drift", "quarter"));
});

finish();
