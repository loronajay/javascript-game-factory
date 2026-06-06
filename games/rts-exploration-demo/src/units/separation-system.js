import { CONFIG } from '../config.js';
import { clampMagnitude } from '../utils.js';
import { UNIT_STATES } from './unit-states.js';

// Pushes overlapping units apart each tick.
// Priority rules prevent moving units from being bumped by idle ones.
export class SeparationSystem {
  constructor(ctx) {
    this.ctx = ctx; // { getUnits, map, getDef, getSimTime }
  }

  update(dt) {
    const units = this.ctx.getUnits();
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.combatState.windupRemaining > 0 || this._isHoldingSlot(a)) continue;
      let pushX = 0;
      let pushY = 0;
      for (let j = 0; j < units.length; j++) {
        if (i === j) continue;
        const b = units[j];
        if (b.combatState.windupRemaining > 0 || this._isHoldingSlot(b)) continue;
        if (a.attackSlot?.targetKey && a.attackSlot.targetKey === b.attackSlot?.targetKey) continue;
        const minDist = Math.max(CONFIG.separationRadius, a.radius + b.radius + 2);
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 === 0 || d2 > minDist * minDist) continue;

        const aPriority = this._movementPriority(a);
        const bPriority = this._movementPriority(b);
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
      if (this.ctx.map.isCircleWalkable(nx, ny, a.radius + 1)) {
        a.x = nx;
        a.y = ny;
      }
    }
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
}
