import { GameMap, TILE } from '../../src/map.js';
import { WorldEntityManager } from '../../src/entities.js';
import { UnitManager } from '../../src/units.js';
import { result } from './helpers.mjs';

const map = new GameMap(24, 20, 32);
map.tiles.fill(TILE.FLOOR);
map.addLandmark({ kind: 'nexus', team: 2, tileX: 14, tileY: 10 });

const entities = new WorldEntityManager(map);
entities.spawnFromLandmarks();
const nexus = entities.getById('nexus_team_2');
const units = new UnitManager(map, entities);
const start = map.tileCenter(11, 10);
const grunt = units.spawnUnit('grunt', 1, start.x, start.y);
const hpBefore = nexus?.hp ?? 0;

const issued = units.attackUnitsEntity([grunt.id], nexus?.id, 1);
for (let tick = 0; tick < 240; tick++) units.update(1 / 60, tick / 60);

result(
  issued &&
    grunt.attackTarget?.kind === 'entity' &&
    grunt.attackTarget?.id === nexus?.id &&
    nexus.hp < hpBefore &&
    nexus.hp > 0,
  {
    scenario: 'nexus_entity_target',
    issued,
    attackTarget: grunt.attackTarget,
    hpBefore,
    hpAfter: nexus?.hp,
  },
);
