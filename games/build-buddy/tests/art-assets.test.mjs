import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ART, SPRING_CROPS, parallaxOffset } from '../js/render/art-assets.js';
import { TOOL_DEFS } from '../js/constants.js';

test('all shipped art references resolve to PNGs and sprite crops stay in bounds', () => {
  for (const path of Object.values(ART)) {
    const png = readFileSync(new URL(`../${path}`, import.meta.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.equal(png.readUInt32BE(16), 1536);
    assert.equal(png.readUInt32BE(20), 1024);
  }
  for (const [type, crop] of Object.entries(SPRING_CROPS)) {
    assert.ok(crop.x >= 0 && crop.x + crop.w <= 1536);
    assert.ok(crop.y >= 0 && crop.y + crop.h <= 1024);
    assert.equal(TOOL_DEFS[type].width, 54);
    assert.equal(TOOL_DEFS[type].height, 28);
  }
});

test('parallax responds to both camera axes and wraps continuously', () => {
  const a = parallaxOffset({ x: 0, y: 100 }, .3, 1600);
  const b = parallaxOffset({ x: 100, y: 200 }, .3, 1600);
  assert.equal(b.x - a.x, -30);
  assert.equal(b.y - a.y, -9);
  assert.ok(Math.abs(parallaxOffset({ x: 1600 / .3, y: 100 }, .3, 1600).x) < 1e-9);
});
