import { areAllies, areEnemies, getTileObject, isWallAt, unitAt } from "../core/state.js";
import { getArt, getArtMpCost, getCommandRangeBonus, getEffectiveStats, getRageArtRangeBonus, getRageEffectValue, getUnitAuraRadius, hasLivingStudiedTarget, isRaging, takesTurns } from "../core/unitCatalog.js";
import { getTileAffinity } from "../core/state.js";
import { ORTHOGONAL_DIRECTIONS, chebyshevDistance, isOnBoard, isOrthogonallyAdjacent, positionKey } from "./movement.js";
import { isStunned } from "./statuses.js";

export const FOOTWORK_DAMAGE = 3;
export const FLEE_RANGE_BONUS = 2;

export function getRushSteps(actor, art = getArt(actor.type, "footwork"), state = null) {
  const rageBonus = isRaging(actor) ? Math.max(0, Number(art?.rageExtraMove) || 0) : 0;
  return getEffectiveStats(actor, state).moveRange + (art?.extraMove ?? 0) + rageBonus;
}

export function getRushContactDamage(actor, art) {
  return (art?.contactDamage ?? FOOTWORK_DAMAGE) + Math.max(0, Number(getRageEffectValue(actor, "trampleDamage", 0)) || 0);
}

export function getFootworkSteps(actor) {
  return getRushSteps(actor, getArt(actor.type, "footwork"));
}

