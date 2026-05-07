// Legend:
// # wall  . floor  S player start  A Access Chip  P Power Cell
// D Laser Door  B Beacon Core
const RAW_MAP = [
  '#############################',
  '#S....#.........#...........#',
  '#####.#####.###.#########.#.#',
  '#...#.......#.............#.#',
  '#.#.#####.###.#############.#',
  '#.#...#...............#.#P..#',
  '###.#.#.###.###.#####.#.#.###',
  '#..P#.#.#...#...#...#...#.#A#',
  '#.#####.#.#########.#####.#.#',
  '#...#...#.##BBBBB##.......#.#',
  '###.#.###.##BBBBB##########.#',
  '#...#...#.##BBBBB#....#.....#',
  '#.#####.#.##BBBBB####.#####.#',
  '#.....#.#..#BBBBB#..#.....#.#',
  '#.###.#.######D####.#####.#.#',
  '#.....#.#.#.....#.#.....#...#',
  '###.#.#.#.####.##.#.###.###.#',
  '#.#.#.#.#.........#...#.#...#',
  '#.#.#.#.#.###..######.#.#.###',
  '#.#.#P..#.#...........#.#.#.#',
  '#.#.#.#####.#...#########.#.#',
  '#...........#...............#',
  '#############################'
];

export function createWorldMap() {
  const tiles = RAW_MAP.map((row) => row.split(''));
  const pickups = [];
  const doors = [];
  const goals = [];
  let start = { x: 1, y: 1 };

  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const cell = tiles[y][x];
      if (cell === 'S') {
        start = { x, y };
        tiles[y][x] = '.';
      } else if (cell === 'A') {
        pickups.push({ id: `chip-${x}-${y}`, x, y, type: 'chip', active: true });
        tiles[y][x] = '.';
      } else if (cell === 'P') {
        pickups.push({ id: `power-${x}-${y}`, x, y, type: 'powerCell', active: true });
        tiles[y][x] = '.';
      } else if (cell === 'D') {
        doors.push({ id: `door-${x}-${y}`, x, y, open: false });
        tiles[y][x] = '.';
      } else if (cell === 'B') {
        goals.push({ x, y, type: 'beaconCore' });
        tiles[y][x] = '.';
      }
    }
  }

  const map = { tiles, width: tiles[0].length, height: tiles.length, start, pickups, doors, goals };
  validateMap(map);
  return map;
}

export function getTile(map, x, y) {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return '#';
  return map.tiles[y][x];
}

export function isWall(map, x, y) {
  return getTile(map, x, y) === '#';
}

export function getDoorAt(map, x, y) {
  return map.doors.find((door) => door.x === x && door.y === y);
}

export function isBlocked(map, x, y) {
  if (isWall(map, x, y)) return true;
  const door = getDoorAt(map, x, y);
  return Boolean(door && !door.open);
}

export function getPickupAt(map, x, y, type = null) {
  return map.pickups.find(
    (pickup) => pickup.active && pickup.x === x && pickup.y === y && (!type || pickup.type === type)
  );
}

export function isGoalAt(map, x, y) {
  return map.goals.some((goal) => goal.x === x && goal.y === y);
}

function validateMap(map) {
  const chips = map.pickups.filter((p) => p.type === 'chip');
  if (chips.length < 1) throw new Error('[Illuminauts map] At least one Access Chip is required.');
  if (map.doors.length !== 1) throw new Error(`[Illuminauts map] Expected exactly one Laser Door, found ${map.doors.length}.`);
  if (map.goals.length !== 25) throw new Error(`[Illuminauts map] Beacon Core must be 5×5. Found ${map.goals.length} tiles.`);

  const door = map.doors[0];
  if (door.x !== 14 || door.y !== 14) {
    throw new Error(`[Illuminauts map] Final Laser Door must be at (14,14). Found (${door.x},${door.y}).`);
  }

  const entryBelowDoor = { x: door.x, y: door.y + 1 };
  if (isWall(map, entryBelowDoor.x, entryBelowDoor.y)) {
    throw new Error('[Illuminauts map] Laser Door bottom approach is blocked.');
  }

  const doorGoalNeighbors = neighbors(door.x, door.y).filter((t) => isGoalAt(map, t.x, t.y));
  if (doorGoalNeighbors.length !== 1 || doorGoalNeighbors[0].x !== 14 || doorGoalNeighbors[0].y !== 13) {
    throw new Error('[Illuminauts map] Beacon Core must have exactly one entry through the bottom Laser Door.');
  }

  for (const goal of map.goals) {
    for (const tile of neighbors(goal.x, goal.y)) {
      if (isGoalAt(map, tile.x, tile.y)) continue;
      if (tile.x === door.x && tile.y === door.y) continue;
      if (!isWall(map, tile.x, tile.y)) {
        throw new Error('[Illuminauts map] Beacon Core has an unintended extra opening.');
      }
    }
  }

  const reachableWithoutDoors = flood(map, [map.start], false);
  if (!chips.some((c) => reachableWithoutDoors.has(key(c.x, c.y)))) {
    throw new Error('[Illuminauts map] No Access Chip reachable before the Laser Door.');
  }
  if (!reachableWithoutDoors.has(key(entryBelowDoor.x, entryBelowDoor.y))) {
    throw new Error('[Illuminauts map] Player cannot reach the Laser Door approach.');
  }

  const reachableWithDoor = flood(map, [map.start], true);
  const centerGoal = { x: 14, y: 11 };
  if (!reachableWithDoor.has(key(centerGoal.x, centerGoal.y))) {
    throw new Error('[Illuminauts map] Beacon Core not reachable after the Laser Door opens.');
  }
}

function neighbors(x, y) {
  return [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
}

function key(x, y) { return `${x},${y}`; }

function flood(map, starts, allowDoors) {
  const queue = starts.map((s) => ({ x: s.x, y: s.y }));
  const seen = new Set(queue.map((t) => key(t.x, t.y)));

  while (queue.length > 0) {
    const current = queue.shift();
    for (const next of neighbors(current.x, current.y)) {
      const nextKey = key(next.x, next.y);
      if (seen.has(nextKey)) continue;
      if (isWall(map, next.x, next.y)) continue;
      const door = getDoorAt(map, next.x, next.y);
      if (door && !allowDoors) continue;
      seen.add(nextKey);
      queue.push(next);
    }
  }
  return seen;
}
