// On-board unit sprites — the painted board pieces that stand on the team coin
// (assets/units/<type>.png by default, or a skin asset when equipped). This REPLACES the carved SVG
// figurine as the on-board token (unitRenderer.js falls back to the figurine only
// for a type with no sprite registered). Pure presentation, so it lives in ui/ and
// keeps core/ free of asset framing data.
//
// Same trap the portraits set (see portraits.js): every source image is a uniform
// full canvas, but the painted figure inside that canvas is not. Dropping those
// images into one fixed box makes narrow/padded units render tiny and nearly-full
// canvas units render huge. So each sprite reuses the portrait alpha box plus a
// hand-tunable `scale`, and `boardSpriteFrameStyle` normalizes the visible figure
// to the SAME standing height (times its own scale) with its feet seated on the coin.
//
// Team identity is NOT baked into the art (these are full-color paintings): it reads
// from the recolored coin/ring (var(--team), already team-driven) so skins stay
// visible at true color.

import { UNIT_TYPES } from "../core/unitCatalog.js";
import { getSkin } from "./skinModel.js";
import { PORTRAITS } from "./portraits.js";

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

// w/h are the source image size (drives aspect ratio only; absolute px are
// irrelevant once normalized). box is the measured visible content box, as fractions
// of that source image. scale: per-unit visual-size fudge (1 = normalize to the
// shared standing height). Lower it for a hunched figure whose full-canvas height
// over-reads its "creature size" so it doesn't tower (the ghoul, same as its portrait).
// The base board sprites currently use the 600x600 portrait sources directly; skins
// do the same and inherit their unit's box/scale unless a future skin supplies a
// bespoke board override.
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
  swordsman:   sprite("swordsman"),
  archer:      sprite("archer"),
  mystic:      sprite("mystic"),
  magician:    sprite("magician"),
  summoner:    sprite("summoner"),
  paladin:     sprite("paladin"),
  necromancer: sprite("necromancer"),
  "witch-doctor": sprite("witch-doctor"),
  // Re-cropped from the 600×600 portrait, centered on the measured stance x=300 (the
  // staff overhang to the right is ignored, per the centering trap in the header notes).
  "father-time": sprite("father-time"),
  // Cropped from the 600×600 portrait, centered on the measured feet x=304.
  juggernaut:  sprite("juggernaut"),
  sniper:      sprite("sniper"),
  // Cropped from the 600×600 portrait, centered on the measured feet x=300.
  king:        sprite("king"),
  monk:        sprite("monk"),
  // Cropped from the 600×600 portrait, centered on the measured stance x=285 (the bow
  // overhang to the right + the wing spread are ignored, per the centering trap notes).
  angel:       sprite("angel"),
  // Cropped from the 600×600 portrait, centered on the measured feet-band stance x=291
  // (wings spread wide; padded to keep the body dead-centre on the coin).
  gargoyle:    sprite("gargoyle"),
  nemesis:     sprite("nemesis"),
  // Cropped from the 600×600 portrait, centered on the measured feet-band stance x
  // (padded to keep the wide blob body dead-centre on the coin). Held a touch smaller.
  virus:       sprite("virus", { scale: 0.94 }),
  // Cropped from the 600×600 portrait, centered on the measured stance x=300 (symmetric
  // golem; the head leans slightly right, ignored per the centering trap in the header).
  clod:        sprite("clod"),
  "fat-knight": sprite("fat-knight"),
  "fat-wizard": sprite("fat-wizard"),
  "fat-cleric": sprite("fat-cleric"),
  "fat-bowman": sprite("fat-bowman"),
  miner: sprite("miner"),
  "big-brother": sprite("big-brother"),
  "little-brother": sprite("little-brother"),
  blacksword:  sprite("blacksword"),
  ronin:       sprite("ronin"),
  "mother-nature": sprite("mother-nature"),
  // Riot Cop base art is the user-provided default Riot Cop PNG (see portraits.js);
  // inherits the approximate box/scale via PORTRAITS["riot-cop"].
  "riot-cop": sprite("riot-cop"),
  // Rooted grove-guardian; inherits the approximate box/scale via PORTRAITS.treant.
  treant: sprite("treant"),
  // Hunched/crouched — its full-canvas height under-reads its size, so a pure
  // normalize would blow it up to a swordsman's height. Hold it a touch smaller.
  ghoul:       sprite("ghoul", { scale: 0.82 })
});

function sprite(type, { scale = 1, src = `assets/units/${type}.png`, w = 600, h = 600, box = PORTRAITS[type]?.box } = {}) {
  return Object.freeze({ src, w, h, scale, box });
}

// Safe lookup. Returns the sprite meta for a unit type (or its def), or null if none
// is registered — callers fall back to the carved figurine so a sprite-less unit
// never breaks the board.
export function getBoardSprite(typeOrDef, skinSlug = null) {
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const base = BOARD_SPRITES[type] ?? null;
  if (!base) return null;
  const skin = getSkin(type, skinSlug);
  if (!skin?.boardSrc) return base;
  return {
    ...base,
    ...(skin.board ?? {}),
    src: skin.boardSrc,
    skinSlug: skin.slug
  };
}

export function hasBoardSprite(typeOrDef, skinSlug = null) {
  return getBoardSprite(typeOrDef, skinSlug) !== null;
}

// Pure framing math (tested headlessly). Turns a sprite's native size + scale into the
// SVG <image> rect in figure space: every figure ends up the same standing height
// (× its own scale), horizontally centred, with its feet seated on the coin at footY.
export function boardSpriteFrameStyle(meta, { standHeight = STAND_HEIGHT, footY = FIGURINE_FOOT_Y } = {}) {
  const { w, h, scale = 1, box = null } = meta;
  const visibleHeight = standHeight * scale;
  const height = box ? visibleHeight / box.h : visibleHeight;
  const width = height * (w / h);
  const anchorX = box ? box.x + box.w / 2 : 0.5;
  const foot = box ? box.y + box.h : 1;
  return {
    width: round(width),
    height: round(height),
    x: round(-width * anchorX),
    y: round(footY - height * foot)
  };
}

function round(n) {
  return Math.round(n * 100) / 100;
}

// Build the on-board sprite figure: <g class="sprite-figure"><image …></g>. Browser-
// only (touches document via svgElement). `svgElement` sets href for SVG2 user agents.
export function createBoardSpriteFigure(typeOrDef, svgElement, frame, { skin = null } = {}) {
  const meta = getBoardSprite(typeOrDef, skin);
  if (!meta) return null;
  const type = typeof typeOrDef === "string" ? typeOrDef : typeOrDef?.id ?? typeOrDef?.type;
  const f = boardSpriteFrameStyle(meta, frame ?? undefined);
  const attrs = { class: "sprite-figure" };
  if (meta.skinSlug) attrs["data-skin"] = meta.skinSlug;
  const g = svgElement("g", attrs);
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
