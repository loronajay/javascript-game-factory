import { strict as assert } from 'node:assert';
import { buildGameMap } from '../../src/map.js';
import { level01 } from '../../src/maps/level-01.js';
import { UnitManager } from '../../src/units.js';
import { result } from './helpers.mjs';

const map = buildGameMap(level01);
const units = new UnitManager(map);
units.spawnFromDef(level01.spawns);

const team1Harvesters = units.units.filter((unit) => unit.team === 1 && unit.type === 'harvester');
const team2Harvesters = units.units.filter((unit) => unit.team === 2 && unit.type === 'harvester');

assert.equal(team1Harvesters.length, 3);
assert.equal(team2Harvesters.length, 3);
assert.equal(hasRequiredSpacing(team1Harvesters), true);
assert.equal(hasRequiredSpacing(team2Harvesters), true);

result(true, {
  scenario: 'harvester_starting_squad',
  team1: team1Harvesters.length,
  team2: team2Harvesters.length,
});

function hasRequiredSpacing(units) {
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      if (Math.hypot(units[i].x - units[j].x, units[i].y - units[j].y) < units[i].radius + units[j].radius + 1) return false;
    }
  }
  return true;
}
