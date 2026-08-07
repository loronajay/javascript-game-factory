// The garage: a player's saved car configurations, and which one they are taking
// to the line.
//
// PURE. Same split as `radio/playlist.js` — this is the transport reducer for
// the picker, and `garage/garage-store.js` is the impure layer that syncs it.
// Every operation returns a new garage rather than mutating, because callers
// (the setup screen, the pending save, the last state sent to the server) can
// legitimately hold an older one.
//
// **A preset belongs to one model.** That is the shape the picker asks for: you
// click a car, then choose among the configs you have built *for that car*. A
// paint scheme is not portable between bodies here — the same hue reads
// differently across 24 silhouettes, and a flat global list of liveries would
// make the second level of the picker meaningless.
//
// **`presetId: null` means the factory default, and it is not a row.** Every
// model has to be raceable before the player has saved anything for it, and the
// obvious alternative — materialising 24 default presets — makes "delete" and
// "rename" answer awkwardly for rows the player never created. A null selection
// resolves to `DEFAULT_LIVERY`, so deleting the last preset for a model falls
// back to factory on its own with no special case anywhere.
//
// **Preset ids come from a counter in the state, not from a clock or a random
// source.** That is what keeps this module pure and its tests deterministic, and
// it means a garage round-tripped through storage or the server rebuilds
// identically rather than re-minting ids.

import { createLivery, normalizeLivery, liveryEquals, DEFAULT_LIVERY } from "./livery.js";

/** How many configs a player may keep per model. */
export const MAX_PRESETS_PER_MODEL = 6;

/** Longest preset name kept. Longer names are truncated, never rejected. */
export const MAX_PRESET_NAME_LENGTH = 24;

/** Total presets kept across every model — a bound on what storage can grow to. */
export const MAX_PRESETS = MAX_PRESETS_PER_MODEL * 40;

const FACTORY_LABEL = "Factory";

/** The name shown for the null selection. Not a preset; there is no row for it. */
export function factoryPresetLabel() {
  return FACTORY_LABEL;
}

function cleanName(value, fallback) {
  const text = typeof value === "string" ? value.trim().slice(0, MAX_PRESET_NAME_LENGTH) : "";
  return text || fallback;
}

function cleanId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 80 ? value : "";
}

/**
 * Builds a garage from anything. Total, for the same reason `createLivery` is:
 * this is what a save file and a server payload both come through, and neither
 * may be able to produce a garage the picker cannot draw.
 *
 * `isKnownModel` is injected rather than imported so this module stays agnostic
 * about the roster — the store passes the atlas's real lookup, tests pass a
 * fake. Presets naming a model that no longer exists are dropped, because a
 * retired model would otherwise sit in the picker resolving to no sprite.
 */
export function createGarage(input = {}, { isKnownModel = () => true } = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const rawPresets = Array.isArray(source.presets) ? source.presets : [];

  const perModel = new Map();
  const presets = [];
  let highestNumber = 0;

  for (const raw of rawPresets) {
    if (presets.length >= MAX_PRESETS) break;
    if (!raw || typeof raw !== "object") continue;
    const modelId = cleanId(raw.modelId);
    if (!modelId || !isKnownModel(modelId)) continue;
    const used = perModel.get(modelId) ?? 0;
    if (used >= MAX_PRESETS_PER_MODEL) continue;

    const id = cleanId(raw.id) || `${modelId}#${highestNumber + 1}`;
    // A duplicate id would make select/rename/delete ambiguous, and the last
    // writer would silently win. Drop the later one instead.
    if (presets.some((preset) => preset.id === id)) continue;

    perModel.set(modelId, used + 1);
    presets.push({
      id,
      modelId,
      name: cleanName(raw.name, `Preset ${used + 1}`),
      livery: normalizeLivery(raw.livery),
    });

    const trailing = Number.parseInt(String(id).split("#").pop(), 10);
    if (Number.isFinite(trailing) && trailing > highestNumber) highestNumber = trailing;
  }

  const counter = Number.isFinite(source.nextPresetNumber)
    ? Math.max(Math.floor(source.nextPresetNumber), highestNumber + 1)
    : highestNumber + 1;

  return withSelection({ presets, nextPresetNumber: counter }, source.selection);
}

/**
 * Applies a selection to a garage, dropping any part of it that does not
 * resolve. A selection pointing at a deleted preset falls back to that model's
 * factory default rather than to another model's preset — losing your paint is
 * recoverable, being handed someone else's car is confusing.
 */
function withSelection(garage, rawSelection) {
  const selection = rawSelection && typeof rawSelection === "object" ? rawSelection : {};
  const modelId = cleanId(selection.modelId);
  const presetId = cleanId(selection.presetId);
  const preset = presetId ? garage.presets.find((entry) => entry.id === presetId) : null;

  // The preset wins where both are given and disagree: the player chose a
  // config, and the config knows which car it is for.
  if (preset) {
    return { ...garage, selection: { modelId: preset.modelId, presetId: preset.id } };
  }
  return { ...garage, selection: { modelId: modelId || null, presetId: null } };
}

