import { tileKey } from './choke-map.js';

const MOBILE_ENGAGEMENT_SLOT_COUNT = 10;
const ROUTE_RESERVATION_TTL = 0.28;

export class ReservationManager {
  constructor({ map, resolveTarget, targetKey, attackSlotsForTarget, getUnitDef }) {
    this.map = map;
    this.resolveTarget = resolveTarget;
    this.targetKey = targetKey;
    this.attackSlotsForTarget = attackSlotsForTarget;
    this.getUnitDef = getUnitDef;
    this.attackSlotReservations = new Map();
    this.mobileEngagementReservations = new Map();
    this.routeReservations = new Map();
  }

  reserveStaticAttackSlot(unit, targetRef) {
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

  releaseStaticAttackSlot(unit) {
    if (!unit.attackSlot) return;
    const reservations = this.attackSlotReservations.get(unit.attackSlot.targetKey);
    if (reservations) {
      reservations.delete(unit.id);
      if (reservations.size === 0) this.attackSlotReservations.delete(unit.attackSlot.targetKey);
    }
    unit.attackSlot = null;
  }

  clearStaticReservationsForTarget(key, units) {
    const reservations = this.attackSlotReservations.get(key);
    if (!reservations) return;
    for (const unit of units) {
      if (unit.attackSlot?.targetKey === key) unit.attackSlot = null;
    }
    this.attackSlotReservations.delete(key);
  }

  cleanupStaticAttackSlots(liveUnits) {
    const live = new Set(liveUnits.map((unit) => unit.id));
    for (const [key, reservations] of this.attackSlotReservations) {
      for (const id of reservations.keys()) {
        if (!live.has(id)) reservations.delete(id);
      }
      if (reservations.size === 0) this.attackSlotReservations.delete(key);
    }
  }

  reserveMobileEngagementSlot(unit, target) {
    if (!target || target.kind !== 'unit') return null;
    const key = this.targetKey({ kind: 'unit', id: target.unit.id });
    if (unit.mobileEngagementSlot?.targetKey === key) {
      this.refreshMobileEngagementSlot(unit, target);
      return unit.mobileEngagementSlot;
    }

    this.releaseMobileEngagementSlot(unit);
    let reservations = this.mobileEngagementReservations.get(key);
    if (!reservations) {
      reservations = new Map();
      this.mobileEngagementReservations.set(key, reservations);
    }

    const occupied = new Set([...reservations.values()].map((slot) => slot.index));
    const preferred = Math.atan2(unit.y - target.unit.y, unit.x - target.unit.x);
    let best = null;
    let bestScore = Infinity;
    for (let index = 0; index < MOBILE_ENGAGEMENT_SLOT_COUNT; index++) {
      const angle = (Math.PI * 2 * index) / MOBILE_ENGAGEMENT_SLOT_COUNT;
      const slotPoint = this.mobileEngagementSlotPoint(unit, target, angle);
      if (!slotPoint || !this.map.isCircleWalkable(slotPoint.x, slotPoint.y, unit.radius + 1)) continue;
      const occupiedPenalty = occupied.has(index) ? 100000 : 0;
      const anglePenalty = Math.abs(shortestAngle(preferred, angle)) * 95;
      const distPenalty = Math.hypot(slotPoint.x - unit.x, slotPoint.y - unit.y) * 0.2;
      const score = occupiedPenalty + anglePenalty + distPenalty;
      if (score < bestScore) {
        best = { targetKey: key, index, angle, x: slotPoint.x, y: slotPoint.y };
        bestScore = score;
      }
    }

    if (!best) {
      best = { targetKey: key, index: -1, angle: preferred, ...this.mobileEngagementSlotPoint(unit, target, preferred) };
    }

    reservations.set(unit.id, best);
    unit.mobileEngagementSlot = best;
    this.refreshMobileEngagementSlot(unit, target);
    return unit.mobileEngagementSlot;
  }

  mobileEngagementSlotPoint(unit, target, angle) {
    if (!target || target.kind !== 'unit') return null;
    const combat = this.getUnitDef(unit).combat;
    const distance = target.unit.radius + Math.max(unit.radius + 4, combat.attackRange * 0.72);
    return {
      x: target.unit.x + Math.cos(angle) * distance,
      y: target.unit.y + Math.sin(angle) * distance,
    };
  }

  refreshMobileEngagementSlot(unit, target) {
    if (!unit.mobileEngagementSlot || !target || target.kind !== 'unit') return;
    const point = this.mobileEngagementSlotPoint(unit, target, unit.mobileEngagementSlot.angle);
    if (!point) return;
    unit.mobileEngagementSlot.x = point.x;
    unit.mobileEngagementSlot.y = point.y;
    const reservations = this.mobileEngagementReservations.get(unit.mobileEngagementSlot.targetKey);
    if (reservations?.has(unit.id)) reservations.set(unit.id, { ...unit.mobileEngagementSlot });
    if (unit.debug) {
      unit.debug.engagementSlot = {
        x: point.x,
        y: point.y,
        index: unit.mobileEngagementSlot.index,
        total: MOBILE_ENGAGEMENT_SLOT_COUNT,
      };
    }
  }

  releaseMobileEngagementSlot(unit) {
    if (!unit.mobileEngagementSlot) return;
    const reservations = this.mobileEngagementReservations.get(unit.mobileEngagementSlot.targetKey);
    if (reservations) {
      reservations.delete(unit.id);
      if (reservations.size === 0) this.mobileEngagementReservations.delete(unit.mobileEngagementSlot.targetKey);
    }
    unit.mobileEngagementSlot = null;
    if (unit.debug) unit.debug.engagementSlot = null;
  }

  clearMobileReservationsForTarget(key, units) {
    const reservations = this.mobileEngagementReservations.get(key);
    if (!reservations) return;
    for (const unit of units) {
      if (unit.mobileEngagementSlot?.targetKey === key) {
        unit.mobileEngagementSlot = null;
        if (unit.debug) unit.debug.engagementSlot = null;
      }
    }
    this.mobileEngagementReservations.delete(key);
  }

  cleanupMobileEngagementReservations(liveUnits) {
    const live = new Set(liveUnits.map((unit) => unit.id));
    const validTargets = new Set(liveUnits.filter((unit) => unit.hp > 0).map((unit) => `unit:${unit.id}`));
    for (const [key, reservations] of this.mobileEngagementReservations) {
      if (!validTargets.has(key)) {
        this.clearMobileReservationsForTarget(key, liveUnits);
        continue;
      }
      for (const id of reservations.keys()) {
        if (!live.has(id)) reservations.delete(id);
      }
      if (reservations.size === 0) this.mobileEngagementReservations.delete(key);
    }
  }


  reserveRouteChokeCells(unit, cells, simTime, routeId = null, directionKey = null) {
    this.cleanupRouteReservations(simTime);
    if (!cells || cells.length === 0) {
      this.releaseRouteReservations(unit);
      if (unit.debug) unit.debug.chokeReservation = null;
      return { ok: true, reserved: [] };
    }

    const conflicts = [];
    for (const cell of cells) {
      const key = cell.key ?? tileKey(cell.tileX, cell.tileY);
      const existing = this.routeReservations.get(key);
      if (!existing || existing.unitId === unit.id || existing.expiresAt <= simTime) continue;
      if (existing.team !== unit.team) continue;
      const priority = unit.debug?.formationSlot?.index ?? 9999;
      const existingPriority = existing.priority ?? 9999;
      if (existingPriority <= priority) conflicts.push({ key, cell, existing });
    }

    if (conflicts.length) {
      const conflict = conflicts[0];
      if (unit.debug) {
        unit.debug.chokeReservation = {
          blocked: true,
          tileX: conflict.cell.tileX,
          tileY: conflict.cell.tileY,
          blockerId: conflict.existing.unitId,
          routeId: conflict.existing.routeId ?? null,
        };
      }
      return { ok: false, blockerId: conflict.existing.unitId, cell: conflict.cell };
    }

    this.releaseRouteReservations(unit);
    const reserved = [];
    for (const cell of cells) {
      const key = cell.key ?? tileKey(cell.tileX, cell.tileY);
      const reservation = {
        key,
        tileX: cell.tileX,
        tileY: cell.tileY,
        unitId: unit.id,
        team: unit.team,
        routeId,
        directionKey,
        expiresAt: simTime + ROUTE_RESERVATION_TTL,
        priority: unit.debug?.formationSlot?.index ?? 9999,
      };
      this.routeReservations.set(key, reservation);
      reserved.push(reservation);
    }
    unit.routeReservations = reserved.map((r) => r.key);
    if (unit.debug) {
      unit.debug.chokeReservation = reserved.length ? {
        blocked: false,
        tiles: reserved.map((r) => ({ x: r.tileX, y: r.tileY })),
        routeId,
        directionKey,
      } : null;
    }
    return { ok: true, reserved };
  }

  releaseRouteReservations(unit) {
    const owned = unit.routeReservations ?? [];
    for (const key of owned) {
      const existing = this.routeReservations.get(key);
      if (existing?.unitId === unit.id) this.routeReservations.delete(key);
    }
    unit.routeReservations = [];
    if (unit.debug) unit.debug.chokeReservation = null;
  }

  cleanupRouteReservations(simTime = 0, liveUnits = null) {
    const live = liveUnits ? new Set(liveUnits.map((unit) => unit.id)) : null;
    for (const [key, reservation] of this.routeReservations) {
      if (reservation.expiresAt <= simTime || (live && !live.has(reservation.unitId))) this.routeReservations.delete(key);
    }
  }

  routeReservationSnapshot() {
    return [...this.routeReservations.values()].map((r) => ({
      tileX: r.tileX,
      tileY: r.tileY,
      unitId: r.unitId,
      team: r.team,
      routeId: r.routeId ?? null,
      directionKey: r.directionKey ?? null,
      expiresAt: r.expiresAt,
      priority: r.priority ?? 9999,
    }));
  }

  cleanup(liveUnits, simTime = 0) {
    this.cleanupStaticAttackSlots(liveUnits);
    this.cleanupMobileEngagementReservations(liveUnits);
    this.cleanupRouteReservations(simTime, liveUnits);
  }
}

function distanceSq(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function normalizeAngle(angle) {
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function shortestAngle(from, to) {
  return normalizeAngle(to - from);
}
