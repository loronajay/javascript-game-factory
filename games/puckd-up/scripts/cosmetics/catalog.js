// PUCK'D UP cosmetic catalog. Pure data: no THREE, no DOM, no storage, no clock.
//
// Three things are deliberately separate and must stay separate:
//
//   CATALOG    (this file) what exists and what a valid value is
//   OWNERSHIP  (inventory.js) what this player may equip
//   GARAGE     (loadout.js) what this player has equipped
//
// Presets SEED parameters; they are not modes. Once a slider moves the loadout
// simply carries different numbers and the editor reports CUSTOM. Nothing
// downstream ever asks "which preset is this" to decide how to draw.
//
// NOTHING HERE TOUCHES PHYSICS. Every bound below is a visual bound. The
// gameplay mallet radius, puck cap, restitution, goal width and rail geometry
// live in `scripts/config.js` and `scripts/physics/` and are not reachable from
// a garage document. See `PHYSICS_MALLET_RADIUS` at the bottom of this file for
// the assertion seam that keeps it that way.

/** Inclusive numeric bounds. `clampNumber` in loadout.js is the only consumer. */
const range = (min, max, step = 0.01) => Object.freeze({ min, max, step });

// ---------------------------------------------------------------------------
// MALLET SHAPE
// ---------------------------------------------------------------------------

/**
 * Geometry bounds.
 *
 * The lower bounds are readability bounds, not physics bounds: a mallet may not
 * be shrunk to a sliver, because a player who cannot see their own mallet
 * cannot play. The upper bounds keep a design inside the visual footprint a
 * player expects from the gameplay reach they actually have.
 */
export const MALLET_GEOMETRY_BOUNDS = Object.freeze({
  shoulderRadius: range(0.56, 0.86),
  shoulderHeight: range(0.14, 0.40),
  capBottomRadius: range(0.16, 0.62),
  capTopRadius: range(0.16, 0.62),
  capHeight: range(0.08, 0.46),
  capLift: range(0.10, 0.42),
  crownBottomRadius: range(0.10, 0.48),
  crownTopRadius: range(0.08, 0.48),
  crownHeight: range(0.06, 0.28),
  crownLift: range(0.24, 0.78),
});

