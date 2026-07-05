import { areAllies, areEnemies, getTileObject, isWallAt, unitAt } from "../core/state.js";
import { getArt, getArtMpCost, getCommandRangeBonus, getEffectiveStats, getUnitAuraRadius, isRaging, takesTurns } from "../core/unitCatalog.js";
import { getTileAffinity } from "../core/state.js";
import { ORTHOGONAL_DIRECTIONS, isOnBoard, isOrthogonallyAdjacent, positionKey } from "./movement.js";
import { isStunned } from "./statuses.js";

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
    if (isWallAt(state, step)) return false; // a wall blocks a Footwork step like a body

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
    if (!isOnBoard(state, candidate) || visited.has(positionKey(candidate)) || isWallAt(state, candidate)) continue;
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

  // Higher Ground extends the rain's reach (an area ART, per the command's promise).
  const maxDepth = 5 + getCommandRangeBonus(state, actor);
  for (let depth = 1; depth <= maxDepth; depth += 1) {
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
      if (!isOnBoard(state, pos) || unitAt(state, pos) || isWallAt(state, pos)) continue;
      legal.add(positionKey(pos));
    }
  }
  return legal;
}

// Empty on-board tiles within an ART's placement radius (Summon Ghoul). The
// Necromancer raises a Ghoul on one of these; occupied tiles and off-board cells
// are excluded. Chebyshev radius, like the rest of the targeting geometry.
export function getSummonPlacementTiles(state, actor, art) {
  const radius = (art?.targeting?.radius ?? 2) + getCommandRangeBonus(state, actor);
  const tiles = new Set();
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      if (dx === 0 && dy === 0) continue;
      const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (!isOnBoard(state, pos) || unitAt(state, pos) || isWallAt(state, pos)) continue;
      tiles.add(positionKey(pos));
    }
  }
  return tiles;
}

// Shared Chebyshev-radius tile sweep around an actor, keeping only on-board tiles
// (never the actor's own tile) that pass `predicate`. Backs the Sniper's placement
// ARTS so wall vs fire only differ by their rule.
function tilesInRadius(state, actor, radius, predicate) {
  const tiles = new Set();
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > radius) continue;
      if (dx === 0 && dy === 0) continue;
      const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (!isOnBoard(state, pos)) continue;
      if (predicate(pos)) tiles.add(positionKey(pos));
    }
  }
  return tiles;
}

// Father Time's Rewind revives a FALLEN ally: the pickable targets are this player's
// dead commanders (a turn-less summon like a Ghoul can't be revived). Corpses persist
// in state.units, so they are found here by scanning for hp <= 0 allies.
export function getReviveTargets(state, actor) {
  return state.units.filter((unit) =>
    unit.hp <= 0 &&
    areAllies(unit, actor) &&
    unit.id !== actor.id &&
    takesTurns(unit));
}

// Legal tiles a revived ally can be placed on: empty on-board tiles within the art's
// Chebyshev radius. Identical rule to a Ghoul summon, so it reuses that sweep.
export function getRevivePlacementTiles(state, actor, art) {
  return getSummonPlacementTiles(state, actor, art);
}

// Build Cover places a solid wall, so it needs a clear floor tile: no unit and no
// existing tile object. Chebyshev radius from the art (default 3).
export function getWallPlacementTiles(state, actor, art) {
  return tilesInRadius(state, actor, (art?.targeting?.radius ?? 3) + getCommandRangeBonus(state, actor), (pos) =>
    !unitAt(state, pos) && !getTileObject(state, pos));
}

// Throw Cigar drops a hazard, so it may land on an OCCUPIED tile (fire at an enemy's
// feet) — it only avoids a wall or an existing fire. Chebyshev radius (default 4).
export function getFirePlacementTiles(state, actor, art) {
  return tilesInRadius(state, actor, (art?.targeting?.radius ?? 4) + getCommandRangeBonus(state, actor), (pos) => !getTileObject(state, pos));
}

// The 8 straight rays (orthogonal + diagonal) a line ability fires along.
const LINE_DIRECTIONS = Object.freeze([
  { x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 },
  { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }
]);

