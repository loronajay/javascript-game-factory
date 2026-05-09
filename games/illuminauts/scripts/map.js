export function createWorldMap(raw) {
  const tiles = raw.map((row) => row.split(''));
  const pickups = [];
  const doors = [];
  const goals = [];
  let start = { x: 1, y: 1 };
  let start2 = { x: 33, y: 1 };

  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      const cell = tiles[y][x];
      if (cell === 'S') {
        start = { x, y };
        tiles[y][x] = '.';
      } else if (cell === 'T') {
        start2 = { x, y };
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

  const map = { tiles, width: tiles[0].length, height: tiles.length, start, start2, pickups, doors, goals };
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

// DRAFT MODE: validation stripped to basics while map is being designed.
// Re-harden once the final map is confirmed.
function validateMap(map) {
  if (map.goals.length !== 25) throw new Error(`[Illuminauts map] Beacon Core must be 5×5. Found ${map.goals.length} tiles.`);
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
