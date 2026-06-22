import { buildGameMap, TILE } from '../../src/map.js';
import { level01 } from '../../src/maps/level-01.js';
import { result } from './helpers.mjs';

const map = buildGameMap(level01);

const wallAt = (x, y) => map.get(x, y) === TILE.DESTRUCTIBLE;
const openAt = (x, y) => map.isWalkableTile(x, y);
const landmarkAt = (kind, x, y) => map.landmarks.some((landmark) => (
  landmark.kind === kind && landmark.tileX === x && landmark.tileY === y
));

// These anchors represent the large octagonal cells and the two player corners
// in map-reference.png. They are deliberately spatial assertions rather than
// renderer tests: the authored collision layout is the map contract.
result(
  level01.spawns.team1.tileX === 7
    && level01.spawns.team1.tileY === 6
    && level01.spawns.team2.tileX === 121
    && level01.spawns.team2.tileY === 121
    && wallAt(47, 19)
    && wallAt(35, 25)
    && openAt(47, 26)
    && wallAt(64, 47)
    && wallAt(48, 64)
    && openAt(64, 64)
    && wallAt(98, 70)
    && openAt(98, 79)
    && landmarkAt('nexus', 7, 6)
    && landmarkAt('nexus', 121, 121)
    && landmarkAt('spaceDragon', 64, 64)
    && landmarkAt('behemothCamp', 6, 62)
    && landmarkAt('behemothCamp', 121, 62)
    && landmarkAt('zombieWormCamp', 64, 7)
    && landmarkAt('zombieWormCamp', 64, 119),
  {
    scenario: 'level01_reference_layout',
    team1: level01.spawns.team1,
    team2: level01.spawns.team2,
    upperCell: [map.get(47, 19), map.get(35, 25), map.get(47, 26)],
    centralCell: [map.get(64, 47), map.get(42, 64), map.get(64, 64)],
    lowerRightCell: [map.get(98, 70), map.get(98, 79)],
    landmarkKinds: map.landmarks.map((landmark) => landmark.kind),
  },
);
