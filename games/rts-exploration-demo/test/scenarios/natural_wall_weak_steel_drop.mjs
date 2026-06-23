import { strict as assert } from 'node:assert';
import { GameMap, TILE } from '../../src/map.js';
import { result } from './helpers.mjs';

const map = new GameMap(8, 8, 32);
map.tiles.fill(TILE.FLOOR);
map.addDestructibleTile(4, 4, 10, 'naturalWall');

const survived = map.damageDestructible(4, 4, 9);
assert.equal(survived, false);
assert.equal(map.resourceNodes.length, 0);

const broken = map.damageDestructible(4, 4, 1);
assert.equal(broken, true);
assert.equal(map.resourceNodes.length, 1);

const [drop] = map.resourceNodes;
assert.deepEqual(
  {
    kind: drop.kind,
    amount: drop.amount,
    tileX: drop.tileX,
    tileY: drop.tileY,
    sourceKind: drop.sourceKind,
    dropped: drop.dropped,
  },
  {
    kind: 'weakSteel',
    amount: 1,
    tileX: 4,
    tileY: 4,
    sourceKind: 'naturalWall',
    dropped: true,
  },
);

assert.equal(map.damageDestructible(4, 4, 1), false);
assert.equal(map.resourceNodes.length, 1);

for (const wall of [
  { x: 2, y: 2, kind: 'transitWall' },
  { x: 6, y: 6, kind: 'objectiveWall' },
]) {
  map.addDestructibleTile(wall.x, wall.y, 1, wall.kind);
  assert.equal(map.damageDestructible(wall.x, wall.y, 1), true);
}

assert.deepEqual(
  map.resourceNodes.map(({ kind, amount, sourceKind, dropped }) => ({ kind, amount, sourceKind, dropped })),
  [
    { kind: 'weakSteel', amount: 1, sourceKind: 'naturalWall', dropped: true },
    { kind: 'weakSteel', amount: 1, sourceKind: 'transitWall', dropped: true },
    { kind: 'weakSteel', amount: 1, sourceKind: 'objectiveWall', dropped: true },
  ],
);

result(true, { scenario: 'natural_wall_weak_steel_drop', drop });
