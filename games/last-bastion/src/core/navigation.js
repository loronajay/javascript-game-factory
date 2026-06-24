import { WORLD, isWorldWalkable } from '../data/map.js';

const COLS = 32;
const ROWS = 45;
const DIRECTIONS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

function key(col, row) {
  return row * COLS + col;
}

function fromKey(value) {
  return { col: value % COLS, row: Math.floor(value / COLS) };
}

function heuristic(a, b) {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

export class Navigator {
  constructor(clearance = 20, map = null, { allowRouteCorridor = false } = {}) {
    this.clearance = clearance;
    this.map = map;
    this.allowRouteCorridor = allowRouteCorridor;
    this.world = map?.world ?? WORLD;
    this.cellWidth = this.world.width / COLS;
    this.cellHeight = this.world.height / ROWS;
    this.walkable = new Uint8Array(COLS * ROWS);
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        const point = this.center(col, row);
        this.walkable[key(col, row)] = isWorldWalkable(point.x, point.y, clearance, this.map, {
          allowRouteCorridor: this.allowRouteCorridor,
        }) ? 1 : 0;
      }
    }
  }

  center(col, row) {
    return { x: (col + 0.5) * this.cellWidth, y: (row + 0.5) * this.cellHeight };
  }

  cellFor(point) {
    return {
      col: Math.max(0, Math.min(COLS - 1, Math.floor(point.x / this.cellWidth))),
      row: Math.max(0, Math.min(ROWS - 1, Math.floor(point.y / this.cellHeight))),
    };
  }

  nearestWalkable(point) {
    const initial = this.cellFor(point);
    if (this.walkable[key(initial.col, initial.row)]) return initial;
    for (let radius = 1; radius < 8; radius += 1) {
      for (let row = initial.row - radius; row <= initial.row + radius; row += 1) {
        for (let col = initial.col - radius; col <= initial.col + radius; col += 1) {
          if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
          if (Math.abs(col - initial.col) !== radius && Math.abs(row - initial.row) !== radius) continue;
          if (this.walkable[key(col, row)]) return { col, row };
        }
      }
    }
    return null;
  }

  findPath(startPoint, endPoint) {
    const start = this.nearestWalkable(startPoint);
    const goal = this.nearestWalkable(endPoint);
    if (!start || !goal) return [];
    const destination = isWorldWalkable(
      endPoint.x,
      endPoint.y,
      this.clearance,
      this.map,
      { allowRouteCorridor: this.allowRouteCorridor },
    ) ? { x: endPoint.x, y: endPoint.y } : this.center(goal.col, goal.row);
    const startKey = key(start.col, start.row);
    const goalKey = key(goal.col, goal.row);
    if (startKey === goalKey) return [destination];

    const open = new Set([startKey]);
    const cameFrom = new Int32Array(COLS * ROWS);
    const gScore = new Float64Array(COLS * ROWS);
    const fScore = new Float64Array(COLS * ROWS);
    cameFrom.fill(-1);
    gScore.fill(Infinity);
    fScore.fill(Infinity);
    gScore[startKey] = 0;
    fScore[startKey] = heuristic(start, goal);

    while (open.size > 0) {
      let currentKey = -1;
      let currentScore = Infinity;
      for (const candidate of open) {
        if (fScore[candidate] < currentScore) {
          currentScore = fScore[candidate];
          currentKey = candidate;
        }
      }
      if (currentKey === goalKey) return this.reconstruct(cameFrom, currentKey, destination);
      open.delete(currentKey);
      const current = fromKey(currentKey);

      for (const [dc, dr, movementCost] of DIRECTIONS) {
        const col = current.col + dc;
        const row = current.row + dr;
        if (col < 0 || col >= COLS || row < 0 || row >= ROWS) continue;
        const neighborKey = key(col, row);
        if (!this.walkable[neighborKey]) continue;
        if (dc !== 0 && dr !== 0) {
          if (!this.walkable[key(current.col + dc, current.row)] || !this.walkable[key(current.col, current.row + dr)]) continue;
        }
        const tentative = gScore[currentKey] + movementCost;
        if (tentative >= gScore[neighborKey]) continue;
        cameFrom[neighborKey] = currentKey;
        gScore[neighborKey] = tentative;
        fScore[neighborKey] = tentative + heuristic({ col, row }, goal);
        open.add(neighborKey);
      }
    }
    return [];
  }

  reconstruct(cameFrom, currentKey, destination) {
    const path = [];
    let cursor = currentKey;
    while (cursor !== -1) {
      const cell = fromKey(cursor);
      path.push(this.center(cell.col, cell.row));
      cursor = cameFrom[cursor];
    }
    path.reverse();
    path.shift();
    path.push(destination);
    return this.simplify(path);
  }

  simplify(path) {
    if (path.length < 3) return path;
    const result = [path[0]];
    let previousDirection = null;
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1];
      const current = path[i];
      const direction = `${Math.sign(current.x - previous.x)},${Math.sign(current.y - previous.y)}`;
      if (previousDirection !== null && direction !== previousDirection) result.push(previous);
      previousDirection = direction;
    }
    result.push(path[path.length - 1]);
    return result;
  }
}
