import { distanceSq } from '../utils.js';
import { UNIT_STATES, setUnitState } from './unit-states.js';

const SLOT_RADIUS_PADDING = 8;

// Owns: aggro detection, attack timers, damage resolution, attack slot geometry,
//       attack/clear assignment, and mobile engagement slot management.
// Calls ctx.movement for path/pursuit operations triggered by combat decisions.
export class CombatSystem {
  constructor(ctx) {
    this.ctx = ctx;
    // ctx: { map, getUnits, getById, getDef, reservations, getSimTime, movement (set after init) }
  }

  update(dt) {
    this.updateNeutralAggro();
    this.updatePlayerAttackMoveAggro();
    this.updateCombat(dt);
  }

  // ── Aggro ───────────────────────────────────────────────────────────────────

  updateNeutralAggro() {
    for (const unit of this.ctx.getUnits()) {
      if (unit.team !== 0 || unit.hp <= 0) continue;
      const combat = this.ctx.getDef(unit.type).combat;
      if (!combat.canAttack) continue;
      const current = this.ctx.resolveTarget(unit.attackTarget);
      if (current && this.ctx.distanceToTargetEdge(unit, current) <= combat.leashRange) continue;

      const target = this.findNearestEnemyUnit(unit, combat.acquireRange, null);
      if (target) {
        this.assignAttackTarget(unit, { kind: 'unit', id: target.id }, false);
      } else if (unit.attackTarget) {
        unit.attackTarget = null;
        this.ctx.reservations.releaseStaticAttackSlot(unit);
        this.ctx.reservations.releaseMobileEngagementSlot(unit);
        unit.combatState.pendingDamage = null;
      }
    }
  }

  updatePlayerAttackMoveAggro() {
    for (const unit of this.ctx.getUnits()) {
      if (unit.team === 0 || unit.hp <= 0 || !unit.attackMoveTarget) continue;
      const combat = this.ctx.getDef(unit.type).combat;
      if (!combat.canAttack || unit.attackTarget) continue;
      const target = this.findNearestEnemyUnit(unit, combat.acquireRange, null);
      if (target) this.assignAttackTarget(unit, { kind: 'unit', id: target.id }, true, { preserveAttackMove: true });
    }
  }

  findNearestEnemyUnit(source, range, teamFilter = null) {
    let best = null;
    let bestD2 = range * range;
    for (const unit of this.ctx.getUnits()) {
      if (unit === source || unit.hp <= 0) continue;
      if (teamFilter !== null && unit.team !== teamFilter) continue;
      if (teamFilter === null && unit.team === source.team) continue;
      const d2 = distanceSq(source.x, source.y, unit.x, unit.y);
      if (d2 < bestD2) { best = unit; bestD2 = d2; }
    }
    return best;
  }

  // ── Combat loop ─────────────────────────────────────────────────────────────

