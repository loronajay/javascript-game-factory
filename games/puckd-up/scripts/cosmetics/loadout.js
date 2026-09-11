// The garage document: every loadout a player has built, and which one is on.
//
// A LOADOUT is one complete design — a mallet and a table half — with an id and
// a player-given name. The GARAGE is the list of them plus `equippedId`, and a
// player always has at least one: deleting the last one is not a state this
// document can be in. Everything downstream (the view, the stage preview, the
// public route an opponent reads) is handed ONE LOADOUT, never the list, which
// is why adding the list cost those files nothing.
//
// Pure. No THREE, no DOM, no storage, no network, no clock — so the whole
// document contract is testable under node, and so the same normalizer runs in
// the editor, in the match, and against anything the server hands back.
//
// THE SERVER IS THE AUTHORITY. This normalizer exists so the client never
// renders a document it would not have written, not so the client can be
// trusted: `platform-api/src/services/puckd-up-loadout-catalog.mts` re-does all
// of it on the way in and on the way out, and `tests/server-agreement.test.js`
// asserts the two agree on the default document and on how they clamp.
//
// VERSIONED. `version` is written on every document and read on the way in, so
// a later shape change is a migration here rather than a wipe.

import {
  MALLET_GEOMETRY_BOUNDS,
  MALLET_MATERIAL_BOUNDS,
  MALLET_HARDWARE_BOUNDS,
  MALLET_DECAL_BOUNDS,
  MALLET_DECAL_TYPES,
  MALLET_SHAPE_BY_ID,
  MALLET_MATERIAL_BY_ID,
  MALLET_HARDWARE_BY_ID,
  MALLET_SHAPE_PRESETS,
  MALLET_MATERIAL_PRESETS,
  TABLE_SURFACE_BOUNDS,
  TABLE_SURFACE_BY_ID,
  TABLE_PATTERN_BY_ID,
  TABLE_MARKING_BOUNDS,
  TABLE_RAIL_BOUNDS,
  TABLE_RAIL_BY_ID,
  TABLE_GOAL_BOUNDS,
  TABLE_GOAL_BY_ID,
  TABLE_TRIM_BOUNDS,
} from "./catalog.js";
import { DECAL_BY_ID } from "./decal-catalog.js";

export const LOADOUT_VERSION = 2;

/**
 * How many designs one account may keep.
 *
 * A cap rather than no cap because this is a row in someone else's database and
 * the whole document is read on every match; eight is more slots than the
 * setup picker can show at once without becoming a menu of its own.
 */
export const MAX_LOADOUTS = 8;

/** Longest player-given name. The picker shows it on one line. */
export const LOADOUT_NAME_LIMIT = 24;

const DEFAULT_SHAPE_ID = "mallet.shape.classic";
const DEFAULT_MATERIAL_ID = "mallet.material.anodized";
const DEFAULT_HARDWARE_ID = "mallet.hardware.halo";
const DEFAULT_SURFACE_ID = "table.surface.factory-graphite";
const DEFAULT_RAIL_ID = "table.rail.factory-steel";
const DEFAULT_GOAL_ID = "table.goal.factory";

/** The cabinet's shipped player colour, so an untouched garage matches the table. */
const DEFAULT_PRIMARY = "#a14848";
const DEFAULT_ACCENT = "#d8dde2";
const DEFAULT_HARDWARE_COLOR = "#8f9aa4";
const DEFAULT_MARKING_COLOR = "#86a1b1";
const DEFAULT_TRIM_COLOR = "#a14848";

const DEFAULT_HARDWARE = Object.freeze({ radius: 0.49, thickness: 0.045, height: 0.18, glowIntensity: 0.34 });
const DEFAULT_DECAL = Object.freeze({ type: "none", x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.95 });

const HEX_COLOR = /^#[0-9a-f]{6}$/;
/** A custom asset reference the server minted. Never a data URI, never a path. */
const ASSET_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ASSET_URL = /^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{1,480}$/;

function clampNumber(value, bounds, fallback) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(bounds.max, Math.max(bounds.min, number));
}

