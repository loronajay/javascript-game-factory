import { distanceSq, normalizeAngle, shortestAngle } from '../utils.js';
import { findPath } from '../pathfinding.js';
import { buildGroupMovePlan, mergeGroupRouteForUnit } from '../movement/group-planner.js';
import { UNIT_STATES, setUnitState } from './unit-states.js';

const MOBILE_ENGAGEMENT_SLOT_COUNT = 10;
const MOBILE_QUEUE_SPACING = 23;
const BLOCKED_ESCALATION_TIME = 0.22;
const REPATH_COOLDOWN = 0.28;

// Owns: path following, waypoint management, blocked detection, repath logic,
//       mobile pursuit, formation-group move planning, and visual facing.
export class MovementSystem {
  constructor(ctx) {
    this.ctx = ctx;
    // ctx: { map, getUnits, getById, getDef, reservations, chokeMap, getSimTime, nextRouteId }
  }

  update(dt) {
    this.updateMovement(dt);
    this.updateVisualFacing(dt);
  }

  // ── Path following ───────────────────────────────────────────────────────────

  updateMovement(dt) {
    const simTime = this.ctx.getSimTime();
    for (const unit of this.ctx.getUnits()) {
      if (unit.path.length === 0) {
        this.ctx.reservations.releaseRouteReservations(unit);
        if (
          unit.state === UNIT_STATES.MOVING ||
          unit.state === UNIT_STATES.ATTACK_MOVING ||
          unit.state === UNIT_STATES.PURSUING_TARGET ||
          unit.state === UNIT_STATES.QUEUED_BEHIND_ALLY
        ) {
          setUnitState(unit, unit.attackTarget ? UNIT_STATES.PURSUING_TARGET : UNIT_STATES.IDLE, simTime);
        }
        this.updateUnitProgress(unit, dt, false);
        continue;
      }
      if (unit.combatState.windupRemaining > 0) continue;

      const movingState = unit.attackTarget
        ? (unit.debug?.queueAnchor ? UNIT_STATES.QUEUED_BEHIND_ALLY : UNIT_STATES.PURSUING_TARGET)
        : (unit.attackMoveTarget ? UNIT_STATES.ATTACK_MOVING : UNIT_STATES.MOVING);
      setUnitState(unit, movingState, simTime);

      const waypoint = unit.path[0];
      const dx = waypoint.x - unit.x;
      const dy = waypoint.y - unit.y;
      const dist = Math.hypot(dx, dy);
      const stopDistance = this.ctx.getDef(unit.type).movement.stopDistance;

      if (dist < stopDistance) {
        unit.path.shift();
        this.resetMovementState(unit);
        if (unit.path.length === 0 && unit.attackSlot) this.ctx.combat.snapToAttackSlotIfClose(unit);
        continue;
      }

      const step = Math.min(this.ctx.getDef(unit.type).movement.moveSpeed * dt, dist);
      const dirX = dx / dist;
      const dirY = dy / dist;

      const chokeClaim = this.claimRouteChokeCells(unit, waypoint);
      if (!chokeClaim.ok) {
        setUnitState(unit, UNIT_STATES.QUEUED_BEHIND_ALLY, simTime);
        if (unit.debug) {
          const blocker = this.ctx.getUnits().find((c) => c.id === chokeClaim.blockerId);
          unit.debug.blockerId = chokeClaim.blockerId ?? null;
          unit.debug.queueAnchor = blocker ? { x: blocker.x, y: blocker.y } : null;
        }
        this.updateUnitProgress(unit, dt, false);
        continue;
      }

      let moved = this.tryMoveUnit(unit, dirX * step, dirY * step);
      if (!moved) {
        const side = unit.movementState?.sidestepSign ?? 1;
        moved = this.tryMoveUnit(unit, -dirY * step * 0.7 * side, dirX * step * 0.7 * side)
          || this.tryMoveUnit(unit, dirX * step * 0.55, 0)
          || this.tryMoveUnit(unit, 0, dirY * step * 0.55);
      }

      unit.facing = Math.atan2(dy, dx);
      this.updateUnitProgress(unit, dt, moved);
      if (!moved) this.handleBlockedUnit(unit);
      if (unit.debug) unit.debug.lastWaypoint = unit.path[0] ? { x: unit.path[0].x, y: unit.path[0].y } : null;
    }
  }

