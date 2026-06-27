import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workspace = import.meta.dirname;
const jayboxGddPath = join(workspace, 'jaybox-gdd.md');
const potOfGreedGddPath = join(workspace, 'pot-of-greed', 'pot-of-greed-gdd.md');
const legacyCombinedGddPath = join(workspace, 'pot-of-greed', 'jaybox-pot-of-greed-gdd.md');
const readmePath = join(workspace, 'README.md');

test('Jaybox and Pot of Greed keep separate implementation GDDs', () => {
  assert.equal(existsSync(jayboxGddPath), true);
  assert.equal(existsSync(potOfGreedGddPath), true);
  assert.equal(existsSync(legacyCombinedGddPath), false);

  const jayboxGdd = readFileSync(jayboxGddPath, 'utf8');
  const potOfGreedGdd = readFileSync(potOfGreedGddPath, 'utf8');

  assert.match(jayboxGdd, /^# JAYBOX$/m);
  assert.match(jayboxGdd, /^## Platform Ownership$/m);
  assert.match(potOfGreedGdd, /^# POT OF GREED$/m);
  assert.match(potOfGreedGdd, /^## Jaybox Integration Boundary$/m);
  assert.doesNotMatch(potOfGreedGdd, /^## 23\. Jaybox Platform Flow$/m);
});

test('Jaybox documents its factory-network-server integration contract', () => {
  assert.equal(existsSync(readmePath), true);

  const readme = readFileSync(readmePath, 'utf8');
  assert.match(readme, /factory-network-server/);
  assert.match(readme, /gameId: "pot-of-greed"/);
  assert.match(readme, /wss:\/\/factory-network-server-production\.up\.railway\.app/);
  assert.match(readme, /\?server=ws:\/\/localhost:3000/);
});