/** An empty garage sitting on a given model's factory default. */
export function emptyGarage(modelId = null) {
  return createGarage({ selection: { modelId } });
}

export function presetsForModel(garage, modelId) {
  return garage.presets.filter((preset) => preset.modelId === modelId);
}

export function presetById(garage, presetId) {
  return garage.presets.find((preset) => preset.id === presetId) ?? null;
}

export function selectedModelId(garage) {
  return garage.selection.modelId;
}

export function selectedPreset(garage) {
  return presetById(garage, garage.selection.presetId);
}

/** Whether this model can take another config, so the UI can say so up front. */
export function canSavePreset(garage, modelId) {
  return (
    presetsForModel(garage, modelId).length < MAX_PRESETS_PER_MODEL
    && garage.presets.length < MAX_PRESETS
  );
}

/**
 * The livery being taken to the line: the selected preset's, or the factory
 * default when nothing is selected. Never null — there is always a car.
 */
export function selectedLivery(garage) {
  return selectedPreset(garage)?.livery ?? createLivery(DEFAULT_LIVERY);
}

/**
 * What the rest of the cabinet actually needs: the car, resolved. This is also
 * exactly the payload the server stores and hands to an opponent, which is why
 * it is a model id plus a livery rather than a preset id — a preset id means
 * nothing to anyone else's garage.
 */
export function selectedLoadout(garage) {
  return { modelId: selectedModelId(garage), livery: selectedLivery(garage) };
}

/** Moves to a model, keeping that model's last-used preset where there is one. */
export function selectModel(garage, modelId) {
  if (!cleanId(modelId)) return garage;
  const existing = selectedPreset(garage);
  if (existing && existing.modelId === modelId) return garage;
  return withSelection(garage, { modelId, presetId: null });
}

/** Selects a saved preset. Unknown ids are ignored rather than clearing the pick. */
export function selectPreset(garage, presetId) {
  const preset = presetById(garage, presetId);
  if (!preset) return garage;
  return withSelection(garage, { modelId: preset.modelId, presetId: preset.id });
}

/** Selects the factory default for the model currently in view. */
export function selectFactory(garage) {
  return withSelection(garage, { modelId: selectedModelId(garage), presetId: null });
}

/**
 * Saves a new config for a model and selects it. Returns the garage unchanged
 * when the model is full, so a caller that ignores the result cannot silently
 * drop the player's oldest preset — refusing is the honest answer, and
 * `canSavePreset` lets the UI say so before they type a name.
 */
export function savePreset(garage, { modelId, name, livery } = {}) {
  if (!cleanId(modelId) || !canSavePreset(garage, modelId)) return garage;
  const number = garage.nextPresetNumber;
  const id = `${modelId}#${number}`;
  const preset = {
    id,
    modelId,
    name: cleanName(name, `Preset ${presetsForModel(garage, modelId).length + 1}`),
    livery: normalizeLivery(livery),
  };
  const next = {
    ...garage,
    presets: [...garage.presets, preset],
    nextPresetNumber: number + 1,
  };
  return withSelection(next, { modelId, presetId: id });
}

/** Rewrites a preset in place. Unknown ids are a no-op. */
export function updatePreset(garage, presetId, patch = {}) {
  const preset = presetById(garage, presetId);
  if (!preset) return garage;
  const updated = {
    ...preset,
    name: patch.name === undefined ? preset.name : cleanName(patch.name, preset.name),
    livery: patch.livery === undefined ? preset.livery : normalizeLivery(patch.livery),
  };
  return {
    ...garage,
    presets: garage.presets.map((entry) => (entry.id === presetId ? updated : entry)),
  };
}

export function renamePreset(garage, presetId, name) {
  return updatePreset(garage, presetId, { name });
}

/**
 * Removes a preset. If it was the selected one the selection falls back to that
 * model's factory default rather than to a neighbouring preset — an implicit
 * jump to a different config after a delete is how a player ends up racing
 * paint they did not choose.
 */
export function deletePreset(garage, presetId) {
  const preset = presetById(garage, presetId);
  if (!preset) return garage;
  const next = { ...garage, presets: garage.presets.filter((entry) => entry.id !== presetId) };
  if (garage.selection.presetId !== presetId) return next;
  return withSelection(next, { modelId: preset.modelId, presetId: null });
}

/**
 * True when a livery differs from what the selection already holds — the test
 * for "is there anything to save", and for whether the server needs telling.
 */
export function isDirty(garage, livery) {
  return !liveryEquals(selectedLivery(garage), livery);
}

/**
 * The subset that survives a round trip through storage or the server. Kept
 * explicit rather than serializing the whole object so an internal field added
 * later cannot leak into a payload by accident.
 */
export function serializeGarage(garage) {
  return {
    presets: garage.presets.map((preset) => ({
      id: preset.id,
      modelId: preset.modelId,
      name: preset.name,
      livery: preset.livery,
    })),
    selection: { ...garage.selection },
    nextPresetNumber: garage.nextPresetNumber,
  };
}
