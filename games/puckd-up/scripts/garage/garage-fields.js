// The Garage's control layout, as data.
//
// Pure: no DOM, no THREE. The editor renders whatever is here, so adding a
// control is a row rather than a block of markup, and the layout is testable
// under node — `tests/garage-fields.test.js` asserts every `path` addresses a
// real field of the garage document and every bound it cites exists.
//
// `path` is a dotted address into the garage document. That is the only
// coupling between a control and what it edits; nothing here knows how a value
// is drawn.

import {
  MALLET_SHAPE_PRESETS,
  MALLET_MATERIAL_PRESETS,
  MALLET_HARDWARE_STYLES,
  MALLET_GEOMETRY_BOUNDS,
  MALLET_MATERIAL_BOUNDS,
  MALLET_HARDWARE_BOUNDS,
  MALLET_DECAL_BOUNDS,
  TABLE_SURFACE_PRESETS,
  TABLE_PATTERNS,
  TABLE_RAIL_PRESETS,
  TABLE_GOAL_PRESETS,
  TABLE_SURFACE_BOUNDS,
  TABLE_MARKING_BOUNDS,
  TABLE_RAIL_BOUNDS,
  TABLE_GOAL_BOUNDS,
  TABLE_TRIM_BOUNDS,
} from "../cosmetics/catalog.js";

const slider = (path, label, bounds) => ({ kind: "slider", path, label, bounds });
const color = (path, label) => ({ kind: "color", path, label });
const toggle = (path, label) => ({ kind: "toggle", path, label });
const chips = (path, label, options, apply) => ({
  kind: "chips",
  path,
  label,
  apply,
  options: options.map((option) => ({ id: option.id, name: option.name, blurb: option.blurb ?? "" })),
});

/**
 * Colour shortcuts. Every colour control also takes an arbitrary value — these
 * are a fast path, never the whole choice.
 */
export const COLOR_SWATCHES = Object.freeze([
  "#a14848", "#d05a32", "#d0a52e", "#3e9b61", "#3d82b2", "#7652b8", "#c24b86", "#d8dde2",
  "#8f9aa4", "#c9a24a", "#78d0e8", "#1b2229",
]);

export const MALLET_GROUPS = Object.freeze([
  {
    id: "chassis",
    name: "Chassis",
    hint: "A preset seeds the shape. Move any slider and it becomes CUSTOM.",
    fields: [chips("mallet.shapePreset", "Preset", MALLET_SHAPE_PRESETS, "shape")],
  },
  {
    id: "shape",
    name: "Shape",
    fields: [
      slider("mallet.geometry.shoulderRadius", "Shoulder radius", MALLET_GEOMETRY_BOUNDS.shoulderRadius),
      slider("mallet.geometry.shoulderHeight", "Shoulder height", MALLET_GEOMETRY_BOUNDS.shoulderHeight),
      slider("mallet.geometry.capBottomRadius", "Cap bottom", MALLET_GEOMETRY_BOUNDS.capBottomRadius),
      slider("mallet.geometry.capTopRadius", "Cap top", MALLET_GEOMETRY_BOUNDS.capTopRadius),
      slider("mallet.geometry.capHeight", "Cap height", MALLET_GEOMETRY_BOUNDS.capHeight),
      slider("mallet.geometry.capLift", "Cap lift", MALLET_GEOMETRY_BOUNDS.capLift),
      toggle("mallet.geometry.crownEnabled", "Crown"),
      slider("mallet.geometry.crownBottomRadius", "Crown bottom", MALLET_GEOMETRY_BOUNDS.crownBottomRadius),
      slider("mallet.geometry.crownTopRadius", "Crown top", MALLET_GEOMETRY_BOUNDS.crownTopRadius),
      slider("mallet.geometry.crownHeight", "Crown height", MALLET_GEOMETRY_BOUNDS.crownHeight),
      slider("mallet.geometry.crownLift", "Crown lift", MALLET_GEOMETRY_BOUNDS.crownLift),
    ],
  },
  {
    id: "material",
    name: "Material",
    fields: [
      chips("mallet.material.preset", "Finish", MALLET_MATERIAL_PRESETS, "material"),
      slider("mallet.material.roughness", "Roughness", MALLET_MATERIAL_BOUNDS.roughness),
      slider("mallet.material.metalness", "Metalness", MALLET_MATERIAL_BOUNDS.metalness),
      slider("mallet.material.clearcoat", "Clearcoat", MALLET_MATERIAL_BOUNDS.clearcoat),
      slider("mallet.material.clearcoatRoughness", "Clearcoat roughness", MALLET_MATERIAL_BOUNDS.clearcoatRoughness),
    ],
  },
  {
    id: "colors",
    name: "Colors",
    fields: [
      color("mallet.colors.primary", "Primary"),
      color("mallet.colors.accent", "Accent"),
      color("mallet.colors.hardware", "Hardware"),
    ],
  },
  {
    id: "hardware",
    name: "Hardware",
    fields: [
      chips("mallet.hardware.style", "Style", MALLET_HARDWARE_STYLES),
      slider("mallet.hardware.radius", "Ring radius", MALLET_HARDWARE_BOUNDS.radius),
      slider("mallet.hardware.thickness", "Thickness", MALLET_HARDWARE_BOUNDS.thickness),
      slider("mallet.hardware.height", "Height", MALLET_HARDWARE_BOUNDS.height),
      slider("mallet.hardware.glowIntensity", "Glow", MALLET_HARDWARE_BOUNDS.glowIntensity),
    ],
  },
  {
    id: "decal",
    name: "Decal",
    hint: "The decal sits on the topmost face — the crown when one is fitted, otherwise the cap.",
    fields: [
      { kind: "decal-picker", path: "mallet.decal", label: "Design" },
      slider("mallet.decal.x", "Across", MALLET_DECAL_BOUNDS.x),
      slider("mallet.decal.y", "Along", MALLET_DECAL_BOUNDS.y),
      slider("mallet.decal.scale", "Scale", MALLET_DECAL_BOUNDS.scale),
      slider("mallet.decal.rotation", "Rotation", MALLET_DECAL_BOUNDS.rotation),
      slider("mallet.decal.opacity", "Opacity", MALLET_DECAL_BOUNDS.opacity),
    ],
  },
]);

