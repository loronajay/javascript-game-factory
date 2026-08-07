import { suite, test, assert, assertEqual, assertDeepEqual, finish } from "./harness.js";

import {
  MAX_PRESETS_PER_MODEL,
  MAX_PRESET_NAME_LENGTH,
  createGarage,
  emptyGarage,
  presetsForModel,
  presetById,
  selectedModelId,
  selectedPreset,
  selectedLivery,
  selectedLoadout,
  canSavePreset,
  selectModel,
  selectPreset,
  selectFactory,
  savePreset,
  updatePreset,
  renamePreset,
  deletePreset,
  isDirty,
  serializeGarage,
} from "../scripts/garage/garage.js";
import { DEFAULT_LIVERY, createLivery } from "../scripts/garage/livery.js";

suite("garage — saved configs and which one goes to the line");

const KNOWN = ["kaido-gts", "toro-sv", "colt-gt"];
const options = { isKnownModel: (id) => KNOWN.includes(id) };

const withPreset = (garage, modelId, name, livery) =>
  savePreset(garage, { modelId, name, livery });

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

test("a garage built from nothing is empty and sits on factory", () => {
  const garage = createGarage();
  assertEqual(garage.presets.length, 0);
  assertEqual(selectedPreset(garage), null);
  assertDeepEqual(selectedLivery(garage), DEFAULT_LIVERY);
});

test("garbage input normalizes rather than throwing", () => {
  for (const input of [null, undefined, 0, "", [], true, NaN]) {
    const garage = createGarage(input);
    assertEqual(garage.presets.length, 0, `presets for ${String(input)}`);
  }
});

test("malformed presets are dropped, good ones survive", () => {
  const garage = createGarage(
    {
      presets: [
        null,
        "nonsense",
        { modelId: "" },
        { modelId: "kaido-gts", name: "Keep", livery: {} },
        { noModel: true },
      ],
    },
    options,
  );
  assertEqual(garage.presets.length, 1);
  assertEqual(garage.presets[0].name, "Keep");
});

test("presets for a model that no longer exists are dropped", () => {
  // A retired model would otherwise sit in the picker resolving to no sprite.
  const garage = createGarage(
    { presets: [{ modelId: "kaido-gts", name: "Keep" }, { modelId: "deleted-car", name: "Gone" }] },
    options,
  );
  assertEqual(garage.presets.length, 1);
  assertEqual(garage.presets[0].modelId, "kaido-gts");
});

test("duplicate preset ids are dropped rather than letting the last writer win", () => {
  const garage = createGarage(
    {
      presets: [
        { id: "dup", modelId: "kaido-gts", name: "First" },
        { id: "dup", modelId: "toro-sv", name: "Second" },
      ],
    },
    options,
  );
  assertEqual(garage.presets.length, 1);
  assertEqual(garage.presets[0].name, "First");
});

test("stored presets beyond the per-model cap are dropped on load", () => {
  const presets = [];
  for (let i = 0; i < MAX_PRESETS_PER_MODEL + 4; i += 1) {
    presets.push({ id: `kaido-gts#${i + 1}`, modelId: "kaido-gts", name: `P${i}` });
  }
  const garage = createGarage({ presets }, options);
  assertEqual(presetsForModel(garage, "kaido-gts").length, MAX_PRESETS_PER_MODEL);
});

test("preset liveries are normalized on the way in", () => {
  const garage = createGarage(
    { presets: [{ modelId: "kaido-gts", livery: { paint: { hue: 9999, finish: "chrome" } } }] },
    options,
  );
  assertEqual(garage.presets[0].livery.paint.finish, "gloss");
  assert(garage.presets[0].livery.paint.hue >= 0 && garage.presets[0].livery.paint.hue <= 359);
});

test("long preset names are truncated rather than rejected", () => {
  const garage = withPreset(emptyGarage(), "kaido-gts", "x".repeat(200));
  assertEqual(garage.presets[0].name.length, MAX_PRESET_NAME_LENGTH);
});

