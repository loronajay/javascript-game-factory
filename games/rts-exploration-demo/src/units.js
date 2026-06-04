import { CONFIG } from './config.js';
import { getUnitDef } from './unit-defs.js';
import { clampMagnitude, distanceSq } from './utils.js';
import { findPath } from './pathfinding.js';
import { ReservationManager } from './movement/reservations.js';
import { buildGroupMovePlan, mergeGroupRouteForUnit } from './movement/group-planner.js';
import { ChokeMap } from './movement/choke-map.js';

const SLOT_RADIUS_PADDING = 8;
const MOBILE_ENGAGEMENT_SLOT_COUNT = 10;
const MOBILE_QUEUE_SPACING = 23;

export const UNIT_STATES = Object.freeze({
  IDLE: 'idle',
  MOVING: 'moving',
  ATTACK_MOVING: 'attack-moving',
  PURSUING_TARGET: 'pursuing-target',
  ATTACKING: 'attacking',
  BLOCKED_REPATHING: 'blocked-repathing',
  QUEUED_BEHIND_ALLY: 'queued-behind-ally',
  DEAD: 'dead',
});

export class UnitManager {
  constructor(map) {
    this.map = map;
    this.units = [];
    this.selectedIds = new Set();
    this.chokeMap = new ChokeMap(this.map);
    this.reservations = new ReservationManager({
      map: this.map,
      resolveTarget: (targetRef) => this.resolveTarget(targetRef),
      targetKey: (targetRef) => this.targetKey(targetRef),
      attackSlotsForTarget: (target, unit) => this.attackSlotsForTarget(target, unit),
      getUnitDef: (unit) => this.getDef(unit),
    });
    this.attackSlotReservations = this.reservations.attackSlotReservations;
    this.mobileEngagementReservations = this.reservations.mobileEngagementReservations;
    this.routeReservations = this.reservations.routeReservations;
    this.nextRouteId = 1;
    this.nextId = 1;
    this.simTime = 0;
    this.spawnStartingUnits();
    this.spawnNeutralCreatures();
  }

  spawnStartingUnits() {
    this.spawnTeamPackage(1, 10, 10, 1);
    this.spawnTeamPackage(2, 116, 116, -1);
  }

  spawnTeamPackage(team, tileX, tileY, direction = 1) {
    const base = this.map.tileCenter(tileX, tileY);
    const scoutSpacing = 34;
    for (let i = 0; i < CONFIG.startingScoutsPerPlayer; i++) {
      this.spawnUnit('scout', team, base.x + direction * i * scoutSpacing, base.y + (i % 2) * 20);
    }

    const gruntBase = this.map.tileCenter(tileX, tileY + direction * 3);
    const gruntSpacing = 30;
    for (let i = 0; i < CONFIG.startingGruntsPerPlayer; i++) {
      this.spawnUnit('grunt', team, gruntBase.x + direction * i * gruntSpacing, gruntBase.y + (i % 2) * 22);
    }
  }

  spawnNeutralCreatures() {
    // Authored guardian placements near future resource rooms and blocked lanes.
    const placements = [
      this.map.tileCenter(29, 20),
      this.map.tileCenter(44, 40),
      this.map.tileCenter(82, 42),
      this.map.tileCenter(101, 55),
    ];
    for (const p of placements) this.spawnUnit('neutralCrawler', 0, p.x, p.y);
  }

  spawnUnit(type, team, x, y) {
    const def = getUnitDef(type);
    const unit = {
      id: this.nextId++,
      type,
      team,
      x,
      y,
      spawnX: x,
      spawnY: y,
      facing: 0,
      visualFacing: 0,

      radius: def.body.radius,
      selectionRadius: def.body.selectionRadius,

      hp: def.vitals.maxHp,
      maxHp: def.vitals.maxHp,

      selected: false,
      visible: true,
      state: UNIT_STATES.IDLE,
      lastStableState: UNIT_STATES.IDLE,

      path: [],
      pathIndex: 0,
      moveTarget: null,
      attackTarget: null,
      attackMoveTarget: null,
      attackSlot: null,
      mobileEngagementSlot: null,
      commandAckUntil: -Infinity,
      commandAckKind: null,
      mobilePursuitRepathAt: 0,
      routeId: null,
      routeReservations: [],
      movementState: {
        lastX: x,
        lastY: y,
        blockedFor: 0,
        repathAt: 0,
        sidestepUntil: 0,
        sidestepSign: 1,
        lastProgressAt: 0,
        lastBlockedAt: -Infinity,
        lastBlockReason: null,
      },
      debug: {
        stateSince: 0,
        lastWaypoint: null,
        pathGoal: null,
        queueAnchor: null,
        blockerId: null,
        lastRepathAt: -Infinity,
        groupRoute: null,
        formationMode: null,
        formationSlot: null,
        engagementSlot: null,
        lanePriority: 0,
        chokeReservation: null,
      },

      combatState: {
        targetId: null,
        cooldownRemaining: 0,
        windupRemaining: 0,
        recoveryRemaining: 0,
        pendingDamage: null,
        lastCombatTime: -Infinity,
        lastDamagedTime: -Infinity,
        attackAnimStart: -Infinity,
        attackAnimDuration: 0,
        impactFlashUntil: -Infinity,
        attackSequence: 0,
      },

      modifiers: [],
    };
    this.units.push(unit);
    return unit;
  }

  getDef(unit) {
    return getUnitDef(unit.type);
  }

  getMoveSpeed(unit) {
    return this.getDef(unit).movement.moveSpeed;
  }

  getRevealRangeTiles(unit) {
    return Math.ceil(this.getDef(unit).vision.revealRange / this.map.tileSize);
  }

  setUnitState(unit, state) {
    if (!unit || unit.state === state) return;
    unit.state = state;
    unit.lastStableState = state;
    if (!unit.debug) unit.debug = {};
    unit.debug.stateSince = this.simTime;
  }

  setDebugPathGoal(unit, point) {
    if (!unit.debug) unit.debug = {};
    unit.debug.pathGoal = point ? { x: point.x, y: point.y } : null;
  }

  update(dt, simTime = this.simTime) {
    this.simTime = simTime;
    this.updateNeutralAggro();
    this.updatePlayerAttackMoveAggro();
    this.updateCombat(dt);
    this.updateMovement(dt);
    this.applySeparation(dt);
    this.updateVisualFacing(dt);
    this.removeDeadUnits();
  }

