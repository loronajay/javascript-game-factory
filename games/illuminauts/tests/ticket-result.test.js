import assert from 'node:assert/strict';

import { buildTicketResult } from '../scripts/ticket-result.js';

const ID = 'illum-lx2k9c-1a2b3c4d';

function solo(mode = 'sprint', mapId = 'map-02') {
  return { mapId, solo: { enabled: true, mode }, online: { enabled: false } };
}

function online(mapId = 'map-04') {
  return { mapId, solo: { enabled: false }, online: { enabled: true } };
}

function testSoloClearReportsModeMapAndTime() {
  assert.deepEqual(buildTicketResult({ state: solo('sweep'), localWon: true, resultId: ID, durationMs: 201_000.9 }), {
    resultId: ID, mode: 'sweep', mapId: 'map-02', durationMs: 201_000,
  });
}

function testOnlineRaceReportsOutcomeForThisRunner() {
  assert.deepEqual(buildTicketResult({ state: online(), localWon: false, resultId: ID, durationMs: 95_000 }), {
    resultId: ID, mode: 'online', mapId: 'map-04', outcome: 'loss', durationMs: 95_000,
  });
  assert.equal(buildTicketResult({ state: online(), localWon: true, resultId: ID, durationMs: 95_000 }).outcome, 'win');
}

function testPlaytestsAndUnknownMapsAreNeverReported() {
  const playtest = { mapId: 'map-01', solo: { enabled: false }, online: { enabled: false } };
  assert.equal(buildTicketResult({ state: playtest, localWon: true, resultId: ID, durationMs: 60_000 }), null);
  assert.equal(buildTicketResult({ state: solo('sprint', 'editor-map'), localWon: true, resultId: ID, durationMs: 60_000 }), null);
}

function testNothingIsReportedWithoutAnIdOrAClear() {
  assert.equal(buildTicketResult({ state: solo(), localWon: true, resultId: null, durationMs: 60_000 }), null);
  assert.equal(buildTicketResult({ state: solo(), localWon: false, resultId: ID, durationMs: 60_000 }), null);
}

testSoloClearReportsModeMapAndTime();
testOnlineRaceReportsOutcomeForThisRunner();
testPlaytestsAndUnknownMapsAreNeverReported();
testNothingIsReportedWithoutAnIdOrAClear();
console.log('ticket-result tests passed');
