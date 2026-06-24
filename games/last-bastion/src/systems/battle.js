import { UNIT_TYPES, matchupMultiplier } from '../data/units.js';
import { BASE, getPathById, isWorldWalkable } from '../data/map.js';
import { clamp, distSq } from '../core/math.js';
import {
  addHitEffect,
  addExplosionEffect,
  addMeleeSwingEffect,
  launchProjectile,
  updateCombatEffects,
} from './effects.js';

let nextId = 1;

export function createUnit({ side, type, x, y, pathId = null, hpScale = 1, damageScale = 1, map = null }) {
  const data = UNIT_TYPES[type];
  const scaledMaxHp = Math.max(1, Math.round(data.maxHp * hpScale));
  const route = side === 'enemy' ? getPathById(pathId, map) : null;
  return {
    id: nextId++,
    side,
    type,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: side === 'enemy' ? -Math.PI / 2 : Math.PI / 2,
    hp: scaledMaxHp,
    maxHp: scaledMaxHp,
    damageScale,
    attackTimer: 0,
    windupTimer: 0,
    windupTargetId: null,
    targetId: null,
    state: side === 'enemy' ? 'advancing' : 'holding',
    order: side === 'enemy' ? 'advance' : 'hold',
    movePath: [],
    moveIndex: 0,
    focusTargetId: null,
    guardTargetId: null,
    navigationGoal: null,
    repathTimer: 0,
    route,
    routeIndex: 1,
    routePlanReady: false,
    flash: 0,
    armTimer: data.armTime ?? 0,
    dead: false,
  };
}

export function assignMoveOrder(unit, path) {
  unit.order = 'move';
  unit.state = 'moving';
  unit.movePath = path;
  unit.moveIndex = 0;
  unit.focusTargetId = null;
  unit.guardTargetId = null;
}

export function assignHoldOrder(unit) {
  unit.order = 'hold';
  unit.state = 'holding';
  unit.movePath = [];
  unit.moveIndex = 0;
  unit.focusTargetId = null;
  unit.guardTargetId = null;
}

export function assignGuardOrder(unit, ally) {
  unit.order = 'guard';
  unit.state = 'guarding';
  unit.guardTargetId = ally.id;
  unit.focusTargetId = null;
  unit.movePath = [];
  unit.moveIndex = 0;
  unit.repathTimer = 0;
}

export function assignAttackOrder(unit, enemy) {
  unit.order = 'attack';
  unit.state = 'pursuing';
  unit.focusTargetId = enemy.id;
  unit.guardTargetId = null;
  unit.movePath = [];
  unit.moveIndex = 0;
  unit.repathTimer = 0;
}

export function assignRetreatOrder(game, unit) {
  const base = game.map?.base ?? BASE;
  const destination = {
    x: base.x + (unit.x < base.x ? -78 : 78),
    y: base.y + 112,
  };
  const path = game.navigator.findPath(unit, destination);
  unit.order = 'retreat';
  unit.state = 'retreating';
  unit.movePath = path;
  unit.moveIndex = 0;
  unit.focusTargetId = null;
  unit.guardTargetId = null;
}

