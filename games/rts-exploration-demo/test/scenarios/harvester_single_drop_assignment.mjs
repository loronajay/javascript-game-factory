import { strict as assert } from 'node:assert';
import { GameMap, TILE } from '../../src/map.js';
import { WorldEntityManager } from '../../src/entities.js';
import { UnitManager } from '../../src/units.js';
import { CommandSystem, createHarvestResourceCommand } from '../../src/commands.js';
import { result } from './helpers.mjs';

const map = new GameMap(24, 20, 32);
map.tiles.fill(TILE.FLOOR);
map.addLandmark({ kind: 'nexus', team: 1, tileX: 2, tileY: 2 });
const drop = map.addWeakSteelDrop(10, 10, 'naturalWall');
const entities = new WorldEntityManager(map);
entities.spawnFromLandmarks();
const units = new UnitManager(map, entities);
const commands = new CommandSystem({ units, map });

const harvesters = [8, 10, 12].map((tileY) => {
  const start = map.tileCenter(7, tileY);
  return units.spawnUnit('harvester', 1, start.x, start.y);
});
const order = commands.issueLocal(createHarvestResourceCommand(harvesters.map((unit) => unit.id), drop.id));

const assigned = harvesters.filter((unit) => unit.harvestState);
assert.equal(order.ok, true);
assert.equal(assigned.length, 1);
assert.equal(assigned[0].id, harvesters[1].id);
assert.deepEqual(harvesters.filter((unit) => !unit.harvestState).map((unit) => unit.path.length), [0, 0]);

for (let tick = 0; tick < 1500; tick++) units.update(1 / 60, tick / 60);
assert.equal(units.resourceAmount(1, 'weakSteel'), 1);
assert.equal(harvesters.every((unit) => !unit.harvestState && unit.path.length === 0), true);

result(true, {
  scenario: 'harvester_single_drop_assignment',
  assignedHarvester: assigned[0].id,
  deliveredWeakSteel: units.resourceAmount(1, 'weakSteel'),
});
