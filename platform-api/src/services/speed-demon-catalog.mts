// Speed Demon's server-side allow-list.
//
// A garage payload comes from an installed game client, so every field in it is
// attacker-controlled. This module is the only place the server decides what a
// valid model id and a valid livery are — the route layer sanitizes shape, this
// sanitizes *meaning*.
//
// Keep the model list in lockstep with
// games/speed-demon/scripts/assets/car-atlas.js. An id names a car and is stable
// forever: renaming one orphans every saved preset and every stored loadout
// keyed to it, on every account.
//
// **Ownership is deliberately open for now.** Every model is currently owned by
// every player — the design decision was to ship the roster unlocked with the
// entitlement plumbing in place, so an unlock rule can drop in later as data
// rather than as a migration. `ownedModelIds` is the seam that changes when that
// happens; nothing above it needs to know. Note that the public *claims* route
// (db/game-progress) still runs every claim through the Tactical Arena
// validator, which rejects any other slug — so earning a model will also need a
// per-game validator registry there. That refactor is deliberately not done yet:
// it touches TA's live economy and buys nothing while the roster is free.

export const SPEED_DEMON_GAME_SLUG = "speed-demon";

/**
 * The 24 base models. Grouping and labels live in the client — the server only
 * needs to know which ids are real, because that is the only thing it has to
 * refuse.
 */
export const SPEED_DEMON_MODEL_IDS: readonly string[] = Object.freeze([
  // models-a
  "kaido-gts", "tsunami-rz", "shutter-z", "meridian-rs",
  "monolith-8", "zephyr-z", "stallion-gt", "aero-rs",
  "skyward-r", "gravel-stx", "toro-sv", "scalpel-r",
  // models-b
  "chrono-12", "orbit-rz", "vega-qv", "crest-s",
  "titan-r", "cyclone-rz", "colt-gt", "ember-rs",
  "halo-lt", "vortex-fd", "kaido-r", "crest-turbo",
]);

const MODEL_ID_SET = new Set(SPEED_DEMON_MODEL_IDS);

export const SPEED_DEMON_FINISHES: readonly string[] = Object.freeze(["gloss", "matte", "metallic"]);
const FINISH_SET = new Set(SPEED_DEMON_FINISHES);

/**
 * Bounds, mirroring `LIVERY_LIMITS` in the client. Duplicated across the repo
 * boundary rather than shared because the two projects do not import from each
 * other — the same reason `match.js` will be mirrored into the network server.
 * `tests` assert the ranges rather than the exact numbers, so a client tuning
 * pass does not break the server.
 */
const LIMITS = Object.freeze({
  hue: { min: 0, max: 359, wraps: true },
  saturation: { min: 0, max: 1 },
  brightness: { min: 0.65, max: 1.35 },
  windowTint: { min: 0, max: 1 },
  tailLightHue: { min: 0, max: 359, wraps: true },
  underglowHue: { min: 0, max: 359, wraps: true },
  underglowIntensity: { min: 0.2, max: 1 },
});

/** How many saved configs one player may hold per model, and in total. */
export const MAX_PRESETS_PER_MODEL = 6;
export const MAX_PRESETS = 240;
export const MAX_PRESET_NAME_LENGTH = 24;

export function isValidSpeedDemonModelId(value: any): boolean {
  return typeof value === "string" && MODEL_ID_SET.has(value);
}

/**
 * Which models a player owns. Currently everything — see the note at the top.
 * Kept as a function taking the player so the signature does not change when
 * ownership starts depending on entitlements.
 */
export function ownedModelIds(_entitlementIds: readonly string[] = []): readonly string[] {
  return SPEED_DEMON_MODEL_IDS;
}

export function playerOwnsModel(modelId: any, entitlementIds: readonly string[] = []): boolean {
  return isValidSpeedDemonModelId(modelId) && ownedModelIds(entitlementIds).includes(modelId);
}

function clampNumber(value: any, limit: { min: number; max: number; wraps?: boolean }, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (limit.wraps) {
    const span = limit.max - limit.min + 1;
    return limit.min + ((((Math.round(number) - limit.min) % span) + span) % span);
  }
  // Rounded to three places: the client snaps its steps to that precision, and an
  // unrounded float would make an identical livery serialize two different ways.
  return Math.round(Math.min(limit.max, Math.max(limit.min, number)) * 1000) / 1000;
}