export function updateBattle(game, dt) {
  const units = game.units;
  const byId = new Map(units.map((unit) => [unit.id, unit]));

  for (const unit of units) {
    unit.prevX = unit.x;
    unit.prevY = unit.y;
    unit.flash = Math.max(0, unit.flash - dt);
    unit.attackTimer = Math.max(0, unit.attackTimer - dt);
    unit.repathTimer = Math.max(0, unit.repathTimer - dt);
    if (unit.dead) continue;

    const data = UNIT_TYPES[unit.type];
    if (data.trap) {
      updateTrap(game, unit, units, dt);
      continue;
    }
    const currentWindupTarget = byId.get(unit.windupTargetId);
    if (unit.windupTimer > 0) {
      unit.windupTimer -= dt;
      unit.state = 'attacking';
      if (unit.windupTimer <= 0) {
        if (currentWindupTarget && !currentWindupTarget.dead && inAttackRange(unit, currentWindupTarget, data)) {
          resolveAttack(game, unit, currentWindupTarget);
        }
        unit.attackTimer = data.attackCooldown;
        unit.windupTargetId = null;
      }
      continue;
    }

    const target = chooseTarget(unit, units, byId);
    unit.targetId = target?.id ?? null;

    if (target && inAttackRange(unit, target, data)) {
      faceToward(unit, target);
      if (unit.attackTimer <= 0) {
        unit.windupTimer = data.windup;
        unit.windupTargetId = target.id;
        unit.state = 'attacking';
      } else {
        unit.state = 'engaged';
      }
      continue;
    }

    if (unit.side === 'player') updatePlayerMovement(game, unit, target, byId, dt);
    else updateEnemyMovement(game, unit, target, dt);
  }

  applyUnitSeparation(units, game.map);
  updateCombatEffects(game, dt);

  for (const unit of units) {
    if (!unit.dead && unit.hp <= 0) killUnit(game, unit);
  }

  game.units = units.filter((unit) => !unit.dead);
}

function chooseTarget(unit, units, byId) {
  const data = UNIT_TYPES[unit.type];
  if (unit.side === 'player') {
    if (unit.order === 'attack') {
      const focused = byId.get(unit.focusTargetId);
      if (focused && !focused.dead && focused.side === 'enemy') return focused;
      assignHoldOrder(unit);
    }

    if (unit.order === 'guard') {
      const ally = byId.get(unit.guardTargetId);
      if (!ally || ally.dead || ally.side !== 'player') assignHoldOrder(unit);
      else {
        const threat = nearestEnemy(unit, units, 146, ally);
        if (threat) return threat;
      }
    }

    return nearestEnemy(unit, units, data.range + data.radius + 24);
  }

  return nearestEnemy(unit, units, 112);
}

function nearestEnemy(unit, units, maxDistance, anchor = unit) {
  const maxDistanceSq = maxDistance * maxDistance;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of units) {
    if (candidate.dead || candidate.side === unit.side) continue;
    if (UNIT_TYPES[candidate.type].trap && candidate.armTimer > 0) continue;
    const d = distSq(anchor, candidate);
    if (d <= maxDistanceSq && d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }
  return best;
}


function faceToward(unit, target) {
  const dx = target.x - unit.x;
  const dy = target.y - unit.y;
  if (Math.abs(dx) + Math.abs(dy) > 0.01) unit.facing = Math.atan2(dy, dx);
}

function inAttackRange(attacker, defender, attackerData) {
  const defenderData = UNIT_TYPES[defender.type];
  const range = attackerData.range + attackerData.radius + defenderData.radius;
  return distSq(attacker, defender) <= range * range;
}

function updatePlayerMovement(game, unit, target, byId, dt) {
  const data = UNIT_TYPES[unit.type];

  if (data.stationary) {
    unit.state = 'holding';
    unit.movePath = [];
    unit.moveIndex = 0;
    return;
  }

  if (unit.order === 'attack' && target) {
    if (unit.repathTimer <= 0 || unit.movePath.length === 0) {
      const path = game.navigator.findPath(unit, target);
      unit.movePath = path;
      unit.moveIndex = 0;
      unit.repathTimer = 0.42;
    }
    unit.state = 'pursuing';
    followMovePath(unit, dt, data.speed, game.map);
    return;
  }

  if (unit.order === 'guard') {
    const ally = byId.get(unit.guardTargetId);
    if (!ally || ally.dead) {
      assignHoldOrder(unit);
      return;
    }
    const guardDistanceSq = distSq(unit, ally);
    if (target) {
      if (unit.repathTimer <= 0 || unit.movePath.length === 0) {
        unit.movePath = game.navigator.findPath(unit, target);
        unit.moveIndex = 0;
        unit.repathTimer = 0.5;
      }
      unit.state = 'guarding';
      followMovePath(unit, dt, data.speed, game.map);
      return;
    }
    if (guardDistanceSq > 82 * 82) {
      if (unit.repathTimer <= 0 || unit.movePath.length === 0) {
        const angle = unit.id % 2 === 0 ? -0.6 : 0.6;
        const destination = {
          x: ally.x + Math.cos(angle) * 54,
          y: ally.y + Math.sin(angle) * 54,
        };
        unit.movePath = game.navigator.findPath(unit, destination);
        unit.moveIndex = 0;
        unit.repathTimer = 0.65;
      }
      unit.state = 'guarding';
      followMovePath(unit, dt, data.speed, game.map);
    } else {
      unit.state = 'guarding';
      unit.movePath = [];
      unit.moveIndex = 0;
    }
    return;
  }

  if (unit.order === 'move' || unit.order === 'retreat') {
    const completed = followMovePath(unit, dt, data.speed, game.map);
    if (completed) assignHoldOrder(unit);
    return;
  }

  unit.state = 'holding';
}

