import assert from 'node:assert/strict';

import { shouldQuitMatchOnKey } from '../scripts/session-controls.js';

function testEscapeQuitsActiveMatchPhases() {
  assert.equal(shouldQuitMatchOnKey('playing', 'Escape'), true);
  assert.equal(shouldQuitMatchOnKey('countdown', 'Escape'), true);
}

function testEscapeDoesNotQuitMenuFlowPhases() {
  assert.equal(shouldQuitMatchOnKey('menu', 'Escape'), false);
  assert.equal(shouldQuitMatchOnKey('side_select', 'Escape'), false);
  assert.equal(shouldQuitMatchOnKey('lobby', 'Escape'), false);
}

function testOtherKeysDoNotQuit() {
  assert.equal(shouldQuitMatchOnKey('playing', 'KeyQ'), false);
}

function run() {
  testEscapeQuitsActiveMatchPhases();
  testEscapeDoesNotQuitMenuFlowPhases();
  testOtherKeysDoNotQuit();
  console.log('Illuminauts session control tests passed.');
}

run();
