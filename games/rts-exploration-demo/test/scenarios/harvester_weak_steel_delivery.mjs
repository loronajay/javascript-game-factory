import { strict as assert } from 'node:assert';
import { GameMap, TILE } from '../../src/map.js';
import { WorldEntityManager } from '../../src/entities.js';
import { UnitManager } from '../../src/units.js';
import { CommandSystem, createHarvestResourceCommand } from '../../src/commands.js';
import { result } from './helpers.mjs';

const map = new GameMap(20, 20, 32);
map.tiles.fill(TILE.FLOOR);
map.addLandmark({ kind: 'nexus', team: 1, tileX: 2, tileY: 2 });
const drop = map.addWeakSteelDrop(10, 10, 'naturalWall');

const entities = new WorldEntityManager(map);
entities.spawnFromLandmarks();
const units = new UnitManager(map, entities);
const commands = new CommandSystem({ units, map });
const start = map.tileCenter(8, 10);
const harvester = units.spawnUnit('harvester', 1, start.x, start.y);

const command = commands.issueLocal(createHarvestResourceCommand([harvester.id], drop.id));
for (let tick = 0; tick < 900; tick++) units.update(1 / 60, tick / 60);

assert.equal(command.ok, true);
assert.equal(map.getResourceNode(drop.id), null);
assert.equal(harvester.cargo, null);
assert.equal(units.resourceAmount(1, 'weakSteel'), 1);

result(true, {
  scenario: 'harvester_weak_steel_delivery',
  command: command.command.type,
  deliveredWeakSteel: units.resourceAmount(1, 'weakSteel'),
  harvesterState: harvester.harvestState,
});