// The FIRST unit contacted along each of the 8 straight rays from `actor`, within
// `range` tiles. A wall or the board edge stops a ray. `includeAllies` decides whether a
// friendly first-contact counts as a target: Tether Grab grabs anyone (true), Rocket
// Punch's shot is blocked by an ally (false). Returns [{ unit, dir, distance }]; the pull
// destination for a grab is `actor.position + dir` (the tile one step along the ray).
export function getLineTargets(state, actor, range, { includeAllies = false } = {}) {
  const targets = [];
  const reach = range + getCommandRangeBonus(state, actor);
  for (const dir of LINE_DIRECTIONS) {
    for (let d = 1; d <= reach; d += 1) {
      const pos = { x: actor.position.x + dir.x * d, y: actor.position.y + dir.y * d };
      if (!isOnBoard(state, pos)) break;
      if (isWallAt(state, pos)) break; // a wall stops the ray for everyone
      const occupant = unitAt(state, pos);
      if (occupant) {
        if (includeAllies || areEnemies(actor, occupant)) targets.push({ unit: occupant, dir, distance: d });
        break; // first contact ends the ray regardless of team
      }
    }
  }
  return targets;
}

// Every tile a line ability can REACH along its 8 straight rays, for the range wash the
// player sees when aiming Tether Grab / Rocket Punch. Each ray stops at the board edge or
// a wall (exclusive) and ends AT the first unit it contacts (inclusive — that unit's tile
// is a valid endpoint). Team-agnostic on purpose: the reach reads the same for both line
// arts even with nothing in line, so the ability never looks inert; getLineTargets decides
// which of these tiles is an actual legal target (bright), this just paints the reach.
export function getLineReachTiles(state, actor, range) {
  const tiles = [];
  const reach = range + getCommandRangeBonus(state, actor);
  for (const dir of LINE_DIRECTIONS) {
    for (let d = 1; d <= reach; d += 1) {
      const pos = { x: actor.position.x + dir.x * d, y: actor.position.y + dir.y * d };
      if (!isOnBoard(state, pos)) break;
      if (isWallAt(state, pos)) break; // a wall stops the ray for everyone
      tiles.push(pos);
      if (unitAt(state, pos)) break; // first contact ends the ray (its tile is included)
    }
  }
  return tiles;
}

export function getTilePulseTargets(state, actor, art) {
  const effect = art.effect;
  if (effect?.type !== "tilePulse") return [];
  const range = effect.range + getCommandRangeBonus(state, actor);
  return state.units.filter((target) =>
    target.hp > 0 &&
    areEnemies(actor, target) &&
    getTileAffinity(state, target.position) === effect.affinity &&
    (effect.global || Math.max(
      Math.abs(actor.position.x - target.position.x),
      Math.abs(actor.position.y - target.position.y)
    ) <= range)
  );
}

export function getSelfBlastRadius(state, actor, art) {
  // Higher Ground widens a self-centred blast (Nuke/Dark Bomb/Self Destruct) — an area ART.
  const bonus = getCommandRangeBonus(state, actor);
  const baseRadius = (art?.targeting?.radius ?? 0) + bonus;
  if (art?.targeting?.shape !== "nukeAura") return baseRadius;
  if (!art.targeting.matchAuraRadius) return baseRadius;
  return Math.max(baseRadius, getUnitAuraRadius(actor, state) + bonus);
}

// True when a targeted ART lands a real physical attack (the same path the basic
// ATTACK takes) and is therefore body-blockable. Magic ARTS (Spark, Banish — a
// `damageType` of "magic") and pure casts (Silence — `resolution: "statusCast"`)
// reach their target directly and are never blocked. Callers must already have
// excluded heal/flee/summon/AoE modes (see isTargetedMode) before consulting this.
export function artUsesPhysicalStrike(art) {
  return Boolean(
    art &&
    art.kind === "active" &&
    (art.damageType ?? "physical") === "physical" &&
    art.resolution !== "statusCast"
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
    !isStunned(actor) &&
    !actor.statuses?.some((status) => status.type === "silence") &&
    actor.mp >= getArtMpCost(actor, art) &&
    (!art.rageLocked || isRaging(actor))
  );
}
