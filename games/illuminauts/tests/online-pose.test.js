import assert from 'node:assert/strict';
import { createGameState } from '../scripts/state.js';
import { createPositionPacket, applyRemotePosition } from '../scripts/online-pose.js';
const alpha = createGameState(0, 'A'), beta = createGameState(0, 'B');
Object.assign(alpha.player, { px: 3.21, py: 1.51, tx: 3, ty: 1, yaw: -1.4 });
const packet = createPositionPacket(alpha.player, 2);
assert.equal(applyRemotePosition(beta, packet), true);
assert.equal(beta.remote.px, alpha.player.px);
assert.equal(beta.remote.yaw, alpha.player.yaw);
assert.equal(applyRemotePosition(beta, { ...packet, sequence: 1, px: 3.1 }), false);
assert.equal(applyRemotePosition(beta, { ...packet, sequence: 3, px: NaN }), false);
assert.equal(applyRemotePosition(beta, { ...packet, sequence: 3, px: 999 }), false);
assert.equal(applyRemotePosition(beta, { ...packet, sequence: 3, x: 4 }), false);
const legacy = createGameState();
assert.equal(applyRemotePosition(legacy, { x: 1, y: 1, dir: 'down' }), true);
assert.equal(legacy.remote.px, 1.5);
// Headless two-peer relay: delayed, reordered, duplicated packets must converge.
const queue = [];
for (let i = 0; i < 50; i++) {
  alpha.player.px = 1.5 + i / 100; alpha.player.tx = 1;
  beta.player.px = 31.5 - i / 100; beta.player.tx = 31;
  for (const [from, to] of [[alpha, beta], [beta, alpha]]) {
    const value = createPositionPacket(from.player, i + 10);
    queue.push({ at: i * 50 + ((i * 73) % 190), to, value });
    queue.push({ at: i * 50 + 220, to, value });
  }
}
queue.sort((a, b) => a.at - b.at).forEach(({ to, value }) => applyRemotePosition(to, value));
assert.equal(beta.remote.px, alpha.player.px); assert.equal(alpha.remote.px, beta.player.px);
console.log('Illuminauts delayed two-peer pose tests passed.');
