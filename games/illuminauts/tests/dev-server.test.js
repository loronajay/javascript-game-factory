import assert from 'node:assert/strict';
import { createDevServer } from '../scripts/serve.mjs';
const server = createDevServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(url + '/games/illuminauts/scripts/hazards.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(await response.text(), /export function getAlienPose/);
  assert.equal((await fetch(url + '/not-found')).status, 404);
  assert.equal((await fetch(url + '/games/illuminauts/', { method: 'HEAD' })).status, 200);
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('Illuminauts local development server tests passed.');
