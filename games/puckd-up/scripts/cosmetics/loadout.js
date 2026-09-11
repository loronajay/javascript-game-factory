// The garage document: what a player has equipped.
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

export const LOADOUT_VERSION = 1;

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
// DOCUMENT
// ---------------------------------------------------------------------------

/**
 * The factory loadout: what a player who has never opened the Garage is
 * already looking at. The server returns the same document for a player with
 * no row, and `tests/server-agreement.test.js` asserts they are byte-identical.
 */
export function defaultGarage() {
  return normalizeGarage(null);
}

/** Coerce anything at all into a valid garage document. Never throws. */
export function normalizeGarage(value) {
  const input = object(value);
  return {
    version: LOADOUT_VERSION,
    mallet: normalizeMallet(input.mallet),
    tableHalf: normalizeTableHalf(input.tableHalf),
  };
}

/** The wire form. Normalized, so an edited document cannot leave malformed. */
export function serializeGarage(garage) {
  return normalizeGarage(garage);
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

/** Seed the geometry from a preset, leaving everything else on the mallet alone. */
export function applyShapePreset(garage, presetId) {
  const preset = MALLET_SHAPE_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  const next = normalizeGarage(garage);
  next.mallet.shapePreset = preset.id;
  next.mallet.geometry = normalizeGeometry(preset.geometry, preset.geometry);
  return next;
}

export function applyMaterialPreset(garage, presetId) {
  const preset = MALLET_MATERIAL_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  const next = normalizeGarage(garage);
  next.mallet.material = normalizeMaterial({ preset: preset.id, ...preset.material }, preset.material);
  return next;
}

export function applySurfacePreset(garage, presetId) {
  const preset = TABLE_SURFACE_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  const next = normalizeGarage(garage);
  next.tableHalf.surface = normalizeSurface({ preset: preset.id, ...preset.surface });
  return next;
}

export function applyRailPreset(garage, presetId) {
  const preset = TABLE_RAIL_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  const next = normalizeGarage(garage);
  next.tableHalf.rails = normalizeRails({ preset: preset.id, ...preset.rails });
  return next;
}

export function applyGoalPreset(garage, presetId) {
  const preset = TABLE_GOAL_BY_ID.get(presetId);
  if (!preset) return normalizeGarage(garage);
  const next = normalizeGarage(garage);
  next.tableHalf.goal = normalizeGoal({ preset: preset.id, ...preset.goal });
  return next;
}

/** Structural equality, used by the editor to decide UNSAVED vs SAVED. */
export function garagesEqual(left, right) {
  return JSON.stringify(normalizeGarage(left)) === JSON.stringify(normalizeGarage(right));
}
