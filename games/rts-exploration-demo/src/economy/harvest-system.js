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
  }

  issue(units, resourceId) {
    const node = this.map.getResourceNode(resourceId);
    if (!node) return false;
    let issued = false;
    for (const unit of units) {
      const harvest = this.harvestDef(unit);
      // A Harvester carries exactly one resource unit. Do not let a new order
      // overwrite that cargo or interrupt its return-to-Nexus trip.
      if (!harvest || unit.cargo) continue;
      this.combat.clearAttack(unit);
      unit.harvestState = {
        resourceId: node.id,
        phase: 'to-resource',
        gatherRemaining: harvest.gatherTime,
      };
      if (this.movement.pathUnitToWorld(unit, node.x, node.y)) issued = true;
      else unit.harvestState = null;
    }
    return issued;
  }

  update(units, dt) {
    for (const unit of units) {
      if (!unit.harvestState || unit.hp <= 0) continue;
      this.updateUnit(unit, dt);
    }
  }

  clear(unit) {
    if (!unit) return;
    unit.harvestState = null;
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
      if (!node) return this.clear(unit);
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

      const cargo = this.map.takeResourceNode(node.id, harvest.capacity);
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
}
