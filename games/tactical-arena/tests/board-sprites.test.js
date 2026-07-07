import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { BOARD_SPRITES, getBoardSprite, hasBoardSprite, boardSpriteFrameStyle, STAND_HEIGHT, FIGURINE_FOOT_Y } from "../src/ui/boardSprites.js";

// Teeth (mirrors portraits.test.js / ai-metadata.test.js): a new unit that forgets its
// board sprite fails the suite instead of silently falling back to the carved figurine.
// Every registered unit type, including the summon-only Ghoul, must declare a sprite
// whose asset exists on disk, and the framing math must produce a sane <image> rect.

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES = Object.entries(UNIT_TYPES);

test("every registered unit type declares a board sprite", () => {
  for (const [type] of ENTRIES) {
    assert.ok(BOARD_SPRITES[type], `${type} is missing a board sprite entry`);
    assert.ok(hasBoardSprite(type), `getBoardSprite(${type}) should resolve`);
  }
});

test("no board sprite exists for an unknown unit type", () => {
  assert.equal(getBoardSprite("dragon"), null);
  assert.equal(getBoardSprite(undefined), null);
});

test("each board sprite points at an asset file that exists on disk", () => {
  for (const [type, meta] of Object.entries(BOARD_SPRITES)) {
    assert.ok(meta.src.startsWith("assets/units/"), `${type} src should live under assets/units/`);
    assert.ok(existsSync(join(GAME_ROOT, meta.src)), `${type} board sprite asset is missing: ${meta.src}`);
  }
});

test("each board sprite declares a sane native size and scale", () => {
  for (const [type, meta] of Object.entries(BOARD_SPRITES)) {
    assert.ok(Number.isFinite(meta.w) && meta.w > 0, `${type}.w must be positive`);
    assert.ok(Number.isFinite(meta.h) && meta.h > 0, `${type}.h must be positive`);
    assert.ok(meta.scale > 0, `${type}.scale must be positive`);
  }
});

test("framing math yields a centred, foot-seated <image> rect", () => {
  for (const [type, meta] of Object.entries(BOARD_SPRITES)) {
    const f = boardSpriteFrameStyle(meta);
    assert.ok(Number.isFinite(f.width) && f.width > 0, `${type} width must be positive`);
    assert.ok(Number.isFinite(f.height) && f.height > 0, `${type} height must be positive`);
    const box = meta.box ?? { x: 0, y: 0, w: 1, h: 1 };
    // The visible content box, not necessarily the full transparent PNG canvas, is
    // centred horizontally and has its feet on the coin at FIGURINE_FOOT_Y.
    assert.ok(Math.abs(f.x + f.width * (box.x + box.w / 2)) < 0.02, `${type} should be visibly centred`);
    assert.ok(Math.abs(f.y + f.height * (box.y + box.h) - FIGURINE_FOOT_Y) < 0.02, `${type} visible feet should sit at FIGURINE_FOOT_Y`);
    // Aspect ratio is preserved from the native size.
    assert.ok(Math.abs(f.width / f.height - meta.w / meta.h) < 1e-3, `${type} should keep native aspect ratio`);
  }
});

test("normalization gives a constant visible standing height (x scale) across units", () => {
  for (const [type, meta] of Object.entries(BOARD_SPRITES)) {
    const f = boardSpriteFrameStyle(meta);
    const box = meta.box ?? { h: 1 };
    assert.ok(Math.abs(f.height * box.h - STAND_HEIGHT * meta.scale) < 0.02, `${type} visible height should be STAND_HEIGHT x scale`);
  }
});

test("scale < 1 shrinks a figure (the ghoul reads shorter than a full normalize)", () => {
  assert.ok(BOARD_SPRITES.ghoul.scale < 1, "ghoul should be held below a full normalize");
  const ghoul = boardSpriteFrameStyle(BOARD_SPRITES.ghoul);
  assert.ok(ghoul.height * BOARD_SPRITES.ghoul.box.h < STAND_HEIGHT, "ghoul standing height should be below the shared height");
});

test("full-canvas portrait sprites still normalize by measured content box", () => {
  const fatKnight = BOARD_SPRITES["fat-knight"];
  assert.ok(fatKnight.box.h < 1, "regression guard: fat knight has transparent vertical padding");
  const frame = boardSpriteFrameStyle(fatKnight);
  assert.ok(frame.height > STAND_HEIGHT, "full source image is enlarged so visible art reaches stand height");
  assert.ok(Math.abs(frame.height * fatKnight.box.h - STAND_HEIGHT) < 0.02);
});
