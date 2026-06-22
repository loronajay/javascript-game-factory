import { GameMap, TILE } from '../../src/map.js';
import { UnitManager } from '../../src/units.js';
import { result } from './helpers.mjs';

const map = new GameMap(20, 20, 32);
map.tiles.fill(TILE.FLOOR);
map.addDestructibleTile(10, 10, 90, 'naturalWall');

const units = new UnitManager(map);
const start = map.tileCenter(7, 10);
const grunt = units.spawnUnit('grunt', 1, start.x, start.y);

let issued = false;
let error = null;
try {
  issued = units.attackUnitsDestructible([grunt.id], 10, 10, 1);
} catch (caught) {
  error = caught?.message ?? String(caught);
}

result(issued && grunt.attackTarget?.kind === 'destructibleTile' && Boolean(grunt.attackSlot) && !error, {
  scenario: 'natural_wall_attack_target',
  issued,
  attackTarget: grunt.attackTarget,
  attackSlot: grunt.attackSlot,
  error,
});
