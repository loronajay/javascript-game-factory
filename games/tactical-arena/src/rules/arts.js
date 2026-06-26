import { areEnemies, unitAt } from "../core/state.js";
import { getArt, getEffectiveStats, isRaging } from "../core/unitCatalog.js";
import { getTileAffinity } from "../core/state.js";
import { ORTHOGONAL_DIRECTIONS, isOnBoard, isOrthogonallyAdjacent, positionKey } from "./movement.js";

export const FOOTWORK_DAMAGE = 2;
export const FLEE_RANGE_BONUS = 2;

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

export function getLegalFleeTiles(state, actor) {
  const range = getEffectiveStats(actor).moveRange + FLEE_RANGE_BONUS;
  const legal = new Set();
  for (let dx = -range; dx <= range; dx += 1) {
    for (let dy = -range; dy <= range; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > range) continue;
      if (dx === 0 && dy === 0) continue;
      const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (!isOnBoard(state, pos) || unitAt(state, pos)) continue;
      legal.add(positionKey(pos));
    }
  }
  return legal;
}

// Empty on-board tiles within an ART's placement radius (Summon Ghoul). The
// Necromancer raises a Ghoul on one of these; occupied tiles and off-board cells
// are excluded. Chebyshev radius, like the rest of the targeting geometry.
export function getSummonPlacementTiles(state, actor, art) {
  const radius = art?.targeting?.radius ?? 2;
  const tiles = new Set();
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      if (dx === 0 && dy === 0) continue;
      const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (!isOnBoard(state, pos) || unitAt(state, pos)) continue;
      tiles.add(positionKey(pos));
    }
  }
  return tiles;
}

export function getTilePulseTargets(state, actor, art) {
  const effect = art.effect;
  if (effect?.type !== "tilePulse") return [];
  return state.units.filter((target) =>
    target.hp > 0 &&
    areEnemies(actor, target) &&
    getTileAffinity(state, target.position) === effect.affinity &&
    (effect.global || Math.max(
      Math.abs(actor.position.x - target.position.x),
      Math.abs(actor.position.y - target.position.y)
    ) <= effect.range)
  );
}

export function canUseArt(state, actor, artId) {
  const art = getArt(actor.type, artId);
  const activation = state.activation;
  const usedBonusGroups = activation?.bonusActionGroups ?? [];
  const bonusActionAvailable = Boolean(
    art?.bonusActionGroup &&
    activation?.unitId === actor.id &&
    !usedBonusGroups.includes(art.bonusActionGroup)
  );
  const actionAvailable = art?.bonusActionGroup
    ? bonusActionAvailable
    : (!activation?.moved && !activation?.primaryUsed);
  return Boolean(
    art?.implemented && art.kind === "active" &&
    activation?.unitId === actor.id &&
    actionAvailable &&
    !actor.spent &&
    !actor.statuses?.some((status) => status.type === "silence") &&
    actor.mp >= art.mpCost &&
    (!art.rageLocked || isRaging(actor))
  );
}