export const MALLET_SHAPE_PRESETS = Object.freeze([
  {
    id: "mallet.shape.classic",
    name: "Classic",
    blurb: "Factory profile. Wide shoulder, stepped cap.",
    geometry: {
      shoulderRadius: 0.73, shoulderHeight: 0.26,
      capBottomRadius: 0.48, capTopRadius: 0.38, capHeight: 0.30, capLift: 0.26,
      crownEnabled: false, crownBottomRadius: 0.26, crownTopRadius: 0.22, crownHeight: 0.10, crownLift: 0.56,
    },
  },
  {
    id: "mallet.shape.heavy",
    name: "Heavy",
    blurb: "Deep shoulder and a squat machined crown.",
    geometry: {
      shoulderRadius: 0.79, shoulderHeight: 0.34,
      capBottomRadius: 0.56, capTopRadius: 0.46, capHeight: 0.26, capLift: 0.34,
      crownEnabled: true, crownBottomRadius: 0.32, crownTopRadius: 0.26, crownHeight: 0.11, crownLift: 0.60,
    },
  },
  {
    id: "mallet.shape.razor",
    name: "Razor",
    blurb: "Thin shoulder, tall inverted taper.",
    geometry: {
      shoulderRadius: 0.68, shoulderHeight: 0.18,
      capBottomRadius: 0.52, capTopRadius: 0.21, capHeight: 0.44, capLift: 0.18,
      crownEnabled: false, crownBottomRadius: 0.18, crownTopRadius: 0.14, crownHeight: 0.08, crownLift: 0.62,
    },
  },
  {
    id: "mallet.shape.turbine",
    name: "Turbine",
    blurb: "Straight barrel cap under a broad rotor deck.",
    geometry: {
      shoulderRadius: 0.75, shoulderHeight: 0.22,
      capBottomRadius: 0.50, capTopRadius: 0.46, capHeight: 0.20, capLift: 0.22,
      crownEnabled: true, crownBottomRadius: 0.36, crownTopRadius: 0.38, crownHeight: 0.15, crownLift: 0.42,
    },
  },
  {
    id: "mallet.shape.split-core",
    name: "Split Core",
    blurb: "Narrow waist opening into a flared core.",
    geometry: {
      shoulderRadius: 0.74, shoulderHeight: 0.30,
      capBottomRadius: 0.46, capTopRadius: 0.28, capHeight: 0.14, capLift: 0.30,
      crownEnabled: true, crownBottomRadius: 0.24, crownTopRadius: 0.42, crownHeight: 0.20, crownLift: 0.44,
    },
  },
  {
    id: "mallet.shape.champion",
    name: "Champion",
    blurb: "Tournament profile with a raised trophy crown.",
    geometry: {
      shoulderRadius: 0.76, shoulderHeight: 0.28,
      capBottomRadius: 0.50, capTopRadius: 0.34, capHeight: 0.34, capLift: 0.28,
      crownEnabled: true, crownBottomRadius: 0.22, crownTopRadius: 0.30, crownHeight: 0.14, crownLift: 0.62,
    },
  },
  {
    id: "mallet.shape.reactor",
    name: "Reactor",
    blurb: "Cylindrical housing under a flared vent stack.",
    geometry: {
      shoulderRadius: 0.72, shoulderHeight: 0.24,
      capBottomRadius: 0.44, capTopRadius: 0.44, capHeight: 0.26, capLift: 0.24,
      crownEnabled: true, crownBottomRadius: 0.19, crownTopRadius: 0.36, crownHeight: 0.22, crownLift: 0.50,
    },
  },
  {
    id: "mallet.shape.industrial",
    name: "Industrial",
    blurb: "Oversized shoulder, short plate cap, service collar.",
    geometry: {
      shoulderRadius: 0.82, shoulderHeight: 0.36,
      capBottomRadius: 0.58, capTopRadius: 0.54, capHeight: 0.16, capLift: 0.36,
      crownEnabled: true, crownBottomRadius: 0.44, crownTopRadius: 0.40, crownHeight: 0.10, crownLift: 0.52,
    },
  },
  {
    id: "mallet.shape.minimal",
    name: "Minimal",
    blurb: "One clean step. Nothing else.",
    geometry: {
      shoulderRadius: 0.70, shoulderHeight: 0.20,
      capBottomRadius: 0.48, capTopRadius: 0.45, capHeight: 0.14, capLift: 0.20,
      crownEnabled: false, crownBottomRadius: 0.24, crownTopRadius: 0.20, crownHeight: 0.08, crownLift: 0.50,
    },
  },
  {
    id: "mallet.shape.arcade",
    name: "Arcade",
    blurb: "Tall cone and a button crown. Cabinet classic.",
    geometry: {
      shoulderRadius: 0.73, shoulderHeight: 0.28,
      capBottomRadius: 0.52, capTopRadius: 0.28, capHeight: 0.36, capLift: 0.28,
      crownEnabled: true, crownBottomRadius: 0.20, crownTopRadius: 0.23, crownHeight: 0.17, crownLift: 0.64,
    },
  },
]);

// ---------------------------------------------------------------------------
// MALLET MATERIAL
// ---------------------------------------------------------------------------

/**
 * Material bounds.
 *
 * Roughness has a floor AND a ceiling for the same reason: a perfect mirror and
 * a dead matte both stop reading as a moving object against a dark table.
 */
export const MALLET_MATERIAL_BOUNDS = Object.freeze({
  roughness: range(0.04, 0.92),
  metalness: range(0, 1),
  clearcoat: range(0, 1),
  clearcoatRoughness: range(0, 1),
});

export const MALLET_MATERIAL_PRESETS = Object.freeze([
  { id: "mallet.material.matte-polymer", name: "Matte Polymer", material: { roughness: 0.72, metalness: 0.06, clearcoat: 0.10, clearcoatRoughness: 0.60 } },
  { id: "mallet.material.brushed-metal", name: "Brushed Metal", material: { roughness: 0.36, metalness: 0.88, clearcoat: 0.18, clearcoatRoughness: 0.42 } },
  { id: "mallet.material.chrome", name: "Chrome", material: { roughness: 0.08, metalness: 1.00, clearcoat: 0.55, clearcoatRoughness: 0.06 } },
  { id: "mallet.material.carbon-composite", name: "Carbon Composite", material: { roughness: 0.44, metalness: 0.32, clearcoat: 0.70, clearcoatRoughness: 0.22 } },
  { id: "mallet.material.acrylic", name: "Acrylic", material: { roughness: 0.16, metalness: 0.02, clearcoat: 0.92, clearcoatRoughness: 0.06 } },
  { id: "mallet.material.pearl", name: "Pearl", material: { roughness: 0.28, metalness: 0.44, clearcoat: 0.86, clearcoatRoughness: 0.12 } },
  { id: "mallet.material.anodized", name: "Anodized Metal", material: { roughness: 0.30, metalness: 0.76, clearcoat: 0.30, clearcoatRoughness: 0.30 } },
  { id: "mallet.material.black-chrome", name: "Black Chrome", material: { roughness: 0.14, metalness: 0.95, clearcoat: 0.62, clearcoatRoughness: 0.10 } },
  { id: "mallet.material.championship", name: "Championship Metal", material: { roughness: 0.20, metalness: 0.92, clearcoat: 0.48, clearcoatRoughness: 0.14 } },
]);

