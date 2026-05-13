import assert from 'node:assert/strict';

import { prepareSpriteSheet } from '../scripts/assets.js';

function testPrepareSpriteSheetPreservesTransparentAssets() {
  const source = { width: 128, height: 128, tag: 'sprite-sheet' };
  assert.equal(prepareSpriteSheet(source), source);
}

function run() {
  testPrepareSpriteSheetPreservesTransparentAssets();
  console.log('Illuminauts asset tests passed.');
}

run();
