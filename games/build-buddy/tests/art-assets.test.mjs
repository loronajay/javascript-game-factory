import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ART, SPRING_CROPS, parallaxOffset } from '../js/render/art-assets.js';
import { TOOL_DEFS } from '../js/constants.js';
import { CHARACTERS, CHARACTER_ART } from '../js/characters.js';
import { RUNNER_FRAMES } from '../js/render/runner-frames.js';

test('all shipped art references resolve to PNGs and sprite crops stay in bounds', () => {
  for (const path of Object.values(ART)) {
    const png = readFileSync(new URL(`../${path}`, import.meta.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    const runnerId = path.match(/runners\/(\w+)\.png$/)?.[1];
    const atlas = RUNNER_FRAMES[runnerId];
    const expectedWidth = atlas?.width ?? (path === CHARACTER_ART ? 2172 : 1536);
    const expectedHeight = atlas?.height ?? (path === CHARACTER_ART ? 724 : 1024);
    assert.equal(png.readUInt32BE(16), expectedWidth);
    assert.equal(png.readUInt32BE(20), expectedHeight);
    if (runnerId) {
      assert.ok(atlas, `${runnerId} is missing animation measurements`);
      assert.equal(atlas.frames.length, 16);
      assert.equal(png[25], 6, 'animated sprites require RGBA transparency');
      for (const frame of atlas.frames) {
        assert.ok(frame.x >= 0 && frame.x + frame.w <= atlas.width);
        assert.ok(frame.y >= 0 && frame.y + frame.h <= atlas.height);
      }
    }
  }
  for (const [type, crop] of Object.entries(SPRING_CROPS)) {
    assert.ok(crop.x >= 0 && crop.x + crop.w <= 1536);
    assert.ok(crop.y >= 0 && crop.y + crop.h <= 1024);
    assert.equal(TOOL_DEFS[type].width, 54);
    assert.equal(TOOL_DEFS[type].height, 28);
  }
  for (const { crop } of CHARACTERS) {
    assert.ok(crop.x >= 0 && crop.x + crop.w <= 2172);
    assert.ok(crop.y >= 0 && crop.y + crop.h <= 724);
  }
});

test('parallax responds to both camera axes and wraps continuously', () => {
  const a = parallaxOffset({ x: 0, y: 100 }, .3, 1600);
  const b = parallaxOffset({ x: 100, y: 200 }, .3, 1600);
  assert.equal(b.x - a.x, -30);
  assert.equal(b.y - a.y, -9);
  assert.ok(Math.abs(parallaxOffset({ x: 1600 / .3, y: 100 }, .3, 1600).x) < 1e-9);
});

test('main menu crew art is an RGBA cutout sized for the open menu column', () => {
  const png = readFileSync(new URL(`../${ART.menuCrew}`, import.meta.url));
  assert.equal(png.toString('ascii', 1, 4), 'PNG');
  assert.equal(png.readUInt32BE(16), 1536);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 6, 'menu crew art requires real alpha transparency');
});
