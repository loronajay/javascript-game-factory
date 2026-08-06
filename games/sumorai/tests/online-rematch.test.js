import test from 'node:test';
import assert from 'node:assert/strict';

import { createRematchFlow, rematchSeed } from '../scripts/online-rematch.js';

test('ranked results never enter the rematch handshake', () => {
  const sent = [];
  const states = [];
  const flow = createRematchFlow({
    sendState: state => sent.push(state),
    onState: state => states.push(state),
  });
  assert.equal(flow.enterResults({ round: 0, enabled: false }), false);
  assert.deepEqual(sent, []);
  assert.equal(states.at(-1).disabled, true);
});

test('casual rematch uses mutual consent and a coordinator-authored synchronized start', () => {
  const starts = [];
  const accepted = [];
  const flow = createRematchFlow({
    sendState() {},
    sendStart: start => starts.push(start),
    isCoordinator: () => true,
    buildStart: round => ({ round, seed: rematchSeed(77, round), startAt: 9000 }),
    onAccepted: start => accepted.push(start),
  });
  flow.enterResults({ round: 0 });
  flow.receiveState({ round: 0, available: true, requested: false });
  flow.request();
  flow.receiveState({ round: 0, available: true, requested: true });

  assert.deepEqual(starts, [{ round: 1, seed: rematchSeed(77, 1), startAt: 9000 }]);
  assert.deepEqual(accepted, starts);
});

test('leaving casual results withdraws availability', () => {
  const sent = [];
  const flow = createRematchFlow({ sendState: state => sent.push(state) });
  flow.enterResults({ round: 4 });
  flow.leaveResults();
  assert.deepEqual(sent.at(-1), { round: 4, available: false, requested: false });
});

