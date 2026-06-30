import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";
import { PORTRAITS, getPortrait, hasPortrait, portraitFrameStyle } from "../src/ui/portraits.js";

// Teeth (mirrors ai-metadata.test.js): a new unit that forgets its portrait fails
// the suite instead of silently shipping a glyph-only Codex card. Every registered
// unit type — including the summon-only Ghoul — must declare a portrait whose asset
// exists on disk and whose measured box is sane, and the framing math must produce
// finite, usable inline styles.

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRIES = Object.entries(UNIT_TYPES);

test("every registered unit type declares a portrait", () => {
  for (const [type] of ENTRIES) {
    assert.ok(PORTRAITS[type], `${type} is missing a portrait entry`);
    assert.ok(hasPortrait(type), `getPortrait(${type}) should resolve`);
  }
});

test("no portrait entry exists for an unknown unit type", () => {
  assert.equal(getPortrait("dragon"), null);
  assert.equal(getPortrait(undefined), null);
});

test("each portrait points at an asset file that exists on disk", () => {
  for (const [type, meta] of Object.entries(PORTRAITS)) {
    assert.ok(meta.src.startsWith("assets/units/"), `${type} src should live under assets/units/`);
    assert.ok(existsSync(join(GAME_ROOT, meta.src)), `${type} portrait asset is missing: ${meta.src}`);
  }
});

test("each portrait box is a sane content rectangle in [0,1]", () => {
  for (const [type, meta] of Object.entries(PORTRAITS)) {
    const { x, y, w, h } = meta.box;
    for (const [k, v] of Object.entries({ x, y, w, h })) {
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${type}.box.${k} out of range: ${v}`);
    }
    assert.ok(w > 0 && h > 0, `${type}.box must have positive size`);
    assert.ok(x + w <= 1.001, `${type}.box overflows right edge`);
    assert.ok(y + h <= 1.001, `${type}.box overflows bottom edge`);
    assert.ok(meta.scale > 0, `${type}.scale must be positive`);
  }
});

test("framing math yields finite, positive inline styles", () => {
  for (const [type, meta] of Object.entries(PORTRAITS)) {
    const s = portraitFrameStyle(meta);
    assert.ok(Number.isFinite(s.heightPct) && s.heightPct > 0, `${type} height must be positive`);
    assert.ok(Number.isFinite(s.translateXPct), `${type} translateX must be finite`);
    assert.ok(Number.isFinite(s.translateYPct), `${type} translateY must be finite`);
    assert.match(s.cssHeight, /^\d/, `${type} cssHeight should start with a number`);
    assert.match(s.cssTransform, /^translate\(/, `${type} cssTransform should be a translate()`);
  }
});

test("normalization gives equal-height figures: bbox h × frame height is constant across units", () => {
  // The whole point of the box model — after framing, every figure's content box
  // occupies the same fraction of the frame (× its own scale). So heightPct × box.h
  // / scale should be identical for all units (== fill × 100).
  const values = Object.values(PORTRAITS).map((m) => {
    const s = portraitFrameStyle(m, { fill: 0.9 });
    return (s.heightPct * m.box.h) / m.scale;
  });
  for (const v of values) assert.ok(Math.abs(v - 90) < 1e-6, `expected normalized fill 90, got ${v}`);
});

test("scale < 1 shrinks a figure relative to fill (ghoul reads smaller than a full normalize)", () => {
  const ghoul = portraitFrameStyle(PORTRAITS.ghoul, { fill: 0.9 });
  const asIfFull = (0.9 / PORTRAITS.ghoul.box.h) * 100;
  assert.ok(ghoul.heightPct < asIfFull, "ghoul scale should hold it below a full normalize");
});
