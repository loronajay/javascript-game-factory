// Puck'd Up's server-owned loadout catalog: the trust boundary for a player's
// saved mallet and table half.
//
// Registered in `db/game-loadouts.mts` beside Speed Demon's, Yam Bowling's and
// Shark Hall's, and it reuses the same generic `game_loadouts` row keyed by
// `game_slug`. No new table, no new route: `GET`/`PUT /games/puckd-up/garage`
// and the public `GET /games/puckd-up/loadout/:playerId`.
//
// WHY THIS VALIDATES NUMBERS AND NOT JUST SHAPE.
//
// Shark Hall's cosmetics are opaque ids whose meaning lives in the cabinet, so
// its catalog checks namespaces. Puck'd Up's garage is mostly NUMBERS — radii,
// heights, opacities, a decal's position on the cap — and a number out of range
// is a defect wherever it came from. So every one is clamped here, on the way
// in AND on the way out, exactly the way Speed Demon clamps a livery.
//
// COSMETICS CANNOT REACH PHYSICS, AND THIS IS WHERE THAT IS TRUE.
//
// Nothing in this document is a gameplay quantity. The mallet's collision
// radius, the puck speed cap, restitution, friction, mass, goal width and rail
// geometry are all constants in the cabinet's own `scripts/config.js` and
// `scripts/physics/`, and no field below is read by any of them. The visual
// bounds here exist for READABILITY — a mallet nobody can see, or a marking
// opacity that erases the goal mouth, is a broken table for both players — not
// because a wider value would be worth more reach. It would not be worth any:
// the geometry drives a mesh and the mesh drives nothing.
//
// EVERYTHING IS GRANTED IN THIS PHASE. `requiresEntitlements` is the switch,
// and when cosmetics become earned the owned-id test goes beside `pickId`
// below. Nothing else in the stack changes.
export const PUCK_D_UP_GAME_SLUG = "puckd-up";
const LOADOUT_VERSION = 2;
/** How many designs one account may keep. Mirrors the cabinet's own cap. */
const MAX_LOADOUTS = 8;
/** Longest player-given loadout name. */
const LOADOUT_NAME_LIMIT = 24;
const range = (min, max) => ({ min, max });
// ---------------------------------------------------------------------------
// BOUNDS — mirrored from the cabinet's `scripts/cosmetics/catalog.js`.
// `games/puckd-up/tests/server-agreement.test.js` asserts the two agree.
// ---------------------------------------------------------------------------
const GEOMETRY_BOUNDS = {
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
};
const MATERIAL_BOUNDS = {
    roughness: range(0.04, 0.92),
    metalness: range(0, 1),
    clearcoat: range(0, 1),
    clearcoatRoughness: range(0, 1),
};
const HARDWARE_BOUNDS = {
    radius: range(0.20, 0.84),
    thickness: range(0.018, 0.09),
    height: range(0.02, 0.62),
    glowIntensity: range(0, 1.6),
};
const DECAL_BOUNDS = {
    x: range(-0.75, 0.75),
    y: range(-0.75, 0.75),
    scale: range(0.25, 1.9),
    rotation: range(-180, 180),
    opacity: range(0.15, 1),
};
const SURFACE_BOUNDS = {
    patternScale: range(0.4, 2.6),
    patternOpacity: range(0, 0.85),
    roughness: range(0.10, 0.90),
    metalness: range(0, 0.75),
};
const RAIL_BOUNDS = {
    roughness: range(0.08, 0.90),
    metalness: range(0, 1),
};
const MARKING_OPACITY = range(0.25, 0.95);
const GOAL_GLOW = range(0, 1.2);
const TRIM_GLOW = range(0, 1.2);
const SHAPE_PRESETS = {
    "mallet.shape.classic": { shoulderRadius: 0.73, shoulderHeight: 0.26, capBottomRadius: 0.48, capTopRadius: 0.38, capHeight: 0.30, capLift: 0.26, crownEnabled: false, crownBottomRadius: 0.26, crownTopRadius: 0.22, crownHeight: 0.10, crownLift: 0.56 },
    "mallet.shape.heavy": { shoulderRadius: 0.79, shoulderHeight: 0.34, capBottomRadius: 0.56, capTopRadius: 0.46, capHeight: 0.26, capLift: 0.34, crownEnabled: true, crownBottomRadius: 0.32, crownTopRadius: 0.26, crownHeight: 0.11, crownLift: 0.60 },
    "mallet.shape.razor": { shoulderRadius: 0.68, shoulderHeight: 0.18, capBottomRadius: 0.52, capTopRadius: 0.21, capHeight: 0.44, capLift: 0.18, crownEnabled: false, crownBottomRadius: 0.18, crownTopRadius: 0.14, crownHeight: 0.08, crownLift: 0.62 },
    "mallet.shape.turbine": { shoulderRadius: 0.75, shoulderHeight: 0.22, capBottomRadius: 0.50, capTopRadius: 0.46, capHeight: 0.20, capLift: 0.22, crownEnabled: true, crownBottomRadius: 0.36, crownTopRadius: 0.38, crownHeight: 0.15, crownLift: 0.42 },
    "mallet.shape.split-core": { shoulderRadius: 0.74, shoulderHeight: 0.30, capBottomRadius: 0.46, capTopRadius: 0.28, capHeight: 0.14, capLift: 0.30, crownEnabled: true, crownBottomRadius: 0.24, crownTopRadius: 0.42, crownHeight: 0.20, crownLift: 0.44 },
    "mallet.shape.champion": { shoulderRadius: 0.76, shoulderHeight: 0.28, capBottomRadius: 0.50, capTopRadius: 0.34, capHeight: 0.34, capLift: 0.28, crownEnabled: true, crownBottomRadius: 0.22, crownTopRadius: 0.30, crownHeight: 0.14, crownLift: 0.62 },
    "mallet.shape.reactor": { shoulderRadius: 0.72, shoulderHeight: 0.24, capBottomRadius: 0.44, capTopRadius: 0.44, capHeight: 0.26, capLift: 0.24, crownEnabled: true, crownBottomRadius: 0.19, crownTopRadius: 0.36, crownHeight: 0.22, crownLift: 0.50 },
    "mallet.shape.industrial": { shoulderRadius: 0.82, shoulderHeight: 0.36, capBottomRadius: 0.58, capTopRadius: 0.54, capHeight: 0.16, capLift: 0.36, crownEnabled: true, crownBottomRadius: 0.44, crownTopRadius: 0.40, crownHeight: 0.10, crownLift: 0.52 },
    "mallet.shape.minimal": { shoulderRadius: 0.70, shoulderHeight: 0.20, capBottomRadius: 0.48, capTopRadius: 0.45, capHeight: 0.14, capLift: 0.20, crownEnabled: false, crownBottomRadius: 0.24, crownTopRadius: 0.20, crownHeight: 0.08, crownLift: 0.50 },
    "mallet.shape.arcade": { shoulderRadius: 0.73, shoulderHeight: 0.28, capBottomRadius: 0.52, capTopRadius: 0.28, capHeight: 0.36, capLift: 0.28, crownEnabled: true, crownBottomRadius: 0.20, crownTopRadius: 0.23, crownHeight: 0.17, crownLift: 0.64 },
};
const MATERIAL_PRESETS = {
    "mallet.material.matte-polymer": { roughness: 0.72, metalness: 0.06, clearcoat: 0.10, clearcoatRoughness: 0.60 },
    "mallet.material.brushed-metal": { roughness: 0.36, metalness: 0.88, clearcoat: 0.18, clearcoatRoughness: 0.42 },
    "mallet.material.chrome": { roughness: 0.08, metalness: 1.00, clearcoat: 0.55, clearcoatRoughness: 0.06 },
    "mallet.material.carbon-composite": { roughness: 0.44, metalness: 0.32, clearcoat: 0.70, clearcoatRoughness: 0.22 },
    "mallet.material.acrylic": { roughness: 0.16, metalness: 0.02, clearcoat: 0.92, clearcoatRoughness: 0.06 },
    "mallet.material.pearl": { roughness: 0.28, metalness: 0.44, clearcoat: 0.86, clearcoatRoughness: 0.12 },
    "mallet.material.anodized": { roughness: 0.30, metalness: 0.76, clearcoat: 0.30, clearcoatRoughness: 0.30 },
    "mallet.material.black-chrome": { roughness: 0.14, metalness: 0.95, clearcoat: 0.62, clearcoatRoughness: 0.10 },
    "mallet.material.championship": { roughness: 0.20, metalness: 0.92, clearcoat: 0.48, clearcoatRoughness: 0.14 },
};
const HARDWARE_STYLES = new Set([
    "mallet.hardware.none", "mallet.hardware.halo", "mallet.hardware.dual-halo",
    "mallet.hardware.segmented", "mallet.hardware.underglow", "mallet.hardware.reactor",
    "mallet.hardware.mechanical",
]);
/** The approved default decals. Mirrors `assets/decals/catalog.json`. */
const DECAL_IDS = new Set([
    "decal.lightning-bolt", "decal.skull", "decal.champion-crown", "decal.target-reticle",
    "decal.crossed-mallets", "decal.turbine", "decal.reactor-core", "decal.radiation",
    "decal.claw-marks", "decal.flaming-puck", "decal.circuit-puck", "decal.champion-shield",
    "decal.gold-star", "decal.number-one-laurel", "decal.checkered-flag", "decal.yin-yang",
    "decal.spade", "decal.club", "decal.wolf", "decal.smiley", "decal.pixel-ghost",
    "decal.arcade-joystick", "decal.facet-star", "decal.hex-cluster", "decal.carbon-fiber",
    "decal.gear", "decal.glitch-x", "decal.crossed-bars", "decal.cherry-blossom",
    "decal.great-wave", "decal.galaxy", "decal.mountain-moon", "decal.desert-sunset",
    "decal.snowflake", "decal.city-skyline", "decal.rising-sun", "decal.monster-grin",
    "decal.oni-mask", "decal.anarchy", "decal.speed-slashes",
]);
const PATTERN_IDS = new Set([
    "table.pattern.none", "table.pattern.micro-grain", "table.pattern.fine-lines",
    "table.pattern.circuit-trace", "table.pattern.vector-grid", "table.pattern.gold-pinstripe",
    "table.pattern.blueprint-draft", "table.pattern.hex-tessellation", "table.pattern.prism-facets",
    "table.pattern.checker-border", "table.pattern.hazard-trim", "table.pattern.synth-vector",
    "table.pattern.precision-rings",
]);
const SURFACE_PRESETS = {
    "table.surface.factory-graphite": { baseColor: "#1b2229", secondaryColor: "#242d36", patternId: "table.pattern.micro-grain", patternColor: "#38444f", patternScale: 1, patternOpacity: 0.22, roughness: 0.42, metalness: 0.14 },
    "table.surface.tournament-slate": { baseColor: "#161c22", secondaryColor: "#1f272f", patternId: "table.pattern.fine-lines", patternColor: "#4a5a68", patternScale: 1.1, patternOpacity: 0.18, roughness: 0.34, metalness: 0.20 },
    "table.surface.carbon-circuit": { baseColor: "#12161a", secondaryColor: "#1b2126", patternId: "table.pattern.circuit-trace", patternColor: "#3fa9c6", patternScale: 1, patternOpacity: 0.34, roughness: 0.38, metalness: 0.28 },
    "table.surface.vector-grid": { baseColor: "#131a26", secondaryColor: "#1b2433", patternId: "table.pattern.vector-grid", patternColor: "#4b6f95", patternScale: 1, patternOpacity: 0.20, roughness: 0.36, metalness: 0.18 },
    "table.surface.championship": { baseColor: "#101216", secondaryColor: "#191c22", patternId: "table.pattern.gold-pinstripe", patternColor: "#c9a24a", patternScale: 1, patternOpacity: 0.42, roughness: 0.28, metalness: 0.34 },
    "table.surface.blueprint": { baseColor: "#0f1c2e", secondaryColor: "#16283f", patternId: "table.pattern.blueprint-draft", patternColor: "#79a7d6", patternScale: 1, patternOpacity: 0.30, roughness: 0.44, metalness: 0.10 },
    "table.surface.hex-matrix": { baseColor: "#171b20", secondaryColor: "#212830", patternId: "table.pattern.hex-tessellation", patternColor: "#465663", patternScale: 1.2, patternOpacity: 0.24, roughness: 0.40, metalness: 0.16 },
    "table.surface.prism-facet": { baseColor: "#1a1d22", secondaryColor: "#23272e", patternId: "table.pattern.prism-facets", patternColor: "#4d5866", patternScale: 1, patternOpacity: 0.26, roughness: 0.32, metalness: 0.22 },
    "table.surface.arcade-checker": { baseColor: "#161a1f", secondaryColor: "#20262d", patternId: "table.pattern.checker-border", patternColor: "#8c98a4", patternScale: 1, patternOpacity: 0.38, roughness: 0.38, metalness: 0.16 },
    "table.surface.industrial-hazard": { baseColor: "#191a17", secondaryColor: "#23241f", patternId: "table.pattern.hazard-trim", patternColor: "#c2a02c", patternScale: 1, patternOpacity: 0.40, roughness: 0.52, metalness: 0.12 },
    "table.surface.synth-vector": { baseColor: "#0e0f18", secondaryColor: "#161a28", patternId: "table.pattern.synth-vector", patternColor: "#b256c9", patternScale: 1, patternOpacity: 0.34, roughness: 0.30, metalness: 0.26 },
    "table.surface.precision-rings": { baseColor: "#181d23", secondaryColor: "#212831", patternId: "table.pattern.precision-rings", patternColor: "#51697d", patternScale: 1, patternOpacity: 0.22, roughness: 0.36, metalness: 0.18 },
};
const RAIL_PRESETS = {
    "table.rail.factory-steel": { bodyColor: "#343d46", topColor: "#7d8790", roughness: 0.22, metalness: 0.74 },
    "table.rail.black-chrome": { bodyColor: "#1a1d21", topColor: "#59616a", roughness: 0.14, metalness: 0.92 },
    "table.rail.machined-silver": { bodyColor: "#6d757d", topColor: "#c3cad1", roughness: 0.26, metalness: 0.86 },
    "table.rail.carbon-composite": { bodyColor: "#22262b", topColor: "#454c54", roughness: 0.46, metalness: 0.34 },
    "table.rail.championship-gold": { bodyColor: "#4a3c1d", topColor: "#c9a24a", roughness: 0.24, metalness: 0.88 },
    "table.rail.arcade-trim": { bodyColor: "#2b2438", topColor: "#8f79bd", roughness: 0.30, metalness: 0.58 },
};
const GOAL_PRESETS = {
    "table.goal.factory": { color: "#a14848", emissiveColor: "#a14848", glowIntensity: 0.17 },
    "table.goal.halo": { color: "#2b3138", emissiveColor: "#78d0e8", glowIntensity: 0.62 },
    "table.goal.blackout": { color: "#15181c", emissiveColor: "#15181c", glowIntensity: 0.04 },
    "table.goal.championship": { color: "#4a3c1d", emissiveColor: "#c9a24a", glowIntensity: 0.48 },
    "table.goal.reactor": { color: "#2a1f2e", emissiveColor: "#d05a32", glowIntensity: 0.75 },
};
const DEFAULT_SHAPE_ID = "mallet.shape.classic";
const DEFAULT_MATERIAL_ID = "mallet.material.anodized";
const DEFAULT_HARDWARE_ID = "mallet.hardware.halo";
const DEFAULT_SURFACE_ID = "table.surface.factory-graphite";
const DEFAULT_RAIL_ID = "table.rail.factory-steel";
const DEFAULT_GOAL_ID = "table.goal.factory";
const DEFAULT_PRIMARY = "#a14848";
const DEFAULT_ACCENT = "#d8dde2";
const DEFAULT_HARDWARE_COLOR = "#8f9aa4";
const DEFAULT_MARKING_COLOR = "#86a1b1";
const DEFAULT_TRIM_COLOR = "#a14848";
const DEFAULT_HARDWARE = { radius: 0.49, thickness: 0.045, height: 0.18, glowIntensity: 0.34 };
const DEFAULT_DECAL = { type: "none", x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.95 };
// ---------------------------------------------------------------------------
// NORMALIZATION
// ---------------------------------------------------------------------------
const HEX_COLOR = /^#[0-9a-f]{6}$/;
const SHORT_HEX = /^#[0-9a-f]{3}$/;
/** A reference this API minted. Never a data URI, never a path, never inline bytes. */
const ASSET_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ASSET_URL = /^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]{1,480}$/;
function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function clampNumber(value, bounds, fallback) {
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number))
        return fallback;
    return Math.min(bounds.max, Math.max(bounds.min, number));
}
function normalizeColor(value, fallback) {
    const text = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (HEX_COLOR.test(text))
        return text;
    if (SHORT_HEX.test(text))
        return `#${text.slice(1).split("").map((c) => c + c).join("")}`;
    return fallback;
}
/** One id, or the default. An unknown id falls back rather than failing the save. */
function pickId(value, allowed, fallback) {
    const text = typeof value === "string" ? value.trim() : "";
    const known = allowed instanceof Set ? allowed.has(text) : Object.hasOwn(allowed, text);
    return known ? text : fallback;
}
function clampMap(raw, bounds, defaults) {
    const input = asObject(raw);
    const out = {};
    for (const [key, bound] of Object.entries(bounds))
        out[key] = clampNumber(input[key], bound, defaults[key]);
    return out;
}
function normalizeGeometry(raw, defaults) {
    const out = clampMap(raw, GEOMETRY_BOUNDS, defaults);
    const input = asObject(raw);
    out.crownEnabled = typeof input.crownEnabled === "boolean" ? input.crownEnabled : Boolean(defaults.crownEnabled);
    return out;
}
function normalizeDecal(raw) {
    const input = asObject(raw);
    const placement = clampMap(input, DECAL_BOUNDS, DEFAULT_DECAL);
    const none = { type: "none", id: "", customAssetId: null, customAssetUrl: null, ...placement };
    const type = typeof input.type === "string" ? input.type : DEFAULT_DECAL.type;
    if (type === "builtin") {
        const id = typeof input.id === "string" ? input.id.trim() : "";
        return DECAL_IDS.has(id) ? { type: "builtin", id, customAssetId: null, customAssetUrl: null, ...placement } : none;
    }
    if (type === "custom") {
        // Both halves of the reference, or nothing. A half-valid custom decal is how
        // an unbounded blob ends up in an account row; there is no partial state.
        const assetId = typeof input.customAssetId === "string" ? input.customAssetId.trim() : "";
        const assetUrl = typeof input.customAssetUrl === "string" ? input.customAssetUrl.trim() : "";
        if (!ASSET_ID.test(assetId) || !ASSET_URL.test(assetUrl))
            return none;
        return { type: "custom", id: "", customAssetId: assetId, customAssetUrl: assetUrl, ...placement };
    }
    return none;
}
function normalizeMallet(raw) {
    const input = asObject(raw);
    const shapePreset = pickId(input.shapePreset, SHAPE_PRESETS, DEFAULT_SHAPE_ID);
    const materialPreset = pickId(asObject(input.material).preset, MATERIAL_PRESETS, DEFAULT_MATERIAL_ID);
    const colors = asObject(input.colors);
    return {
        shapePreset,
        geometry: normalizeGeometry(input.geometry, SHAPE_PRESETS[shapePreset]),
        material: { preset: materialPreset, ...clampMap(input.material, MATERIAL_BOUNDS, MATERIAL_PRESETS[materialPreset]) },
        colors: {
            primary: normalizeColor(colors.primary, DEFAULT_PRIMARY),
            accent: normalizeColor(colors.accent, DEFAULT_ACCENT),
            hardware: normalizeColor(colors.hardware, DEFAULT_HARDWARE_COLOR),
        },
        hardware: {
            style: pickId(asObject(input.hardware).style, HARDWARE_STYLES, DEFAULT_HARDWARE_ID),
            ...clampMap(input.hardware, HARDWARE_BOUNDS, DEFAULT_HARDWARE),
        },
        decal: normalizeDecal(input.decal),
    };
}
function normalizeTableHalf(raw) {
    const input = asObject(raw);
    const surfaceInput = asObject(input.surface);
    const surfacePreset = pickId(surfaceInput.preset, SURFACE_PRESETS, DEFAULT_SURFACE_ID);
    const surfaceDefaults = SURFACE_PRESETS[surfacePreset];
    const railInput = asObject(input.rails);
    const railPreset = pickId(railInput.preset, RAIL_PRESETS, DEFAULT_RAIL_ID);
    const railDefaults = RAIL_PRESETS[railPreset];
    const goalInput = asObject(input.goal);
    const goalPreset = pickId(goalInput.preset, GOAL_PRESETS, DEFAULT_GOAL_ID);
    const goalDefaults = GOAL_PRESETS[goalPreset];
    const markings = asObject(input.markings);
    const trim = asObject(input.trim);
    return {
        surface: {
            preset: surfacePreset,
            baseColor: normalizeColor(surfaceInput.baseColor, surfaceDefaults.baseColor),
            secondaryColor: normalizeColor(surfaceInput.secondaryColor, surfaceDefaults.secondaryColor),
            patternId: pickId(surfaceInput.patternId, PATTERN_IDS, surfaceDefaults.patternId),
            patternColor: normalizeColor(surfaceInput.patternColor, surfaceDefaults.patternColor),
            ...clampMap(surfaceInput, SURFACE_BOUNDS, surfaceDefaults),
        },
        // The floor on marking opacity is a gameplay-readability rule, not taste:
        // the centre division and the goal mouth have to stay visible to BOTH
        // players, and one of them does not get a vote on this half.
        markings: {
            color: normalizeColor(markings.color, DEFAULT_MARKING_COLOR),
            opacity: clampNumber(markings.opacity, MARKING_OPACITY, 0.45),
        },
        rails: {
            preset: railPreset,
            bodyColor: normalizeColor(railInput.bodyColor, railDefaults.bodyColor),
            topColor: normalizeColor(railInput.topColor, railDefaults.topColor),
            ...clampMap(railInput, RAIL_BOUNDS, railDefaults),
        },
        goal: {
            preset: goalPreset,
            color: normalizeColor(goalInput.color, goalDefaults.color),
            emissiveColor: normalizeColor(goalInput.emissiveColor, goalDefaults.emissiveColor),
            glowIntensity: clampNumber(goalInput.glowIntensity, GOAL_GLOW, goalDefaults.glowIntensity),
        },
        trim: {
            color: normalizeColor(trim.color, DEFAULT_TRIM_COLOR),
            glowIntensity: clampNumber(trim.glowIntensity, TRIM_GLOW, 0.45),
        },
    };
}
// ---------------------------------------------------------------------------
// LOADOUTS AND THE DOCUMENT
// ---------------------------------------------------------------------------
//
// A player keeps SEVERAL designs and equips one. The cap and the name rules are
// enforced here because this is a row in this database: an unbounded list of
// unbounded names is how one account's cosmetics become everyone's problem.
// The cabinet does the same work in `scripts/cosmetics/loadout.js` so it never
// draws a document it would not have written, and
// `games/puckd-up/tests/server-agreement.test.js` asserts the two agree
// character for character.
const LOADOUT_ID = /^[A-Za-z0-9_-]{1,32}$/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const defaultLoadoutName = (index) => `Loadout ${index + 1}`;
const defaultLoadoutId = (index) => `loadout-${index + 1}`;
function normalizeLoadoutName(value, index) {
    const text = (typeof value === "string" ? value : "")
        .replace(CONTROL_CHARS, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, LOADOUT_NAME_LIMIT)
        .trim();
    return text || defaultLoadoutName(index);
}
function normalizeLoadout(value, index) {
    const input = asObject(value);
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
/**
 * The factory garage.
 *
 * A player who has never opened the Garage has no row, and that is not an
 * error: they get this, which is exactly what their own cabinet is drawing
 * before it has ever talked to the API.
 */
export function defaultPuckdUpGarage() {
    return normalizePuckdUpGarage(null);
}
/**
 * Coerce any stored or submitted document into a garage. Never throws.
 *
 * MIGRATION, NOT WIPE. Version 1 was a bare mallet-and-table-half with no list,
 * so a document with no usable `loadouts` array is read AS one loadout — every
 * row written before this shipped comes back as slot one with its design
 * intact, and an absent row lands on the factory loadout by the same path.
 */
export function normalizePuckdUpGarage(value) {
    const input = asObject(value);
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
            while (taken.has(defaultLoadoutId(n)))
                n += 1;
            loadout.id = defaultLoadoutId(n);
        }
        taken.add(loadout.id);
        loadouts.push(loadout);
    }
    const requested = typeof input.equippedId === "string" ? input.equippedId.trim() : "";
    const equippedId = taken.has(requested) ? requested : loadouts[0].id;
    return { version: LOADOUT_VERSION, equippedId, loadouts };
}
/**
 * What one player's equipment looks like, for an opponent to draw.
 *
 * THE EQUIPPED SLOT ONLY. A player's other designs are theirs; an opponent is
 * owed the mallet and the half actually on the table, and nothing else. This is
 * the line that keeps the public shape from growing with the private list.
 */
export function puckdUpLoadoutFromGarage(garage) {
    const normalized = normalizePuckdUpGarage(garage);
    const equipped = normalized.loadouts.find((loadout) => loadout.id === normalized.equippedId)
        ?? normalized.loadouts[0];
    return { mallet: equipped.mallet, tableHalf: equipped.tableHalf };
}
export const PUCK_D_UP_LOADOUT_CATALOG = Object.freeze({
    requiresEntitlements: false,
    normalizeGarage: normalizePuckdUpGarage,
    loadoutFromGarage: puckdUpLoadoutFromGarage,
});
