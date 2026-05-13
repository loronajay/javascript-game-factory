import assert from 'node:assert/strict';

import { drawHud, drawMessage } from '../scripts/renderer-hud.js';

function createFakeContext() {
  const calls = [];
  return {
    calls,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    textBaseline: '',
    imageSmoothingEnabled: true,
    fillRect(...args) { calls.push(['fillRect', this.fillStyle, ...args]); },
    beginPath() { calls.push(['beginPath']); },
    moveTo(...args) { calls.push(['moveTo', ...args]); },
    lineTo(...args) { calls.push(['lineTo', ...args]); },
    stroke() { calls.push(['stroke']); },
    fillText(...args) { calls.push(['fillText', this.fillStyle, this.font, ...args]); },
    drawImage(...args) { calls.push(['drawImage', ...args]); },
  };
}

function createState(overrides = {}) {
  return {
    player: {
      hearts: 3,
      chips: 2,
      powerUntil: 10000,
      stamina: 50,
      ...overrides,
    },
    online: { enabled: true },
    remote: { displayName: 'Opponent' },
  };
}

function testHudDrawsChipAndPowerSprites() {
  const ctx = createFakeContext();
  drawHud(ctx, createState(), 1000, 900, 600, {
    accessChip: { image: { chip: true }, w: 120, h: 76 },
    powerCell: { image: { power: true }, w: 52, h: 114 },
  });

  assert.ok(ctx.calls.some((call) => call[0] === 'drawImage' && call[1].chip));
  assert.ok(ctx.calls.some((call) => call[0] === 'drawImage' && call[1].power));
  assert.ok(ctx.calls.some((call) => call[0] === 'fillText' && call[3] === 'x 2'));
  assert.ok(ctx.calls.some((call) => call[0] === 'fillText' && call[3] === '9s'));
}

function testHudUsesBiggerHeartText() {
  const ctx = createFakeContext();
  drawHud(ctx, createState({ hearts: 2 }), 1000, 900, 600);

  const heartCall = ctx.calls.find((call) => call[0] === 'fillText' && call[3].includes('♥'));
  assert.ok(heartCall);
  assert.ok(heartCall[2].startsWith('bold 31px'), `expected larger heart font, got ${heartCall[2]}`);
}

function testMessageShowsQuitHint() {
  const ctx = createFakeContext();
  drawMessage(ctx, { message: 'Find the Beacon Core.' }, 900, 600);

  assert.ok(ctx.calls.some((call) => call[0] === 'fillText' && call[3] === 'Find the Beacon Core.'));
  assert.ok(ctx.calls.some((call) => call[0] === 'fillText' && call[3] === 'ESC - quit match'));
}

function run() {
  testHudDrawsChipAndPowerSprites();
  testHudUsesBiggerHeartText();
  testMessageShowsQuitHint();
  console.log('Illuminauts HUD tests passed.');
}

run();
