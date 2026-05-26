import assert from 'node:assert/strict';

import { MAPS } from '../scripts/maps.js';
import { createGameState, selectMatchMapIndex, selectRandomMapIndex } from '../scripts/state.js';

function testSelectRandomMapIndexUsesAllCatalogSlots() {
  const picks = new Set();
  for (let index = 0; index < MAPS.length; index++) {
    const randomValue = (index + 0.1) / MAPS.length;
    picks.add(selectRandomMapIndex(() => randomValue, MAPS.length));
  }

  assert.deepEqual([...picks].sort((a, b) => a - b), MAPS.map((_, index) => index));
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

function testPlayerPalettesFollowRoles() {
  const alphaState = createGameState(0, 'A');
  assert.equal(alphaState.player.role, 'A');
  assert.equal(alphaState.player.palette, 'alpha');
  assert.equal(alphaState.remote.role, 'B');
  assert.equal(alphaState.remote.palette, 'beta');

  const betaState = createGameState(0, 'B');
  assert.equal(betaState.player.role, 'B');
  assert.equal(betaState.player.palette, 'beta');
  assert.equal(betaState.remote.role, 'A');
  assert.equal(betaState.remote.palette, 'alpha');
}

function run() {
  testSelectRandomMapIndexUsesAllCatalogSlots();
  testSelectRandomMapIndexClampsHighRandomValue();
  testSelectMatchMapIndexIsSharedFromMatchSeed();
  testCreateGameStateCanLoadEveryCatalogMap();
  testPlayerPalettesFollowRoles();
  console.log('Illuminauts state tests passed.');
}

run();