  claimRouteChokeCells(unit, waypoint) {
    if (!this.ctx.chokeMap || !waypoint) return { ok: true };
    const cells = this.ctx.chokeMap.sampleChokeCellsAlongSegment(unit.x, unit.y, waypoint.x, waypoint.y, 3);
    if (!cells.length) return this.ctx.reservations.reserveRouteChokeCells(unit, [], this.ctx.getSimTime(), unit.routeId ?? null, null);
    const dx = waypoint.x - unit.x;
    const dy = waypoint.y - unit.y;
    const directionKey = `${Math.sign(Math.round(dx))},${Math.sign(Math.round(dy))}`;
    return this.ctx.reservations.reserveRouteChokeCells(unit, cells, this.ctx.getSimTime(), unit.routeId ?? null, directionKey);
  }

  tryMoveUnit(unit, dx, dy) {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return false;
    const nx = unit.x + dx;
    const ny = unit.y + dy;
    if (!this.ctx.map.isCircleWalkable(nx, ny, unit.radius + 1)) return false;
    unit.x = nx;
    unit.y = ny;
    return true;
  }

  updateUnitProgress(unit, dt, moved) {
    if (!unit.movementState) this.resetMovementState(unit);
    const state = unit.movementState;
    const movedDistance = Math.hypot(unit.x - state.lastX, unit.y - state.lastY);
    if (moved && movedDistance > 0.35) {
      state.blockedFor = 0;
      state.lastX = unit.x;
      state.lastY = unit.y;
      state.lastProgressAt = this.ctx.getSimTime();
      state.lastBlockReason = null;
      return;
    }
    if (unit.path.length > 0) {
      state.blockedFor += dt;
      state.lastBlockedAt = this.ctx.getSimTime();
      state.lastBlockReason = 'no-progress';
    }
  }

  handleBlockedUnit(unit) {
    if (!unit.movementState) this.resetMovementState(unit);
    const state = unit.movementState;
    const simTime = this.ctx.getSimTime();
    if (state.blockedFor < BLOCKED_ESCALATION_TIME || simTime < state.repathAt) return;

    setUnitState(unit, UNIT_STATES.BLOCKED_REPATHING, simTime);
    state.repathAt = simTime + REPATH_COOLDOWN;
    if (unit.debug) unit.debug.lastRepathAt = simTime;
    state.sidestepSign *= -1;

    const target = this.ctx.resolveTarget(unit.attackTarget);
    if (target?.kind === 'unit') {
      if (this.pursueMobileAttackTarget(unit, target, { forceRepath: true, allowQueue: true })) {
        state.blockedFor = 0;
        return;
      }
    } else if (target) {
      if (this.pathUnitToAttackTarget(unit, target)) {
        state.blockedFor = 0;
        return;
      }
    } else if (unit.moveTarget) {
      if (this.pathUnitToWorld(unit, unit.moveTarget.x, unit.moveTarget.y)) {
        state.blockedFor = 0;
        return;
      }
    }

    unit.path = [];
    setDebugPathGoal(unit, null);
    setUnitState(unit, UNIT_STATES.BLOCKED_REPATHING, simTime);
  }

  resetMovementState(unit) {
    unit.movementState = {
      lastX: unit.x,
      lastY: unit.y,
      blockedFor: 0,
      repathAt: 0,
      sidestepUntil: 0,
      sidestepSign: unit.movementState?.sidestepSign ?? 1,
      lastProgressAt: this.ctx.getSimTime(),
      lastBlockedAt: -Infinity,
      lastBlockReason: null,
    };
  }

  // ── Pathing ──────────────────────────────────────────────────────────────────