// ---------------------------------------------------------------------------
// MALLET HARDWARE
// ---------------------------------------------------------------------------

export const MALLET_HARDWARE_BOUNDS = Object.freeze({
  radius: range(0.20, 0.84),
  thickness: range(0.018, 0.09),
  height: range(0.02, 0.62),
  glowIntensity: range(0, 1.6),
});

/**
 * Hardware styles are REAL MESH, not a shader flag. `segments` is how many
 * pieces the ring is built from; `rings` how many stacked bands. The renderer
 * reads these two numbers and nothing else, so a new style is a row here.
 */
export const MALLET_HARDWARE_STYLES = Object.freeze([
  { id: "mallet.hardware.none", name: "None", segments: 0, rings: 0, emissive: false },
  { id: "mallet.hardware.halo", name: "Halo", segments: 1, rings: 1, emissive: true },
  { id: "mallet.hardware.dual-halo", name: "Dual Halo", segments: 1, rings: 2, emissive: true },
  { id: "mallet.hardware.segmented", name: "Segmented", segments: 8, rings: 1, emissive: true },
  { id: "mallet.hardware.underglow", name: "Underglow", segments: 1, rings: 1, emissive: true, underglow: true },
  { id: "mallet.hardware.reactor", name: "Reactor", segments: 6, rings: 2, emissive: true, posts: true },
  { id: "mallet.hardware.mechanical", name: "Mechanical", segments: 12, rings: 1, emissive: false, posts: true },
]);

// ---------------------------------------------------------------------------
// MALLET DECAL PLACEMENT
// ---------------------------------------------------------------------------

/**
 * Decal placement bounds.
 *
 * X/Y are in CAP RADII, not world units, so a decal keeps its position relative
 * to the top face when the cap is resized. That is what stops a decal drifting
 * off the mallet the moment a shape slider moves.
 */
export const MALLET_DECAL_BOUNDS = Object.freeze({
  x: range(-0.75, 0.75),
  y: range(-0.75, 0.75),
  scale: range(0.25, 1.9),
  rotation: range(-180, 180, 1),
  opacity: range(0.15, 1),
});

export const MALLET_DECAL_TYPES = Object.freeze(["none", "builtin", "custom"]);

// ---------------------------------------------------------------------------
// TABLE HALF: SURFACE
// ---------------------------------------------------------------------------

export const TABLE_SURFACE_BOUNDS = Object.freeze({
  patternScale: range(0.4, 2.6),
  patternOpacity: range(0, 0.85),
  roughness: range(0.10, 0.90),
  metalness: range(0, 0.75),
});

/**
 * Pattern generators.
 *
 * `zones` is the readability contract and the reason the prototype's
 * full-field designs are not here: it names where a pattern is ALLOWED to draw.
 * `perimeter` and `rear` keep art off the puck-reading centre of the half;
 * `field` is reserved for patterns quiet enough to sit under live play.
 */
export const TABLE_PATTERNS = Object.freeze([
  { id: "table.pattern.none", name: "None", zones: [] },
  { id: "table.pattern.micro-grain", name: "Micro Grain", zones: ["field"] },
  { id: "table.pattern.fine-lines", name: "Fine Linework", zones: ["field"] },
  { id: "table.pattern.circuit-trace", name: "Circuit Trace", zones: ["perimeter", "rear"] },
  { id: "table.pattern.vector-grid", name: "Vector Grid", zones: ["field"] },
  { id: "table.pattern.gold-pinstripe", name: "Gold Pinstripe", zones: ["perimeter"] },
  { id: "table.pattern.blueprint-draft", name: "Blueprint Draft", zones: ["perimeter", "rear"] },
  { id: "table.pattern.hex-tessellation", name: "Hex Matrix", zones: ["field"] },
  { id: "table.pattern.prism-facets", name: "Prism Facets", zones: ["field"] },
  { id: "table.pattern.checker-border", name: "Checker Border", zones: ["perimeter", "rear"] },
  { id: "table.pattern.hazard-trim", name: "Hazard Trim", zones: ["rear"] },
  { id: "table.pattern.synth-vector", name: "Synth Vector", zones: ["perimeter", "rear"] },
  { id: "table.pattern.precision-rings", name: "Precision Rings", zones: ["field"] },
]);

