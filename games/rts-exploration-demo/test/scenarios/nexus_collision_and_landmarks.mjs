import { GameMap, TILE, buildGameMap } from '../../src/map.js';
import { WorldEntityManager } from '../../src/entities.js';
import { UnitManager } from '../../src/units.js';
import { UnitFactory } from '../../src/units/unit-factory.js';
import { getUnitDef } from '../../src/unit-defs.js';
import { shouldRenderMapLandmark } from '../../src/renderer.js';
import { level01 } from '../../src/maps/level-01.js';
import { result } from './helpers.mjs';

const map = new GameMap(24, 20, 32);
map.tiles.fill(TILE.FLOOR);
map.addLandmark({ kind: 'nexus', team: 2, tileX: 12, tileY: 10 });
const entities = new WorldEntityManager(map);
entities.spawnFromLandmarks();
const nexus = entities.getById('nexus_team_2');
const units = new UnitManager(map, entities);
const start = map.tileCenter(3, 10);
const goal = map.tileCenter(21, 10);
const grunt = units.spawnUnit('grunt', 1, start.x, start.y);

const issued = units.moveUnitsTo([grunt.id], goal.x, goal.y);
let closest = Infinity;
for (let tick = 0; tick < 900; tick++) {
  units.update(1 / 60, tick / 60);
  closest = Math.min(closest, Math.hypot(grunt.x - nexus.x, grunt.y - nexus.y));
}

const levelMap = buildGameMap(level01);
const levelEntities = new WorldEntityManager(levelMap);
levelEntities.spawnFromLandmarks();
const levelFactory = new UnitFactory({ map: levelMap, getDef: getUnitDef });
const levelStartingUnits = [];
levelFactory.applySpawnDef(level01.spawns, (type, team, x, y, options) => {
  levelStartingUnits.push(levelFactory.create(type, team, x, y, options));
});
const startingSquadsClearHomeNexus = levelStartingUnits
  .filter((unit) => unit.team === 1 || unit.team === 2)
  .every((unit) => {
    const ownNexus = levelEntities.getById(`nexus_team_${unit.team}`);
    return Math.hypot(unit.x - ownNexus.x, unit.y - ownNexus.y) >= ownNexus.radius + unit.radius;
  });

result(
  issued &&
    !map.isCircleWalkable(nexus.x, nexus.y, 1) &&
    closest >= nexus.radius + grunt.radius &&
    grunt.x > nexus.x &&
    startingSquadsClearHomeNexus &&
    !shouldRenderMapLandmark({ kind: 'nexus' }) &&
    !shouldRenderMapLandmark({ kind: 'drifter' }) &&
    shouldRenderMapLandmark({ kind: 'spaceDragon' }),
  {
    scenario: 'nexus_collision_and_landmarks',
    issued,
    closest,
    requiredClearance: nexus.radius + grunt.radius,
    finalX: grunt.x,
    startingSquadsClearHomeNexus,
  },
);
