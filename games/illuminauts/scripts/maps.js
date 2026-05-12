// Map catalog. Each entry has:
//   id      — human label shown in debug overlay
//   raw     — tile string array (see legend below)
//   hazards — initial alien/gate/turret config for this map
//
// Legend:
//   # wall  . floor  S player-A start  T player-B start
//   A Access Ahip  P Power Aell  D Laser Door  B Beacon Aore (must be 5x5)

export const MAPS = [
  {
    id: 'map-01',
    raw: [
      '###################################',
      '#S.........#......#...#.#...#...#T#',
      '####.#####.#.####.#.#.#.#.#.#.#.#.#',
      '#........#.#.#...A#.#.#.###...#P#.#',
      '#.######.#.#.#.######.#.....#####.#',
      '#..#.....#.#.#.#......##.####.....#',
      '##.#P#####.....#.#.##..#......#.#.#',
      '##.###...#######.#....#########.#.#',
      '##.#...#......#######.....#.....#.#',
      '##.#.########P#.......###.#.#####.#',
      '##D#.#......#.#######.#A#.#.#.....#',
      '##.#.#.####.#.#BBBBB#.#.#.#.#.#####',
      '##...#..#.#.#.#BBBBB#.#.#.#.#.....#',
      '##.######.....#BBBBB#.#.#.#.#####A#',
      '##.#.#.P#.###.#BBBBB#.#.#.#.....###',
      '##.#.#.##.#.#.#BBBBB#.#.#.#####D#P#',
      '#....#.####.#####D###.#.#P#...#.#.#',
      '#.##.#..........#.#.#.#.###.#.#.#.#',
      '#.#..#.####.###.#...#.......#.#.#.#',
      '#.#.##...A#.#.#.###.#.#####.#...#.#',
      '#.#.#######.#.#.#.#.....#.#.#.###.#',
      '#.#.#.....#.#.#.#.#.#.#...#.......#',
      '#.#.#####.#.#.###.#.#.######.######',
      '#.#.....#.........#.#.##.#P#......#',
      '#.#######.###.#####.#.##.#.#.####.#',
      '#P........#.........#....#........#',
      '###################################'
    ],
    hazards: {
      aliens: [
        {
          id: 'alien3', route: [{ x: 5, y: 7 }, { x: 9, y: 7 }],
          index: 0, lastStepAt: 0, stepMs: 620
        },
        {
          id: 'alien4', route: [{ x: 4, y: 14 }, { x: 4, y: 18 }],
          index: 0, lastStepAt: 0, stepMs: 620
        },
        {
          id: 'alien5', route: [{ x: 11, y: 15 }, { x: 11, y: 23 }],
          index: 0, lastStepAt: 0, stepMs: 620
        },
        {
          id: 'alien6', route: [{ x: 29, y: 9 }, { x: 29, y: 13 }],
          index: 0, lastStepAt: 0, stepMs: 620
        },
        {
          id: 'alien7', route: [{ x: 19, y: 9 }, { x: 22, y: 9 }],
          index: 0, lastStepAt: 0, stepMs: 620
        }
      ],
      laserGates: [
        {
          id: 'gate2', tiles: [{ x: 16, y: 18 }, { x: 17, y: 18 }, { x: 19, y: 18 }, { x: 18, y: 18 }, { x: 20, y: 18 }],
          cycleMs: 3000, warningMs: 760, activeMs: 820, offsetMs: 0
        },
        {
          id: 'gate8', tiles: [{ x: 28, y: 19 }, { x: 29, y: 19 }, { x: 30, y: 19 }, { x: 31, y: 19 }, { x: 32, y: 19 }],
          cycleMs: 3000, warningMs: 760, activeMs: 820, offsetMs: 0
        },
        {
          id: 'gate9', tiles: [{ x: 12, y: 23 }, { x: 13, y: 23 }, { x: 14, y: 23 }],
          cycleMs: 3000, warningMs: 760, activeMs: 820, offsetMs: 0
        },
        {
          id: 'gate10', tiles: [{ x: 2, y: 23 }, { x: 3, y: 23 }, { x: 4, y: 23 }, { x: 1, y: 23 }],
          cycleMs: 3000, warningMs: 760, activeMs: 820, offsetMs: 0
        }
      ],
      turrets: [
        {
          id: 'turret1', x: 1, y: 12, dx: 1, dy: 0, range: 3,
          cycleMs: 3000, warningMs: 820, activeMs: 520, offsetMs: 0
        }
      ]
    }
  }
];
