import { strict as assert } from 'node:assert';
import { GameMap, TILE } from '../../src/map.js';
import { WorldEntityManager } from '../../src/entities.js';
import { UnitManager } from '../../src/units.js';
import { CommandSystem, createHarvestResourceCommand } from '../../src/commands.js';
import { result } from './helpers.mjs';

const map = new GameMap(24, 20, 32);
map.tiles.fill(TILE.FLOOR);
map.addLandmark({ kind: 'nexus', team: 1, tileX: 2, tileY: 2 });
const firstDrop = map.addWeakSteelDrop(10, 10, 'naturalWall');
const secondDrop = map.addWeakSteelDrop(15, 10, 'naturalWall');

const entities = new WorldEntityManager(map);
entities.spawnFromLandmarks();
const units = new UnitManager(map, entities);
const commands = new CommandSystem({ units, map });
const start = map.tileCenter(8, 10);
const harvester = units.spawnUnit('harvester', 1, start.x, start.y);

const firstOrder = commands.issueLocal(createHarvestResourceCommand([harvester.id], firstDrop.id));
for (let tick = 0; tick < 100; tick++) units.update(1 / 60, tick / 60);

assert.deepEqual(harvester.cargo, { kind: 'weakSteel', amount: 1 });
const blockedOrder = commands.issueLocal(createHarvestResourceCommand([harvester.id], secondDrop.id));
assert.equal(blockedOrder.ok, false);
assert.equal(map.getResourceNode(secondDrop.id)?.amount, 1);
assert.deepEqual(harvester.cargo, { kind: 'weakSteel', amount: 1 });

for (let tick = 100; tick < 1800; tick++) units.update(1 / 60, tick / 60);
assert.equal(harvester.cargo, null);
assert.equal(units.resourceAmount(1, 'weakSteel'), 1);

const secondOrder = commands.issueLocal(createHarvestResourceCommand([harvester.id], secondDrop.id));
assert.equal(secondOrder.ok, true);
for (let tick = 1800; tick < 3600; tick++) units.update(1 / 60, tick / 60);
assert.equal(units.resourceAmount(1, 'weakSteel'), 2);

result(true, {
  scenario: 'harvester_cargo_gate',
  firstOrder: firstOrder.ok,
  blockedOrder: blockedOrder.ok,
  secondOrder: secondOrder.ok,
  deliveredWeakSteel: units.resourceAmount(1, 'weakSteel'),
});
