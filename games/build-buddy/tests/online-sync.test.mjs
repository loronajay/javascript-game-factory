import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  acceptServerWorldSyncMessage,
  createOnlineGameplayState,
  createStateSyncMessage,
  shouldSendServerWorldSync,
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
      const accepted = acceptServerWorldSyncMessage(
        onlineState,
        'builder',
        lastAppliedTick,
        packet.message,
      );
      if (accepted) {
        lastAppliedTick = accepted.tick;
        replicaX = accepted.runner.x;
      }
      wire.splice(index, 1);
    }
  };

  for (let tick = 1; tick <= 180; tick += 1) {
    deliver(tick);
    authoritativeX += 4;
    const replicaIsHitched = tick >= 70 && tick < 100;
    if (!replicaIsHitched) replicaX += 4;

    if (corrections && shouldSendServerWorldSync(onlineState, 'runner', tick)) {
      const deliveryTick = Math.max(tick + latency + nextJitter(), lastDeliveryTick + 1);
      lastDeliveryTick = deliveryTick;
      wire.push({
        deliveryTick,
        message: {
          senderId: 'runner',
          value: createStateSyncMessage({ tick, runner: { x: authoritativeX, y: 0, vx: 240, vy: 0 }, tools: [] }).value,
        },
      });
    }
    maxDivergence = Math.max(maxDivergence, Math.abs(authoritativeX - replicaX));
  }

  deliver(Number.POSITIVE_INFINITY);
  return { authoritativeX, replicaX, maxDivergence };
}

test('Runner world syncs recover a hitched Builder replica across a latency sweep', () => {
  for (const latency of [2, 6, 12]) {
    const result = runDelayedReplica({ corrections: true, latency });
    assert.equal(result.replicaX, result.authoritativeX, `latency ${latency} did not converge`);
    assert.ok(
      result.maxDivergence <= 80,
      `latency ${latency} allowed ${result.maxDivergence}px of unbounded drift`,
    );
  }
});

test('teeth check: the same replica hitch drifts without Runner world syncs', () => {
  const result = runDelayedReplica({ corrections: false, latency: 6 });
  assert.ok(result.maxDivergence >= 120, 'the harness did not exercise a meaningful replica hitch');
  assert.notEqual(result.replicaX, result.authoritativeX, 'the unsynchronized replica unexpectedly converged');
});

test('a swapped-in Runner whose tick count is behind is not ignored once the cursor is reset', () => {
  // Stage 1: `runner` ran and reached tick 900. Stage 2 swaps the chairs, and
  // the new Runner (`builder`, who spent stage 1 with a throttled tab) is only
  // at tick 300. The per-stage cursor must start fresh or every sync for the
  // next ten seconds is rejected as stale.
  const stageTwo = createOnlineGameplayState({
    packId: 'pack_01',
    stageSequence,
    players,
    localPlayerId: 'runner',
    authorityPlayerId: 'server',
  });
  stageTwo.session = { ...stageTwo.session, stageIndex: 1, currentStageId: stageSequence[1] };
  const message = {
    senderId: 'builder',
    value: createStateSyncMessage({ tick: 300, runner: { x: 5, y: 5 }, tools: [] }).value,
  };
  assert.equal(acceptServerWorldSyncMessage(stageTwo, 'builder', 900, message), null);
  assert.equal(acceptServerWorldSyncMessage(stageTwo, 'builder', -1, message)?.tick, 300);
});
