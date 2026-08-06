import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  acceptServerRunnerStateMessage,
  createOnlineGameplayState,
  createRunnerStateMessage,
  shouldSendServerRunnerState,
} from '../js/online-gameplay.js';

const stageSequence = Array.from(
  { length: 10 },
  (_, index) => `pack_01_stage_${String(index + 1).padStart(2, '0')}`,
);
const players = [
  { id: 'runner', displayName: 'Runner' },
  { id: 'builder', displayName: 'Builder' },
];

function runDelayedReplica({ corrections, latency, jitter = 4 }) {
  const onlineState = createOnlineGameplayState({
    packId: 'pack_01',
    stageSequence,
    players,
    localPlayerId: 'builder',
    authorityPlayerId: 'server',
  });
  const wire = [];
  let randomState = 1234567;
  let lastDeliveryTick = -1;
  let lastAppliedTick = -1;
  let authoritativeX = 0;
  let replicaX = 0;
  let maxDivergence = 0;

  const nextJitter = () => {
    randomState = (randomState * 1103515245 + 12345) & 0x7fffffff;
    return jitter > 0 ? randomState % (jitter + 1) : 0;
  };
  const deliver = (driverTick) => {
    for (let index = 0; index < wire.length;) {
      const packet = wire[index];
      if (packet.deliveryTick > driverTick) {
        index += 1;
        continue;
      }
      const accepted = acceptServerRunnerStateMessage(
        onlineState,
        'builder',
        lastAppliedTick,
        packet.message,
      );
      if (accepted) {
        lastAppliedTick = accepted.tick;
        replicaX = accepted.x;
      }
      wire.splice(index, 1);
    }
  };

  for (let tick = 1; tick <= 180; tick += 1) {
    deliver(tick);
    authoritativeX += 4;
    const replicaIsHitched = tick >= 70 && tick < 100;
    if (!replicaIsHitched) replicaX += 4;

    if (corrections && shouldSendServerRunnerState(onlineState, 'runner', tick)) {
      const deliveryTick = Math.max(tick + latency + nextJitter(), lastDeliveryTick + 1);
      lastDeliveryTick = deliveryTick;
      wire.push({
        deliveryTick,
        message: {
          senderId: 'runner',
          value: createRunnerStateMessage({ tick, x: authoritativeX, y: 0, vx: 240, vy: 0 }).value,
        },
      });
    }
    maxDivergence = Math.max(maxDivergence, Math.abs(authoritativeX - replicaX));
  }

  deliver(Number.POSITIVE_INFINITY);
  return { authoritativeX, replicaX, maxDivergence };
}

test('Runner corrections recover a hitched Builder replica across a latency sweep', () => {
  for (const latency of [2, 6, 12]) {
    const result = runDelayedReplica({ corrections: true, latency });
    assert.equal(result.replicaX, result.authoritativeX, `latency ${latency} did not converge`);
    assert.ok(
      result.maxDivergence <= 80,
      `latency ${latency} allowed ${result.maxDivergence}px of unbounded drift`,
    );
  }
});

test('teeth check: the same replica hitch drifts without Runner corrections', () => {
  const result = runDelayedReplica({ corrections: false, latency: 6 });
  assert.ok(result.maxDivergence >= 120, 'the harness did not exercise a meaningful replica hitch');
  assert.notEqual(result.replicaX, result.authoritativeX, 'the unsynchronized replica unexpectedly converged');
});