  updateNeutralAggro() {
    for (const unit of this.units) {
      if (unit.team !== 0 || unit.hp <= 0) continue;
      const combat = this.getDef(unit).combat;
      if (!combat.canAttack) continue;
      const current = this.resolveTarget(unit.attackTarget);
      if (current && this.distanceToTargetEdge(unit, current) <= combat.leashRange) continue;

      const target = this.findNearestEnemyUnit(unit, combat.acquireRange, null);
      if (target) {
        this.assignAttackTarget(unit, { kind: 'unit', id: target.id }, false);
      } else if (unit.attackTarget) {
        unit.attackTarget = null;
        this.releaseAttackSlot(unit);
        this.releaseMobileEngagementSlot(unit);
        unit.combatState.pendingDamage = null;
      }
    }
  }


  updatePlayerAttackMoveAggro() {
    for (const unit of this.units) {
      if (unit.team === 0 || unit.hp <= 0 || !unit.attackMoveTarget) continue;
      const combat = this.getDef(unit).combat;
      if (!combat.canAttack || unit.attackTarget) continue;
      const target = this.findNearestEnemyUnit(unit, combat.acquireRange, null);
      if (target) this.assignAttackTarget(unit, { kind: 'unit', id: target.id }, true, { preserveAttackMove: true });
    }
  }

  findNearestEnemyUnit(source, range, teamFilter = null) {
    let best = null;
    let bestD2 = range * range;
    for (const unit of this.units) {
      if (unit === source || unit.hp <= 0) continue;
      if (teamFilter !== null && unit.team !== teamFilter) continue;
      if (teamFilter === null && unit.team === source.team) continue;
      const d2 = distanceSq(source.x, source.y, unit.x, unit.y);
      if (d2 < bestD2) {
        best = unit;
        bestD2 = d2;
      }
    }
    return best;
  }

  updateCombat(dt) {
    for (const unit of this.units) {
      if (unit.hp <= 0) continue;
      const def = this.getDef(unit);
      const combat = def.combat;
      const state = unit.combatState;

      if (state.cooldownRemaining > 0) state.cooldownRemaining = Math.max(0, state.cooldownRemaining - dt);
      if (state.recoveryRemaining > 0) state.recoveryRemaining = Math.max(0, state.recoveryRemaining - dt);

      if (state.windupRemaining > 0) {
        state.windupRemaining = Math.max(0, state.windupRemaining - dt);
        this.setUnitState(unit, UNIT_STATES.ATTACKING);
        if (state.windupRemaining === 0 && state.pendingDamage) this.resolvePendingDamage(unit);
        continue;
      }

      if (!combat.canAttack || !unit.attackTarget) continue;
      const target = this.resolveTarget(unit.attackTarget);
      if (!target) {
        this.clearAttack(unit, { preserveAttackMove: unit.team !== 0, resumeAttackMove: unit.team !== 0 });
        continue;
      }

      const edgeDistance = this.distanceToTargetEdge(unit, target);
      if (unit.team === 0 && edgeDistance > combat.leashRange) {
        this.clearAttack(unit);
        continue;
      }

      if (target.kind === 'unit') {
        this.refreshMobileEngagementSlot(unit, target);
        if (edgeDistance > combat.attackRange) {
          this.pursueMobileAttackTarget(unit, target);
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
            if (unit.path.length === 0 || slotMovedAwayFromPath) this.pathUnitToAttackTarget(unit, target);
            continue;
          }
        }

        if (edgeDistance > combat.attackRange) {
          if (unit.path.length === 0) this.pathUnitToAttackTarget(unit, target);
          continue;
        }

        if (unit.attackSlot) this.snapToAttackSlotIfClose(unit);
      }
      unit.path = [];
      unit.routeId = null;
      this.reservations.releaseRouteReservations(unit);
      unit.moveTarget = null;
      const center = this.targetCenter(target);
      unit.facing = Math.atan2(center.y - unit.y, center.x - unit.x);
      this.setUnitState(unit, UNIT_STATES.ATTACKING);
      state.lastCombatTime = this.simTime;

      if (state.cooldownRemaining === 0 && state.recoveryRemaining === 0) {
        const now = this.simTime;
        state.windupRemaining = combat.windupTime;
        state.attackAnimStart = now;
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
      this.map.damageDestructible(pending.x, pending.y, pending.amount);
    } else if (pending.kind === 'unit') {
      const target = this.getById(pending.id);
      if (target && target.hp > 0) {
        const damage = this.calculateDamage(pending.amount, pending.damageType, target);
        target.hp = Math.max(0, target.hp - damage);
        target.combatState.lastDamagedTime = this.simTime;
        target.combatState.lastCombatTime = this.simTime;
        const targetCombat = this.getDef(target).combat;
        if (target.team !== unit.team && target.hp > 0 && targetCombat.canAttack && !target.attackTarget) {
          this.assignAttackTarget(target, { kind: 'unit', id: unit.id }, target.team !== 0);
        }
      }
    }

    const now = this.simTime;
    state.impactFlashUntil = now + 0.14;
    const combat = this.getDef(unit).combat;
    state.pendingDamage = null;
    state.recoveryRemaining = combat.recoveryTime;
    state.lastCombatTime = now;
  }

  calculateDamage(amount, damageType, target) {
    const defenses = this.getDef(target).defenses;
    const mitigation = damageType === 'magic' ? defenses.magicResist : defenses.armor;
    return Math.max(1, amount - mitigation);
  }

  removeDeadUnits() {
    const deadIds = new Set(this.units.filter((unit) => unit.hp <= 0).map((unit) => unit.id));
    if (deadIds.size === 0) return;
    for (const unit of this.units) {
      if (deadIds.has(unit.id)) continue;
      if (unit.attackTarget?.kind === 'unit' && deadIds.has(unit.attackTarget.id)) this.clearAttack(unit, { preserveAttackMove: true, resumeAttackMove: true });
    }
    for (const id of deadIds) this.selectedIds.delete(id);
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.cleanupAttackSlotReservations();
    this.cleanupMobileEngagementReservations();
    this.reservations.cleanupRouteReservations(this.simTime, this.units);
  }

