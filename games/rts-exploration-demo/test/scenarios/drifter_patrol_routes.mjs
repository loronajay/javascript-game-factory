import { buildGameMap } from '../../src/map.js';
import { level01 } from '../../src/maps/level-01.js';
import { UnitManager } from '../../src/units.js';
import { result } from './helpers.mjs';

const map = buildGameMap(level01);
const units = new UnitManager(map);
units.spawnFromDef(level01.spawns);
const drifters = units.units.filter((unit) => unit.type === 'drifter');
const starts = drifters.map((unit) => ({ x: unit.x, y: unit.y }));

for (let tick = 0; tick < 360; tick++) units.update(1 / 60, tick / 60);

const patrolling = drifters.every((unit, index) => (
  unit.neutralPatrol?.waypoints?.length === 2
    && unit.neutralPatrol.waypoints[0].x === unit.neutralPatrol.waypoints[1].x
    && unit.neutralPatrol.waypoints[0].y !== unit.neutralPatrol.waypoints[1].y
    && unit.neutralPatrol.lastIssuedAt > 0
    && Math.hypot(unit.x - starts[index].x, unit.y - starts[index].y) > 8
    && unit.attackTarget === null
));

result(patrolling, {
  scenario: 'drifter_patrol_routes',
  drifters: drifters.map((unit, index) => ({
    start: starts[index],
    end: { x: unit.x, y: unit.y },
    patrol: unit.neutralPatrol,
    state: unit.state,
  })),
});
