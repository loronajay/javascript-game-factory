// On-board unit sprites — the painted board pieces that stand on the team coin
// (assets/units/board-units/game-ready/<type>.png). This REPLACES the carved SVG
// figurine as the on-board token (unitRenderer.js falls back to the figurine only
// for a type with no sprite registered). Pure presentation, so it lives in ui/ and
// keeps core/ free of asset framing data.
//
// Same trap the portraits set (see portraits.js): the sprites are tightly cropped
// (alpha bbox == full canvas) but their canvases differ a lot — the necromancer is
// 120×150, the hunched ghoul only 88×93. Dropping them into one fixed box would make
// the ghoul as tall as the swordsman. So each sprite carries its native pixel size +
// a hand-tunable `scale`, and `boardSpriteFrameStyle` normalizes every figure to the
// SAME standing height (× its own scale) with its feet seated on the coin at y=0.
//
// Team identity is NOT baked into the art (these are full-color paintings): it reads
// from the recolored coin/ring (var(--team), already team-driven) plus a team-color
// tint wash applied to the <image> via the #teamTintP1/#teamTintP2 SVG filters.

import { UNIT_TYPES } from "../core/unitCatalog.js";

// Figure-space standing height a `scale: 1` unit normalizes to. Figure space puts the
// feet at (0,0) and rises into -y (see unitRenderer.js), matching the old figurine.
export const STAND_HEIGHT = 52;

// The carved-figurine fallback (unitRenderer.js FIGURE_BUILDERS) does NOT actually
// plant its feet at figure-space y=0 — every builder's leg/robe path bottoms out
// around raw y≈10, and the whole figurine is then drawn at `scale(0.82)` (see
// FIGURE_SCALE in unitRenderer.js), so its real on-screen foot position is
// 10 * 0.82 ≈ 8. Board sprites used footY=0 (the plinth origin) directly, which
// planted them ~8 figure-space units too high — visually perched on the back/top
// rim of the coin ellipse instead of centered on it. This is the figurine's
// calibrated foot offset, reused so both fallbacks land in the same spot.
export const FIGURINE_FOOT_Y = 8;

// w/h are the sprite's native pixel size (drives aspect ratio only — absolute px are
// irrelevant once normalized). scale: per-unit visual-size fudge (1 = normalize to the
// shared standing height). Lower it for a hunched figure whose full-canvas height
// over-reads its "creature size" so it doesn't tower (the ghoul, same as its portrait).
// 2026-07-01: re-cropped from the 600×600 portrait source (tight alpha bbox + 3px
// pad) instead of the old ~100-150px exports — those were being upscaled by the
// browser to fill their on-screen space, which was the source of the blur. Native
// sizes below are now several times the old pixel count, so the same normalize-to-
// STAND_HEIGHT framing reads sharp instead of smoothed.
//
// Two follow-up misses before this landed: (1) centering the crop on the alpha
// bbox drifts toward whichever hand holds a sword/bow/staff/rifle/flame-effect
// reaching far to one side, so the painted body sat off the coin; (2) centering on
// an automatically-detected "feet band" is just as fragile — robe hems flare
// asymmetrically and weapon tips/shields touch the ground well away from the
// actual feet, so the auto-centroid grabbed the wrong point entirely for the
// robed casters. What's here now is centered on a MEASURED stance x per unit
// (read off a gridded view of each portrait, feet/torso midpoint, weapon overhang
// ignored) — see the `FEET_X` map in the scratchpad recrop script if these ever
// need re-deriving after an art swap. Padded with transparent canvas on the tight
// side rather than clamped, so the stance stays dead-center regardless of how far
// a held weapon reaches past the source canvas edge.
export const BOARD_SPRITES = Object.freeze({
  swordsman:   sprite("swordsman",   584, 574),
  archer:      sprite("archer",      462, 595),
  mystic:      sprite("mystic",      396, 581),
  magician:    sprite("magician",    458, 572),
  paladin:     sprite("paladin",     572, 566),
  necromancer: sprite("necromancer", 510, 558),
  "witch-doctor": sprite("witch-doctor", 600, 600),
  // Re-cropped from the 600×600 portrait, centered on the measured stance x=300 (the
  // staff overhang to the right is ignored, per the centering trap in the header notes).
  "father-time": sprite("father-time", 488, 552),
  // Cropped from the 600×600 portrait, centered on the measured feet x=304.
  juggernaut:  sprite("juggernaut",  448, 576),
  sniper:      sprite("sniper",      602, 581),
  // Cropped from the 600×600 portrait, centered on the measured feet x=300.
  king:        sprite("king",        448, 574),
  // Hunched/crouched — its full-canvas height under-reads its size, so a pure
  // normalize would blow it up to a swordsman's height. Hold it a touch smaller.
  ghoul:       sprite("ghoul",       436, 410, { scale: 0.82 })
});

function sprite(type, w, h, { scale = 1, src = `assets/units/board-units/game-ready/${type}.png` } = {}) {
  return Object.freeze({ src, w, h, scale });
}

// Safe lookup. Returns the sprite meta for a unit type (or its def), or null if none
// is registered — callers fall back to the carved figurine so a sprite-less unit
// never breaks the board.
export function getBoardSprite(typeOrDef) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id;
  return BOARD_SPRITES[type] ?? null;
}

export function hasBoardSprite(typeOrDef) {
  return getBoardSprite(typeOrDef) !== null;
}

// Pure framing math (tested headlessly). Turns a sprite's native size + scale into the
// SVG <image> rect in figure space: every figure ends up the same standing height
// (× its own scale), horizontally centred, with its feet seated on the coin at footY.
export function boardSpriteFrameStyle(meta, { standHeight = STAND_HEIGHT, footY = FIGURINE_FOOT_Y } = {}) {
  const { w, h, scale = 1 } = meta;
  const height = standHeight * scale;
  const width = height * (w / h);
  return {
    width: round(width),
    height: round(height),
    x: round(-width / 2),
    y: round(footY - height)
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// Build the on-board sprite figure: <g class="sprite-figure"><image …></g>. Browser-
// only (touches document via svgElement). `svgElement` sets href for SVG2 user agents.
export function createBoardSpriteFigure(typeOrDef, svgElement, frame) {
  const meta = getBoardSprite(typeOrDef);
  if (!meta) return null;
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id;
  const f = boardSpriteFrameStyle(meta, frame);
  const g = svgElement("g", { class: "sprite-figure" });
  g.append(svgElement("image", {
    class: "sprite-img",
    href: meta.src,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    preserveAspectRatio: "xMidYMax meet",
    "aria-label": UNIT_TYPES[type]?.name ?? type ?? ""
  }));
  return g;
}