/**
 * A livery, clamped into range. Total — any input produces something drawable,
 * because this value is handed to *other players'* clients during an online race
 * and a malformed one must not be able to break their render.
 */
export function normalizeLivery(value: any): any {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const paint = source.paint && typeof source.paint === "object" ? source.paint : {};
  const underglow = source.underglow && typeof source.underglow === "object" ? source.underglow : {};

  return {
    paint: {
      hue: clampNumber(paint.hue, LIMITS.hue, 0),
      saturation: clampNumber(paint.saturation, LIMITS.saturation, 0),
      brightness: clampNumber(paint.brightness, LIMITS.brightness, 1),
      finish: FINISH_SET.has(paint.finish) ? paint.finish : "gloss",
    },
    windowTint: clampNumber(source.windowTint, LIMITS.windowTint, 0),
    tailLightHue: clampNumber(source.tailLightHue, LIMITS.tailLightHue, 0),
    underglow: {
      // Only a literal true, mirroring the client: a truthy leftover must not
      // light up a car the player never lit.
      enabled: underglow.enabled === true,
      hue: clampNumber(underglow.hue, LIMITS.underglowHue, 210),
      intensity: clampNumber(underglow.intensity, LIMITS.underglowIntensity, 0.6),
    },
  };
}

function cleanText(value: any, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * A whole garage, clamped. Unknown models are dropped rather than rejected: a
 * client one version ahead may legitimately hold a model this server has not
 * heard of, and refusing the entire save would lose everything else with it.
 */
export function normalizeGarage(value: any): any {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawPresets = Array.isArray(source.presets) ? source.presets : [];

  const perModel = new Map<string, number>();
  const seenIds = new Set<string>();
  const presets: any[] = [];

  for (const raw of rawPresets) {
    if (presets.length >= MAX_PRESETS) break;
    if (!raw || typeof raw !== "object") continue;
    const modelId = cleanText(raw.modelId, 80);
    if (!isValidSpeedDemonModelId(modelId)) continue;

    const used = perModel.get(modelId) ?? 0;
    if (used >= MAX_PRESETS_PER_MODEL) continue;

    const id = cleanText(raw.id, 120);
    if (!id || seenIds.has(id)) continue;

    seenIds.add(id);
    perModel.set(modelId, used + 1);
    presets.push({
      id,
      modelId,
      name: cleanText(raw.name, MAX_PRESET_NAME_LENGTH) || "Paint",
      livery: normalizeLivery(raw.livery),
    });
  }

  const selection = source.selection && typeof source.selection === "object" ? source.selection : {};
  const selectedPresetId = cleanText(selection.presetId, 120);
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const selectedModelId = cleanText(selection.modelId, 80);

  return {
    presets,
    selection: {
      // The preset wins where the two disagree: it knows which car it is for.
      modelId: selectedPreset
        ? selectedPreset.modelId
        : isValidSpeedDemonModelId(selectedModelId) ? selectedModelId : null,
      presetId: selectedPreset ? selectedPreset.id : null,
    },
    nextPresetNumber: Math.max(1, Math.min(100000, Math.floor(Number(source.nextPresetNumber)) || 1)),
  };
}

/**
 * What an opponent is shown: the car being driven, resolved, with no preset ids
 * in it — a preset id means nothing inside anyone else's garage.
 *
 * Falls back to the first model rather than to null, because the caller is an
 * online race that has to draw *something*.
 */
export function loadoutFromGarage(garage: any): any {
  const normalized = normalizeGarage(garage);
  const preset = normalized.presets.find((entry: any) => entry.id === normalized.selection.presetId);
  const modelId = preset?.modelId
    ?? (isValidSpeedDemonModelId(normalized.selection.modelId) ? normalized.selection.modelId : null)
    ?? SPEED_DEMON_MODEL_IDS[0];
  return { modelId, livery: preset ? preset.livery : normalizeLivery(null) };
}
