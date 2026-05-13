import assert from 'node:assert/strict';

import { getLocalIdentity } from '../scripts/online-identity.js';

function assertGeneratedPlayerId(playerId) {
  assert.equal(playerId.startsWith('player-'), true);
}

async function testFallsBackWhenFactoryProfileModuleIsMissing() {
  const identity = await getLocalIdentity({
    profileModulePromise: Promise.reject(new Error('missing factory profile module'))
  });

  assertGeneratedPlayerId(identity.playerId);
  assert.equal(identity.displayName, 'Astronaut');
}

async function testUsesFactoryProfileWhenAvailable() {
  const identity = await getLocalIdentity({
    profileModulePromise: Promise.resolve({
      loadFactoryProfile() {
        return { playerId: 'player-from-factory', profileName: 'Beacon Runner Extra' };
      },
      sanitizeFactoryProfileName(name) {
        return name.replace(/\s+/g, '');
      }
    })
  });

  assert.equal(identity.playerId, 'player-from-factory');
  assert.equal(identity.displayName, 'BeaconRunner');
}

async function run() {
  await testFallsBackWhenFactoryProfileModuleIsMissing();
  await testUsesFactoryProfileWhenAvailable();
  console.log('Illuminauts online identity tests passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
