import { UNIT_STATES, setUnitState } from '../units/unit-states.js';

// Owns resource-order progression, carried cargo, Nexus delivery, and the
// team stockpiles that future HUD and construction systems can query.
export class HarvestSystem {
  constructor({ map, entities, movement, combat, getDef, getSimTime }) {
    this.map = map;
    this.entities = entities;
    this.movement = movement;
    this.combat = combat;
    this.getDef = getDef;
    this.getSimTime = getSimTime;
    this.stockpiles = new Map();
    this.resourceReservations = new Map();
  }

  issue(units, resourceId) {
    const node = this.map.getResourceNode(resourceId);
    if (!node) return [];
    const assigned = [];
    const sortedUnits = [...units].sort((a, b) => distanceToNodeSq(a, node) - distanceToNodeSq(b, node));
    for (const unit of sortedUnits) {
      const harvest = this.harvestDef(unit);
      // A Harvester carries exactly one resource unit. Do not let a new order
      // overwrite that cargo or interrupt its return-to-Nexus trip.
      if (!harvest || unit.cargo) continue;
      this.clear(unit);
      const reservedAmount = this.reserveResource(node, unit, harvest.capacity);
      if (reservedAmount <= 0) continue;
      this.combat.clearAttack(unit);
      unit.harvestState = {
        resourceId: node.id,
        reservedAmount,
        phase: 'to-resource',
        gatherRemaining: harvest.gatherTime,
      };
      if (this.movement.pathUnitToWorld(unit, node.x, node.y)) assigned.push(unit);
      else this.clear(unit);
    }
    return assigned;
  }

  update(units, dt) {
    for (const unit of units) {
      if (!unit.harvestState || unit.hp <= 0) continue;
      this.updateUnit(unit, dt);
    }
  }

  clear(unit, { cancelMovement = false } = {}) {
    if (!unit) return;
    this.releaseReservation(unit.id);
    unit.harvestState = null;
    if (!cancelMovement) return;
    unit.path = [];
    unit.moveTarget = null;
    unit.routeId = null;
    this.movement.ctx.reservations.releaseRouteReservations(unit);
    this.movement.resetMovementState(unit);
    setUnitState(unit, UNIT_STATES.IDLE, this.getSimTime());
  }

  resourceAmount(team, kind) {
    return this.stockpiles.get(team)?.[kind] ?? 0;
  }

  resourceStockpile(team) {
    return { ...(this.stockpiles.get(team) ?? {}) };
  }

  updateUnit(unit, dt) {
    const harvest = this.harvestDef(unit);
    if (!harvest) return this.clear(unit);
    const state = unit.harvestState;

    if (state.phase === 'to-resource' || state.phase === 'gathering') {
      const node = this.map.getResourceNode(state.resourceId);
      if (!node) return this.clear(unit, { cancelMovement: true });
      const distance = Math.hypot(unit.x - node.x, unit.y - node.y);
      if (distance > harvest.gatherRange) {
        state.phase = 'to-resource';
        if (unit.path.length === 0) this.movement.pathUnitToWorld(unit, node.x, node.y);
        return;
      }

      unit.path = [];
      unit.moveTarget = null;
      state.phase = 'gathering';
      setUnitState(unit, UNIT_STATES.HARVESTING, this.getSimTime());
      state.gatherRemaining = Math.max(0, state.gatherRemaining - dt);
      if (state.gatherRemaining > 0) return;

      const reservedAmount = this.releaseReservation(unit.id, node.id);
      const cargo = this.map.takeResourceNode(node.id, reservedAmount);
      if (!cargo) return this.clear(unit);
      unit.cargo = cargo;
      state.phase = 'to-nexus';
      const nexus = this.nexusForTeam(unit.team);
      if (!nexus) return this.clear(unit);
      this.movement.pathUnitToWorld(unit, nexus.x, nexus.y);
      return;
    }

    if (state.phase === 'to-nexus') {
      const nexus = this.nexusForTeam(unit.team);
      if (!nexus || !unit.cargo) return this.clear(unit);
      const distance = Math.hypot(unit.x - nexus.x, unit.y - nexus.y);
      if (distance > nexus.radius + harvest.deliveryRange) {
        if (unit.path.length === 0) this.movement.pathUnitToWorld(unit, nexus.x, nexus.y);
        return;
      }

      this.addResource(unit.team, unit.cargo.kind, unit.cargo.amount);
      unit.cargo = null;
      this.clear(unit);
      setUnitState(unit, UNIT_STATES.IDLE, this.getSimTime());
    }
  }

  harvestDef(unit) {
    return unit?.type === 'harvester' ? this.getDef(unit.type).harvest : null;
  }

  nexusForTeam(team) {
    return this.entities?.getById(`nexus_team_${team}`) ?? null;
  }

  addResource(team, kind, amount) {
    const stockpile = this.stockpiles.get(team) ?? {};
    stockpile[kind] = (stockpile[kind] ?? 0) + amount;
    this.stockpiles.set(team, stockpile);
  }

  reserveResource(node, unit, capacity) {
    const available = Math.max(0, (node.amount ?? 0) - this.reservedAmountForNode(node.id));
    const amount = Math.min(capacity, available);
    if (amount <= 0) return 0;
    this.resourceReservations.set(unit.id, { resourceId: node.id, amount });
    return amount;
  }

  releaseReservation(unitId, resourceId = null) {
    const reservation = this.resourceReservations.get(unitId);
    if (!reservation || (resourceId && reservation.resourceId !== resourceId)) return 0;
    this.resourceReservations.delete(unitId);
    return reservation.amount;
  }

  reservedAmountForNode(resourceId) {
    let total = 0;
    for (const reservation of this.resourceReservations.values()) {
      if (reservation.resourceId === resourceId) total += reservation.amount;
    }
    return total;
  }
}

function distanceToNodeSq(unit, node) {
  const dx = unit.x - node.x;
  const dy = unit.y - node.y;
  return dx * dx + dy * dy;
}
