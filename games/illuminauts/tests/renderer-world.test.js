import assert from 'node:assert/strict';

import { drawPlayer } from '../scripts/renderer-world.js';

function createFakeContext() {
  const calls = [];
  return {
    calls,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    save() { calls.push(['save']); },
    restore() { calls.push(['restore']); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
    fillRect(...args) { calls.push(['fillRect', this.fillStyle, this.globalCompositeOperation, this.globalAlpha, ...args]); },
    beginPath() { calls.push(['beginPath']); },
    arc(...args) { calls.push(['arc', ...args]); },
    fill() { calls.push(['fill', this.fillStyle]); },
  };
}

function testBetaPlayerDrawsOrangeOverlay() {
  const ctx = createFakeContext();
  drawPlayer(ctx, { dir: 'down', palette: 'beta' }, 0, 50, 60, 32, {
    playerDown: { image: { width: 78, height: 101 }, w: 78, h: 101 }
  });

  assert.ok(ctx.calls.some((call) => call[0] === 'drawImage'));
  assert.ok(ctx.calls.some((call) => call[0] === 'fillRect' && call[1] === '#ff8c42' && call[2] === 'source-atop'));
}

function testAlphaPlayerDoesNotDrawOrangeOverlay() {
  const ctx = createFakeContext();
  drawPlayer(ctx, { dir: 'down', palette: 'alpha' }, 0, 50, 60, 32, {
    playerDown: { image: { width: 78, height: 101 }, w: 78, h: 101 }
  });

  assert.ok(ctx.calls.some((call) => call[0] === 'drawImage'));
  assert.equal(ctx.calls.some((call) => call[0] === 'fillRect' && call[1] === '#ff8c42'), false);
}

function run() {
  testBetaPlayerDrawsOrangeOverlay();
  testAlphaPlayerDoesNotDrawOrangeOverlay();
  console.log('Illuminauts renderer-world tests passed.');
}

run();