  buildPathToWorld(unit, worldX, worldY) {
    const targetTile = this.ctx.map.worldToTile(worldX, worldY);
    const clearance = unit.radius + 1;
    const corrected = this.ctx.map.nearestWalkableTileForRadius(targetTile.x, targetTile.y, clearance);
    if (!corrected) return null;
    const startTile = this.ctx.map.worldToTile(unit.x, unit.y);
    const path = findPath(this.ctx.map, startTile, corrected, { clearance });
    if (path.length === 0) return null;
    const rawPointIsUsable =
      corrected.x === targetTile.x &&
      corrected.y === targetTile.y &&
      this.ctx.map.isCircleWalkable(worldX, worldY, unit.radius + 1);
    const finalPoint = rawPointIsUsable ? { x: worldX, y: worldY } : this.ctx.map.tileCenter(corrected.x, corrected.y);
    path[path.length - 1] = finalPoint;
    return { path, finalPoint };
  }

  pathUnitToWorld(unit, worldX, worldY) {
    const planned = this.buildPathToWorld(unit, worldX, worldY);
    if (!planned) return false;
    unit.path = planned.path;
    unit.pathIndex = 0;
    unit.routeId = unit.routeId ?? `solo:${unit.id}:${this.ctx.nextRouteId()}`;
    this.ctx.reservations.releaseRouteReservations(unit);
    unit.moveTarget = planned.finalPoint;
    setDebugPathGoal(unit, planned.finalPoint);
    this.resetMovementState(unit);
    return true;
  }

  pathUnitToAttackTarget(unit, target) {
    const slot = unit.attackSlot;
    if (slot) return this.pathUnitToWorld(unit, slot.x, slot.y);
    if (target.kind === 'destructibleTile') return this.pathUnitAdjacentToTile(unit, target.x, target.y);
    const center = this.ctx.targetCenter(target);
    const combat = this.ctx.getDef(unit.type).combat;
    const dx = unit.x - center.x;
    const dy = unit.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    const desiredDist = this.ctx.targetRadius(target) + combat.attackRange * 0.78;
    return this.pathUnitToWorld(unit, center.x + (dx / len) * desiredDist, center.y + (dy / len) * desiredDist);
  }

  pathUnitAdjacentToTile(unit, tileX, tileY) {
    const slots = this.ctx.combat.attackSlotsForTile(tileX, tileY, unit)
      .sort((a, b) => distanceSq(unit.x, unit.y, a.x, a.y) - distanceSq(unit.x, unit.y, b.x, b.y));
    for (const slot of slots) {
      if (this.pathUnitToWorld(unit, slot.x, slot.y)) return true;
    }
    return false;
  }

  // ── Group move ───────────────────────────────────────────────────────────────

  issueGroupMove(units, worldX, worldY, options = {}) {
    const routeId = `route:${this.ctx.nextRouteId()}`;
    const plan = buildGroupMovePlan({
      units,
      map: this.ctx.map,
      worldX,
      worldY,
      clearanceForUnit: (unit) => unit.radius + 1,
    });

    const simTime = this.ctx.getSimTime();
    let issued = false;
    for (const assignment of plan.assignments) {
      const unit = assignment.unit;
      this.ctx.combat.clearAttack(unit);
      if (options.kind !== 'attackMove') unit.attackMoveTarget = null;
      const planned = this.buildPathToWorld(unit, assignment.targetX, assignment.targetY);
      if (!planned) continue;
      unit.path = mergeGroupRouteForUnit({ map: this.ctx.map, unit, personalPath: planned.path, groupRoute: plan.route });
      unit.pathIndex = 0;
      unit.routeId = routeId;
      this.ctx.reservations.releaseRouteReservations(unit);
      unit.moveTarget = planned.finalPoint;
      if (options.kind === 'attackMove') unit.attackMoveTarget = { x: planned.finalPoint.x, y: planned.finalPoint.y };
      if (unit.debug) {
        unit.debug.groupRoute = plan.route ? plan.route.map((p) => ({ x: p.x, y: p.y })) : null;
        unit.debug.formationMode = plan.formationMode;
        unit.debug.formationSlot = { index: assignment.slotIndex, columns: plan.columns };
      }
      setDebugPathGoal(unit, planned.finalPoint);
      this.resetMovementState(unit);
      setUnitState(unit, options.kind === 'attackMove' ? UNIT_STATES.ATTACK_MOVING : UNIT_STATES.MOVING, simTime);
      markCommandAck(unit, options.kind === 'attackMove' ? 'attackMove' : 'move', simTime);
      issued = true;
    }
    return issued;
  }

  // ── Mobile pursuit ───────────────────────────────────────────────────────────

