import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { BOARD_SPRITES, getBoardSprite, hasBoardSprite, boardSpriteFrameStyle, STAND_HEIGHT } from "../src/ui/boardSprites.js";

// Teeth (mirrors portraits.test.js / ai-metadata.test.js): a new unit that forgets its
// board sprite fails the suite instead of silently falling back to the carved figurine.
// Every registered unit type — including the summon-only Ghoul — must declare a sprite
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
    assert.ok(meta.src.startsWith("assets/units/board-units/game-ready/"), `${type} src should live under the game-ready folder`);
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
    // Centred horizontally, feet on the coin at y=0 (the rect rises into -y).
    assert.ok(Math.abs(f.x + f.width / 2) < 0.02, `${type} should be horizontally centred`);
    assert.ok(Math.abs(f.y + f.height) < 0.02, `${type} feet should sit at y=0`);
    // Aspect ratio is preserved from the native size.
    assert.ok(Math.abs(f.width / f.height - meta.w / meta.h) < 1e-3, `${type} should keep native aspect ratio`);
  }
});

test("normalization gives a constant standing height (× scale) across units", () => {
  for (const [type, meta] of Object.entries(BOARD_SPRITES)) {
    const f = boardSpriteFrameStyle(meta);
    assert.ok(Math.abs(f.height - STAND_HEIGHT * meta.scale) < 1e-6, `${type} height should be STAND_HEIGHT × scale`);
  }
});

test("scale < 1 shrinks a figure (the ghoul reads shorter than a full normalize)", () => {
  assert.ok(BOARD_SPRITES.ghoul.scale < 1, "ghoul should be held below a full normalize");
  const ghoul = boardSpriteFrameStyle(BOARD_SPRITES.ghoul);
  assert.ok(ghoul.height < STAND_HEIGHT, "ghoul standing height should be below the shared height");
});
