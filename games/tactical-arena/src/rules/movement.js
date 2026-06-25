import { getEffectiveStats } from "../core/unitCatalog.js";
import { unitAt } from "../core/state.js";

export const ORTHOGONAL_DIRECTIONS = Object.freeze([
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }
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

export function getLegalMoves(state, unit) {
  const maxSteps = getEffectiveStats(unit, state).moveRange;
  const queue = [{ ...unit.position, distance: 0 }];
  const visited = new Set([positionKey(unit.position)]);
  const legal = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.distance === maxSteps) continue;

    for (const direction of ORTHOGONAL_DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      const key = positionKey(next);
      if (!isOnBoard(state, next) || visited.has(key) || unitAt(state, next)) continue;
      visited.add(key);
      legal.add(key);
      queue.push({ ...next, distance: current.distance + 1 });
    }
  }
  return legal;
}