  updateMovement(dt) {
    for (const unit of this.units) {
      if (unit.path.length === 0) {
        this.reservations.releaseRouteReservations(unit);
        if (unit.state === UNIT_STATES.MOVING || unit.state === UNIT_STATES.ATTACK_MOVING || unit.state === UNIT_STATES.PURSUING_TARGET || unit.state === UNIT_STATES.QUEUED_BEHIND_ALLY) {
          this.setUnitState(unit, unit.attackTarget ? UNIT_STATES.PURSUING_TARGET : UNIT_STATES.IDLE);
        }
        this.updateUnitProgress(unit, dt, false);
        continue;
      }
      if (unit.combatState.windupRemaining > 0) continue;

      const movingState = unit.attackTarget
        ? (unit.debug?.queueAnchor ? UNIT_STATES.QUEUED_BEHIND_ALLY : UNIT_STATES.PURSUING_TARGET)
        : (unit.attackMoveTarget ? UNIT_STATES.ATTACK_MOVING : UNIT_STATES.MOVING);
      this.setUnitState(unit, movingState);
      const waypoint = unit.path[0];
      const dx = waypoint.x - unit.x;
      const dy = waypoint.y - unit.y;
      const dist = Math.hypot(dx, dy);
      const stopDistance = this.getDef(unit).movement.stopDistance;
      if (dist < stopDistance) {
        unit.path.shift();
        this.resetMovementState(unit);
        if (unit.path.length === 0 && unit.attackSlot) this.snapToAttackSlotIfClose(unit);
        continue;
      }

      const step = Math.min(this.getMoveSpeed(unit) * dt, dist);
      const dirX = dx / dist;
      const dirY = dy / dist;
      const chokeClaim = this.claimRouteChokeCells(unit, waypoint);
      if (!chokeClaim.ok) {
        this.setUnitState(unit, UNIT_STATES.QUEUED_BEHIND_ALLY);
        if (unit.debug) {
          const blocker = this.units.find((candidate) => candidate.id === chokeClaim.blockerId);
          unit.debug.blockerId = chokeClaim.blockerId ?? null;
          unit.debug.queueAnchor = blocker ? { x: blocker.x, y: blocker.y } : null;
        }
        this.updateUnitProgress(unit, dt, false);
        continue;
      }
      let moved = this.tryMoveUnit(unit, dirX * step, dirY * step);

      if (!moved) {
        // Do not immediately discard the waypoint. In chokes that creates
        // back-and-forth path popping. Try wall-sliding first, then let stuck
        // detection escalate to a repath/queue behavior.
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
    if (!this.chokeMap || !waypoint) return { ok: true };
    const cells = this.chokeMap.sampleChokeCellsAlongSegment(unit.x, unit.y, waypoint.x, waypoint.y, 3);
    if (!cells.length) return this.reservations.reserveRouteChokeCells(unit, [], this.simTime, unit.routeId ?? null, null);
    const dx = waypoint.x - unit.x;
    const dy = waypoint.y - unit.y;
    const directionKey = `${Math.sign(Math.round(dx))},${Math.sign(Math.round(dy))}`;
    return this.reservations.reserveRouteChokeCells(unit, cells, this.simTime, unit.routeId ?? null, directionKey);
  }

  tryMoveUnit(unit, dx, dy) {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return false;
    const nx = unit.x + dx;
    const ny = unit.y + dy;
    if (!this.map.isCircleWalkable(nx, ny, unit.radius + 1)) return false;
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
      state.lastProgressAt = this.simTime;
      state.lastBlockReason = null;
      return;
    }
    if (unit.path.length > 0) {
      state.blockedFor += dt;
      state.lastBlockedAt = this.simTime;
      state.lastBlockReason = 'no-progress';
    }
  }

  handleBlockedUnit(unit) {
    if (!unit.movementState) this.resetMovementState(unit);
    const state = unit.movementState;
    if (state.blockedFor < 0.22 || this.simTime < state.repathAt) return;

    this.setUnitState(unit, UNIT_STATES.BLOCKED_REPATHING);
    state.repathAt = this.simTime + 0.28;
    if (unit.debug) unit.debug.lastRepathAt = this.simTime;
    state.sidestepSign *= -1;

    const target = this.resolveTarget(unit.attackTarget);
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

    // Explicit waiting is better than waypoint thrash. The retained attack/move
    // intent will be retried by combat pursuit or the next blocked escalation.
    unit.path = [];
    this.setDebugPathGoal(unit, null);
    this.setUnitState(unit, unit.attackTarget ? UNIT_STATES.BLOCKED_REPATHING : UNIT_STATES.BLOCKED_REPATHING);
  }

  applySeparation(dt) {
    for (let i = 0; i < this.units.length; i++) {
      const a = this.units[i];
      if (a.combatState.windupRemaining > 0 || this.isHoldingAttackSlot(a)) continue;
      let pushX = 0;
      let pushY = 0;
      for (let j = 0; j < this.units.length; j++) {
        if (i === j) continue;
        const b = this.units[j];
        if (b.combatState.windupRemaining > 0 || this.isHoldingAttackSlot(b)) continue;
        if (a.attackSlot?.targetKey && a.attackSlot.targetKey === b.attackSlot?.targetKey) continue;
        const minDist = Math.max(CONFIG.separationRadius, a.radius + b.radius + 2);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > minDist * minDist) continue;

        const aPriority = this.unitMovementPriority(a);
        const bPriority = this.unitMovementPriority(b);
        if (aPriority > bPriority + 1) continue;

        const d = Math.sqrt(d2);
        const baseForce = (minDist - d) / minDist;
        const yieldBoost = bPriority > aPriority ? 1.35 : 0.65;
        pushX += (dx / d) * baseForce * yieldBoost;
        pushY += (dy / d) * baseForce * yieldBoost;
      }
      const push = clampMagnitude(pushX, pushY, 1);
      const nx = a.x + push.x * CONFIG.separationStrength * dt;
      const ny = a.y + push.y * CONFIG.separationStrength * dt;
      if (this.map.isCircleWalkable(nx, ny, a.radius + 1)) {
        a.x = nx;
        a.y = ny;
      }
    }
  }

