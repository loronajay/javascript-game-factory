// Level 01 map definition.
// Layers are applied in order; later layers can overwrite earlier ones.
// Gates define a wall segment, an optional carved gap, and the destructible tiles that fill it.
// Spawns describe where each team's units and neutral creatures begin.

export const level01 = {
  id: 'level-01',
  seed: 9142026,
  width: 128,
  height: 128,
  tileSize: 32,

  layers: [
    { type: 'fill' },
    { type: 'border' },

    // Interior wall geometry
    { type: 'rect', x: 20, y: 16, w: 8,  h: 34 },
    { type: 'rect', x: 32, y: 28, w: 28, h: 5  },
    { type: 'rect', x: 46, y: 34, w: 6,  h: 24 },
    { type: 'rect', x: 16, y: 70, w: 42, h: 5  },
    { type: 'rect', x: 70, y: 14, w: 5,  h: 48 },
    { type: 'rect', x: 82, y: 30, w: 24, h: 5  },
    { type: 'rect', x: 98, y: 35, w: 5,  h: 30 },
    { type: 'rect', x: 68, y: 78, w: 38, h: 5  },
    { type: 'rect', x: 58, y: 92, w: 6,  h: 23 },
    { type: 'rect', x: 86, y: 98, w: 26, h: 5  },

    // Carved passages through the walls above
    { type: 'gap', x: 20, y: 25, w: 8, h: 3 },
    { type: 'gap', x: 38, y: 28, w: 5, h: 5 },
    { type: 'gap', x: 46, y: 45, w: 6, h: 4 },
    { type: 'gap', x: 30, y: 70, w: 5, h: 5 },
    { type: 'gap', x: 70, y: 36, w: 5, h: 5 },
    { type: 'gap', x: 93, y: 30, w: 4, h: 5 },
    { type: 'gap', x: 98, y: 52, w: 5, h: 5 },
    { type: 'gap', x: 80, y: 78, w: 6, h: 5 },
    { type: 'gap', x: 58, y: 104, w: 6, h: 4 },
    { type: 'gap', x: 96, y: 98, w: 5, h: 5 },

    // Maze obstacle clusters in the mid-map open areas
    { type: 'maze', x: 42, y: 48, w: 30, h: 24 },
    { type: 'maze', x: 76, y: 62, w: 34, h: 26 },

    { type: 'decor', count: 420, density: 0.55 },
  ],

  clearSpawns: [
    { x: 10,  y: 10,  radius: 10 },
    { x: 116, y: 116, radius: 10 },
  ],

  // Each gate: optional wall/carve to set up the passage, then the destructible block.
  gates: [
    // East spawn gate — blocks the first direct route out of the safe hive pocket.
    { wall: { x: 22, y: 5, w: 1, h: 22 }, carve: { x: 22, y: 14, w: 1, h: 3 }, x: 22, y: 14, w: 1, h: 3 },
    // South spawn gate — second lane, gives an immediate combat introduction.
    { wall: { x: 6, y: 28, w: 22, h: 1 }, carve: { x: 14, y: 28, w: 3, h: 1 }, x: 14, y: 28, w: 3, h: 1 },
    // Mid-corridor gates using existing carved passage positions.
    { x: 38, y: 30, w: 3, h: 1 },
    { x: 47, y: 45, w: 3, h: 1 },
    { x: 71, y: 37, w: 3, h: 2 },
    { x: 99, y: 53, w: 3, h: 2 },
  ],

  resources: [
    { x: 31,  y: 21, kind: 'biomass' },
    { x: 44,  y: 42, kind: 'biomass' },
    { x: 84,  y: 44, kind: 'crystal' },
    { x: 103, y: 57, kind: 'crystal' },
  ],

  // Spawn definitions read by UnitManager.spawnFromDef().
  spawns: {
    team1: { tileX: 10,  tileY: 10,  direction:  1 },
    team2: { tileX: 116, tileY: 116, direction: -1 },
    neutral: [
      { type: 'neutralCrawler', tileX: 29,  tileY: 20 },
      { type: 'neutralCrawler', tileX: 44,  tileY: 40 },
      { type: 'neutralCrawler', tileX: 82,  tileY: 42 },
      { type: 'neutralCrawler', tileX: 101, tileY: 55 },
    ],
  },
};