  updateCombat(dt) {
    const simTime = this.ctx.getSimTime();
    for (const unit of this.ctx.getUnits()) {
      if (unit.hp <= 0) continue;
      const def = this.ctx.getDef(unit.type);
      const combat = def.combat;
      const state = unit.combatState;

      if (state.cooldownRemaining > 0) state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dt);
      if (state.recoveryRemaining > 0) state.recoveryRemaining = Math.max(0, state.recoveryRemaining - dt);

      if (state.windupRemaining > 0) {
        state.windupRemaining = Math.max(0, state.windupRemaining - dt);
        setUnitState(unit, UNIT_STATES.ATTACKING, simTime);
        if (state.windupRemaining === 0 && state.pendingDamage) this.resolvePendingDamage(unit);
        continue;
      }

      if (!combat.canAttack || !unit.attackTarget) continue;
      const target = this.ctx.resolveTarget(unit.attackTarget);
      if (!target) {
        this.clearAttack(unit, { preserveAttackMove: unit.team !== 0, resumeAttackMove: unit.team !== 0 });
        continue;
      }

      const edgeDistance = this.ctx.distanceToTargetEdge(unit, target);
      if (unit.team === 0 && edgeDistance > combat.leashRange) {
        this.clearAttack(unit);
        continue;
      }

      if (target.kind === 'unit') {
        this.ctx.reservations.refreshMobileEngagementSlot(unit, target);
        if (edgeDistance > combat.attackRange) {
          this.ctx.movement.pursueMobileAttackTarget(unit, target);
          continue;
        }
      } else {
        this.refreshMobileAttackSlot(unit, target);
        if (unit.attackSlot && !this.isHoldingAttackSlot(unit)) {
          this.snapToAttackSlotIfClose(unit);
          if (!this.isHoldingAttackSlot(unit)) {
            const finalWaypoint = unit.path[unit.path.length - 1];
            const slotMovedAwayFromPath = finalWaypoint
              ? Math.hypot(finalWaypoint.x - unit.attackSlot.x, finalWaypoint.y - unit.attackSlot.y) > 18
              : true;
            if (unit.path.length === 0 || slotMovedAwayFromPath) this.ctx.movement.pathUnitToAttackTarget(unit, target);
            continue;
          }
        }
        if (edgeDistance > combat.attackRange) {
          if (unit.path.length === 0) this.ctx.movement.pathUnitToAttackTarget(unit, target);
          continue;
        }
        if (unit.attackSlot) this.snapToAttackSlotIfClose(unit);
      }

      unit.path = [];
      unit.routeId = null;
      this.ctx.reservations.releaseRouteReservations(unit);
      unit.moveTarget = null;
      const center = this.ctx.targetCenter(target);
      unit.facing = Math.atan2(center.y - unit.y, center.x - unit.x);
      setUnitState(unit, UNIT_STATES.ATTACKING, simTime);
      state.lastCombatTime = simTime;

      if (state.cooldownRemaining === 0 && state.recoveryRemaining === 0) {
        state.windupRemaining = combat.windupTime;
        state.attackAnimStart = simTime;
        state.attackAnimDuration = combat.windupTime + combat.recoveryTime + 0.08;
        state.attackSequence += 1;
        state.pendingDamage = {
          ...unit.attackTarget,
          amount: combat.baseDamage,
          damageType: combat.damageType,
        };
        state.cooldownRemaining = combat.attackCooldown;
      }
    }
  }

  resolvePendingDamage(unit) {
    const state = unit.combatState;
    const pending = state.pendingDamage;
    if (!pending) return;

    if (pending.kind === 'destructibleTile') {
      this.ctx.map.damageDestructible(pending.x, pending.y, pending.amount);
    } else if (pending.kind === 'unit') {
      const target = this.ctx.getById(pending.id);
      if (target && target.hp > 0) {
        const damage = this.calculateDamage(pending.amount, pending.damageType, target);
        target.hp = Math.max(0, target.hp - damage);
        const simTime = this.ctx.getSimTime();
        target.combatState.lastDamagedTime = simTime;
        target.combatState.lastCombatTime = simTime;
        const targetCombat = this.ctx.getDef(target.type).combat;
        if (target.team !== unit.team && target.hp > 0 && targetCombat.canAttack && !target.attackTarget) {
          this.assignAttackTarget(target, { kind: 'unit', id: unit.id }, target.team !== 0);
        }
      }
    }

    const simTime = this.ctx.getSimTime();
    const combat = this.ctx.getDef(unit.type).combat;
    state.impactFlashUntil = simTime + 0.14;
    state.pendingDamage = null;
    state.recoveryRemaining = combat.recoveryTime;
    state.lastCombatTime = simTime;
  }

  calculateDamage(amount, damageType, target) {
    const defenses = this.ctx.getDef(target.type).defenses;
    const mitigation = damageType === 'magic' ? defenses.magicResist : defenses.armor;
    return Math.max(1, amount - mitigation);
  }

  // ── Assignment ───────────────────────────────────────────────────────────────

  assignAttackTarget(unit, targetRef, reserveSlot = true, options = {}) {
    this.ctx.reservations.releaseStaticAttackSlot(unit);
    this.ctx.reservations.releaseMobileEngagementSlot(unit);
    unit.attackTarget = { ...targetRef };
    if (!options.preserveAttackMove) unit.attackMoveTarget = null;
    unit.combatState.pendingDamage = null;
    unit.combatState.windupRemaining = 0;
    unit.combatState.recoveryRemaining = 0;
    unit.mobilePursuitRepathAt = 0;
    this.ctx.movement.resetMovementState(unit);
    const target = this.ctx.resolveTarget(targetRef);
    if (reserveSlot && target?.kind !== 'unit') this.ctx.reservations.reserveStaticAttackSlot(unit, targetRef);
    if (reserveSlot && target?.kind === 'unit') this.ctx.reservations.reserveMobileEngagementSlot(unit, target);
    if (target?.kind === 'unit') this.ctx.movement.pursueMobileAttackTarget(unit, target);
    else if (target) this.ctx.movement.pathUnitToAttackTarget(unit, target);
  }

  clearAttack(unit, options = {}) {
    const simTime = this.ctx.getSimTime();
    this.ctx.reservations.releaseStaticAttackSlot(unit);
    this.ctx.reservations.releaseMobileEngagementSlot(unit);
    unit.attackTarget = null;
    unit.combatState.pendingDamage = null;
    unit.combatState.windupRemaining = 0;
    unit.combatState.recoveryRemaining = 0;
    unit.path = [];
    unit.routeId = null;
    this.ctx.reservations.releaseRouteReservations(unit);
    unit.moveTarget = null;
    unit.mobilePursuitRepathAt = 0;
    if (unit.debug) {
      unit.debug.queueAnchor = null;
      unit.debug.blockerId = null;
      unit.debug.lastWaypoint = null;
      unit.debug.pathGoal = null;
      unit.debug.groupRoute = null;
      unit.debug.formationMode = null;
      unit.debug.formationSlot = null;
      unit.debug.engagementSlot = null;
      unit.debug.lanePriority = 0;
    }
    this.ctx.movement.resetMovementState(unit);
    setUnitState(unit, UNIT_STATES.IDLE, simTime);
    if (!options.preserveAttackMove) unit.attackMoveTarget = null;
    if (options.resumeAttackMove && unit.attackMoveTarget) {
      this.ctx.movement.pathUnitToWorld(unit, unit.attackMoveTarget.x, unit.attackMoveTarget.y);
      setUnitState(unit, UNIT_STATES.ATTACK_MOVING, simTime);
    }
  }

  // ── Attack slot geometry ─────────────────────────────────────────────────────

  attackSlotsForTarget(target, unit) {
    if (target.kind === 'destructibleTile') return this.attackSlotsForTile(target.x, target.y, unit);
    return this.attackSlotsForUnit(target.unit, unit);
  }

  attackSlotsForTile(tileX, tileY, unit) {
    const candidates = [];
    const tileSize = this.ctx.map.tileSize;
    const center = this.ctx.map.tileCenter(tileX, tileY);
    const sideOffset = tileSize * 0.5 + unit.radius + 3;
    const tangentOffsets = [-unit.radius - 4, unit.radius + 4];
    const sides = [
      { name: 'N', nx: 0, ny: -1, tx: 1, ty: 0 },
      { name: 'S', nx: 0, ny:  1, tx: 1, ty: 0 },
      { name: 'W', nx: -1, ny: 0, tx: 0, ty: 1 },
      { name: 'E', nx:  1, ny: 0, tx: 0, ty: 1 },
    ];

    for (const side of sides) {
      const neighborX = tileX + side.nx;
      const neighborY = tileY + side.ny;
      if (!this.ctx.map.isWalkableTile(neighborX, neighborY)) continue;
      for (const tangent of tangentOffsets) {
        const x = center.x + side.nx * sideOffset + side.tx * tangent;
        const y = center.y + side.ny * sideOffset + side.ty * tangent;
        if (!this.ctx.map.isCircleWalkable(x, y, unit.radius + 1)) continue;
        candidates.push({ key: `${side.name}:${tangent}`, x, y, tileX: neighborX, tileY: neighborY, side: side.name });
      }
    }

    for (let y = tileY - 1; y <= tileY + 1; y++) {
      for (let x = tileX - 1; x <= tileX + 1; x++) {
        if (x === tileX && y === tileY) continue;
        if (x === tileX || y === tileY) continue;
        if (!this.ctx.map.isWalkableTile(x, y)) continue;
        const c = this.ctx.map.tileCenter(x, y);
        if (!this.ctx.map.isCircleWalkable(c.x, c.y, unit.radius + 1)) continue;
        candidates.push({ key: `D:${x},${y}`, x: c.x, y: c.y, tileX: x, tileY: y, diagonal: true });
      }
    }
    return candidates;
  }

  attackSlotsForUnit(targetUnit, attacker) {
    const slots = [];
    const combat = this.ctx.getDef(attacker.type).combat;
    const count = 8;
    const dist = targetUnit.radius + attacker.radius + SLOT_RADIUS_PADDING;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      const x = targetUnit.x + Math.cos(a) * dist;
      const y = targetUnit.y + Math.sin(a) * dist;
      if (!this.ctx.map.isCircleWalkable(x, y, attacker.radius + 1)) continue;
      slots.push({ key: `${targetUnit.id}:${i}`, x, y, angle: a, attackRange: combat.attackRange });
    }
    return slots;
  }

  refreshMobileAttackSlot(unit, target) {
    if (!unit.attackSlot || !target || target.kind !== 'unit') return;
    const angle = Number.isFinite(unit.attackSlot.angle)
      ? unit.attackSlot.angle
      : Math.atan2(unit.y - target.unit.y, unit.x - target.unit.x);
    const dist = target.unit.radius + unit.radius + SLOT_RADIUS_PADDING;
    const x = target.unit.x + Math.cos(angle) * dist;
    const y = target.unit.y + Math.sin(angle) * dist;
    if (this.ctx.map.isCircleWalkable(x, y, unit.radius + 1)) {
      unit.attackSlot.x = x;
      unit.attackSlot.y = y;
      unit.attackSlot.angle = angle;
    }
  }

  isHoldingAttackSlot(unit) {
    if (!unit.attackSlot) return false;
    const def = this.ctx.getDef(unit.type);
    return Math.hypot(unit.attackSlot.x - unit.x, unit.attackSlot.y - unit.y) <= Math.max(3, def.movement.stopDistance + 1);
  }

  snapToAttackSlotIfClose(unit) {
    if (!unit.attackSlot) return false;
    const def = this.ctx.getDef(unit.type);
    const d = Math.hypot(unit.attackSlot.x - unit.x, unit.attackSlot.y - unit.y);
    if (d <= Math.max(4, def.movement.stopDistance + 2) && this.ctx.map.isCircleWalkable(unit.attackSlot.x, unit.attackSlot.y, unit.radius + 1)) {
      unit.x = unit.attackSlot.x;
      unit.y = unit.attackSlot.y;
      unit.path = [];
      unit.routeId = null;
      this.ctx.reservations.releaseRouteReservations(unit);
      unit.moveTarget = null;
      return true;
    }
    return false;
  }
}