  unitMovementPriority(unit) {
    let priority = 0;
    if (unit.attackTarget) priority += 3;
    if (unit.state === UNIT_STATES.ATTACKING) priority += 4;
    if (unit.mobileEngagementSlot) priority += 2;
    if (unit.state === UNIT_STATES.QUEUED_BEHIND_ALLY) priority -= 1;
    if (unit.state === UNIT_STATES.BLOCKED_REPATHING) priority -= 1;
    if (unit.path.length > 0) priority += 1;
    const target = this.resolveTarget(unit.attackTarget);
    if (target) {
      const edge = this.distanceToTargetEdge(unit, target);
      const range = this.getDef(unit).combat.attackRange || 0;
      if (edge <= range + 8) priority += 4;
    }
    return priority;
  }

  resetMovementState(unit) {
    unit.movementState = {
      lastX: unit.x,
      lastY: unit.y,
      blockedFor: 0,
      repathAt: 0,
      sidestepUntil: 0,
      sidestepSign: unit.movementState?.sidestepSign ?? 1,
      lastProgressAt: this.simTime,
      lastBlockedAt: -Infinity,
      lastBlockReason: null,
    };
  }

  updateVisualFacing(dt) {
    for (const unit of this.units) {
      const diff = shortestAngle(unit.visualFacing ?? unit.facing, unit.facing);
      const turnSpeed = this.getDef(unit).movement.turnSpeed ?? 10;
      const step = Math.min(1, turnSpeed * dt);
      unit.visualFacing = normalizeAngle((unit.visualFacing ?? unit.facing) + diff * step);
    }
  }

  clearSelection() {
    this.selectedIds.clear();
    for (const unit of this.units) unit.selected = false;
  }

  selectSingle(id, additive = false) {
    const unit = this.getById(id);
    if (!unit || unit.team !== 1) return;
    if (!additive) this.clearSelection();
    if (this.selectedIds.has(id) && additive) {
      this.selectedIds.delete(id);
      unit.selected = false;
      return;
    }
    this.selectedIds.add(id);
    unit.selected = true;
  }

  selectInWorldRect(rect, additive = false) {
    if (!additive) this.clearSelection();
    for (const unit of this.units) {
      if (unit.team !== 1) continue;
      if (unit.x >= rect.x && unit.y >= rect.y && unit.x <= rect.x + rect.w && unit.y <= rect.y + rect.h) {
        this.selectedIds.add(unit.id);
        unit.selected = true;
      }
    }
  }

  getById(id) {
    return this.units.find((unit) => unit.id === id);
  }

  hitTestUnit(worldX, worldY, { selectableOnly = false, attackableOnly = false } = {}) {
    let best = null;
    let bestD2 = Infinity;
    for (const unit of this.units) {
      if (selectableOnly && unit.team !== 1) continue;
      if (attackableOnly && unit.team === 1) continue;
      const d2 = distanceSq(worldX, worldY, unit.x, unit.y);
      const r = unit.selectionRadius;
      if (d2 <= r * r && d2 < bestD2) {
        best = unit;
        bestD2 = d2;
      }
    }
    return best;
  }

  hitTestAttackable(worldX, worldY) {
    return this.hitTestUnit(worldX, worldY, { attackableOnly: true });
  }

  markCommandAck(unit, kind) {
    unit.commandAckKind = kind;
    unit.commandAckUntil = this.simTime + 0.22;
  }


  moveSelectedTo(worldX, worldY) {
    return this.moveUnitsTo(this.selectedUnitIds(), worldX, worldY);
  }

  moveUnitsTo(unitIds, worldX, worldY, team = 1) {
    const units = this.ownedUnitsFromIds(unitIds, team);
    if (units.length === 0) return false;
    return this.issueGroupMove(units, worldX, worldY, { kind: 'move' });
  }

  stopUnits(unitIds, team = 1) {
    const units = this.ownedUnitsFromIds(unitIds, team);
    if (units.length === 0) return false;
    for (const unit of units) {
      this.clearAttack(unit);
      unit.attackMoveTarget = null;
      unit.path = [];
      unit.routeId = null;
      this.reservations.releaseRouteReservations(unit);
      unit.moveTarget = null;
      this.setUnitState(unit, UNIT_STATES.IDLE);
      this.markCommandAck(unit, 'stop');
    }
    return true;
  }

  attackMoveUnitsTo(unitIds, worldX, worldY, team = 1) {
    const units = this.ownedUnitsFromIds(unitIds, team).filter((unit) => this.getDef(unit).combat.canAttack);
    if (units.length === 0) return false;
    return this.issueGroupMove(units, worldX, worldY, { kind: 'attackMove' });
  }

  issueGroupMove(units, worldX, worldY, options = {}) {
    const routeId = `route:${this.nextRouteId++}`;
    const plan = buildGroupMovePlan({
      units,
      map: this.map,
      worldX,
      worldY,
      clearanceForUnit: (unit) => this.unitPathClearance(unit),
    });
    const route = plan.route;
    const formationMode = plan.formationMode;
    const columns = plan.columns;

    let issued = false;
    for (const assignment of plan.assignments) {
      const unit = assignment.unit;
      this.clearAttack(unit);
      if (options.kind !== 'attackMove') unit.attackMoveTarget = null;
      const planned = this.buildPathToWorld(unit, assignment.targetX, assignment.targetY);
      if (!planned) continue;
      unit.path = mergeGroupRouteForUnit({ map: this.map, unit, personalPath: planned.path, groupRoute: route });
      unit.pathIndex = 0;
      unit.routeId = routeId;
      this.reservations.releaseRouteReservations(unit);
      unit.moveTarget = planned.finalPoint;
      if (options.kind === 'attackMove') unit.attackMoveTarget = { x: planned.finalPoint.x, y: planned.finalPoint.y };
      if (unit.debug) {
        unit.debug.groupRoute = route ? route.map((p) => ({ x: p.x, y: p.y })) : null;
        unit.debug.formationMode = formationMode;
        unit.debug.formationSlot = { index: assignment.slotIndex, columns };
      }
      this.setDebugPathGoal(unit, planned.finalPoint);
      this.resetMovementState(unit);
      this.setUnitState(unit, options.kind === 'attackMove' ? UNIT_STATES.ATTACK_MOVING : UNIT_STATES.MOVING);
      this.markCommandAck(unit, options.kind === 'attackMove' ? 'attackMove' : 'move');
      issued = true;
    }
    return issued;
  }

  attackSelectedDestructible(tileX, tileY) {
    return this.attackUnitsDestructible(this.selectedUnitIds(), tileX, tileY);
  }