  pursueMobileAttackTarget(unit, target, options = {}) {
    if (!target || target.kind !== 'unit') return false;
    const simTime = this.ctx.getSimTime();
    const combat = this.ctx.getDef(unit.type).combat;
    const center = this.ctx.targetCenter(target);
    const slot = this.ctx.reservations.reserveMobileEngagementSlot(unit, target);
    const dx = unit.x - center.x;
    const dy = unit.y - center.y;
    const preferredAngle = Number.isFinite(slot?.angle) ? slot.angle : Math.atan2(dy, dx);
    const desiredCenterDistance = this.ctx.targetRadius(target) + Math.max(unit.radius + 4, combat.attackRange * 0.72);
    const destination = {
      x: center.x + Math.cos(preferredAngle) * desiredCenterDistance,
      y: center.y + Math.sin(preferredAngle) * desiredCenterDistance,
    };

    if (this.ctx.map.isCircleWalkable(destination.x, destination.y, unit.radius + 1) && this.mobileEngagementSlotReachable(unit, destination, target)) {
      unit.path = [destination];
      unit.moveTarget = destination;
      if (unit.debug) { unit.debug.queueAnchor = null; unit.debug.blockerId = null; }
      this.ctx.reservations.refreshMobileEngagementSlot(unit, target);
      setDebugPathGoal(unit, destination);
      setUnitState(unit, UNIT_STATES.PURSUING_TARGET, simTime);
      this.resetMovementState(unit);
      return true;
    }

    if (!options.forceRepath && unit.path.length > 0 && simTime < (unit.mobilePursuitRepathAt ?? 0)) return true;

    const planned = this.findMobileEngagementPath(unit, target, desiredCenterDistance, preferredAngle);
    if (planned) {
      unit.path = planned.path;
      unit.moveTarget = planned.finalPoint;
      this.ctx.reservations.refreshMobileEngagementSlot(unit, target);
      setDebugPathGoal(unit, planned.finalPoint);
      setUnitState(unit, UNIT_STATES.PURSUING_TARGET, simTime);
      this.resetMovementState(unit);
      unit.mobilePursuitRepathAt = simTime + 0.24;
      return true;
    }

    if (options.allowQueue !== false) {
      const queued = this.pathUnitToAttackQueue(unit, target);
      if (queued) { unit.mobilePursuitRepathAt = simTime + 0.24; return true; }
    }

    unit.mobilePursuitRepathAt = simTime + 0.24;
    unit.path = [];
    unit.moveTarget = null;
    setUnitState(unit, UNIT_STATES.BLOCKED_REPATHING, simTime);
    return false;
  }

  mobileEngagementSlotReachable(unit, destination, target) {
    const slot = unit.mobileEngagementSlot;
    if (!slot || !target?.unit) return true;
    const targetUnit = target.unit;
    const toUnit = { x: unit.x - targetUnit.x, y: unit.y - targetUnit.y };
    const toDest = { x: destination.x - targetUnit.x, y: destination.y - targetUnit.y };
    const unitAngle = Math.atan2(toUnit.y, toUnit.x);
    const destAngle = Math.atan2(toDest.y, toDest.x);
    return Math.abs(shortestAngle(unitAngle, destAngle)) < Math.PI * 0.75;
  }

  findMobileEngagementPath(unit, target, desiredCenterDistance, preferredAngle) {
    const center = this.ctx.targetCenter(target);
    const angles = [preferredAngle];
    const samples = MOBILE_ENGAGEMENT_SLOT_COUNT;
    for (let i = 1; i <= Math.floor(samples / 2); i++) {
      const step = (Math.PI * 2 * i) / samples;
      angles.push(preferredAngle + step, preferredAngle - step);
    }
    let best = null;
    let bestScore = Infinity;
    for (const angle of angles) {
      const x = center.x + Math.cos(angle) * desiredCenterDistance;
      const y = center.y + Math.sin(angle) * desiredCenterDistance;
      if (!this.ctx.map.isCircleWalkable(x, y, unit.radius + 1)) continue;
      const planned = this.buildPathToWorld(unit, x, y);
      if (!planned) continue;
      const final = planned.finalPoint;
      const angleCost = Math.abs(shortestAngle(preferredAngle, angle)) * 70;
      const score = planned.path.length * this.ctx.map.tileSize + Math.hypot(final.x - unit.x, final.y - unit.y) + angleCost;
      if (score < bestScore) { best = planned; bestScore = score; }
    }
    return best;
  }