function updateTrap(game, unit, units, dt) {
  const data = UNIT_TYPES[unit.type];
  if (unit.armTimer > 0) {
    unit.armTimer = Math.max(0, unit.armTimer - dt);
    unit.state = 'arming';
    return;
  }

  const target = units.find((candidate) => (
    !candidate.dead
    && candidate.side !== unit.side
    && distSq(unit, candidate) <= (data.triggerRadius + UNIT_TYPES[candidate.type].radius) ** 2
  ));
  if (!target) {
    unit.state = 'armed';
    return;
  }

  for (const candidate of units) {
    if (candidate.dead || candidate.side === unit.side || distSq(unit, candidate) > data.blastRadius ** 2) continue;
    const defendData = UNIT_TYPES[candidate.type];
    const damage = Math.max(1, data.damage - defendData.armor);
    candidate.hp = clamp(candidate.hp - damage, 0, candidate.maxHp);
    candidate.flash = 0.18;
    addHitEffect(game, {
      x: candidate.x,
      y: candidate.y,
      damage,
      side: unit.side,
    });
  }
  addExplosionEffect(game, { x: unit.x, y: unit.y, side: unit.side, radius: data.blastRadius });
  game.playSound?.('critical-hit');
  unit.dead = true;
}

function updateEnemyMovement(game, unit, target, dt) {
  const data = UNIT_TYPES[unit.type];
  const base = game.map?.base ?? BASE;

  if (target && canStepToward(unit, target, dt, data.speed * 0.92, game.map)) {
    unit.state = 'engaging';
    moveDirect(unit, target, dt, data.speed * 0.92, game.map);
    return;
  }

  unit.state = 'advancing';
  const route = unit.route;
  if (!route || unit.routeIndex >= route.points.length) {
    damageBase(game, (data.damage + 8) * unit.damageScale);
    unit.dead = true;
    return;
  }

  const reached = followEnemyRoute(game, unit, dt, data.speed);
  if (reached || distSq(unit, base) <= (base.radius + data.radius) ** 2) {
    damageBase(game, (data.damage + 8) * unit.damageScale);
    unit.dead = true;
  }
}

// Kept for route diagnostics and editor tooling. Runtime movement pathfinds to
// the next authored waypoint instead, so terrain detours are never pulled back
// onto a line that crosses a blocking feature.
export function getEnemyRouteRecoveryPoint(unit, maximumOffset = 36) {
  const route = unit.route;
  if (!route || unit.routeIndex <= 0 || unit.routeIndex >= route.points.length) return null;

  const start = route.points[unit.routeIndex - 1];
  const end = route.points[unit.routeIndex];
  const vx = end.x - start.x;
  const vy = end.y - start.y;
  const lengthSq = vx * vx + vy * vy || 1;
  const t = clamp(((unit.x - start.x) * vx + (unit.y - start.y) * vy) / lengthSq, 0, 1);
  const x = start.x + vx * t;
  const y = start.y + vy * t;
  const dx = unit.x - x;
  const dy = unit.y - y;
  return dx * dx + dy * dy > maximumOffset * maximumOffset ? { x, y } : null;
}