  attackUnitsDestructible(unitIds, tileX, tileY, team = 1) {
    if (!this.map.isDestructibleTile(tileX, tileY)) return false;
    const selected = this.ownedUnitsFromIds(unitIds, team).filter((unit) => this.getDef(unit).combat.canAttack);
    if (selected.length === 0) return false;

    // Treat adjacent destructible tiles as one gate for command distribution.
    // This prevents three grunts from all trying to attack the exact clicked tile
    // when the actual target is a wider membrane barrier.
    const gateTiles = this.findConnectedDestructibleTiles(tileX, tileY);
    const targetCenter = this.map.tileCenter(tileX, tileY);
    const sortedUnits = [...selected].sort((a, b) => distanceSq(a.x, a.y, targetCenter.x, targetCenter.y) - distanceSq(b.x, b.y, targetCenter.x, targetCenter.y));
    const sortedTiles = [...gateTiles].sort((a, b) => distanceSq(targetCenter.x, targetCenter.y, this.map.tileCenter(a.x, a.y).x, this.map.tileCenter(a.x, a.y).y) - distanceSq(targetCenter.x, targetCenter.y, this.map.tileCenter(b.x, b.y).x, this.map.tileCenter(b.x, b.y).y));

    for (const tile of sortedTiles) this.clearReservationsForTarget(this.targetKey({ kind: 'destructibleTile', x: tile.x, y: tile.y }));

    sortedUnits.forEach((unit, index) => {
      const tile = sortedTiles[index % sortedTiles.length];
      this.assignAttackTarget(unit, { kind: 'destructibleTile', x: tile.x, y: tile.y }, true);
      this.markCommandAck(unit, 'attack');
    });
    return true;
  }