test("a blank name falls back rather than leaving an unlabelled row", () => {
  const garage = withPreset(emptyGarage(), "kaido-gts", "   ");
  assert(garage.presets[0].name.length > 0);
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

test("selecting a model keeps factory until a preset is chosen", () => {
  const garage = selectModel(emptyGarage(), "toro-sv");
  assertEqual(selectedModelId(garage), "toro-sv");
  assertEqual(selectedPreset(garage), null);
  assertDeepEqual(selectedLivery(garage), DEFAULT_LIVERY);
});

test("selecting a preset moves the model with it", () => {
  // The preset knows which car it is for, so selecting one cannot leave the
  // picker pointing at a different body.
  let garage = withPreset(emptyGarage("kaido-gts"), "toro-sv", "Bull");
  garage = selectModel(garage, "kaido-gts");
  garage = selectPreset(garage, garage.presets[0].id);
  assertEqual(selectedModelId(garage), "toro-sv");
});

test("a selection naming a preset that does not exist falls back to factory", () => {
  const garage = createGarage(
    { presets: [], selection: { modelId: "kaido-gts", presetId: "ghost" } },
    options,
  );
  assertEqual(selectedModelId(garage), "kaido-gts");
  assertEqual(selectedPreset(garage), null);
});

test("a stored selection whose model and preset disagree follows the preset", () => {
  const garage = createGarage(
    {
      presets: [{ id: "p1", modelId: "toro-sv", name: "Bull" }],
      selection: { modelId: "kaido-gts", presetId: "p1" },
    },
    options,
  );
  assertEqual(selectedModelId(garage), "toro-sv");
});

test("selecting an unknown preset leaves the pick alone", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "Keep");
  const before = selectedPreset(garage).id;
  garage = selectPreset(garage, "ghost");
  assertEqual(selectedPreset(garage).id, before);
});

test("selectFactory drops back to the default without changing model", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "Keep", { paint: { hue: 120 } });
  garage = selectFactory(garage);
  assertEqual(selectedModelId(garage), "kaido-gts");
  assertEqual(selectedPreset(garage), null);
  assertDeepEqual(selectedLivery(garage), DEFAULT_LIVERY);
});

test("there is always a car to race", () => {
  // selectedLivery must never be null: the setup screen has no fallback path.
  assert(selectedLivery(emptyGarage()));
  assert(selectedLivery(createGarage(null)));
  assert(selectedLoadout(emptyGarage()).livery);
});

// ---------------------------------------------------------------------------
// Saving, renaming, deleting
// ---------------------------------------------------------------------------

test("saving a preset selects it", () => {
  const livery = createLivery({ paint: { hue: 200, saturation: 0.6 } });
  const garage = withPreset(emptyGarage(), "kaido-gts", "Ocean", livery);
  assertEqual(selectedPreset(garage).name, "Ocean");
  assertDeepEqual(selectedLivery(garage), livery);
});

test("saving does not mutate the garage handed in", () => {
  const before = emptyGarage();
  withPreset(before, "kaido-gts", "Ocean");
  assertEqual(before.presets.length, 0);
});

test("preset ids are unique even across identical names and models", () => {
  let garage = emptyGarage();
  for (let i = 0; i < MAX_PRESETS_PER_MODEL; i += 1) {
    garage = withPreset(garage, "kaido-gts", "Same");
  }
  assertEqual(new Set(garage.presets.map((preset) => preset.id)).size, MAX_PRESETS_PER_MODEL);
});

test("ids are not re-minted after a round trip through storage", () => {
  // A garage rebuilt from its own serialized form must be identical, or preset
  // ids would churn every load and the server would see phantom changes.
  let garage = withPreset(emptyGarage(), "kaido-gts", "Ocean");
  garage = withPreset(garage, "toro-sv", "Bull");
  const reloaded = createGarage(serializeGarage(garage), options);
  assertDeepEqual(serializeGarage(reloaded), serializeGarage(garage));
});

test("a full model refuses the save rather than dropping the oldest preset", () => {
  let garage = emptyGarage();
  for (let i = 0; i < MAX_PRESETS_PER_MODEL; i += 1) {
    garage = withPreset(garage, "kaido-gts", `P${i}`);
  }
  assertEqual(canSavePreset(garage, "kaido-gts"), false);
  const after = withPreset(garage, "kaido-gts", "OneMore");
  assertEqual(presetsForModel(after, "kaido-gts").length, MAX_PRESETS_PER_MODEL);
  assert(!presetsForModel(after, "kaido-gts").some((preset) => preset.name === "OneMore"));
});

test("filling one model does not block another", () => {
  let garage = emptyGarage();
  for (let i = 0; i < MAX_PRESETS_PER_MODEL; i += 1) {
    garage = withPreset(garage, "kaido-gts", `P${i}`);
  }
  assertEqual(canSavePreset(garage, "toro-sv"), true);
  garage = withPreset(garage, "toro-sv", "Bull");
  assertEqual(presetsForModel(garage, "toro-sv").length, 1);
});

