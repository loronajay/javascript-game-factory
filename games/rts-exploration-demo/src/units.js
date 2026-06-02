import { CONFIG } from './config.js';
import { getUnitDef } from './unit-defs.js';
import { clampMagnitude, distanceSq } from './utils.js';
import { findPath } from './pathfinding.js';

const SLOT_RADIUS_PADDING = 8;

export class UnitManager {
  constructor(map) {
    this.map = map;
    this.units = [];
    this.selectedIds = new Set();
    this.attackSlotReservations = new Map();
    this.nextId = 1;
    this.spawnStartingUnits();
    this.spawnNeutralCreatures();
  }

  spawnStartingUnits() {
    const base = this.map.tileCenter(10, 10);
    const scoutSpacing = 38;
    for (let i = 0; i < CONFIG.startingScoutsPerPlayer; i++) {
      this.spawnUnit('scout', 1, base.x + i * scoutSpacing, base.y + (i % 2) * 20);
    }

    const gruntBase = this.map.tileCenter(10, 13);
    const gruntSpacing = 34;
    for (let i = 0; i < CONFIG.startingGruntsPerPlayer; i++) {
      this.spawnUnit('grunt', 1, gruntBase.x + i * gruntSpacing, gruntBase.y + (i % 2) * 22);
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
      state: 'idle',

      path: [],
      pathIndex: 0,
      moveTarget: null,
      attackTarget: null,
      attackSlot: null,
      commandAckUntil: -Infinity,
      commandAckKind: null,

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

  update(dt) {
    this.updateNeutralAggro();
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

      const target = this.findNearestEnemyUnit(unit, combat.acquireRange, 1);
      if (target) {
        this.assignAttackTarget(unit, { kind: 'unit', id: target.id }, false);
      } else if (unit.attackTarget) {
        unit.attackTarget = null;
        this.releaseAttackSlot(unit);
        unit.combatState.pendingDamage = null;
      }
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
        unit.state = 'attacking';
        if (state.windupRemaining === 0 && state.pendingDamage) this.resolvePendingDamage(unit);
        continue;
      }

      if (!combat.canAttack || !unit.attackTarget) continue;
      const target = this.resolveTarget(unit.attackTarget);
      if (!target) {
        this.clearAttack(unit);
        continue;
      }

      const edgeDistance = this.distanceToTargetEdge(unit, target);
      if (unit.team === 0 && edgeDistance > combat.leashRange) {
        this.clearAttack(unit);
        continue;
      }

      if (unit.attackSlot && !this.isHoldingAttackSlot(unit)) {
        this.snapToAttackSlotIfClose(unit);
        if (!this.isHoldingAttackSlot(unit)) {
          if (unit.path.length === 0) this.pathUnitToAttackTarget(unit, target);
          continue;
        }
      }

      if (edgeDistance > combat.attackRange) {
        if (unit.path.length === 0) this.pathUnitToAttackTarget(unit, target);
        continue;
      }

      if (unit.attackSlot) this.snapToAttackSlotIfClose(unit);
      unit.path = [];
      unit.moveTarget = null;
      const center = this.targetCenter(target);
      unit.facing = Math.atan2(center.y - unit.y, center.x - unit.x);
      unit.state = 'attacking';
      state.lastCombatTime = performance.now() / 1000;

      if (state.cooldownRemaining === 0 && state.recoveryRemaining === 0) {
        const now = performance.now() / 1000;
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
        target.combatState.lastDamagedTime = performance.now() / 1000;
        target.combatState.lastCombatTime = performance.now() / 1000;
        if (target.team === 0 && target.hp > 0 && !target.attackTarget) {
          this.assignAttackTarget(target, { kind: 'unit', id: unit.id }, false);
        }
      }
    }

    const now = performance.now() / 1000;
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
      if (unit.attackTarget?.kind === 'unit' && deadIds.has(unit.attackTarget.id)) this.clearAttack(unit);
    }
    for (const id of deadIds) this.selectedIds.delete(id);
    this.units = this.units.filter((unit) => unit.hp > 0);
    this.cleanupAttackSlotReservations();
  }

  updateMovement(dt) {
    for (const unit of this.units) {
      if (unit.path.length === 0) {
        if (unit.state === 'moving') unit.state = unit.attackTarget ? 'pursuing' : 'idle';
        continue;
      }
      if (unit.combatState.windupRemaining > 0) continue;

      unit.state = unit.attackTarget ? 'pursuing' : 'moving';
      const waypoint = unit.path[0];
      const dx = waypoint.x - unit.x;
      const dy = waypoint.y - unit.y;
      const dist = Math.hypot(dx, dy);
      const stopDistance = this.getDef(unit).movement.stopDistance;
      if (dist < stopDistance) {
        unit.path.shift();
        if (unit.path.length === 0 && unit.attackSlot) this.snapToAttackSlotIfClose(unit);
        continue;
      }
      const step = Math.min(this.getMoveSpeed(unit) * dt, dist);
      const nx = unit.x + (dx / dist) * step;
      const ny = unit.y + (dy / dist) * step;
      if (this.map.isCircleWalkable(nx, ny, unit.radius + 1)) {
        unit.x = nx;
        unit.y = ny;
      } else {
        unit.path.shift();
      }
      unit.facing = Math.atan2(dy, dx);
    }
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
        const d = Math.sqrt(d2);
        const force = (minDist - d) / minDist;
        pushX += (dx / d) * force;
        pushY += (dy / d) * force;
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
    unit.commandAckUntil = performance.now() / 1000 + 0.22;
  }


  moveSelectedTo(worldX, worldY) {
    const selected = this.selectedUnits();
    if (selected.length === 0) return false;
    const offsets = formationOffsets(selected.length, CONFIG.formationSpacing);
    let issued = false;
    selected.forEach((unit, index) => {
      this.clearAttack(unit);
      const offset = offsets[index];
      const targetTile = this.map.worldToTile(worldX + offset.x, worldY + offset.y);
      const corrected = this.map.nearestWalkableTile(targetTile.x, targetTile.y);
      if (!corrected) return;
      const startTile = this.map.worldToTile(unit.x, unit.y);
      const path = findPath(this.map, startTile, corrected);
      if (path.length > 0) {
        unit.path = path;
        unit.pathIndex = 0;
        unit.moveTarget = this.map.tileCenter(corrected.x, corrected.y);
        this.markCommandAck(unit, 'move');
        issued = true;
      }
    });
    return issued;
  }

  attackSelectedDestructible(tileX, tileY) {
    if (!this.map.isDestructibleTile(tileX, tileY)) return false;
    const selected = this.selectedUnits().filter((unit) => this.getDef(unit).combat.canAttack);
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
    if (!targetUnit || targetUnit.team === 1 || targetUnit.hp <= 0) return false;
    return this.attackSelectedTarget({ kind: 'unit', id: targetUnit.id });
  }

  attackSelectedTarget(targetRef) {
    const target = this.resolveTarget(targetRef);
    if (!target) return false;
    const selected = this.selectedUnits().filter((unit) => this.getDef(unit).combat.canAttack);
    if (selected.length === 0) return false;
    this.clearReservationsForTarget(this.targetKey(targetRef));
    const sorted = [...selected].sort((a, b) => distanceSq(a.x, a.y, this.targetCenter(target).x, this.targetCenter(target).y) - distanceSq(b.x, b.y, this.targetCenter(target).x, this.targetCenter(target).y));
    for (const unit of sorted) {
      this.assignAttackTarget(unit, targetRef, true);
      this.markCommandAck(unit, 'attack');
    }
    return true;
  }

  assignAttackTarget(unit, targetRef, reserveSlot = true) {
    this.releaseAttackSlot(unit);
    unit.attackTarget = { ...targetRef };
    unit.combatState.pendingDamage = null;
    unit.combatState.windupRemaining = 0;
    unit.combatState.recoveryRemaining = 0;
    if (reserveSlot) this.reserveAttackSlot(unit, targetRef);
    const target = this.resolveTarget(targetRef);
    if (target) this.pathUnitToAttackTarget(unit, target);
  }

  clearAttack(unit) {
    this.releaseAttackSlot(unit);
    unit.attackTarget = null;
    unit.combatState.pendingDamage = null;
    unit.combatState.windupRemaining = 0;
    unit.path = [];
    unit.moveTarget = null;
    unit.state = 'idle';
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
      unit.moveTarget = null;
      return true;
    }
    return false;
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
    const target = this.resolveTarget(targetRef);
    if (!target) return false;
    const key = this.targetKey(targetRef);
    const slots = this.attackSlotsForTarget(target, unit);
    let reservations = this.attackSlotReservations.get(key);
    if (!reservations) {
      reservations = new Map();
      this.attackSlotReservations.set(key, reservations);
    }

    const occupied = new Set([...reservations.values()].map((slot) => slot.key));
    slots.sort((a, b) => {
      const ad = distanceSq(unit.x, unit.y, a.x, a.y) + (a.diagonal ? 25000 : 0);
      const bd = distanceSq(unit.x, unit.y, b.x, b.y) + (b.diagonal ? 25000 : 0);
      return ad - bd;
    });
    const chosen = slots.find((slot) => !occupied.has(slot.key)) ?? slots[0];
    if (!chosen) return false;

    reservations.set(unit.id, chosen);
    unit.attackSlot = { targetKey: key, ...chosen };
    return true;
  }

  releaseAttackSlot(unit) {
    if (!unit.attackSlot) return;
    const reservations = this.attackSlotReservations.get(unit.attackSlot.targetKey);
    if (reservations) {
      reservations.delete(unit.id);
      if (reservations.size === 0) this.attackSlotReservations.delete(unit.attackSlot.targetKey);
    }
    unit.attackSlot = null;
  }

  clearReservationsForTarget(key) {
    const reservations = this.attackSlotReservations.get(key);
    if (!reservations) return;
    for (const unit of this.units) {
      if (unit.attackSlot?.targetKey === key) unit.attackSlot = null;
    }
    this.attackSlotReservations.delete(key);
  }

  cleanupAttackSlotReservations() {
    const live = new Set(this.units.map((unit) => unit.id));
    for (const [key, reservations] of this.attackSlotReservations) {
      for (const id of reservations.keys()) {
        if (!live.has(id)) reservations.delete(id);
      }
      if (reservations.size === 0) this.attackSlotReservations.delete(key);
    }
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

  pathUnitToWorld(unit, worldX, worldY) {
    const targetTile = this.map.worldToTile(worldX, worldY);
    const corrected = this.map.nearestWalkableTile(targetTile.x, targetTile.y);
    if (!corrected) return false;
    const startTile = this.map.worldToTile(unit.x, unit.y);
    const path = findPath(this.map, startTile, corrected);
    if (path.length === 0) return false;
    path[path.length - 1] = { x: worldX, y: worldY };
    unit.path = path;
    unit.pathIndex = 0;
    unit.moveTarget = { x: worldX, y: worldY };
    return true;
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

function formationOffsets(count, spacing) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const cols = Math.ceil(Math.sqrt(count));
  const offsets = [];
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    offsets.push({
      x: (col - (cols - 1) / 2) * spacing,
      y: (row - (Math.ceil(count / cols) - 1) / 2) * spacing,
    });
  }
  return offsets;
}
