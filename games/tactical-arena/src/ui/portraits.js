// Unit portraits — painted full-body character art (assets/units/<type>.png), used
// by the Codex + roster picker as reference/hero imagery. NOT the on-board token:
// the board piece stays the team-tinted carved SVG figurine (unitRenderer.js). This
// is a pure presentation layer, so it lives in ui/ and keeps core/ free of asset
// framing data.
//
// The trap these portraits set: every source is a uniform 600×600 canvas, but the
// FIGURE inside each canvas is not — the archer stands ~0.97 of canvas height, the
// hunched ghoul only ~0.665 and sits low. Dropping them into one fixed box floats
// the ghoul and oversizes the archer. So each portrait carries a measured content
// `box` (the alpha bounding box, as fractions of the source) plus a hand-tunable
// `scale`; `portraitFrameStyle` turns those into inline styles that crop the dead
// space, normalize every figure to the SAME on-screen height, and floor-align the
// feet — so figures read at a consistent scale with nothing clipped.
//
// `box` values are seeded from a real alpha-bbox measurement of each PNG (see the
// scratchpad measure script that produced them); re-measure if the art is replaced.

import { UNIT_TYPES } from "../core/unitCatalog.js";
import { getSkin } from "./skinModel.js";

// box: { x, y, w, h } — content bounding box as fractions [0..1] of the 600×600 source.
// scale: per-unit visual-size fudge (1 = normalize to the shared height). Lower it for
//        a figure whose bbox over-reads (e.g. a hunched creature shouldn't tower).
export const PORTRAITS = Object.freeze({
  swordsman:   portrait("swordsman",   { x: 0.132, y: 0.027, w: 0.797, h: 0.932 }),
  archer:      portrait("archer",      { x: 0.173, y: 0.012, w: 0.707, h: 0.970 }),
  mystic:      portrait("mystic",      { x: 0.175, y: 0.015, w: 0.628, h: 0.955 }),
  magician:    portrait("magician",    { x: 0.145, y: 0.022, w: 0.693, h: 0.937 }),
  paladin:     portrait("paladin",     { x: 0.063, y: 0.038, w: 0.777, h: 0.920 }),
  necromancer: portrait("necromancer", { x: 0.085, y: 0.030, w: 0.737, h: 0.910 }),
  "witch-doctor": portrait("witch-doctor", { x: 0.080, y: 0.030, w: 0.780, h: 0.920 }),
  "father-time": portrait("father-time", { x: 0.107, y: 0.040, w: 0.800, h: 0.920 }),
  // Heavy war-mech: fills nearly the whole canvas, feet planted at the bottom edge.
  juggernaut:  portrait("juggernaut",  { x: 0.133, y: 0.013, w: 0.693, h: 0.947 }),
  sniper:      portrait("sniper",      { x: 0.150, y: 0.030, w: 0.760, h: 0.955 }),
  // Centered standing figure; measured alpha bbox off the 600×600 source.
  king:        portrait("king",        { x: 0.160, y: 0.030, w: 0.707, h: 0.943 }),
  monk:        portrait("monk",        { x: 0.162, y: 0.027, w: 0.652, h: 0.955 }),
  // Winged holy archer; measured alpha bbox off the 600×600 source (wings + bow spread wide).
  angel:       portrait("angel",       { x: 0.093, y: 0.032, w: 0.810, h: 0.913 }),
  // Winged stone bruiser; measured alpha bbox off the 600×600 source (wings spread wide).
  gargoyle:    portrait("gargoyle",    { x: 0.04, y: 0.017, w: 0.878, h: 0.957 }),
  nemesis:     portrait("nemesis",     { x: 0.080, y: 0.030, w: 0.780, h: 0.920 }),
  // Wide gaseous blob; measured alpha bbox off the 600×600 source. Held a touch smaller
  // so a short-but-wide figure doesn't normalize up into an oversized silhouette.
  virus:       portrait("virus",       { x: 0.057, y: 0.087, w: 0.915, h: 0.833 }, { scale: 0.94 }),
  // Hulking rock golem; measured alpha bbox off the 600×600 source (fills nearly the whole
  // canvas, feet planted at the bottom, arms spread wide).
  clod:        portrait("clod",        { x: 0.080, y: 0.068, w: 0.827, h: 0.878 }),
  "fat-knight": portrait("fat-knight", { x: 0.163, y: 0.067, w: 0.662, h: 0.853 }),
  "fat-wizard": portrait("fat-wizard", { x: 0.090, y: 0.055, w: 0.812, h: 0.885 }),
  // Round battlefield priestess; measured alpha bbox off the 600×600 source.
  "fat-cleric": portrait("fat-cleric", { x: 0.068, y: 0.060, w: 0.878, h: 0.860 }),
  "fat-bowman": portrait("fat-bowman", { x: 0.080, y: 0.050, w: 0.840, h: 0.880 }),
  miner:       portrait("miner",       { x: 0.100, y: 0.045, w: 0.800, h: 0.900 }),
  "big-brother": portrait("big-brother", { x: 0.100, y: 0.040, w: 0.800, h: 0.920 }),
  "little-brother": portrait("little-brother", { x: 0.120, y: 0.060, w: 0.760, h: 0.880 }),
  // Dark duelist; measured alpha bbox off the 600×600 source (the black sword spreads the
  // silhouette wide, balanced around the body centre ≈ 0.51).
  blacksword:  portrait("blacksword",  { x: 0.017, y: 0.037, w: 0.983, h: 0.920 }),
  // Hunched/crouched — its bbox height under-reads its "creature size", so it would
  // blow up to a swordsman's height under pure normalization. Hold it a touch smaller.
  ghoul:       portrait("ghoul",       { x: 0.162, y: 0.190, w: 0.705, h: 0.665 }, { scale: 0.82 })
});