export const TABLE_GROUPS = Object.freeze([
  {
    id: "surface",
    name: "Surface",
    hint: "Your half only. The centre line, the face-off circle and the cabinet stay neutral.",
    fields: [
      chips("tableHalf.surface.preset", "Preset", TABLE_SURFACE_PRESETS, "surface"),
      color("tableHalf.surface.baseColor", "Base"),
      color("tableHalf.surface.secondaryColor", "Secondary"),
      slider("tableHalf.surface.roughness", "Roughness", TABLE_SURFACE_BOUNDS.roughness),
      slider("tableHalf.surface.metalness", "Metalness", TABLE_SURFACE_BOUNDS.metalness),
    ],
  },
  {
    id: "pattern",
    name: "Pattern",
    fields: [
      chips("tableHalf.surface.patternId", "Pattern", TABLE_PATTERNS),
      color("tableHalf.surface.patternColor", "Pattern color"),
      slider("tableHalf.surface.patternScale", "Scale", TABLE_SURFACE_BOUNDS.patternScale),
      slider("tableHalf.surface.patternOpacity", "Strength", TABLE_SURFACE_BOUNDS.patternOpacity),
    ],
  },
  {
    id: "markings",
    name: "Markings",
    hint: "Opacity is floored on purpose: your opponent has to read your goal mouth too.",
    fields: [
      color("tableHalf.markings.color", "Line color"),
      slider("tableHalf.markings.opacity", "Opacity", TABLE_MARKING_BOUNDS.opacity),
    ],
  },
  {
    id: "rails",
    name: "Rails",
    fields: [
      chips("tableHalf.rails.preset", "Preset", TABLE_RAIL_PRESETS, "rails"),
      color("tableHalf.rails.bodyColor", "Body"),
      color("tableHalf.rails.topColor", "Cap"),
      slider("tableHalf.rails.roughness", "Roughness", TABLE_RAIL_BOUNDS.roughness),
      slider("tableHalf.rails.metalness", "Metalness", TABLE_RAIL_BOUNDS.metalness),
    ],
  },
  {
    id: "goal",
    name: "Goal",
    fields: [
      chips("tableHalf.goal.preset", "Preset", TABLE_GOAL_PRESETS, "goal"),
      color("tableHalf.goal.color", "Frame"),
      color("tableHalf.goal.emissiveColor", "Glow color"),
      slider("tableHalf.goal.glowIntensity", "Glow", TABLE_GOAL_BOUNDS.glowIntensity),
    ],
  },
  {
    id: "trim",
    name: "Trim",
    fields: [
      color("tableHalf.trim.color", "Trim color"),
      slider("tableHalf.trim.glowIntensity", "Glow", TABLE_TRIM_BOUNDS.glowIntensity),
    ],
  },
]);

/** Read a dotted path out of a garage document. */
export function readPath(garage, path) {
  return path.split(".").reduce((node, key) => (node == null ? undefined : node[key]), garage);
}

/** A copy of `garage` with one dotted path replaced. The document stays immutable. */
export function writePath(garage, path, value) {
  const keys = path.split(".");
  const next = structuredClone(garage);
  let node = next;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys.at(-1)] = value;
  return next;
}

/** Every control in both tabs, for tests and for a whole-panel refresh. */
export function allFields() {
  return [...MALLET_GROUPS, ...TABLE_GROUPS].flatMap((group) => group.fields);
}
