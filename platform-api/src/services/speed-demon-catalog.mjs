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
export const SPEED_DEMON_MODEL_IDS = Object.freeze([
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
export const SPEED_DEMON_FINISHES = Object.freeze(["gloss", "matte", "metallic"]);
const FINISH_SET = new Set(SPEED_DEMON_FINISHES);
/**
 * Bounds, mirroring `LIVERY_LIMITS` in the client. Duplicated across the repo
 * boundary rather than shared because the two projects do not import from each
 * other — the same reason `match.js` will be mirrored into the network server.
 * `tests` assert the ranges rather than the exact numbers, so a client tuning
 * pass does not break the server.
 *
 * **When a limit moves on the client it has to move here in the same change.**
 * These clamps are applied on save, so a bound the server holds tighter does not
 * reject the livery — it silently rewrites it, and the player watches their car
 * change colour on the next load with nothing to explain it.
 */
const LIMITS = Object.freeze({
    hue: { min: 0, max: 359, wraps: true },
    saturation: { min: 0, max: 1 },
    // The floor reaches genuine black. It used to sit at 0.65, which the client
    // lowered once its paint model stopped losing every highlight on a dark car —
    // see `paintWith`. A server still clamping at 0.65 would silently repaint
    // every black car mid-grey the moment it round-tripped through a save.
    brightness: { min: 0.12, max: 1.35 },
    windowTint: { min: 0, max: 1 },
    tailLightHue: { min: 0, max: 359, wraps: true },
    underglowHue: { min: 0, max: 359, wraps: true },
    underglowIntensity: { min: 0.2, max: 1 },
    layerPosition: { min: 0, max: 1 },
    layerSize: { min: 0.02, max: 1 },
    layerFeather: { min: 0, max: 0.3 },
    // The one signed field: a layer bows either way, so zero is the middle of this
    // range rather than an end of it. `clampNumber` takes the fallback from the
    // caller, and this one has to be 0 — a garbage curve must land on straight,
    // not on fully bent one way.
    layerCurve: { min: -0.35, max: 0.35 },
});
export const SPEED_DEMON_FADE_AXES = Object.freeze([
    "nose-tail", "tail-nose", "left-right", "right-left",
]);
const FADE_AXIS_SET = new Set(SPEED_DEMON_FADE_AXES);
export const SPEED_DEMON_LAYER_KINDS = Object.freeze(["band", "stripe"]);
const LAYER_KIND_SET = new Set(SPEED_DEMON_LAYER_KINDS);
/**
 * How many colour layers one livery may carry, mirroring `MAX_LAYERS`.
 *
 * This one is a denial-of-service bound as much as a design one. A livery is
 * handed to *other players'* clients during an online race, and each layer costs
 * them a per-pixel test across the whole car during the bake — so a payload
 * claiming five hundred layers would be a way to make somebody else's browser
 * stutter. The list is truncated before it is walked, never after.
 */
export const MAX_LIVERY_LAYERS = 4;
export const MAX_LAYER_ID_LENGTH = 40;
/** How many saved configs one player may hold per model, and in total. */
export const MAX_PRESETS_PER_MODEL = 6;
export const MAX_PRESETS = 240;
export const MAX_PRESET_NAME_LENGTH = 24;
export function isValidSpeedDemonModelId(value) {
    return typeof value === "string" && MODEL_ID_SET.has(value);
}
/**
 * Which models a player owns. Currently everything — see the note at the top.
 * Kept as a function taking the player so the signature does not change when
 * ownership starts depending on entitlements.
 */
export function ownedModelIds(_entitlementIds = []) {
    return SPEED_DEMON_MODEL_IDS;
}
export function playerOwnsModel(modelId, entitlementIds = []) {
    return isValidSpeedDemonModelId(modelId) && ownedModelIds(entitlementIds).includes(modelId);
}
function clampNumber(value, limit, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number))
        return fallback;
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
function normalizePaint(value) {
    const paint = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
        hue: clampNumber(paint.hue, LIMITS.hue, 0),
        saturation: clampNumber(paint.saturation, LIMITS.saturation, 0),
        brightness: clampNumber(paint.brightness, LIMITS.brightness, 1),
        finish: FINISH_SET.has(paint.finish) ? paint.finish : "gloss",
    };
}
/**
 * One colour layer, clamped. Mirrors `createLayer` on the client.
 *
 * The id is kept rather than regenerated so a client's own layer ids survive a
 * round trip, but it is length-capped like every other free text field here —
 * it is attacker-controlled and it is stored.
 */
