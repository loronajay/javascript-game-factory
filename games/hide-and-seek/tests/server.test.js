const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');
// The cabinet is served from the repo root so `/js/platform/**` resolves the way it does on Pages.
const repoRoot = path.resolve(projectRoot, '..', '..');
const cabinet = '/games/hide-and-seek';

test('local server serves the game and rejects path traversal', async (t) => {
  const { startServer } = await import(pathToFileURL(path.join(projectRoot, 'server.mjs')));
  const server = await startServer({ port: 0, host: '127.0.0.1', root: repoRoot });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const home = await fetch(`${baseUrl}${cabinet}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /^text\/html/);
  assert.match(await home.text(), /Hide and Seek/);

  const creatureAsset = await fetch(`${baseUrl}${cabinet}/assets/UAL2_Standard.glb`, { method: 'HEAD' });
  assert.equal(creatureAsset.status, 200);
  assert.equal(creatureAsset.headers.get('content-type'), 'model/gltf-binary');

  for (const playerAsset of ['base-character.glb', 'locomotion.glb']) {
    const response = await fetch(`${baseUrl}${cabinet}/assets/quaternius-player/${playerAsset}`, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'model/gltf-binary');
  }

  const chillTheme = await fetch(`${baseUrl}${cabinet}/assets/sounds/bg-themes/empty-halls.mp3`, { method: 'HEAD' });
  assert.equal(chillTheme.status, 200);
  assert.equal(chillTheme.headers.get('content-type'), 'audio/mpeg');

  const chaseTheme = await fetch(`${baseUrl}${cabinet}/assets/sounds/bg-themes/the-chase.mp3`, { method: 'HEAD' });
  assert.equal(chaseTheme.status, 200);
  assert.equal(chaseTheme.headers.get('content-type'), 'audio/mpeg');

  const caughtEffect = await fetch(`${baseUrl}${cabinet}/assets/sounds/sfx/caught.wav`, { method: 'HEAD' });
  assert.equal(caughtEffect.status, 200);
  assert.equal(caughtEffect.headers.get('content-type'), 'audio/wav');

  // The shared platform module the online gate imports has to resolve from the same origin.
  const platform = await fetch(`${baseUrl}/js/platform/api/factory-account-gate.mjs`, { method: 'HEAD' });
  assert.equal(platform.status, 200);
  assert.match(platform.headers.get('content-type'), /javascript/);

  const traversal = await fetch(`${baseUrl}/..%2F..%2Fpackage.json`);
  assert.equal(traversal.status, 403);
});

test('one-click launcher and npm start use the local server', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const launcher = fs.readFileSync(path.join(projectRoot, 'PLAY HIDE AND SEEK.cmd'), 'utf8');

  assert.equal(packageJson.scripts.start, 'node server.mjs --open');
  assert.match(launcher, /npm start/i);
});
