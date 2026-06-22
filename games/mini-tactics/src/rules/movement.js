import { UNIT_TYPES } from "../config.js";
import { tileKey } from "../geometry/isometric.js";
import { unitAt } from "../state/gameState.js";

const ORTHOGONAL_DIRECTIONS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1]
]);

export function getLegalMoves(state, unit) {
  const maxSteps = UNIT_TYPES[unit.type].moveRange;
  const startKey = tileKey(unit.x, unit.y);
  const visited = new Map([[startKey, 0]]);
  const queue = [{ x: unit.x, y: unit.y, distance: 0 }];
  const legal = new Set();

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.distance >= maxSteps) {
      continue;
    }

    for (const [dx, dy] of ORTHOGONAL_DIRECTIONS) {
      const nextX = current.x + dx;
      const nextY = current.y + dy;

      if (
        nextX < 0 ||
        nextY < 0 ||
        nextX >= state.size ||
        nextY >= state.size
      ) {
        continue;
      }

      const key = tileKey(nextX, nextY);

      if (visited.has(key) || unitAt(state, nextX, nextY)) {
        continue;
      }

      visited.set(key, current.distance + 1);
      queue.push({
        x: nextX,
        y: nextY,
        distance: current.distance + 1
      });
      legal.add(key);
    }
  }

  return legal;
}