function normalizeLayer(value, index) {
    const layer = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const id = typeof layer.id === "string" && layer.id.trim()
        ? layer.id.trim().slice(0, MAX_LAYER_ID_LENGTH)
        : `layer-${index + 1}`;
    return {
        id,
        kind: LAYER_KIND_SET.has(layer.kind) ? layer.kind : "band",
        position: clampNumber(layer.position, LIMITS.layerPosition, 0.5),
        size: clampNumber(layer.size, LIMITS.layerSize, 0.2),
        feather: clampNumber(layer.feather, LIMITS.layerFeather, 0),
        curve: clampNumber(layer.curve, LIMITS.layerCurve, 0),
        mirrored: layer.mirrored === true,
        paint: normalizePaint(layer.paint),
    };
}
export function normalizeLivery(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const underglow = source.underglow && typeof source.underglow === "object" ? source.underglow : {};
    const fade = source.fade && typeof source.fade === "object" && !Array.isArray(source.fade)
        ? source.fade
        : {};
    // Truncate before mapping, not after: a payload claiming half a million layers
    // must cost four normalizations, not half a million.
    const layers = Array.isArray(source.layers) ? source.layers.slice(0, MAX_LIVERY_LAYERS) : [];
    return {
        paint: normalizePaint(source.paint),
        fade: {
            // Only a literal true, mirroring the client.
            enabled: fade.enabled === true,
            hue: clampNumber(fade.hue, LIMITS.hue, 210),
            saturation: clampNumber(fade.saturation, LIMITS.saturation, 0.7),
            brightness: clampNumber(fade.brightness, LIMITS.brightness, 0.9),
            axis: FADE_AXIS_SET.has(fade.axis) ? fade.axis : "nose-tail",
        },
        layers: layers.map((layer, index) => normalizeLayer(layer, index)),
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
function cleanText(value, maxLength) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
/**
 * A whole garage, clamped. Unknown models are dropped rather than rejected: a
 * client one version ahead may legitimately hold a model this server has not
 * heard of, and refusing the entire save would lose everything else with it.
 */
export function normalizeGarage(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rawPresets = Array.isArray(source.presets) ? source.presets : [];
    const perModel = new Map();
    const seenIds = new Set();
    const presets = [];
    for (const raw of rawPresets) {
        if (presets.length >= MAX_PRESETS)
            break;
        if (!raw || typeof raw !== "object")
            continue;
        const modelId = cleanText(raw.modelId, 80);
        if (!isValidSpeedDemonModelId(modelId))
            continue;
        const used = perModel.get(modelId) ?? 0;
        if (used >= MAX_PRESETS_PER_MODEL)
            continue;
        const id = cleanText(raw.id, 120);
        if (!id || seenIds.has(id))
            continue;
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
// ---------------------------------------------------------------------------
// The driver profile
//
// A name, a face and up to five pinned cars, stored per player per game in
// `game_driver_profiles` (037). Validated here for the same reason a garage is:
// the payload comes from an installed client, so every field in it is
// attacker-controlled, and this is the only place the server decides what any of
// it means.
//
// **This is a cabinet alias, not an account.** The name is defaulted from the
// factory profile on the client and edited locally; nothing here may be treated
// as identity, and nothing that writes here writes back to the shell's profile.
// ---------------------------------------------------------------------------
/**
 * Mirrors `MAX_NAME_LENGTH` and `NAME_ALPHABET` in
 * games/speed-demon/scripts/profile/profile.js. Narrow on purpose: the string
 * lands in a canvas `fillText` on somebody else's machine, and quite possibly on
 * a wire before that.
 */
export const MAX_DRIVER_NAME_LENGTH = 14;
const DRIVER_NAME_ALLOWED = /[A-Za-z0-9 \-'.]/;
/** Mirrors `MAX_FAVOURITES`. Five is what fits on the card as real cars. */
export const MAX_FAVOURITE_MODELS = 5;
/**
 * The avatar ids, generated from the same three bands the client's
 * `profile/avatars.js` manifest builds. **Keep the counts in lockstep with that
 * file** — the same rule the model list follows, and for a weaker version of the
 * same reason: an id the server refuses is a face that silently reverts to the
 * default on the next load, with nothing on screen to explain it.
 */
const AVATAR_BANDS = Object.freeze([
    { prefix: "male", files: Array.from({ length: 20 }, (_, index) => String(index + 1)) },
    { prefix: "female", files: Array.from({ length: 24 }, (_, index) => String(index + 1)) },
    { prefix: "fast", files: ["luda", "paul", "tyrese", "vin", "yuki"] },
]);
export const SPEED_DEMON_AVATAR_IDS = Object.freeze(AVATAR_BANDS.flatMap((band) => band.files.map((file) => `${band.prefix}-${file}`)));
const AVATAR_ID_SET = new Set(SPEED_DEMON_AVATAR_IDS);
export const DEFAULT_SPEED_DEMON_AVATAR_ID = SPEED_DEMON_AVATAR_IDS[0];
export function isValidSpeedDemonAvatarId(value) {
    return typeof value === "string" && AVATAR_ID_SET.has(value);
}
function cleanDriverName(value) {
    if (typeof value !== "string")
        return "";
    let out = "";
    for (const char of value) {
        if (out.length >= MAX_DRIVER_NAME_LENGTH)
            break;
        if (!DRIVER_NAME_ALLOWED.test(char))
            continue;
        out += char;
    }
    return out.trim();
}
/**
 * A driver profile, clamped. Total, like `normalizeLivery`: any input produces
 * something drawable, because this document is handed to *other players'*
 * clients and a malformed one must not be able to break their card.
 *
 * An unknown avatar falls back to the default rather than rejecting the save —
 * a client one version ahead may legitimately name a face this server has not
 * heard of, and refusing the whole document would lose the name with it. That is
 * `normalizeGarage`'s rule about unknown models.
 *
 * An empty name is a legal saved state: the client prints `DRIVER` for it. There
 * is deliberately no server-side default name, because the only sensible one
 * would be the account's, and inventing identity here is exactly what this table
 * must not do.
 */
export function normalizeDriverProfile(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const favourites = [];
    // Truncate before mapping, not after — the layers rule, and a denial-of-service
    // bound for the same reason.
    for (const raw of (Array.isArray(source.favourites) ? source.favourites : []).slice(0, 64)) {
        if (favourites.length >= MAX_FAVOURITE_MODELS)
            break;
        if (!isValidSpeedDemonModelId(raw) || favourites.includes(raw))
            continue;
        favourites.push(raw);
    }
    return {
        name: cleanDriverName(source.name),
        avatarId: isValidSpeedDemonAvatarId(source.avatarId) ? source.avatarId : DEFAULT_SPEED_DEMON_AVATAR_ID,
        favourites,
    };
}
/**
 * What an opponent is shown: the car being driven, resolved, with no preset ids
 * in it — a preset id means nothing inside anyone else's garage.
 *
 * Falls back to the first model rather than to null, because the caller is an
 * online race that has to draw *something*.
 */
export function loadoutFromGarage(garage) {
    const normalized = normalizeGarage(garage);
    const preset = normalized.presets.find((entry) => entry.id === normalized.selection.presetId);
    const modelId = preset?.modelId
        ?? (isValidSpeedDemonModelId(normalized.selection.modelId) ? normalized.selection.modelId : null)
        ?? SPEED_DEMON_MODEL_IDS[0];
    return { modelId, livery: preset ? preset.livery : normalizeLivery(null) };
}
