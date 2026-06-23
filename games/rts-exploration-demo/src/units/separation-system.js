import { CONFIG } from '../config.js';
import { UNIT_STATES } from './unit-states.js';

// Pushes overlapping units apart each tick.
// Several short positional passes make a compact group slide apart promptly
// without turning unit movement into hard collision/deadlock behaviour.
const SEPARATION_PASSES = 3;

export class SeparationSystem {
  constructor(ctx) {
    this.ctx = ctx; // { getUnits, map, getDef, getSimTime }
  }

  update(dt) {
    const units = this.ctx.getUnits();
    const maxCorrection = CONFIG.separationStrength * dt;
    for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
      for (let i = 0; i < units.length; i++) {
        const a = units[i];
        if (a.combatState.windupRemaining > 0 || this._isHoldingSlot(a)) continue;
        for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (b.combatState.windupRemaining > 0 || this._isHoldingSlot(b)) continue;
        if (a.attackSlot?.targetKey && a.attackSlot.targetKey === b.attackSlot?.targetKey) continue;
        const minDist = Math.max(CONFIG.separationRadius, a.radius + b.radius + 2);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;

        const aPriority = this._movementPriority(a);
        const bPriority = this._movementPriority(b);
        const d = Math.sqrt(d2);
        const direction = d > 0.001 ? { x: dx / d, y: dy / d } : this._overlapDirection(a, b);
        const correction = Math.min(minDist - d, maxCorrection);
        const aShare = aPriority < bPriority ? 0.8 : aPriority > bPriority ? 0.2 : 0.5;
        const bShare = 1 - aShare;

        this._moveIfWalkable(a, direction.x * correction * aShare, direction.y * correction * aShare);
        this._moveIfWalkable(b, -direction.x * correction * bShare, -direction.y * correction * bShare);
        }
      }
    }
  }

  _moveIfWalkable(unit, dx, dy) {
    const x = unit.x + dx;
    const y = unit.y + dy;
    if (!this.ctx.map.isCircleWalkable(x, y, unit.radius + 1)) return;
    unit.x = x;
    unit.y = y;
  }

  _isHoldingSlot(unit) {
    if (!unit.attackSlot) return false;
    const def = this.ctx.getDef(unit.type);
    return Math.hypot(unit.attackSlot.x - unit.x, unit.attackSlot.y - unit.y) <= Math.max(3, def.movement.stopDistance + 1);
  }

  _movementPriority(unit) {
    let priority = 0;
    if (unit.attackTarget) priority += 3;
    if (unit.state === UNIT_STATES.ATTACKING) priority += 4;
    if (unit.mobileEngagementSlot) priority += 2;
    if (unit.state === UNIT_STATES.QUEUED_BEHIND_ALLY) priority -= 1;
    if (unit.state === UNIT_STATES.BLOCKED_REPATHING) priority -= 1;
    if (unit.path.length > 0) priority += 1;
    if (unit.attackTarget) {
      const target = this.ctx.resolveTarget(unit.attackTarget);
      if (target) {
        const center = this.ctx.targetCenter(target);
        const edge = Math.max(0, Math.hypot(center.x - unit.x, center.y - unit.y) - this.ctx.targetRadius(target));
        const range = this.ctx.getDef(unit.type).combat.attackRange || 0;
        if (edge <= range + 8) priority += 4;
      }
    }
    return priority;
  }

  _overlapDirection(a, b) {
    // A stable ID-derived axis gives perfectly coincident units a direction to
    // separate without introducing random, frame-dependent jitter.
    const lowId = Math.min(a.id, b.id);
    const highId = Math.max(a.id, b.id);
    const angle = ((lowId * 73856093 + highId * 19349663) % 360) * (Math.PI / 180);
    const sign = a.id === lowId ? 1 : -1;
    return { x: Math.cos(angle) * sign, y: Math.sin(angle) * sign };
  }
}