  pathUnitToAttackQueue(unit, target) {
    if (!target || target.kind !== 'unit') return false;
    const targetUnit = target.unit;
    const slot = this.ctx.reservations.reserveMobileEngagementSlot(unit, target);
    const slotAngle = Number.isFinite(slot?.angle) ? slot.angle : Math.atan2(unit.y - targetUnit.y, unit.x - targetUnit.x);

    let blocker = null;
    let blockerScore = Infinity;
    for (const ally of this.ctx.getUnits()) {
      if (ally === unit || ally.team !== unit.team || ally.hp <= 0) continue;
      if (ally.attackTarget?.kind !== 'unit' || ally.attackTarget.id !== targetUnit.id) continue;
      const allyEdge = this.ctx.distanceToTargetEdge(ally, target);
      const unitEdge = this.ctx.distanceToTargetEdge(unit, target);
      if (allyEdge > unitEdge + 8) continue;
      const allyAngle = ally.mobileEngagementSlot?.angle ?? Math.atan2(ally.y - targetUnit.y, ally.x - targetUnit.x);
      const lanePenalty = Math.abs(shortestAngle(slotAngle, allyAngle)) * 80;
      const d2 = distanceSq(unit.x, unit.y, ally.x, ally.y);
      const score = d2 + lanePenalty;
      if (score < blockerScore) { blocker = ally; blockerScore = score; }
    }
    if (!blocker) return false;

    const awayX = blocker.x - targetUnit.x;
    const awayY = blocker.y - targetUnit.y;
    const len = Math.hypot(awayX, awayY) || 1;
    const queueOrdinal = this.queueOrdinalBehindBlocker(unit, blocker, target);
    const queueDistance = blocker.radius + unit.radius + MOBILE_QUEUE_SPACING + queueOrdinal * MOBILE_QUEUE_SPACING;
    const qx = blocker.x + (awayX / len) * queueDistance;
    const qy = blocker.y + (awayY / len) * queueDistance;
    if (!this.ctx.map.isCircleWalkable(qx, qy, unit.radius + 1)) return false;
    const ok = this.pathUnitToWorld(unit, qx, qy);
    if (ok) {
      const simTime = this.ctx.getSimTime();
      if (unit.debug) {
        unit.debug.queueAnchor = { x: qx, y: qy };
        unit.debug.blockerId = blocker.id;
        unit.debug.lanePriority = queueOrdinal + 1;
      }
      setUnitState(unit, UNIT_STATES.QUEUED_BEHIND_ALLY, simTime);
    }
    return ok;
  }

  queueOrdinalBehindBlocker(unit, blocker, target) {
    let count = 0;
    for (const ally of this.ctx.getUnits()) {
      if (ally === unit || ally === blocker || ally.team !== unit.team || ally.hp <= 0) continue;
      if (ally.attackTarget?.kind !== 'unit' || ally.attackTarget.id !== target.unit.id) continue;
      if (ally.debug?.blockerId === blocker.id) count += 1;
    }
    return count;
  }

  // ── Visual facing ────────────────────────────────────────────────────────────

  updateVisualFacing(dt) {
    for (const unit of this.ctx.getUnits()) {
      const diff = shortestAngle(unit.visualFacing ?? unit.facing, unit.facing);
      const turnSpeed = this.ctx.getDef(unit.type).movement.turnSpeed ?? 10;
      const step = Math.min(1, turnSpeed * dt);
      unit.visualFacing = normalizeAngle((unit.visualFacing ?? unit.facing) + diff * step);
    }
  }
}

// ── Module-level helpers ─────────────────────────────────────────────────────

function setDebugPathGoal(unit, point) {
  if (!unit.debug) return;
  unit.debug.pathGoal = point ? { x: point.x, y: point.y } : null;
}

function markCommandAck(unit, kind, simTime) {
  unit.commandAckKind = kind;
  unit.commandAckUntil = simTime + 0.22;
}
