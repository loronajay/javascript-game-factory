import { CONFIG } from './config.js';

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(node) {
    this.items.push(node);
    this.bubbleUp(this.items.length - 1);
  }
  pop() {
    if (this.items.length === 0) return null;
    const root = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return root;
  }
  bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].f <= this.items[index].f) break;
      [this.items[parent], this.items[index]] = [this.items[index], this.items[parent]];
      index = parent;
    }
  }
  sinkDown(index) {
    const len = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < len && this.items[left].f < this.items[smallest].f) smallest = left;
      if (right < len && this.items[right].f < this.items[smallest].f) smallest = right;
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [this.items[smallest], this.items[index]];
      index = smallest;
    }
  }
}

function heuristic(ax, ay, bx, by) {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return CONFIG.pathDiagonal ? Math.max(dx, dy) : dx + dy;
}

function nodeKey(x, y) {
  return y * 100000 + x;
}

export function findPath(map, startTile, goalTile, options = {}) {
  const clearance = Math.max(0, options.clearance ?? 0);
  const maxGoalSearchRadius = options.maxGoalSearchRadius ?? 18;
  const passable = (x, y) => {
    if (!map.isWalkableTile(x, y)) return false;
    if (clearance <= 0) return true;
    const c = map.tileCenter(x, y);
    return map.isCircleWalkable(c.x, c.y, clearance);
  };

  const correctedGoal = clearance > 0
    ? map.nearestWalkableTileForRadius(goalTile.x, goalTile.y, clearance, maxGoalSearchRadius)
    : map.nearestWalkableTile(goalTile.x, goalTile.y, maxGoalSearchRadius);

  if (!correctedGoal || !passable(startTile.x, startTile.y)) return [];
  const goal = correctedGoal;
  if (startTile.x === goal.x && startTile.y === goal.y) return [map.tileCenter(goal.x, goal.y)];

  const open = new MinHeap();
  const cameFrom = new Map();
  const gScore = new Map();
  const startKey = nodeKey(startTile.x, startTile.y);
  gScore.set(startKey, 0);
  open.push({ x: startTile.x, y: startTile.y, f: heuristic(startTile.x, startTile.y, goal.x, goal.y) });

  const dirs = CONFIG.pathDiagonal
    ? [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
    : [[1,0],[-1,0],[0,1],[0,-1]];

  let iterations = 0;
  const closed = new Set();

  while (open.size > 0 && iterations++ < CONFIG.pathMaxIterations) {
    const current = open.pop();
    const currentKey = nodeKey(current.x, current.y);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.x === goal.x && current.y === goal.y) {
      return reconstructPath(map, cameFrom, currentKey, current.x, current.y);
    }

    const baseG = gScore.get(currentKey) ?? Infinity;
    for (const [dx, dy] of dirs) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (!passable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        if (!passable(current.x + dx, current.y) || !passable(current.x, current.y + dy)) continue;
      }
      const nKey = nodeKey(nx, ny);
      if (closed.has(nKey)) continue;
      const stepCost = dx !== 0 && dy !== 0 ? 1.4142 : 1;
      const tentativeG = baseG + stepCost;
      if (tentativeG >= (gScore.get(nKey) ?? Infinity)) continue;
      cameFrom.set(nKey, { key: currentKey, x: current.x, y: current.y });
      gScore.set(nKey, tentativeG);
      open.push({ x: nx, y: ny, f: tentativeG + heuristic(nx, ny, goal.x, goal.y) });
    }
  }

  return [];
}

function reconstructPath(map, cameFrom, endKey, endX, endY) {
  const tiles = [{ x: endX, y: endY }];
  let key = endKey;
  while (cameFrom.has(key)) {
    const prev = cameFrom.get(key);
    tiles.push({ x: prev.x, y: prev.y });
    key = prev.key;
  }
  tiles.reverse();
  return simplifyPath(tiles).map((tile) => map.tileCenter(tile.x, tile.y));
}

function simplifyPath(tiles) {
  if (tiles.length <= 2) return tiles;
  const out = [tiles[0]];
  let lastDx = Math.sign(tiles[1].x - tiles[0].x);
  let lastDy = Math.sign(tiles[1].y - tiles[0].y);
  for (let i = 1; i < tiles.length - 1; i++) {
    const dx = Math.sign(tiles[i + 1].x - tiles[i].x);
    const dy = Math.sign(tiles[i + 1].y - tiles[i].y);
    if (dx !== lastDx || dy !== lastDy) {
      out.push(tiles[i]);
      lastDx = dx;
      lastDy = dy;
    }
  }
  out.push(tiles[tiles.length - 1]);
  return out;
}
