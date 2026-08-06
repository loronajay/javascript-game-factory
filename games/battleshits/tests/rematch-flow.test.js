import test from 'node:test';
import assert from 'node:assert/strict';

import { createRematchFlow } from '../scripts/rematch-flow.js';

function harness({ coordinator = true } = {}) {
  const states = [];
  const sentStates = [];
  const sentStarts = [];
  const accepted = [];
  const flow = createRematchFlow({
    sendState: state => sentStates.push(state),
    sendStart: start => sentStarts.push(start),
    isCoordinator: () => coordinator,
    buildStart: round => ({ round, seed: 100 + round }),
    onState: state => states.push(state),
    onAccepted: start => accepted.push(start),
  });
  return { flow, states, sentStates, sentStarts, accepted };
}

test('rematch unlocks only after both players reach results and starts after mutual consent', () => {
  const h = harness();
  h.flow.enterResults({ round: 0 });
  assert.equal(h.states.at(-1).available, false);
  assert.deepEqual(h.flow.request(), { accepted: false, reason: 'unavailable' });

  h.flow.receiveState({ round: 0, available: true, requested: false });
  assert.equal(h.states.at(-1).available, true);
  h.flow.request();
  h.flow.receiveState({ round: 0, available: true, requested: true });

  assert.deepEqual(h.sentStarts, [{ round: 1, seed: 101 }]);
  assert.deepEqual(h.accepted, [{ round: 1, seed: 101 }]);
});

test('leaving results withdraws availability and declines a pending request', () => {
  const h = harness();
  h.flow.enterResults({ round: 2 });
  h.flow.receiveState({ round: 2, available: true, requested: false });
  h.flow.request();
  h.flow.receiveState({ round: 2, available: false, requested: false });
  assert.equal(h.states.at(-1).declined, true);

  h.flow.leaveResults();
  assert.deepEqual(h.sentStates.at(-1), { round: 2, available: false, requested: false });
});

