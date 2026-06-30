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
  sniper:      portrait("sniper",      { x: 0.150, y: 0.030, w: 0.760, h: 0.955 }),
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
export function getPortrait(typeOrDef) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id;
  return PORTRAITS[type] ?? null;
}

export function hasPortrait(typeOrDef) {
  return getPortrait(typeOrDef) !== null;
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
export function createPortrait(typeOrDef, { variant = "", alt = "", frame } = {}) {
  const meta = getPortrait(typeOrDef);
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id;
  const wrap = document.createElement("figure");
  wrap.className = `unit-portrait${variant ? ` ${variant}` : ""}`;
  wrap.dataset.type = type ?? "";
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
  img.loading = "lazy";
  img.decoding = "async";
  img.style.height = style.cssHeight;
  img.style.transform = style.cssTransform;
  wrap.appendChild(img);
  return wrap;
}
