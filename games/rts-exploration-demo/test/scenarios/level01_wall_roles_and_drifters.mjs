import { buildGameMap } from '../../src/map.js';
import { level01 } from '../../src/maps/level-01.js';
import { UnitManager } from '../../src/units.js';
import { result } from './helpers.mjs';

const map = buildGameMap(level01);
const baseExitWall = map.getDestructible(16, 12);
const dragonWall = map.getDestructible(64, 47);
const units = new UnitManager(map);
units.spawnFromDef(level01.spawns);
const drifters = units.units.filter((unit) => unit.type === 'drifter');

// Transit barriers should be quick to clear; the Dragon enclosure remains a
// deliberately expensive objective. Gold markers are the only current generic
// neutral units, and represent Drifters rather than Crawlers.
result(
  baseExitWall?.kind === 'transitWall'
    && baseExitWall.hp < dragonWall?.hp
    && dragonWall?.kind === 'objectiveWall'
    && drifters.length === 2
    && drifters.every((unit) => unit.type === 'drifter')
    && !units.units.some((unit) => unit.type === 'neutralCrawler'),
  {
    scenario: 'level01_wall_roles_and_drifters',
    baseExitWall,
    dragonWall,
    drifters: drifters.map((unit) => ({ type: unit.type, x: unit.x, y: unit.y })),
  },
);