function portrait(type, box, { scale = 1, src = `assets/units/${type}.png` } = {}) {
  return Object.freeze({ src, box: Object.freeze(box), scale });
}

// Safe lookup. Returns the portrait meta for a unit type (or its def), or null if no
// portrait is registered — callers fall back to the glyph so a portrait-less unit
// never breaks a panel.
export function getPortrait(typeOrDef, skinSlug = null) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const base = PORTRAITS[type] ?? null;
  if (!base) return null;
  const skin = getSkin(type, skinSlug);
  return skin?.portraitSrc ? { ...base, src: skin.portraitSrc, skinSlug: skin.slug } : base;
}

export function hasPortrait(typeOrDef, skinSlug = null) {
  return getPortrait(typeOrDef, skinSlug) !== null;
}

// Pure framing math (tested headlessly). Turns a portrait's measured box into the
// inline values that frame the figure inside an `overflow:hidden` box:
//   - height: image height as a % of the FRAME height, scaled so the content box
//     occupies `fill` of the frame (× the unit's own `scale`) — this is what makes
//     every figure the same on-screen size.
//   - translateX/Y: % of the IMAGE's own size, so no frame aspect ratio is needed —
//     centers the box horizontally and seats the box bottom on the floor (`padBottom`
//     above the frame's bottom edge).
// The image is positioned `top:0; left:50%`, so apply: height + translate(x%, y%).
export function portraitFrameStyle(meta, { fill = 0.92, padBottom = 0.02 } = {}) {
  const { box, scale = 1 } = meta;
  const effFill = fill * scale;
  const cx = box.x + box.w / 2;
  const boxBottom = box.y + box.h;
  const heightPct = (effFill / box.h) * 100;
  const translateXPct = -cx * 100;
  const translateYPct = ((1 - padBottom) * (box.h / effFill) - boxBottom) * 100;
  return {
    heightPct,
    translateXPct,
    translateYPct,
    cssHeight: `${round(heightPct)}%`,
    cssTransform: `translate(${round(translateXPct)}%, ${round(translateYPct)}%)`
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// Build a framed portrait node: <figure class="unit-portrait"><img …></figure>.
// `variant` adds a modifier class (e.g. "is-hero", "is-thumb") for CSS sizing; the
// framing math is variant-independent. Browser-only (touches document).
export function createPortrait(typeOrDef, { variant = "", alt = "", frame, eager = false, skin = null } = {}) {
  const meta = getPortrait(typeOrDef, skin);
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const wrap = document.createElement("figure");
  wrap.className = `unit-portrait${variant ? ` ${variant}` : ""}`;
  wrap.dataset.type = type ?? "";
  if (meta?.skinSlug) wrap.dataset.skin = meta.skinSlug;
  if (!meta) {
    // Glyph fallback keeps a portrait-less unit from rendering an empty box.
    const def = UNIT_TYPES[type];
    wrap.classList.add("is-glyph-fallback");
    wrap.textContent = def?.glyph ?? "?";
    return wrap;
  }
  const style = portraitFrameStyle(meta, frame);
  const img = document.createElement("img");
  img.className = "unit-portrait-img";
  img.src = meta.src;
  img.alt = alt || `${UNIT_TYPES[type]?.name ?? type} portrait`;
  img.loading = eager ? "eager" : "lazy";
  img.decoding = "async";
  img.style.height = style.cssHeight;
  img.style.transform = style.cssTransform;
  wrap.appendChild(img);
  return wrap;
}
