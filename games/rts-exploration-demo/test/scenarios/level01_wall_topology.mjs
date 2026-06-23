import { buildGameMap } from '../../src/map.js';
import { level01 } from '../../src/maps/level-01.js';
import { result } from './helpers.mjs';

const map = buildGameMap(level01);
const kindAt = (x, y) => map.getDestructible(x, y)?.kind ?? null;

// The large left/right objective enclosure is mirrored by its objective-wall
// path. It must not also carry a second thin transit outline along the map
// edge: that duplicate reads as a stray strip and weakens part of the barrier.
result(
  kindAt(0, 49) === 'objectiveWall'
    && kindAt(127, 78) === 'objectiveWall'
    && kindAt(0, 47) !== 'transitWall'
    && kindAt(0, 78) !== 'transitWall'
    && kindAt(127, 49) !== 'transitWall'
    && kindAt(127, 80) !== 'transitWall'
    && kindAt(69, 18) === 'objectiveWall'
    && kindAt(52, 0) === 'objectiveWall'
    && kindAt(58, 109) === 'objectiveWall'
    && kindAt(75, 127) === 'objectiveWall',
  {
    scenario: 'level01_wall_topology',
    leftObjective: kindAt(0, 49),
    rightObjective: kindAt(127, 78),
    strayBorderKinds: [kindAt(0, 47), kindAt(0, 78), kindAt(127, 49), kindAt(127, 80)],
    largeObjectiveKinds: [kindAt(69, 18), kindAt(52, 0), kindAt(58, 109), kindAt(75, 127)],
  },
);