  findConnectedDestructibleTiles(tileX, tileY) {
    const seen = new Set();
    const out = [];
    const queue = [{ x: tileX, y: tileY }];
    while (queue.length > 0) {
      const cur = queue.shift();
      const key = `${cur.x},${cur.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.map.isDestructibleTile(cur.x, cur.y)) continue;
      out.push(cur);
      queue.push({ x: cur.x + 1, y: cur.y });
      queue.push({ x: cur.x - 1, y: cur.y });
      queue.push({ x: cur.x, y: cur.y + 1 });
      queue.push({ x: cur.x, y: cur.y - 1 });
    }
    return out.length > 0 ? out : [{ x: tileX, y: tileY }];
  }

  attackSelectedUnit(targetUnit) {
    return this.attackUnitsUnit(this.selectedUnitIds(), targetUnit);
  }

  attackUnitsUnit(unitIds, targetUnit, team = 1) {
    if (!targetUnit || targetUnit.team === team || targetUnit.hp <= 0) return false;
    return this.attackUnitsTarget(unitIds, { kind: 'unit', id: targetUnit.id }, team);
  }

  attackSelectedTarget(targetRef) {
    return this.attackUnitsTarget(this.selectedUnitIds(), targetRef);
  }

  attackUnitsTarget(unitIds, targetRef, team = 1) {
    const target = this.resolveTarget(targetRef);
    if (!target) return false;
    const selected = this.ownedUnitsFromIds(unitIds, team).filter((unit) => this.getDef(unit).combat.canAttack);
    if (selected.length === 0) return false;
    this.clearReservationsForTarget(this.targetKey(targetRef));
    this.clearMobileReservationsForTarget(this.targetKey(targetRef));
    const sorted = [...selected].sort((a, b) => distanceSq(a.x, a.y, this.targetCenter(target).x, this.targetCenter(target).y) - distanceSq(b.x, b.y, this.targetCenter(target).x, this.targetCenter(target).y));
    for (const unit of sorted) {
      this.assignAttackTarget(unit, targetRef, true);
      this.markCommandAck(unit, 'attack');
    }
    return true;
  }

  assignAttackTarget(unit, targetRef, reserveSlot = true, options = {}) {
    this.releaseAttackSlot(unit);
    this.releaseMobileEngagementSlot(unit);
    unit.attackTarget = { ...targetRef };
    if (!options.preserveAttackMove) unit.attackMoveTarget = null;
    unit.combatState.pendingDamage = null;
    unit.combatState.windupRemaining = 0;
    unit.combatState.recoveryRemaining = 0;
    unit.mobilePursuitRepathAt = 0;
    this.resetMovementState(unit);
    const target = this.resolveTarget(targetRef);
    if (reserveSlot && target?.kind !== 'unit') this.reserveAttackSlot(unit, targetRef);
    if (reserveSlot && target?.kind === 'unit') this.reserveMobileEngagementSlot(unit, target);
    if (target?.kind === 'unit') this.pursueMobileAttackTarget(unit, target);
    else if (target) this.pathUnitToAttackTarget(unit, target);
  }

  clearAttack(unit, options = {}) {
    this.releaseAttackSlot(unit);
    this.releaseMobileEngagementSlot(unit);
    unit.attackTarget = null;
    unit.combatState.pendingDamage = null;
    unit.combatState.windupRemaining = 0;
    unit.combatState.recoveryRemaining = 0;
    unit.path = [];
    unit.routeId = null;
    this.reservations.releaseRouteReservations(unit);
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
    this.resetMovementState(unit);
    this.setUnitState(unit, UNIT_STATES.IDLE);
    if (!options.preserveAttackMove) unit.attackMoveTarget = null;
    if (options.resumeAttackMove && unit.attackMoveTarget) {
      this.pathUnitToWorld(unit, unit.attackMoveTarget.x, unit.attackMoveTarget.y);
      this.setUnitState(unit, UNIT_STATES.ATTACK_MOVING);
    }
  }

  resolveTarget(ref) {
    if (!ref) return null;
    if (ref.kind === 'destructibleTile') {
      const wall = this.map.getDestructible(ref.x, ref.y);
      return wall ? { kind: 'destructibleTile', ...wall } : null;
    }
    if (ref.kind === 'unit') {
      const unit = this.getById(ref.id);
      return unit && unit.hp > 0 ? { kind: 'unit', unit } : null;
    }
    return null;
  }

  targetKey(ref) {
    if (!ref) return '';
    if (ref.kind === 'destructibleTile') return `tile:${ref.x},${ref.y}`;
    if (ref.kind === 'unit') return `unit:${ref.id}`;
    return '';
  }

  targetCenter(target) {
    if (target.kind === 'destructibleTile') return this.map.tileCenter(target.x, target.y);
    return { x: target.unit.x, y: target.unit.y };
  }

  targetRadius(target) {
    if (target.kind === 'destructibleTile') return this.map.tileSize * 0.5;
    return target.unit.radius;
  }

  distanceToTargetEdge(unit, target) {
    const center = this.targetCenter(target);
    return Math.max(0, Math.hypot(center.x - unit.x, center.y - unit.y) - this.targetRadius(target));
  }

  distanceToAttackSlot(unit) {
    if (!unit.attackSlot) return 0;
    return Math.hypot(unit.attackSlot.x - unit.x, unit.attackSlot.y - unit.y);
  }

  refreshMobileAttackSlot(unit, target) {
    if (!unit.attackSlot || !target || target.kind !== 'unit') return;
    // Unit targets move. Keep the reserved melee slot attached to the target's
    // current body instead of sending attackers to the position the target had
    // when the click happened. Static wall slots intentionally remain fixed.
    const angle = Number.isFinite(unit.attackSlot.angle)
      ? unit.attackSlot.angle
      : Math.atan2(unit.y - target.unit.y, unit.x - target.unit.x);
    const dist = target.unit.radius + unit.radius + SLOT_RADIUS_PADDING;
    const x = target.unit.x + Math.cos(angle) * dist;
    const y = target.unit.y + Math.sin(angle) * dist;
    if (this.map.isCircleWalkable(x, y, unit.radius + 1)) {
      unit.attackSlot.x = x;
      unit.attackSlot.y = y;
      unit.attackSlot.angle = angle;
    }
  }

  isHoldingAttackSlot(unit) {
    if (!unit.attackSlot) return false;
    return this.distanceToAttackSlot(unit) <= Math.max(3, this.getDef(unit).movement.stopDistance + 1);
  }

  snapToAttackSlotIfClose(unit) {
    if (!unit.attackSlot) return false;
    const d = this.distanceToAttackSlot(unit);
    if (d <= Math.max(4, this.getDef(unit).movement.stopDistance + 2) && this.map.isCircleWalkable(unit.attackSlot.x, unit.attackSlot.y, unit.radius + 1)) {
      unit.x = unit.attackSlot.x;
      unit.y = unit.attackSlot.y;
      unit.path = [];
      unit.routeId = null;
      this.reservations.releaseRouteReservations(unit);
      unit.moveTarget = null;
      return true;
    }
    return false;
  }

  pursueMobileAttackTarget(unit, target, options = {}) {
    if (!target || target.kind !== 'unit') return false;
    const combat = this.getDef(unit).combat;
    const center = this.targetCenter(target);
    const slot = this.reserveMobileEngagementSlot(unit, target);
    const dx = unit.x - center.x;
    const dy = unit.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    const preferredAngle = Number.isFinite(slot?.angle) ? slot.angle : Math.atan2(dy, dx);
    const desiredCenterDistance = this.targetRadius(target) + Math.max(unit.radius + 4, combat.attackRange * 0.72);
    const destination = {
      x: center.x + Math.cos(preferredAngle) * desiredCenterDistance,
      y: center.y + Math.sin(preferredAngle) * desiredCenterDistance,
    };

    // Dynamic melee reservations are soft lanes, not hard static waypoints. The
    // point moves with the target each tick, but each attacker keeps a stable
    // angular lane so multiple grunts stop fighting for the same approach pixel.
    if (this.map.isCircleWalkable(destination.x, destination.y, unit.radius + 1) && this.mobileEngagementSlotReachable(unit, destination, target)) {
      unit.path = [destination];
      unit.moveTarget = destination;
      if (unit.debug) {
        unit.debug.queueAnchor = null;
        unit.debug.blockerId = null;
      }
      this.refreshMobileEngagementSlot(unit, target);
      this.setDebugPathGoal(unit, destination);
      this.setUnitState(unit, UNIT_STATES.PURSUING_TARGET);
      this.resetMovementState(unit);
      return true;
    }

    if (!options.forceRepath && unit.path.length > 0 && this.simTime < (unit.mobilePursuitRepathAt ?? 0)) return true;

    const planned = this.findMobileEngagementPath(unit, target, desiredCenterDistance, preferredAngle);
    if (planned) {
      unit.path = planned.path;
      unit.moveTarget = planned.finalPoint;
      this.refreshMobileEngagementSlot(unit, target);
      this.setDebugPathGoal(unit, planned.finalPoint);
      this.setUnitState(unit, UNIT_STATES.PURSUING_TARGET);
      this.resetMovementState(unit);
      unit.mobilePursuitRepathAt = this.simTime + 0.24;
      return true;
    }

    if (options.allowQueue !== false) {
      const queued = this.pathUnitToAttackQueue(unit, target);
      if (queued) {
        unit.mobilePursuitRepathAt = this.simTime + 0.24;
        return true;
      }
    }

    unit.mobilePursuitRepathAt = this.simTime + 0.24;
    unit.path = [];
    unit.moveTarget = null;
    this.setUnitState(unit, UNIT_STATES.BLOCKED_REPATHING);
    return false;
  }

  mobileEngagementSlotReachable(unit, destination, target) {
    // In open space, direct steering is fine. In a lane, reject lateral jumps
    // that would cross through the target/frontline and cause units to swap
    // lanes every frame.
    const slot = unit.mobileEngagementSlot;
    if (!slot || !target?.unit) return true;
    const targetUnit = target.unit;
    const toUnit = { x: unit.x - targetUnit.x, y: unit.y - targetUnit.y };
    const toDest = { x: destination.x - targetUnit.x, y: destination.y - targetUnit.y };
    const unitAngle = Math.atan2(toUnit.y, toUnit.x);
    const destAngle = Math.atan2(toDest.y, toDest.x);
    return Math.abs(shortestAngle(unitAngle, destAngle)) < Math.PI * 0.75;
  }

  pathUnitToAttackQueue(unit, target) {
    if (!target || target.kind !== 'unit') return false;
    const targetUnit = target.unit;
    const slot = this.reserveMobileEngagementSlot(unit, target);
    const slotAngle = Number.isFinite(slot?.angle) ? slot.angle : Math.atan2(unit.y - targetUnit.y, unit.x - targetUnit.x);

    let blocker = null;
    let blockerScore = Infinity;
    for (const ally of this.units) {
      if (ally === unit || ally.team !== unit.team || ally.hp <= 0) continue;
      if (ally.attackTarget?.kind !== 'unit' || ally.attackTarget.id !== targetUnit.id) continue;
      const allyEdge = this.distanceToTargetEdge(ally, target);
      const unitEdge = this.distanceToTargetEdge(unit, target);
      if (allyEdge > unitEdge + 8) continue;
      const allyAngle = ally.mobileEngagementSlot?.angle ?? Math.atan2(ally.y - targetUnit.y, ally.x - targetUnit.x);
      const lanePenalty = Math.abs(shortestAngle(slotAngle, allyAngle)) * 80;
      const d2 = distanceSq(unit.x, unit.y, ally.x, ally.y);
      const score = d2 + lanePenalty;
      if (score < blockerScore) {
        blocker = ally;
        blockerScore = score;
      }
    }
    if (!blocker) return false;

    const awayX = blocker.x - targetUnit.x;
    const awayY = blocker.y - targetUnit.y;
    const len = Math.hypot(awayX, awayY) || 1;
    const queueOrdinal = this.queueOrdinalBehindBlocker(unit, blocker, target);
    const queueDistance = blocker.radius + unit.radius + MOBILE_QUEUE_SPACING + queueOrdinal * MOBILE_QUEUE_SPACING;
    const qx = blocker.x + (awayX / len) * queueDistance;
    const qy = blocker.y + (awayY / len) * queueDistance;
    if (!this.map.isCircleWalkable(qx, qy, unit.radius + 1)) return false;
    const ok = this.pathUnitToWorld(unit, qx, qy);
    if (ok) {
      if (unit.debug) {
        unit.debug.queueAnchor = { x: qx, y: qy };
        unit.debug.blockerId = blocker.id;
        unit.debug.lanePriority = queueOrdinal + 1;
      }
      this.setUnitState(unit, UNIT_STATES.QUEUED_BEHIND_ALLY);
    }
    return ok;
  }

  queueOrdinalBehindBlocker(unit, blocker, target) {
    let count = 0;
    for (const ally of this.units) {
      if (ally === unit || ally === blocker || ally.team !== unit.team || ally.hp <= 0) continue;
      if (ally.attackTarget?.kind !== 'unit' || ally.attackTarget.id !== target.unit.id) continue;
      if (ally.debug?.blockerId === blocker.id) count += 1;
    }
    return count;
  }

  findMobileEngagementPath(unit, target, desiredCenterDistance, preferredAngle) {
    const center = this.targetCenter(target);
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
      if (!this.map.isCircleWalkable(x, y, unit.radius + 1)) continue;
      const planned = this.buildPathToWorld(unit, x, y);
      if (!planned) continue;
      const final = planned.finalPoint;
      const angleCost = Math.abs(shortestAngle(preferredAngle, angle)) * 70;
      const score = planned.path.length * this.map.tileSize + Math.hypot(final.x - unit.x, final.y - unit.y) + angleCost;
      if (score < bestScore) {
        best = planned;
        bestScore = score;
      }
    }
    return best;
  }

  pathUnitToAttackTarget(unit, target) {
    const slot = unit.attackSlot;
    if (slot) return this.pathUnitToWorld(unit, slot.x, slot.y);

    if (target.kind === 'destructibleTile') return this.pathUnitAdjacentToTile(unit, target.x, target.y);
    const center = this.targetCenter(target);
    const combat = this.getDef(unit).combat;
    const dx = unit.x - center.x;
    const dy = unit.y - center.y;
    const len = Math.hypot(dx, dy) || 1;
    const desiredDist = this.targetRadius(target) + combat.attackRange * 0.78;
    return this.pathUnitToWorld(unit, center.x + (dx / len) * desiredDist, center.y + (dy / len) * desiredDist);
  }

  reserveAttackSlot(unit, targetRef) {
    return this.reservations.reserveStaticAttackSlot(unit, targetRef);
  }

  releaseAttackSlot(unit) {
    this.reservations.releaseStaticAttackSlot(unit);
  }

  clearReservationsForTarget(key) {
    this.reservations.clearStaticReservationsForTarget(key, this.units);
  }

  cleanupAttackSlotReservations() {
    this.reservations.cleanupStaticAttackSlots(this.units);
  }

  reserveMobileEngagementSlot(unit, target) {
    return this.reservations.reserveMobileEngagementSlot(unit, target);
  }

  mobileEngagementSlotPoint(unit, target, angle) {
    return this.reservations.mobileEngagementSlotPoint(unit, target, angle);
  }

  refreshMobileEngagementSlot(unit, target) {
    this.reservations.refreshMobileEngagementSlot(unit, target);
  }

  releaseMobileEngagementSlot(unit) {
    this.reservations.releaseMobileEngagementSlot(unit);
  }

  clearMobileReservationsForTarget(key) {
    this.reservations.clearMobileReservationsForTarget(key, this.units);
  }

  cleanupMobileEngagementReservations() {
    this.reservations.cleanupMobileEngagementReservations(this.units);
  }

  attackSlotsForTarget(target, unit) {
    if (target.kind === 'destructibleTile') return this.attackSlotsForTile(target.x, target.y, unit);
    return this.attackSlotsForUnit(target.unit, unit);
  }

  attackSlotsForTile(tileX, tileY, unit) {
    const candidates = [];
    const tileSize = this.map.tileSize;
    const center = this.map.tileCenter(tileX, tileY);
    const sideOffset = tileSize * 0.5 + unit.radius + 3;
    // Two slots per open side. Three bodies cannot fit cleanly across a single 32px tile face.
    const tangentOffsets = [-unit.radius - 4, unit.radius + 4];
    const sides = [
      { name: 'N', nx: 0, ny: -1, tx: 1, ty: 0 },
      { name: 'S', nx: 0, ny: 1, tx: 1, ty: 0 },
      { name: 'W', nx: -1, ny: 0, tx: 0, ty: 1 },
      { name: 'E', nx: 1, ny: 0, tx: 0, ty: 1 },
    ];

    for (const side of sides) {
      const neighborX = tileX + side.nx;
      const neighborY = tileY + side.ny;
      if (!this.map.isWalkableTile(neighborX, neighborY)) continue;
      for (const tangent of tangentOffsets) {
        const x = center.x + side.nx * sideOffset + side.tx * tangent;
        const y = center.y + side.ny * sideOffset + side.ty * tangent;
        if (!this.map.isCircleWalkable(x, y, unit.radius + 1)) continue;
        candidates.push({
          key: `${side.name}:${tangent}`,
          x,
          y,
          tileX: neighborX,
          tileY: neighborY,
          side: side.name,
        });
      }
    }

    // Diagonal fallback only. These are lower priority because they can create ugly corner crowding.
    for (let y = tileY - 1; y <= tileY + 1; y++) {
      for (let x = tileX - 1; x <= tileX + 1; x++) {
        if (x === tileX && y === tileY) continue;
        if (x === tileX || y === tileY) continue;
        if (!this.map.isWalkableTile(x, y)) continue;
        const c = this.map.tileCenter(x, y);
        if (!this.map.isCircleWalkable(c.x, c.y, unit.radius + 1)) continue;
        candidates.push({ key: `D:${x},${y}`, x: c.x, y: c.y, tileX: x, tileY: y, diagonal: true });
      }
    }

    return candidates;
  }

  attackSlotsForUnit(targetUnit, attacker) {
    const slots = [];
    const combat = this.getDef(attacker).combat;
    const count = 8;
    const dist = targetUnit.radius + attacker.radius + SLOT_RADIUS_PADDING;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      const x = targetUnit.x + Math.cos(a) * dist;
      const y = targetUnit.y + Math.sin(a) * dist;
      if (!this.map.isCircleWalkable(x, y, attacker.radius + 1)) continue;
      slots.push({ key: `${targetUnit.id}:${i}`, x, y, angle: a, attackRange: combat.attackRange });
    }
    return slots;
  }

  pathUnitAdjacentToTile(unit, tileX, tileY) {
    const slots = this.attackSlotsForTile(tileX, tileY, unit).sort((a, b) => distanceSq(unit.x, unit.y, a.x, a.y) - distanceSq(unit.x, unit.y, b.x, b.y));
    for (const slot of slots) {
      if (this.pathUnitToWorld(unit, slot.x, slot.y)) return true;
    }
    return false;
  }

  buildPathToWorld(unit, worldX, worldY) {
    const targetTile = this.map.worldToTile(worldX, worldY);
    const clearance = this.unitPathClearance(unit);
    const corrected = this.map.nearestWalkableTileForRadius(targetTile.x, targetTile.y, clearance);
    if (!corrected) return null;
    const startTile = this.map.worldToTile(unit.x, unit.y);
    const path = findPath(this.map, startTile, corrected, { clearance });
    if (path.length === 0) return null;

    // Do not force the final waypoint back onto the raw requested point when
    // that point is not physically reachable by the unit body. The old behavior
    // could path to a corrected walkable tile, then replace the final waypoint
    // with an unwalkable point next to/inside a wall or moving target. The unit
    // would then try to step into blocked space, drop the waypoint, repath, and
    // repeat forever as visible back-and-forth jitter.
    const rawPointIsUsable =
      corrected.x === targetTile.x &&
      corrected.y === targetTile.y &&
      this.map.isCircleWalkable(worldX, worldY, unit.radius + 1);
    const finalPoint = rawPointIsUsable ? { x: worldX, y: worldY } : this.map.tileCenter(corrected.x, corrected.y);
    path[path.length - 1] = finalPoint;
    return { path, finalPoint };
  }

  pathUnitToWorld(unit, worldX, worldY) {
    const planned = this.buildPathToWorld(unit, worldX, worldY);
    if (!planned) return false;
    unit.path = planned.path;
    unit.pathIndex = 0;
    unit.routeId = unit.routeId ?? `solo:${unit.id}:${this.nextRouteId++}`;
    this.reservations.releaseRouteReservations(unit);
    unit.moveTarget = planned.finalPoint;
    this.setDebugPathGoal(unit, planned.finalPoint);
    this.resetMovementState(unit);
    return true;
  }

  unitPathClearance(unit) {
    // A* and body movement now agree on the same collision envelope. This
    // prevents routes through tile centers that a circular unit cannot actually
    // occupy once wall collision is checked.
    return unit.radius + 1;
  }

  updateDiscovery(fog) {
    for (const unit of this.units) {
      const tile = this.map.worldToTile(unit.x, unit.y);
      if (unit.team !== 1 && fog.isVisible(tile.x, tile.y)) unit.discovered = true;
    }
  }

  stateCounts() {
    const counts = new Map();
    for (const unit of this.units) counts.set(unit.state, (counts.get(unit.state) ?? 0) + 1);
    return counts;
  }

  selectedDebugSummary() {
    const selected = this.selectedUnits();
    if (selected.length === 0) return 'none';
    const counts = new Map();
    for (const unit of selected) counts.set(unit.state, (counts.get(unit.state) ?? 0) + 1);
    return [...counts.entries()].map(([state, count]) => `${state}:${count}`).join(' ');
  }

  selectedUnitIds() {
    return [...this.selectedIds];
  }

  ownedUnitsFromIds(unitIds, team = 1) {
    const requested = new Set(unitIds);
    return this.units.filter((unit) => requested.has(unit.id) && unit.team === team && unit.hp > 0);
  }


  teamUnits(team) {
    return this.units.filter((unit) => unit.team === team && unit.hp > 0);
  }

  idleTeamUnits(team, type = null) {
    return this.teamUnits(team).filter((unit) => {
      if (type && unit.type !== type) return false;
      return !unit.attackTarget && unit.path.length === 0 && unit.combatState.windupRemaining === 0 && unit.combatState.recoveryRemaining === 0;
    });
  }

  nearestLiveUnit(sourceX, sourceY, predicate) {
    let best = null;
    let bestD2 = Infinity;
    for (const unit of this.units) {
      if (unit.hp <= 0 || !predicate(unit)) continue;
      const d2 = distanceSq(sourceX, sourceY, unit.x, unit.y);
      if (d2 < bestD2) {
        best = unit;
        bestD2 = d2;
      }
    }
    return best;
  }

  selectedUnits() {
    return this.units.filter((unit) => this.selectedIds.has(unit.id));
  }

  selectedCenter() {
    const selected = this.selectedUnits();
    if (selected.length === 0) return null;
    const sum = selected.reduce((acc, unit) => {
      acc.x += unit.x;
      acc.y += unit.y;
      return acc;
    }, { x: 0, y: 0 });
    return { x: sum.x / selected.length, y: sum.y / selected.length };
  }
}


function normalizeAngle(angle) {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function shortestAngle(from, to) {
  return normalizeAngle(to - from);
}