/**
 * Tabletop presets. Every one of these is a premium manufactured surface: a
 * dark field, restrained linework, and one accent. Street Paint and Black Ice
 * from the prototype are deliberately absent and are not coming back.
 */
export const TABLE_SURFACE_PRESETS = Object.freeze([
  {
    id: "table.surface.factory-graphite", name: "Factory Graphite", blurb: "The baseline. Dark graphite, subtle grain.",
    surface: { baseColor: "#1b2229", secondaryColor: "#242d36", patternId: "table.pattern.micro-grain", patternColor: "#38444f", patternScale: 1, patternOpacity: 0.22, roughness: 0.42, metalness: 0.14 },
  },
  {
    id: "table.surface.tournament-slate", name: "Tournament Slate", blurb: "Competition slate. Crisp thin linework, almost no noise.",
    surface: { baseColor: "#161c22", secondaryColor: "#1f272f", patternId: "table.pattern.fine-lines", patternColor: "#4a5a68", patternScale: 1.1, patternOpacity: 0.18, roughness: 0.34, metalness: 0.20 },
  },
  {
    id: "table.surface.carbon-circuit", name: "Carbon Circuit", blurb: "Carbon weave with sparse traces at the perimeter and goal.",
    surface: { baseColor: "#12161a", secondaryColor: "#1b2126", patternId: "table.pattern.circuit-trace", patternColor: "#3fa9c6", patternScale: 1, patternOpacity: 0.34, roughness: 0.38, metalness: 0.28 },
  },
  {
    id: "table.surface.vector-grid", name: "Vector Grid", blurb: "Navy field under a low-contrast precision grid.",
    surface: { baseColor: "#131a26", secondaryColor: "#1b2433", patternId: "table.pattern.vector-grid", patternColor: "#4b6f95", patternScale: 1, patternOpacity: 0.20, roughness: 0.36, metalness: 0.18 },
  },
  {
    id: "table.surface.championship", name: "Championship Black & Gold", blurb: "Black field, restrained gold pinstriping.",
    surface: { baseColor: "#101216", secondaryColor: "#191c22", patternId: "table.pattern.gold-pinstripe", patternColor: "#c9a24a", patternScale: 1, patternOpacity: 0.42, roughness: 0.28, metalness: 0.34 },
  },
  {
    id: "table.surface.blueprint", name: "Blueprint", blurb: "Deep navy and technical drafting linework.",
    surface: { baseColor: "#0f1c2e", secondaryColor: "#16283f", patternId: "table.pattern.blueprint-draft", patternColor: "#79a7d6", patternScale: 1, patternOpacity: 0.30, roughness: 0.44, metalness: 0.10 },
  },
  {
    id: "table.surface.hex-matrix", name: "Hex Matrix", blurb: "Large low-contrast hex tessellation with occasional accents.",
    surface: { baseColor: "#171b20", secondaryColor: "#212830", patternId: "table.pattern.hex-tessellation", patternColor: "#465663", patternScale: 1.2, patternOpacity: 0.24, roughness: 0.40, metalness: 0.16 },
  },
  {
    id: "table.surface.prism-facet", name: "Prism Facet", blurb: "Charcoal-on-charcoal facets with one accent.",
    surface: { baseColor: "#1a1d22", secondaryColor: "#23272e", patternId: "table.pattern.prism-facets", patternColor: "#4d5866", patternScale: 1, patternOpacity: 0.26, roughness: 0.32, metalness: 0.22 },
  },
  {
    id: "table.surface.arcade-checker", name: "Arcade Checker", blurb: "Checker held to the border and rear apron only.",
    surface: { baseColor: "#161a1f", secondaryColor: "#20262d", patternId: "table.pattern.checker-border", patternColor: "#8c98a4", patternScale: 1, patternOpacity: 0.38, roughness: 0.38, metalness: 0.16 },
  },
  {
    id: "table.surface.industrial-hazard", name: "Industrial Hazard", blurb: "Dark plant floor, hazard detail at the rear trim.",
    surface: { baseColor: "#191a17", secondaryColor: "#23241f", patternId: "table.pattern.hazard-trim", patternColor: "#c2a02c", patternScale: 1, patternOpacity: 0.40, roughness: 0.52, metalness: 0.12 },
  },
  {
    id: "table.surface.synth-vector", name: "Synth Vector", blurb: "Very dark field, sparse printed vector geometry.",
    surface: { baseColor: "#0e0f18", secondaryColor: "#161a28", patternId: "table.pattern.synth-vector", patternColor: "#b256c9", patternScale: 1, patternOpacity: 0.34, roughness: 0.30, metalness: 0.26 },
  },
  {
    id: "table.surface.precision-rings", name: "Precision Rings", blurb: "Concentric technical rings, kept low contrast.",
    surface: { baseColor: "#181d23", secondaryColor: "#212831", patternId: "table.pattern.precision-rings", patternColor: "#51697d", patternScale: 1, patternOpacity: 0.22, roughness: 0.36, metalness: 0.18 },
  },
]);