test("presets are listed per model", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "A");
  garage = withPreset(garage, "toro-sv", "B");
  garage = withPreset(garage, "kaido-gts", "C");
  assertDeepEqual(presetsForModel(garage, "kaido-gts").map((p) => p.name), ["A", "C"]);
  assertDeepEqual(presetsForModel(garage, "toro-sv").map((p) => p.name), ["B"]);
});

test("renaming changes only the name", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "Old", { paint: { hue: 90 } });
  const id = garage.presets[0].id;
  const before = garage.presets[0].livery;
  garage = renamePreset(garage, id, "New");
  assertEqual(presetById(garage, id).name, "New");
  assertDeepEqual(presetById(garage, id).livery, before);
});

test("updating a livery keeps the id and the name", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "Keep");
  const id = garage.presets[0].id;
  garage = updatePreset(garage, id, { livery: { paint: { hue: 300 } } });
  assertEqual(presetById(garage, id).name, "Keep");
  assertEqual(presetById(garage, id).livery.paint.hue, 300);
});

test("updating an unknown preset is a no-op", () => {
  const garage = withPreset(emptyGarage(), "kaido-gts", "Keep");
  assertDeepEqual(updatePreset(garage, "ghost", { name: "X" }), garage);
});

test("deleting the selected preset falls back to factory, not a neighbour", () => {
  // Jumping to another config after a delete is how a player ends up racing
  // paint they never chose.
  let garage = withPreset(emptyGarage(), "kaido-gts", "First", { paint: { hue: 10 } });
  garage = withPreset(garage, "kaido-gts", "Second", { paint: { hue: 20 } });
  garage = deletePreset(garage, selectedPreset(garage).id);
  assertEqual(selectedPreset(garage), null);
  assertEqual(selectedModelId(garage), "kaido-gts");
  assertDeepEqual(selectedLivery(garage), DEFAULT_LIVERY);
});

test("deleting an unselected preset leaves the selection alone", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "First");
  const first = garage.presets[0].id;
  garage = withPreset(garage, "kaido-gts", "Second");
  const selected = selectedPreset(garage).id;
  garage = deletePreset(garage, first);
  assertEqual(selectedPreset(garage).id, selected);
});

test("deleting an unknown preset is a no-op", () => {
  const garage = withPreset(emptyGarage(), "kaido-gts", "Keep");
  assertDeepEqual(deletePreset(garage, "ghost"), garage);
});

test("deleting the last preset for a model leaves it raceable", () => {
  let garage = withPreset(emptyGarage(), "kaido-gts", "Only");
  garage = deletePreset(garage, garage.presets[0].id);
  assertEqual(presetsForModel(garage, "kaido-gts").length, 0);
  assert(selectedLivery(garage), "the model must still be raceable on factory paint");
});

// ---------------------------------------------------------------------------
// Dirty tracking and serialization
// ---------------------------------------------------------------------------

test("dirty is false against the selection's own livery", () => {
  const livery = createLivery({ paint: { hue: 120 } });
  const garage = withPreset(emptyGarage(), "kaido-gts", "Keep", livery);
  assertEqual(isDirty(garage, livery), false);
  assertEqual(isDirty(garage, { paint: { hue: 121 } }), true);
});

test("an unsaved edit against factory reads as dirty", () => {
  const garage = emptyGarage("kaido-gts");
  assertEqual(isDirty(garage, DEFAULT_LIVERY), false);
  assertEqual(isDirty(garage, { paint: { hue: 45, saturation: 0.5 } }), true);
});

test("the loadout is a model plus a livery, with no preset id in it", () => {
  // This is what the server stores and hands an opponent; a preset id means
  // nothing inside anyone else's garage.
  const garage = withPreset(emptyGarage(), "toro-sv", "Bull", { paint: { hue: 45 } });
  const loadout = selectedLoadout(garage);
  assertEqual(loadout.modelId, "toro-sv");
  assertEqual(loadout.livery.paint.hue, 45);
  assertEqual(loadout.presetId, undefined);
});

test("serialization keeps only the fields that survive a round trip", () => {
  const garage = withPreset(emptyGarage(), "kaido-gts", "Keep");
  const serialized = serializeGarage({ ...garage, scratch: "should not travel" });
  assertEqual(serialized.scratch, undefined);
  assertDeepEqual(Object.keys(serialized).sort(), ["nextPresetNumber", "presets", "selection"]);
});

finish();