function followMovePath(unit, dt, speed, map = null) {
  if (!unit.movePath.length || unit.moveIndex >= unit.movePath.length) return true;
  const waypoint = unit.movePath[unit.moveIndex];
  const reached = moveDirect(unit, waypoint, dt, speed, map);
  if (reached) unit.moveIndex += 1;
  if (unit.moveIndex >= unit.movePath.length) {
    unit.movePath = [];
    unit.moveIndex = 0;
    return true;
  }
  return false;
}

// Route points describe the intended approach, but no enemy is allowed to use
// them as a straight-line shortcut through a cliff. Build a strict terrain-safe
// plan once per route and share it among every unit using that approach.
function followEnemyRoute(game, unit, dt, speed) {
  if (!unit.routePlanReady) {
    // Authored spawn markers can sit directly against an obstacle edge. Start
    // the physical unit on the nearest legal nav cell rather than letting a
    // larger unit begin partially inside terrain.
    if (!isWorldWalkable(unit.x, unit.y, UNIT_TYPES[unit.type].radius, game.map, { allowRouteCorridor: false })) {
      const start = game.navigator.nearestWalkable(unit);
      if (start) {
        const point = game.navigator.center(start.col, start.row);
        unit.x = point.x;
        unit.y = point.y;
        unit.prevX = point.x;
        unit.prevY = point.y;
      }
    }
    unit.movePath = getEnemyRoutePlan(game, unit.route);
    unit.moveIndex = 0;
    unit.routePlanReady = true;
  }
  if (unit.movePath.length === 0) return false;
  const waypoint = unit.movePath[unit.moveIndex];
  const beforeX = unit.x;
  const beforeY = unit.y;
  const reached = followMovePath(unit, dt, speed, game.map);
  const blocked = !reached && waypoint && Math.abs(unit.x - beforeX) < 0.001 && Math.abs(unit.y - beforeY) < 0.001;
  if (blocked && unit.repathTimer <= 0) {
    const detour = game.navigator.findPath(unit, waypoint);
    if (detour.length > 0) {
      unit.movePath = [...detour, ...unit.movePath.slice(unit.moveIndex + 1)];
      unit.moveIndex = 0;
    }
    unit.repathTimer = 0.3;
  }
  return reached;
}

function getEnemyRoutePlan(game, route) {
  if (!route) return [];
  if (!game.enemyRoutePlans) game.enemyRoutePlans = new Map();
  const cached = game.enemyRoutePlans.get(route.id);
  if (cached) return cached.map((point) => ({ ...point }));

  const plan = [];
  let current = route.points[0];
  for (let index = 1; index < route.points.length; index += 1) {
    const leg = game.navigator.findPath(current, route.points[index]);
    if (leg.length === 0) continue;
    plan.push(...leg);
    current = leg[leg.length - 1];
  }
  game.enemyRoutePlans.set(route.id, plan);
  return plan.map((point) => ({ ...point }));
}

function canStepToward(unit, destination, dt, speed, map = null) {
  const dx = destination.x - unit.x;
  const dy = destination.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 3) return true;
  const step = Math.min(distance, speed * dt);
  const nextX = unit.x + (dx / distance) * step;
  const nextY = unit.y + (dy / distance) * step;
  return isWorldWalkable(nextX, nextY, UNIT_TYPES[unit.type].radius, map, { allowRouteCorridor: false });
}

function moveDirect(unit, destination, dt, speed, map = null) {
  const dx = destination.x - unit.x;
  const dy = destination.y - unit.y;
  if (Math.abs(dx) + Math.abs(dy) > 0.01) unit.facing = Math.atan2(dy, dx);
  const distance = Math.hypot(dx, dy);
  if (distance <= 3) {
    if (isWorldWalkable(destination.x, destination.y, UNIT_TYPES[unit.type].radius, map, { allowRouteCorridor: false })) {
      unit.x = destination.x;
      unit.y = destination.y;
      return true;
    }
    return false;
  }
  const step = Math.min(distance, speed * dt);
  const nextX = unit.x + (dx / distance) * step;
  const nextY = unit.y + (dy / distance) * step;
  const radius = UNIT_TYPES[unit.type].radius;
  if (isWorldWalkable(nextX, nextY, radius, map, { allowRouteCorridor: false })) {
    unit.x = nextX;
    unit.y = nextY;
  }
  return step >= distance;
}

