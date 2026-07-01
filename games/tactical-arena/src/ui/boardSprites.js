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

// w/h are the sprite's native pixel size (drives aspect ratio only — absolute px are
// irrelevant once normalized). scale: per-unit visual-size fudge (1 = normalize to the
// shared standing height). Lower it for a hunched figure whose full-canvas height
// over-reads its "creature size" so it doesn't tower (the ghoul, same as its portrait).
export const BOARD_SPRITES = Object.freeze({
  swordsman:   sprite("swordsman",   112, 131),
  archer:      sprite("archer",       77, 116),
  mystic:      sprite("mystic",      102, 142),
  magician:    sprite("magician",    102, 136),
  paladin:     sprite("paladin",     128, 144),
  necromancer: sprite("necromancer", 120, 150),
  sniper:      sprite("sniper",      113, 124),
  // Hunched/crouched — its full-canvas height under-reads its size, so a pure
  // normalize would blow it up to a swordsman's height. Hold it a touch smaller.
  ghoul:       sprite("ghoul",        88,  93, { scale: 0.82 })
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
export function boardSpriteFrameStyle(meta, { standHeight = STAND_HEIGHT, footY = 0 } = {}) {
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
