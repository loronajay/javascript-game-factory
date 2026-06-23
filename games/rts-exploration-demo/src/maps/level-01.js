// Level 01 is traced from map-reference.png on the 128 x 128 simulation grid.
// Geometry belongs here, not in the generator: this is the stable collision and
// navigation contract that later mechanics will build on.

const p = (x, y) => ({ x, y });
const transitWall = (...points) => ({
  type: 'naturalWallPath',
  kind: 'transitWall',
  width: 1,
  hp: 24,
  rotational: true,
  points: points.map(([x, y]) => p(x, y)),
});
const objectiveWall = (...points) => ({
  type: 'naturalWallPath',
  kind: 'objectiveWall',
  width: 3,
  hp: 180,
  rotational: true,
  points: points.map(([x, y]) => p(x, y)),
});

export const level01 = {
  id: 'level-01',
  seed: 9142026,
  width: 128,
  height: 128,
  tileSize: 32,

  layers: [
    { type: 'fill' },

    // Perimeter fragments and long transit walls.
    transitWall([0, 18], [10, 18], [16, 12], [16, 0]),
    transitWall([19, 0], [19, 10]),
    transitWall([32, 0], [32, 13], [14, 31], [0, 31]),
    transitWall([48, 0], [48, 8], [35, 21], [35, 27]),
    objectiveWall([75, 0], [75, 10], [69, 18], [57, 18], [51, 12], [51, 0]),
    transitWall([86, 0], [86, 21], [73, 40], [73, 47], [87, 62], [112, 43], [128, 43]),
    transitWall([96, 0], [96, 12], [106, 22], [111, 22], [117, 29], [128, 29]),
    transitWall([0, 40], [12, 40], [25, 29], [29, 29], [38, 39], [38, 48], [29, 57], [20, 57]),
    objectiveWall([0, 49], [11, 49], [20, 58], [20, 73], [13, 80], [0, 80]),
    transitWall([57, 40], [72, 40], [86, 55], [86, 71], [72, 85], [56, 85], [42, 72]),
    transitWall([0, 91], [17, 91], [33, 77], [42, 86], [54, 86], [39, 106], [39, 128]),
    transitWall([0, 100], [11, 100], [21, 110], [31, 119], [31, 128]),
    transitWall([128, 88], [116, 88], [103, 101], [92, 112], [81, 112], [81, 128]),
    transitWall([128, 98], [116, 98], [108, 106], [108, 128]),
    transitWall([109, 119], [109, 128]),

    // Large reference cells: upper-green, central-purple, and lower-right cyan.
    transitWall([47, 19], [51, 19], [56, 24], [56, 31], [51, 37], [46, 37], [35, 27], [35, 21], [40, 16], [47, 16]),
    objectiveWall([59, 47], [69, 47], [79, 57], [79, 69], [70, 79], [58, 79], [48, 69], [48, 57]),
    transitWall([95, 70], [101, 70], [109, 78], [109, 86], [101, 95], [95, 95], [89, 89], [89, 78]),

    // Smaller reference cells.
    transitWall([25, 30], [29, 30], [37, 39], [37, 48], [29, 56], [25, 56], [19, 49], [19, 45]),
    transitWall([78, 91], [82, 88], [89, 96], [89, 104], [82, 111], [76, 111], [72, 107], [72, 97]),

    // The reference is clean dark terrain; decoration will return only when it
    // has an authored visual role instead of obscuring navigation readability.
  ],

  // This is the reference legend expressed as durable map data. It is the
  // source of truth for the later deposit, guardian, objective, and respawn
  // systems; no generic resource node or placeholder creature stands in for it.
  landmarks: [
    { kind: 'nexus', team: 1, tileX: 7, tileY: 6 },
    { kind: 'nexus', team: 2, tileX: 121, tileY: 121 },
    { kind: 'spaceDragon', tileX: 64, tileY: 64 },
    { kind: 'behemothCamp', tileX: 6, tileY: 62, guardian: 'behemoth', resourceKind: 'organicCrystal', size: 'large' },
    { kind: 'behemothCamp', tileX: 121, tileY: 62, guardian: 'behemoth', resourceKind: 'organicCrystal', size: 'large' },
    { kind: 'zombieWormCamp', tileX: 64, tileY: 7, guardian: 'zombieWorm', resourceKind: 'organicBiomass', size: 'large' },
    { kind: 'zombieWormCamp', tileX: 64, tileY: 119, guardian: 'zombieWorm', resourceKind: 'organicBiomass', size: 'large' },
    { kind: 'postDragonDeposit', tileX: 102, tileY: 33, resourceKind: 'organicCrystal', size: 'large', active: false },
    { kind: 'postDragonDeposit', tileX: 22, tileY: 94, resourceKind: 'organicCrystal', size: 'large', active: false },
    { kind: 'postDragonDeposit', tileX: 94, tileY: 20, resourceKind: 'organicBiomass', size: 'large', active: false },
    { kind: 'postDragonDeposit', tileX: 35, tileY: 106, resourceKind: 'organicBiomass', size: 'large', active: false },
    { kind: 'smallCrystalDeposit', tileX: 120, tileY: 14 },
    { kind: 'smallCrystalDeposit', tileX: 29, tileY: 47 },
    { kind: 'smallCrystalDeposit', tileX: 98, tileY: 79 },
    { kind: 'smallCrystalDeposit', tileX: 6, tileY: 112 },
    { kind: 'smallBiomassDeposit', tileX: 111, tileY: 6 },
    { kind: 'smallBiomassDeposit', tileX: 47, tileY: 26 },
    { kind: 'smallBiomassDeposit', tileX: 80, tileY: 101 },
    { kind: 'smallBiomassDeposit', tileX: 15, tileY: 121 },
    { kind: 'drifter', tileX: 43, tileY: 44 },
    { kind: 'drifter', tileX: 84, tileY: 83 },
  ],

  // The blue and red circles in the reference establish opposing start corners.
  spawns: {
    team1: { tileX: 7, tileY: 6, direction: 1 },
    team2: { tileX: 121, tileY: 121, direction: -1 },
    neutral: [
      { type: 'drifter', tileX: 43, tileY: 44, patrol: [{ tileX: 43, tileY: 37 }, { tileX: 43, tileY: 52 }] },
      { type: 'drifter', tileX: 84, tileY: 83, patrol: [{ tileX: 84, tileY: 90 }, { tileX: 84, tileY: 75 }] },
    ],
  },
};
