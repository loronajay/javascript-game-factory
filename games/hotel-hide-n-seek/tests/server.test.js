const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');

test('local server serves the game and rejects path traversal', async (t) => {
  const { startServer } = await import(pathToFileURL(path.join(projectRoot, 'server.mjs')));
  const server = await startServer({ port: 0, host: '127.0.0.1', root: projectRoot });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const home = await fetch(`${baseUrl}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /^text\/html/);
  assert.match(await home.text(), /Hotel Horror Prototype/);

  const traversal = await fetch(`${baseUrl}/..%2Fpackage.json`);
  assert.equal(traversal.status, 403);
});

test('one-click launcher and npm start use the local server', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  const launcher = fs.readFileSync(path.join(projectRoot, 'PLAY HOTEL HIDE-N-SEEK.cmd'), 'utf8');

  assert.equal(packageJson.scripts.start, 'node server.mjs --open');
  assert.match(launcher, /npm start/i);
});