function normalizeColor(value, fallback) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (HEX_COLOR.test(text)) return text;
  // `#abc` is a real thing players paste. Expand it rather than discard it.
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text.slice(1).split("").map((c) => c + c).join("")}`;
  return fallback;
}

function normalizeId(value, lookup, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return lookup.has(text) ? text : fallback;
}

function normalizeBool(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

const object = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

// ---------------------------------------------------------------------------
// MALLET
// ---------------------------------------------------------------------------

function normalizeGeometry(raw, defaults) {
  const input = object(raw);
  const out = {};
  for (const [key, bounds] of Object.entries(MALLET_GEOMETRY_BOUNDS)) {
    out[key] = clampNumber(input[key], bounds, defaults[key]);
  }
  out.crownEnabled = normalizeBool(input.crownEnabled, defaults.crownEnabled);
  return out;
}

function normalizeMaterial(raw, defaults) {
  const input = object(raw);
  const preset = normalizeId(input.preset, MALLET_MATERIAL_BY_ID, DEFAULT_MATERIAL_ID);
  const out = { preset };
  for (const [key, bounds] of Object.entries(MALLET_MATERIAL_BOUNDS)) {
    out[key] = clampNumber(input[key], bounds, defaults[key]);
  }
  return out;
}

function normalizeHardware(raw, defaults) {
  const input = object(raw);
  const out = { style: normalizeId(input.style, MALLET_HARDWARE_BY_ID, DEFAULT_HARDWARE_ID) };
  for (const [key, bounds] of Object.entries(MALLET_HARDWARE_BOUNDS)) {
    out[key] = clampNumber(input[key], bounds, defaults[key]);
  }
  return out;
}

/**
 * The decal reference.
 *
 * A `custom` decal that does not carry BOTH a server-minted asset id and an
 * https URL degrades to `none` rather than being kept as a broken reference —
 * there is nothing to draw, and a half-valid custom decal is how a data URI
 * ends up in an account row. A `builtin` id that is no longer in the catalog
 * degrades the same way: the decal is gone, the rest of the mallet is not.
 */
function normalizeDecal(raw, defaults) {
  const input = object(raw);
  const requested = typeof input.type === "string" ? input.type : defaults.type;
  const placement = {
    x: clampNumber(input.x, MALLET_DECAL_BOUNDS.x, defaults.x),
    y: clampNumber(input.y, MALLET_DECAL_BOUNDS.y, defaults.y),
    scale: clampNumber(input.scale, MALLET_DECAL_BOUNDS.scale, defaults.scale),
    rotation: clampNumber(input.rotation, MALLET_DECAL_BOUNDS.rotation, defaults.rotation),
    opacity: clampNumber(input.opacity, MALLET_DECAL_BOUNDS.opacity, defaults.opacity),
  };
  const none = { type: "none", id: "", customAssetId: null, customAssetUrl: null, ...placement };

  if (!MALLET_DECAL_TYPES.includes(requested)) return none;
  if (requested === "none") return none;

  if (requested === "builtin") {
    const id = typeof input.id === "string" ? input.id.trim() : "";
    if (!DECAL_BY_ID.has(id)) return none;
    return { type: "builtin", id, customAssetId: null, customAssetUrl: null, ...placement };
  }

  const assetId = typeof input.customAssetId === "string" ? input.customAssetId.trim() : "";
  const assetUrl = typeof input.customAssetUrl === "string" ? input.customAssetUrl.trim() : "";
  if (!ASSET_ID.test(assetId) || !ASSET_URL.test(assetUrl)) return none;
  return { type: "custom", id: "", customAssetId: assetId, customAssetUrl: assetUrl, ...placement };
}

function normalizeMallet(raw) {
  const input = object(raw);
  const shapePreset = normalizeId(input.shapePreset, MALLET_SHAPE_BY_ID, DEFAULT_SHAPE_ID);
  const shapeDefaults = MALLET_SHAPE_BY_ID.get(shapePreset).geometry;
  const materialDefaults = MALLET_MATERIAL_BY_ID.get(
    normalizeId(object(input.material).preset, MALLET_MATERIAL_BY_ID, DEFAULT_MATERIAL_ID),
  ).material;
  const colors = object(input.colors);
  return {
    shapePreset,
    geometry: normalizeGeometry(input.geometry, shapeDefaults),
    material: normalizeMaterial(input.material, materialDefaults),
    colors: {
      primary: normalizeColor(colors.primary, DEFAULT_PRIMARY),
      accent: normalizeColor(colors.accent, DEFAULT_ACCENT),
      hardware: normalizeColor(colors.hardware, DEFAULT_HARDWARE_COLOR),
    },
    hardware: normalizeHardware(input.hardware, DEFAULT_HARDWARE),
    decal: normalizeDecal(input.decal, DEFAULT_DECAL),
  };
}

// ---------------------------------------------------------------------------
// TABLE HALF
// ---------------------------------------------------------------------------

function normalizeSurface(raw) {
  const input = object(raw);
  const preset = normalizeId(input.preset, TABLE_SURFACE_BY_ID, DEFAULT_SURFACE_ID);
  const defaults = TABLE_SURFACE_BY_ID.get(preset).surface;
  return {
    preset,
    baseColor: normalizeColor(input.baseColor, defaults.baseColor),
    secondaryColor: normalizeColor(input.secondaryColor, defaults.secondaryColor),
    patternId: normalizeId(input.patternId, TABLE_PATTERN_BY_ID, defaults.patternId),
    patternColor: normalizeColor(input.patternColor, defaults.patternColor),
    patternScale: clampNumber(input.patternScale, TABLE_SURFACE_BOUNDS.patternScale, defaults.patternScale),
    patternOpacity: clampNumber(input.patternOpacity, TABLE_SURFACE_BOUNDS.patternOpacity, defaults.patternOpacity),
    roughness: clampNumber(input.roughness, TABLE_SURFACE_BOUNDS.roughness, defaults.roughness),
    metalness: clampNumber(input.metalness, TABLE_SURFACE_BOUNDS.metalness, defaults.metalness),
  };
}

function normalizeRails(raw) {
  const input = object(raw);
  const preset = normalizeId(input.preset, TABLE_RAIL_BY_ID, DEFAULT_RAIL_ID);
  const defaults = TABLE_RAIL_BY_ID.get(preset).rails;
  return {
    preset,
    bodyColor: normalizeColor(input.bodyColor, defaults.bodyColor),
    topColor: normalizeColor(input.topColor, defaults.topColor),
    roughness: clampNumber(input.roughness, TABLE_RAIL_BOUNDS.roughness, defaults.roughness),
    metalness: clampNumber(input.metalness, TABLE_RAIL_BOUNDS.metalness, defaults.metalness),
  };
}

function normalizeGoal(raw) {
  const input = object(raw);
  const preset = normalizeId(input.preset, TABLE_GOAL_BY_ID, DEFAULT_GOAL_ID);
  const defaults = TABLE_GOAL_BY_ID.get(preset).goal;
  return {
    preset,
    color: normalizeColor(input.color, defaults.color),
    emissiveColor: normalizeColor(input.emissiveColor, defaults.emissiveColor),
    glowIntensity: clampNumber(input.glowIntensity, TABLE_GOAL_BOUNDS.glowIntensity, defaults.glowIntensity),
  };
}

function normalizeTableHalf(raw) {
  const input = object(raw);
  const markings = object(input.markings);
  const trim = object(input.trim);
  return {
    surface: normalizeSurface(input.surface),
    markings: {
      color: normalizeColor(markings.color, DEFAULT_MARKING_COLOR),
      opacity: clampNumber(markings.opacity, TABLE_MARKING_BOUNDS.opacity, 0.45),
    },
    rails: normalizeRails(input.rails),
    goal: normalizeGoal(input.goal),
    trim: {
      color: normalizeColor(trim.color, DEFAULT_TRIM_COLOR),
      glowIntensity: clampNumber(trim.glowIntensity, TABLE_TRIM_BOUNDS.glowIntensity, 0.45),
    },
  };
}

// ---------------------------------------------------------------------------
// LOADOUT
// ---------------------------------------------------------------------------

/** An id this document minted. Short, opaque, and safe to put in markup. */
const LOADOUT_ID = /^[A-Za-z0-9_-]{1,32}$/;
/** Everything below a space, plus DEL. A name is one line of text or it is not a name. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

/** The slot a player who has never opened the Garage is already looking at. */
const defaultLoadoutName = (index) => `Loadout ${index + 1}`;
const defaultLoadoutId = (index) => `loadout-${index + 1}`;

/**
 * A player-given name, made safe and made finite.
 *
 * Control characters out, runs of whitespace collapsed, trimmed, capped — and
 * an empty result becomes the slot's positional name rather than a blank chip.
 * The SERVER does all of this again; the two must agree character for
 * character, which is what `tests/server-agreement.test.js` checks.
 */
function normalizeLoadoutName(value, index) {
  const text = (typeof value === "string" ? value : "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LOADOUT_NAME_LIMIT)
    .trim();
  return text || defaultLoadoutName(index);
}

/**
 * One design.
 *
 * `index` is the slot's position, used only to name an unnamed loadout and to
 * mint an id for one that arrived without a usable one — so the same junk
 * normalizes to the same document on the client and on the server.
 */
export function normalizeLoadout(value, index = 0) {
  const input = object(value);
  const id = typeof input.id === "string" && LOADOUT_ID.test(input.id.trim())
    ? input.id.trim()
    : defaultLoadoutId(index);
  return {
    id,
    name: normalizeLoadoutName(input.name, index),
    mallet: normalizeMallet(input.mallet),
    tableHalf: normalizeTableHalf(input.tableHalf),
  };
}

/** The factory design: slot one, untouched. */
export function defaultLoadout() {
  return normalizeLoadout(null);
}

// ---------------------------------------------------------------------------
// DOCUMENT
// ---------------------------------------------------------------------------

/**
 * The factory garage: one loadout, equipped, exactly what the cabinet draws
 * before it has ever talked to the API. The server returns the same document
 * for a player with no row.
 */
export function defaultGarage() {
  return normalizeGarage(null);
}

/**
 * Coerce anything at all into a garage document. Never throws.
 *
 * MIGRATION, NOT WIPE. A version-1 document was a bare mallet-and-table-half
 * with no list and no id, so a document with no usable `loadouts` array is read
 * AS one loadout — meaning every garage saved before this existed comes back as
 * slot one with its design intact, and `{}` and `null` land on the factory
 * loadout by that same path.
 */
export function normalizeGarage(value) {
  const input = object(value);
  const raw = Array.isArray(input.loadouts) && input.loadouts.length ? input.loadouts : [input];

  const loadouts = [];
  const taken = new Set();
  for (const entry of raw.slice(0, MAX_LOADOUTS)) {
    const index = loadouts.length;
    const loadout = normalizeLoadout(entry, index);
    // Two slots with one id is a document the editor cannot address. The later
    // one is renumbered rather than dropped: it is somebody's design.
    if (taken.has(loadout.id)) {
      let n = index + 1;
      while (taken.has(defaultLoadoutId(n))) n += 1;
      loadout.id = defaultLoadoutId(n);
    }
    taken.add(loadout.id);
    loadouts.push(loadout);
  }

  const requested = typeof input.equippedId === "string" ? input.equippedId.trim() : "";
  const equippedId = taken.has(requested) ? requested : loadouts[0].id;
  return { version: LOADOUT_VERSION, equippedId, loadouts };
}

/** The wire form. Normalized, so an edited document cannot leave malformed. */
export function serializeGarage(garage) {
  return normalizeGarage(garage);
}

/** Structural equality, used by the editor to decide UNSAVED vs SAVED. */
export function garagesEqual(left, right) {
  return JSON.stringify(normalizeGarage(left)) === JSON.stringify(normalizeGarage(right));
}

// ---------------------------------------------------------------------------
// SLOTS
// ---------------------------------------------------------------------------

/**
 * The loadout that is ON.
 *
 * This is the ONLY thing handed to the renderer, the stage preview and the
 * public route, and it is always a real loadout — `normalizeGarage` guarantees
 * at least one slot and an `equippedId` that names one of them.
 */
export function equippedLoadout(garage) {
  const normalized = normalizeGarage(garage);
  return normalized.loadouts.find((loadout) => loadout.id === normalized.equippedId) ?? normalized.loadouts[0];
}

/** Put an edited loadout back where it came from. Identity is the id, not the index. */
export function replaceLoadout(garage, loadout) {
  const next = normalizeGarage(garage);
  const index = next.loadouts.findIndex((entry) => entry.id === loadout?.id);
  if (index < 0) return next;
  next.loadouts[index] = normalizeLoadout({ ...loadout, id: next.loadouts[index].id }, index);
  return next;
}

/** Apply a change to whichever loadout is equipped. */
function mapEquipped(garage, change) {
  const next = normalizeGarage(garage);
  return replaceLoadout(next, change(equippedLoadout(next)));
}

/** Equip a saved design. An unknown id leaves the garage exactly as it was. */
export function selectLoadout(garage, id) {
  const next = normalizeGarage(garage);
  if (!next.loadouts.some((loadout) => loadout.id === id)) return next;
  next.equippedId = id;
  return next;
}

export function renameLoadout(garage, id, name) {
  const next = normalizeGarage(garage);
  const index = next.loadouts.findIndex((loadout) => loadout.id === id);
  if (index < 0) return next;
  next.loadouts[index] = { ...next.loadouts[index], name: normalizeLoadoutName(name, index) };
  return next;
}

/**
 * Add a slot and equip it.
 *
 * `from` copies an existing design — the way most second loadouts get made is
 * "this one, but blue" — and omitting it starts from the factory loadout. At
 * `MAX_LOADOUTS` the garage comes back untouched; the caller disables the
 * button, and this makes the rule true rather than merely displayed.
 */
export function addLoadout(garage, { from = null, name = "" } = {}) {
  const next = normalizeGarage(garage);
  if (next.loadouts.length >= MAX_LOADOUTS) return next;
  const source = from ? next.loadouts.find((loadout) => loadout.id === from) : null;
  const taken = new Set(next.loadouts.map((loadout) => loadout.id));
  let n = next.loadouts.length;
  while (taken.has(defaultLoadoutId(n))) n += 1;
  const index = next.loadouts.length;
  const created = normalizeLoadout({
    ...(source ?? defaultLoadout()),
    id: defaultLoadoutId(n),
    name: name || (source ? `${source.name} copy` : defaultLoadoutName(index)),
  }, index);
  next.loadouts.push(created);
  next.equippedId = created.id;
  return next;
}

/**
 * Delete a slot.
 *
 * The last one cannot go: a player with no loadout has no mallet, and the
 * document has nowhere to point. Deleting what was equipped equips its
 * neighbour rather than leaving the garage pointing at nothing.
 */
export function removeLoadout(garage, id) {
  const next = normalizeGarage(garage);
  if (next.loadouts.length <= 1) return next;
  const index = next.loadouts.findIndex((loadout) => loadout.id === id);
  if (index < 0) return next;
  next.loadouts.splice(index, 1);
  if (next.equippedId === id) next.equippedId = next.loadouts[Math.min(index, next.loadouts.length - 1)].id;
  return next;
}

// ---------------------------------------------------------------------------
// EDITOR HELPERS
// ---------------------------------------------------------------------------

const NEAR = (a, b) => Math.abs(a - b) < 1e-6;

/**
 * Which shape preset this geometry still IS, or `null` for CUSTOM.
 *
 * Derived by comparison rather than remembered, so moving one slider and moving
 * it back reports the preset again, and a stored `shapePreset` can never
 * disagree with the numbers actually being drawn.
 */
export function matchingShapePresetId(geometry) {
  const current = object(geometry);
  for (const preset of MALLET_SHAPE_PRESETS) {
    const target = preset.geometry;
    if (current.crownEnabled !== target.crownEnabled) continue;
    // A disabled crown's numbers are not being drawn, so they do not decide
    // identity — otherwise every crownless preset reports CUSTOM forever.
    const keys = Object.keys(MALLET_GEOMETRY_BOUNDS)
      .filter((key) => target.crownEnabled || !key.startsWith("crown"));
    if (keys.every((key) => NEAR(current[key], target[key]))) return preset.id;
  }
  return null;
}

/** Same idea for the material tab. */
export function matchingMaterialPresetId(material) {
  const current = object(material);
  for (const preset of MALLET_MATERIAL_PRESETS) {
    const keys = Object.keys(MALLET_MATERIAL_BOUNDS);
    if (keys.every((key) => NEAR(current[key], preset.material[key]))) return preset.id;
  }
  return null;
}

// Presets seed the EQUIPPED loadout. The editor only ever edits the design that
// is on, so there is no "which slot did that apply to" to get wrong.

/** Seed the geometry from a preset, leaving everything else on the mallet alone. */
export function applyShapePreset(garage, presetId) {
  const preset = MALLET_SHAPE_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  return mapEquipped(garage, (loadout) => ({
    ...loadout,
    mallet: { ...loadout.mallet, shapePreset: preset.id, geometry: normalizeGeometry(preset.geometry, preset.geometry) },
  }));
}

export function applyMaterialPreset(garage, presetId) {
  const preset = MALLET_MATERIAL_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  return mapEquipped(garage, (loadout) => ({
    ...loadout,
    mallet: { ...loadout.mallet, material: normalizeMaterial({ preset: preset.id, ...preset.material }, preset.material) },
  }));
}

export function applySurfacePreset(garage, presetId) {
  const preset = TABLE_SURFACE_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  return mapEquipped(garage, (loadout) => ({
    ...loadout,
    tableHalf: { ...loadout.tableHalf, surface: normalizeSurface({ preset: preset.id, ...preset.surface }) },
  }));
}

export function applyRailPreset(garage, presetId) {
  const preset = TABLE_RAIL_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  return mapEquipped(garage, (loadout) => ({
    ...loadout,
    tableHalf: { ...loadout.tableHalf, rails: normalizeRails({ preset: preset.id, ...preset.rails }) },
  }));
}

export function applyGoalPreset(garage, presetId) {
  const preset = TABLE_GOAL_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  return mapEquipped(garage, (loadout) => ({
    ...loadout,
    tableHalf: { ...loadout.tableHalf, goal: normalizeGoal({ preset: preset.id, ...preset.goal }) },
  }));
}
