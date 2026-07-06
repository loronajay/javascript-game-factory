import { getEffectiveStats, getUnitType } from "../core/unitCatalog.js";
import { isWallAt, unitAt } from "../core/state.js";

export const ORTHOGONAL_DIRECTIONS = Object.freeze([
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
]);

export const ALL_DIRECTIONS = Object.freeze([
  ...ORTHOGONAL_DIRECTIONS,
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
]);

export function positionKey({ x, y }) {
  return `${x},${y}`;
}

export function isOnBoard(state, { x, y }) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < state.size && y < state.size;
}

export function isOrthogonallyAdjacent(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// Bresenham grid line between two cells, inclusive of both endpoints. The body-block
// line-of-sight check walks this and looks for an occupant on any tile strictly
// between the attacker and its target. Pure geometry — no board/unit state.
export function traceGridLine(x0, y0, x1, y1) {
  const cells = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    cells.push({ x, y });
    if (x === x1 && y === y1) break;
    const doubleError = 2 * error;
    if (doubleError >= dy) { error += dy; x += sx; }
    if (doubleError <= dx) { error += dx; y += sy; }
  }
  return cells;
}

export function getLegalMoves(state, unit) {
  const maxSteps = getEffectiveStats(unit, state).moveRange;
  if (getUnitType(unit.type).passive?.effect?.type === "movementShape" &&
      getUnitType(unit.type).passive.effect.shape === "radius") {
    const legal = new Set();
    for (let dx = -maxSteps; dx <= maxSteps; dx += 1) {
      for (let dy = -maxSteps; dy <= maxSteps; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > maxSteps) continue;
        const pos = { x: unit.position.x + dx, y: unit.position.y + dy };
        if (!isOnBoard(state, pos) || unitAt(state, pos) || isWallAt(state, pos)) continue;
        legal.add(positionKey(pos));
      }
    }
    return legal;
  }
  const queue = [{ ...unit.position, distance: 0 }];
  const visited = new Set([positionKey(unit.position)]);
  const legal = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.distance === maxSteps) continue;

    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = positionKey(next);
      // A wall occupies its tile like a body: you can't step onto it or path through it.
      if (!isOnBoard(state, next) || visited.has(key) || unitAt(state, next) || isWallAt(state, next)) continue;
      visited.add(key);
      legal.add(key);
      queue.push({ ...next, distance: current.distance + 1 });
    }
  }
  return legal;
}
