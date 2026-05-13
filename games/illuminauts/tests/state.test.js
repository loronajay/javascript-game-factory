import assert from 'node:assert/strict';

import { MAPS } from '../scripts/maps.js';
import { createGameState, selectMatchMapIndex, selectRandomMapIndex } from '../scripts/state.js';

function testSelectRandomMapIndexUsesAllCatalogSlots() {
  const picks = new Set();
  for (const randomValue of [0, 0.34, 0.67]) {
    picks.add(selectRandomMapIndex(() => randomValue, MAPS.length));
  }

  assert.deepEqual([...picks].sort((a, b) => a - b), [0, 1, 2]);
}

function testSelectRandomMapIndexClampsHighRandomValue() {
  assert.equal(selectRandomMapIndex(() => 0.999999, MAPS.length), MAPS.length - 1);
  assert.equal(selectRandomMapIndex(() => 1, MAPS.length), MAPS.length - 1);
}

function testSelectMatchMapIndexIsSharedFromMatchSeed() {
  assert.equal(selectMatchMapIndex(123456789, MAPS.length), selectMatchMapIndex(123456789, MAPS.length));
  assert.notEqual(selectMatchMapIndex(123456789, MAPS.length), selectMatchMapIndex(123456790, MAPS.length));
}

function testCreateGameStateCanLoadEveryCatalogMap() {
  const ids = MAPS.map((_, index) => createGameState(index).mapId);
  assert.deepEqual(ids, MAPS.map((map) => map.id));
}

function run() {
  testSelectRandomMapIndexUsesAllCatalogSlots();
  testSelectRandomMapIndexClampsHighRandomValue();
  testSelectMatchMapIndexIsSharedFromMatchSeed();
  testCreateGameStateCanLoadEveryCatalogMap();
  console.log('Illuminauts state tests passed.');
}

run();
