import fs from 'node:fs';
const file = '../../../factory-network-server/games/mini-hoops/mini-hoops-horse.test.mjs';
const source = fs.readFileSync(file, 'utf8');
if (!source.includes('assert.equal(setup.pieces[0].id, "bank-pad");')) throw new Error('Unexpected test; review before editing.');
fs.writeFileSync(file, source
  .replace('a placement validates and preserves its HORSE trick-shot tools', 'a placement strips disabled HORSE trick-shot tools')
  .replace('assert.equal(setup.pieces.length, 1);', 'assert.equal(setup.pieces.length, 0);')
  .replace('  assert.equal(setup.pieces[0].id, "bank-pad");\n', ''));
await import('./tools/mirror-server.mjs');