// Only opposing units form a visible frontline. Friendly columns may stack in a
// narrow detour, which keeps them flowing instead of shoving one another into a
// terrain edge.
export function applyUnitSeparation(units, map = null) {
  for (let i = 0; i < units.length; i += 1) {
    const a = units[i];
    if (a.dead) continue;
    for (let j = i + 1; j < units.length; j += 1) {
      const b = units[j];
      if (b.dead) continue;
      if (a.side === b.side) continue;
      const minDistance = (UNIT_TYPES[a.type].radius + UNIT_TYPES[b.type].radius) * 0.82;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distanceSqValue = dx * dx + dy * dy;
      if (distanceSqValue >= minDistance * minDistance) continue;
      if (distanceSqValue <= 0.001) {
        const angle = ((a.id * 31 + b.id * 17) % 360) * Math.PI / 180;
        dx = Math.cos(angle) * 0.01;
        dy = Math.sin(angle) * 0.01;
        distanceSqValue = dx * dx + dy * dy;
      }
      const distance = Math.sqrt(distanceSqValue);
      const push = (minDistance - distance) * 0.5;
      const nx = dx / distance;
      const ny = dy / distance;
      const aX = a.x - nx * push;
      const aY = a.y - ny * push;
      const bX = b.x + nx * push;
      const bY = b.y + ny * push;
      if (isWorldWalkable(aX, aY, UNIT_TYPES[a.type].radius, map, { allowRouteCorridor: false })) {
        a.x = aX;
        a.y = aY;
      }
      if (isWorldWalkable(bX, bY, UNIT_TYPES[b.type].radius, map, { allowRouteCorridor: false })) {
        b.x = bX;
        b.y = bY;
      }
    }
  }
}

function resolveAttack(game, attacker, defender) {
  const attackData = UNIT_TYPES[attacker.type];
  const defendData = UNIT_TYPES[defender.type];
  const multiplier = matchupMultiplier(attackData, defendData);
  const damage = Math.max(1, Math.round(attackData.damage * attacker.damageScale * multiplier) - defendData.armor);
  const matchup = multiplier > 1 ? 'strong' : multiplier < 1 ? 'weak' : 'neutral';
  if (attackData.projectileSpeed) {
    game.playSound?.('arrow-airborne');
    launchProjectile(game, {
      source: attacker,
      target: defender,
      damage,
      strong: multiplier > 1,
      weak: multiplier < 1,
      matchup,
      speed: attackData.projectileSpeed,
      side: attacker.side,
    });
    return;
  }

  defender.hp = clamp(defender.hp - damage, 0, defender.maxHp);
  defender.flash = 0.13;
  game.playSound?.(matchup === 'strong'
    ? 'critical-hit'
    : matchup === 'weak'
      ? 'defended-hit'
      : 'attack-hit');
  addMeleeSwingEffect(game, { attacker, defender });
  addHitEffect(game, {
    x: defender.x,
    y: defender.y,
    damage,
    strong: multiplier > 1,
    weak: multiplier < 1,
    matchup,
    side: attacker.side,
  });
}

function killUnit(game, unit) {
  unit.dead = true;
  game.effects.push({ type: 'burst', x: unit.x, y: unit.y, life: 0.42, maxLife: 0.42, side: unit.side });
  if (unit.side === 'enemy') {
    game.gold += UNIT_TYPES[unit.type].bounty;
    game.stats.enemiesDefeated += 1;
  } else if (game.selectedUnitId === unit.id) {
    game.cancelInteraction();
  }
}

function damageBase(game, damage) {
  const base = game.map?.base ?? BASE;
  game.baseHp = clamp(game.baseHp - damage, 0, game.baseMaxHp);
  game.effects.push({ type: 'baseHit', x: base.x, y: base.y, life: 0.5, maxLife: 0.5 });
}
