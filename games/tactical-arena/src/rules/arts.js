import { areEnemies, unitAt } from "../core/state.js";
import { getArt, getEffectiveStats } from "../core/unitCatalog.js";
import { ORTHOGONAL_DIRECTIONS, isOnBoard, isOrthogonallyAdjacent, positionKey } from "./movement.js";

export const FOOTWORK_DAMAGE = 2;

export function getFootworkSteps(actor) {
  const footwork = getArt(actor.type, "footwork");
  return getEffectiveStats(actor).moveRange + (footwork?.extraMove ?? 0);
}

export function validateFootworkPath(state, actor, path) {
  if (!Array.isArray(path) || path.length !== getFootworkSteps(actor)) return false;

  let previous = actor.position;
  const visited = new Set([positionKey(actor.position)]);
  for (let index = 0; index < path.length; index += 1) {
    const step = path[index];
    const key = positionKey(step);
    if (!isOnBoard(state, step) || visited.has(key) || !isOrthogonallyAdjacent(previous, step)) return false;

    const occupant = unitAt(state, step);
    const isFinalStep = index === path.length - 1;
    if (occupant && (!areEnemies(actor, occupant) || isFinalStep)) return false;
    visited.add(key);
    previous = step;
  }
  return true;
}

export function getFootworkStepOptions(state, actor, path) {
  if (path.length >= getFootworkSteps(actor)) return new Set();
  const prior = path.length ? path[path.length - 1] : actor.position;
  const visited = new Set([positionKey(actor.position), ...path.map(positionKey)]);
  const lastStep = path.length === getFootworkSteps(actor) - 1;
  const options = new Set();

  for (const candidate of [
    { x: prior.x + 1, y: prior.y }, { x: prior.x - 1, y: prior.y },
    { x: prior.x, y: prior.y + 1 }, { x: prior.x, y: prior.y - 1 }
  ]) {
    if (!isOnBoard(state, candidate) || visited.has(positionKey(candidate))) continue;
    const occupant = unitAt(state, candidate);
    if (occupant && (!areEnemies(actor, occupant) || lastStep)) continue;
    options.add(positionKey(candidate));
  }
  return options;
}

export function getVolleyShotAimOptions(state, actor) {
  return ORTHOGONAL_DIRECTIONS
    .map((direction) => ({ x: actor.position.x + direction.x, y: actor.position.y + direction.y }))
    .filter((position) => isOnBoard(state, position));
}

// The selected origin is the first cell in the rain. Each further row widens
// one tile to either side: 1, 3, 5, 7, then 9 cells across.
export function getVolleyShotCells(state, actor, origin) {
  if (!origin || !isOnBoard(state, origin) || !isOrthogonallyAdjacent(actor.position, origin)) return null;
  const direction = { x: origin.x - actor.position.x, y: origin.y - actor.position.y };
  const perpendicular = { x: -direction.y, y: direction.x };
  const cells = [];

  for (let depth = 1; depth <= 5; depth += 1) {
    for (let offset = -(depth - 1); offset <= depth - 1; offset += 1) {
      const position = {
        x: actor.position.x + direction.x * depth + perpendicular.x * offset,
        y: actor.position.y + direction.y * depth + perpendicular.y * offset
      };
      if (isOnBoard(state, position)) cells.push(position);
    }
  }
  return cells;
}

export function canUseArt(state, actor, artId) {
  const art = getArt(actor.type, artId);
  return Boolean(
    art?.implemented && art.kind === "active" &&
    state.activation?.unitId === actor.id &&
    !state.activation.moved &&
    !state.activation.primaryUsed &&
    !actor.spent &&
    !actor.statuses?.some((status) => status.type === "silence") &&
    actor.mp >= art.mpCost
  );
}