export function validateRushPath(state, actor, path, art = getArt(actor.type, "footwork")) {
  if (!Array.isArray(path) || path.length !== getRushSteps(actor, art, state)) return false;

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

export function validateFootworkPath(state, actor, path) {
  return validateRushPath(state, actor, path, getArt(actor.type, "footwork"));
}

export function getRushStepOptions(state, actor, path, art = getArt(actor.type, "footwork")) {
  if (path.length >= getRushSteps(actor, art, state)) return new Set();
  const prior = path.length ? path[path.length - 1] : actor.position;
  const visited = new Set([positionKey(actor.position), ...path.map(positionKey)]);
  const lastStep = path.length === getRushSteps(actor, art, state) - 1;
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

export function getFootworkStepOptions(state, actor, path) {
  return getRushStepOptions(state, actor, path, getArt(actor.type, "footwork"));
}

export function getConeAimOptions(state, actor) {
  return ORTHOGONAL_DIRECTIONS
    .map((direction) => ({ x: actor.position.x + direction.x, y: actor.position.y + direction.y }))
    .filter((position) => isOnBoard(state, position));
}

export function getVolleyShotAimOptions(state, actor) {
  return getConeAimOptions(state, actor);
}

function coneDepth(state, actor, artOrRange) {
  const base = Number.isFinite(artOrRange)
    ? artOrRange
    : Number.isFinite(artOrRange?.targeting?.range)
      ? artOrRange.targeting.range
      : 5;
  const rageBonus = !Number.isFinite(artOrRange) && isRaging(actor)
    ? Math.max(0, Number(artOrRange?.rageRangeBonus) || 0)
    : 0;
  return base + getCommandRangeBonus(state, actor) + rageBonus;
}

// The selected origin is the first cell in the rain. Each further row widens
// one tile to either side: 1, 3, 5, 7, then 9 cells across.
export function getConeCells(state, actor, origin, artOrRange = 5) {
  if (!origin || !isOnBoard(state, origin) || !isOrthogonallyAdjacent(actor.position, origin)) return null;
  const direction = { x: origin.x - actor.position.x, y: origin.y - actor.position.y };
  const perpendicular = { x: -direction.y, y: direction.x };
  const cells = [];

  // Higher Ground extends the rain's reach (an area ART, per the command's promise).
  const maxDepth = coneDepth(state, actor, artOrRange);
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

export function getVolleyShotCells(state, actor, origin) {
  return getConeCells(state, actor, origin, getArt(actor.type, "volley-shot") ?? 5);
}

export function getConeOriginForTarget(state, actor, targetPosition, artOrRange = 5) {
  if (!targetPosition || !isOnBoard(state, targetPosition)) return null;
  const targetKey = positionKey(targetPosition);
  for (const origin of getConeAimOptions(state, actor)) {
    if (getConeCells(state, actor, origin, artOrRange)?.some((cell) => positionKey(cell) === targetKey)) {
      return origin;
    }
  }
  return null;
}

export function getVolleyShotOriginForTarget(state, actor, targetPosition) {
  return getConeOriginForTarget(state, actor, targetPosition, getArt(actor.type, "volley-shot") ?? 5);
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

export function getArtTargetRange(state, actor, art) {
  const base = Number.isFinite(art?.targeting?.range)
    ? art.targeting.range
    : getEffectiveStats(actor, state).attackRange;
  return base + getCommandRangeBonus(state, actor) + getRageArtRangeBonus(actor);
}

function directionStep(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  return { x: Math.sign(dx), y: Math.sign(dy) };
}

export function getProtectLandingTiles(state, actor, ally, art = null) {
  art = art ?? getArt(actor?.type, "protect");
  const legal = new Set();
  if (!actor || !ally || actor.id === ally.id || ally.hp <= 0 || !areAllies(actor, ally)) return legal;
  if (chebyshevDistance(actor.position, ally.position) > getArtTargetRange(state, actor, art)) return legal;
  const step = directionStep(actor.position, ally.position);
  if (!step) return legal;
  const landing = { x: ally.position.x - step.x, y: ally.position.y - step.y };
  if (!isOnBoard(state, landing) || isWallAt(state, landing)) return legal;
  const occupant = unitAt(state, landing);
  if (occupant && occupant.id !== actor.id) return legal;
  legal.add(positionKey(landing));
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
export const LINE_DIRECTIONS = Object.freeze([
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

export function getDarkPulseTargets(state, actor) {
  return getDarkPulseRays(state, actor)
    .filter((ray) => ray.stopKind === "unit" && ray.unit)
    .map((ray) => ({ unit: ray.unit, dir: ray.dir, distance: ray.distance }));
}

export function getDarkPulseRays(state, actor) {
  const rays = [];
  if (!actor) return rays;
  for (const dir of LINE_DIRECTIONS) {
    let lastOnBoard = null;
    for (let d = 1; ; d += 1) {
      const pos = { x: actor.position.x + dir.x * d, y: actor.position.y + dir.y * d };
      if (!isOnBoard(state, pos)) {
        rays.push({ dir, distance: d - 1, stopKind: "border", position: lastOnBoard ?? { ...actor.position } });
        break;
      }
      lastOnBoard = pos;
      if (isWallAt(state, pos)) {
        rays.push({ dir, distance: d, stopKind: "wall", position: { ...pos } });
        break;
      }
      const occupant = unitAt(state, pos);
      if (occupant) {
        rays.push({ dir, distance: d, stopKind: "unit", position: { ...pos }, targetId: occupant.id, unit: occupant });
        break;
      }
    }
  }
  return rays;
}

// Flight (Gargoyle): empty on-board, non-wall tiles the Gargoyle can fly onto — a
// Chebyshev radius (diagonals allowed) of (effective Move + moveBonus). Move already
// folds Heavy's cap + any King MOVE buff via getEffectiveStats, so the reach can't
// drift from the live stat. Reuses the flee-style empty-tile sweep.
export function getFlightRange(state, actor, art) {
  return getEffectiveStats(actor, state).moveRange + (art?.targeting?.moveBonus ?? 1);
}
export function getFlightTiles(state, actor, art) {
  const range = getFlightRange(state, actor, art);
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

// Pyroclasm (Gargoyle): every ENEMY standing on any of the 8 straight rays within range.
// UNLIKE the Juggernaut's line targeting, the ray does NOT stop at the first body — it
// burns through units ("all enemies touching the lines"), so a screen of allies/enemies
// doesn't shield the ones behind them. Only a wall or the board edge stops a ray. Range
// folds Higher Ground + Volcanic Rage's +2 via getArtTargetRange.
export function getPyroclasmTargets(state, actor, art) {
  const reach = getArtTargetRange(state, actor, art);
  const targets = [];
  const seen = new Set();
  for (const dir of LINE_DIRECTIONS) {
    for (let d = 1; d <= reach; d += 1) {
      const pos = { x: actor.position.x + dir.x * d, y: actor.position.y + dir.y * d };
      if (!isOnBoard(state, pos)) break;
      if (isWallAt(state, pos)) break; // a wall stops the ray for everyone
      const occupant = unitAt(state, pos);
      if (occupant && areEnemies(actor, occupant) && !seen.has(occupant.id)) {
        seen.add(occupant.id);
        targets.push(occupant);
      }
    }
  }
  return targets;
}

// Every tile Pyroclasm's rays reach (for the range wash the player sees). Each ray runs
// to the board edge or a wall (exclusive); it does NOT stop at a unit, matching the burn.
export function getPyroclasmReachTiles(state, actor, art) {
  const reach = getArtTargetRange(state, actor, art);
  const tiles = [];
  for (const dir of LINE_DIRECTIONS) {
    for (let d = 1; d <= reach; d += 1) {
      const pos = { x: actor.position.x + dir.x * d, y: actor.position.y + dir.y * d };
      if (!isOnBoard(state, pos)) break;
      if (isWallAt(state, pos)) break;
      tiles.push(pos);
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

// Thunderous Charge (Clod): a targeted-tile blast Clod CHARGES to — he ends up standing on
// the tile, so it must be a clear landing spot. The pickable tiles are every on-board,
// non-wall tile within the art's reach (Chebyshev, Higher Ground + rage bonus folded via
// getArtTargetRange) that is empty OR the actor's own tile (charge in place). Any other
// occupant — ally or enemy — blocks it.
export function getTargetedBlastAimTiles(state, actor, art) {
  const reach = getArtTargetRange(state, actor, art);
  const tiles = new Set();
  for (let dx = -reach; dx <= reach; dx += 1) {
    for (let dy = -reach; dy <= reach; dy += 1) {
      const pos = { x: actor.position.x + dx, y: actor.position.y + dy };
      if (!isOnBoard(state, pos) || isWallAt(state, pos)) continue;
      const occupant = unitAt(state, pos);
      if (occupant && occupant.id !== actor.id) continue; // land only on a clear tile (or in place)
      tiles.add(positionKey(pos));
    }
  }
  return tiles;
}

// Every on-board tile within `radius` (Chebyshev) of a blast's center — the detonation
// footprint the board renderer previews on hover.
export function getTargetedBlastFootprint(state, center, radius) {
  const tiles = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const pos = { x: center.x + dx, y: center.y + dy };
      if (isOnBoard(state, pos)) tiles.push(pos);
    }
  }
  return tiles;
}

// Every enemy of `actor` caught inside a blast centered on `center` (Chebyshev radius).
export function getTargetedBlastTargets(state, actor, center, radius) {
  return state.units.filter((unit) =>
    unit.hp > 0 && areEnemies(actor, unit) &&
    Math.max(Math.abs(unit.position.x - center.x), Math.abs(unit.position.y - center.y)) <= radius);
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

// True when a targeted ART intentionally shoots through intervening units.
export function artPiercesUnits(art) {
  return Boolean(art?.effect?.pierceUnits);
}

export function artIsBodyBlocked(art) {
  return artUsesPhysicalStrike(art) && !artPiercesUnits(art);
}

// True when at least one living enemy of `actor` is poisoned — the gate for Virus's
// Explosion (requiresPoisonedEnemy), so the rage ultimate is only offered/accepted when
// it would actually detonate something.
export function hasPoisonedEnemy(state, actor) {
  return (state.units ?? []).some((unit) =>
    unit.hp > 0 && areEnemies(actor, unit) && (unit.statuses ?? []).some((status) => status.type === "poison"));
}

export function canUseArt(state, actor, artId) {
  const art = getArt(actor.type, artId);
  const activation = state.activation;
  const usedBonusGroups = activation?.bonusActionGroups ?? [];
  const moveAndArtAvailable = Boolean(
    getRageEffectValue(actor, "moveAndUseArts", false) &&
    activation?.unitId === actor.id &&
    !activation?.primaryUsed
  );
  const bonusActionAvailable = Boolean(
    art?.bonusActionGroup &&
    activation?.unitId === actor.id &&
    !usedBonusGroups.includes(art.bonusActionGroup)
  );
  const realmTraversalPulse = art?.id === "dark-pulse" &&
    activation?.unitId === actor.id &&
    activation?.realmTraversalActive &&
    !activation?.primaryUsed;
  const actionAvailable = art?.bonusActionGroup
    ? bonusActionAvailable
    : (moveAndArtAvailable || (!activation?.moved && !activation?.primaryUsed) || realmTraversalPulse);
  return Boolean(
    art?.implemented && art.kind === "active" &&
    activation?.unitId === actor.id &&
    actionAvailable &&
    !actor.spent &&
    !(isRaging(actor) && art.replacedByRageArt) &&
    !(art.id === "realm-traversal" && actor.realmTraversalLocked) &&
    !isStunned(actor) &&
    !actor.statuses?.some((status) => status.type === "silence") &&
    actor.mp >= getArtMpCost(actor, art, state) &&
    (!art.rageLocked || isRaging(actor)) &&
    (!art.requiresPoisonedEnemy || hasPoisonedEnemy(state, actor)) &&
    !(art.effect?.type === "studyTarget" && hasLivingStudiedTarget(actor, state)) &&
    !(art.effect?.type === "relayPower" && (actor.hp <= (art.effect.hp ?? 0) || actor.mp < (art.effect.mp ?? 0)))
  );
}