// ---------------------------------------------------------------------------
// TABLE HALF: MARKINGS, RAILS, GOAL, TRIM
// ---------------------------------------------------------------------------

/**
 * Markings.
 *
 * Opacity has a FLOOR. A player may tone their own half's linework down; they
 * may not erase the goal mouth or the boundary, because those are gameplay
 * information and the opponent has to read them too.
 */
export const TABLE_MARKING_BOUNDS = Object.freeze({
  opacity: range(0.25, 0.95),
});

export const TABLE_RAIL_PRESETS = Object.freeze([
  { id: "table.rail.factory-steel", name: "Factory Steel", rails: { bodyColor: "#343d46", topColor: "#7d8790", roughness: 0.22, metalness: 0.74 } },
  { id: "table.rail.black-chrome", name: "Black Chrome", rails: { bodyColor: "#1a1d21", topColor: "#59616a", roughness: 0.14, metalness: 0.92 } },
  { id: "table.rail.machined-silver", name: "Machined Silver", rails: { bodyColor: "#6d757d", topColor: "#c3cad1", roughness: 0.26, metalness: 0.86 } },
  { id: "table.rail.carbon-composite", name: "Carbon Composite", rails: { bodyColor: "#22262b", topColor: "#454c54", roughness: 0.46, metalness: 0.34 } },
  { id: "table.rail.championship-gold", name: "Championship Gold", rails: { bodyColor: "#4a3c1d", topColor: "#c9a24a", roughness: 0.24, metalness: 0.88 } },
  { id: "table.rail.arcade-trim", name: "Arcade Trim", rails: { bodyColor: "#2b2438", topColor: "#8f79bd", roughness: 0.30, metalness: 0.58 } },
]);

export const TABLE_RAIL_BOUNDS = Object.freeze({
  roughness: range(0.08, 0.90),
  metalness: range(0, 1),
});

export const TABLE_GOAL_PRESETS = Object.freeze([
  { id: "table.goal.factory", name: "Factory", goal: { color: "#a14848", emissiveColor: "#a14848", glowIntensity: 0.17 } },
  { id: "table.goal.halo", name: "Halo", goal: { color: "#2b3138", emissiveColor: "#78d0e8", glowIntensity: 0.62 } },
  { id: "table.goal.blackout", name: "Blackout", goal: { color: "#15181c", emissiveColor: "#15181c", glowIntensity: 0.04 } },
  { id: "table.goal.championship", name: "Championship", goal: { color: "#4a3c1d", emissiveColor: "#c9a24a", glowIntensity: 0.48 } },
  { id: "table.goal.reactor", name: "Reactor", goal: { color: "#2a1f2e", emissiveColor: "#d05a32", glowIntensity: 0.75 } },
]);

export const TABLE_GOAL_BOUNDS = Object.freeze({
  glowIntensity: range(0, 1.2),
});

export const TABLE_TRIM_BOUNDS = Object.freeze({
  glowIntensity: range(0, 1.2),
});

// ---------------------------------------------------------------------------
// LOOKUP
// ---------------------------------------------------------------------------

const index = (list) => Object.freeze(new Map(list.map((entry) => [entry.id, entry])));

export const MALLET_SHAPE_BY_ID = index(MALLET_SHAPE_PRESETS);
export const MALLET_MATERIAL_BY_ID = index(MALLET_MATERIAL_PRESETS);
export const MALLET_HARDWARE_BY_ID = index(MALLET_HARDWARE_STYLES);
export const TABLE_SURFACE_BY_ID = index(TABLE_SURFACE_PRESETS);
export const TABLE_PATTERN_BY_ID = index(TABLE_PATTERNS);
export const TABLE_RAIL_BY_ID = index(TABLE_RAIL_PRESETS);
export const TABLE_GOAL_BY_ID = index(TABLE_GOAL_PRESETS);

/**
 * The gameplay mallet radius, restated here for ONE purpose: the garage's
 * collision-footprint overlay and the test that asserts no cosmetic can change
 * it. It is a mirror of `CONTACT_R - PUCK_R` in config.js, checked by
 * `tests/cosmetics-physics.test.js`. Nothing draws gameplay from this constant.
 */
export const PHYSICS_MALLET_RADIUS = 0.73;
