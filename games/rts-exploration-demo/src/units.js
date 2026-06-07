import { getUnitDef } from './unit-defs.js';
import { distanceSq } from './utils.js';
import { ReservationManager } from './movement/reservations.js';
import { ChokeMap } from './movement/choke-map.js';

import { UNIT_STATES, setUnitState } from './units/unit-states.js';
import { resolveTarget, targetKey, targetCenter, targetRadius, distanceToTargetEdge } from './units/target-resolver.js';
import { UnitFactory } from './units/unit-factory.js';
import { CombatSystem } from './units/combat-system.js';
import { MovementSystem } from './units/movement-system.js';
import { SeparationSystem } from './units/separation-system.js';
import { SelectionSystem } from './units/selection-system.js';

export { UNIT_STATES };

export class UnitManager {
  constructor(map) {
    this.map = map;
    this.units = [];
    this.selectedIds = new Set();

    // ── Shared context ──────────────────────────────────────────────────────
    // All subsystems receive this object so they can read shared state
    // without holding direct cross-system references at construction time.
    const ctx = {
      map,
      getUnits:  () => this.units,
      getById:   (id) => this.units.find((u) => u.id === id),
      getDef:    (type) => getUnitDef(type),
      selectedIds: this.selectedIds,
      getSimTime: () => this.simTime,
      nextRouteId: () => `${this._nextRouteId++}`,

      // Target resolution helpers (shared by combat + movement + separation)
      resolveTarget:       (ref) => resolveTarget(ref, map, (id) => this.units.find((u) => u.id === id)),
      targetKey:           (ref) => targetKey(ref),
      targetCenter:        (target) => targetCenter(target, map),
      targetRadius:        (target) => targetRadius(target, map),
      distanceToTargetEdge: (unit, target) => distanceToTargetEdge(unit, target, map),
    };

    // ── Reservation manager ─────────────────────────────────────────────────
    // Uses late-bound ctx.combat so the callback is resolved after all systems init.
    const reservations = new ReservationManager({
      map,
      resolveTarget: ctx.resolveTarget,
      targetKey:     ctx.targetKey,
      attackSlotsForTarget: (target, unit) => ctx.combat.attackSlotsForTarget(target, unit),
      getUnitDef: (unit) => getUnitDef(unit.type),
    });
    ctx.reservations = reservations;
    ctx.chokeMap = new ChokeMap(map);
    this._reservations = reservations; // direct reference for UnitManager methods

    // ── Subsystems ──────────────────────────────────────────────────────────
    this.factory    = new UnitFactory({ map, getDef: getUnitDef });
    this.selection  = new SelectionSystem(ctx);
    this.separation = new SeparationSystem(ctx);
    this.movement   = new MovementSystem(ctx);
    this.combat     = new CombatSystem(ctx);

    // Wire cross-system refs now that all instances exist.
    ctx.combat   = this.combat;
    ctx.movement = this.movement;

    this.simTime = 0;
    this._nextRouteId = 1;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  update(dt, simTime = this.simTime) {
    this.simTime = simTime;
    this.combat.update(dt);
    this.movement.update(dt);
    this.separation.update(dt);
    this.removeDeadUnits();
  }

  removeDeadUnits() {
    const deadIds = new Set(this.units.filter((u) => u.hp <= 0).map((u) => u.id));
    if (deadIds.size === 0) return;
    for (const unit of this.units) {
      if (deadIds.has(unit.id)) continue;
      if (unit.attackTarget?.kind === 'unit' && deadIds.has(unit.attackTarget.id)) {
        this.combat.clearAttack(unit, { preserveAttackMove: true, resumeAttackMove: true });
      }
    }
    for (const id of deadIds) this.selectedIds.delete(id);
    this.units = this.units.filter((u) => u.hp > 0);
    this._reservations.cleanupStaticAttackSlots(this.units);
    this._reservations.cleanupMobileEngagementReservations(this.units);
    this._reservations.cleanupRouteReservations(this.simTime, this.units);
  }

  // ── Spawning ────────────────────────────────────────────────────────────────

  spawnUnit(type, team, x, y) {
    const unit = this.factory.create(type, team, x, y);
    this.units.push(unit);
    return unit;
  }

  // Apply the spawn definitions from a level def (see maps/level-01.js → spawns).
  spawnFromDef(spawnsDef) {
    this.factory.applySpawnDef(spawnsDef, (type, team, x, y) => this.spawnUnit(type, team, x, y));
  }

  // ── Discovery ───────────────────────────────────────────────────────────────

  updateDiscovery(fog) {
    for (const unit of this.units) {
      const tile = this.map.worldToTile(unit.x, unit.y);
      if (unit.team !== 1 && fog.isVisible(tile.x, tile.y)) unit.discovered = true;
    }
  }

  // ── Selection (delegates) ────────────────────────────────────────────────────

  clearSelection()                           { this.selection.clearSelection(); }
  selectSingle(id, additive = false)         { this.selection.selectSingle(id, additive); }
  selectInWorldRect(rect, additive = false)  { this.selection.selectInWorldRect(rect, additive); }
  hitTestUnit(worldX, worldY, opts = {})     { return this.selection.hitTestUnit(worldX, worldY, opts); }
  hitTestAttackable(worldX, worldY)          { return this.selection.hitTestUnit(worldX, worldY, { attackableOnly: true }); }
  selectedUnitIds()                          { return this.selection.selectedUnitIds(); }
  selectedUnits()                            { return this.selection.selectedUnits(); }
  selectedCenter()                           { return this.selection.selectedCenter(); }
  selectedDebugSummary()                     { return this.selection.selectedDebugSummary(); }

  // ── Command API ─────────────────────────────────────────────────────────────

  moveSelectedTo(worldX, worldY) {
    return this.moveUnitsTo(this.selectedUnitIds(), worldX, worldY);
  }

  moveUnitsTo(unitIds, worldX, worldY, team = 1) {
    const units = this.ownedUnitsFromIds(unitIds, team);
    if (units.length === 0) return false;
    return this.movement.issueGroupMove(units, worldX, worldY, { kind: 'move' });
  }

  stopUnits(unitIds, team = 1) {
    const units = this.ownedUnitsFromIds(unitIds, team);
    if (units.length === 0) return false;
    for (const unit of units) {
      this.combat.clearAttack(unit);
      unit.attackMoveTarget = null;
      unit.path = [];
      unit.routeId = null;
      this._reservations.releaseRouteReservations(unit);
      unit.moveTarget = null;
      setUnitState(unit, UNIT_STATES.IDLE, this.simTime);
      this._markCommandAck(unit, 'stop');
    }
    return true;
  }

  attackMoveUnitsTo(unitIds, worldX, worldY, team = 1) {
    const units = this.ownedUnitsFromIds(unitIds, team).filter((u) => getUnitDef(u.type).combat.canAttack);
    if (units.length === 0) return false;
    return this.movement.issueGroupMove(units, worldX, worldY, { kind: 'attackMove' });
  }

  attackSelectedDestructible(tileX, tileY) {
    return this.attackUnitsDestructible(this.selectedUnitIds(), tileX, tileY);
  }

  attackUnitsDestructible(unitIds, tileX, tileY, team = 1) {
    if (!this.map.isDestructibleTile(tileX, tileY)) return false;
    const selected = this.ownedUnitsFromIds(unitIds, team).filter((u) => getUnitDef(u.type).combat.canAttack);
    if (selected.length === 0) return false;

    const gateTiles = this.findConnectedDestructibleTiles(tileX, tileY);
    const targetCenter = this.map.tileCenter(tileX, tileY);
    const sortedUnits = [...selected].sort((a, b) => distanceSq(a.x, a.y, targetCenter.x, targetCenter.y) - distanceSq(b.x, b.y, targetCenter.x, targetCenter.y));
    const sortedTiles = [...gateTiles].sort((a, b) => distanceSq(targetCenter.x, targetCenter.y, this.map.tileCenter(a.x, a.y).x, this.map.tileCenter(a.x, a.y).y) - distanceSq(targetCenter.x, targetCenter.y, this.map.tileCenter(b.x, b.y).x, this.map.tileCenter(b.x, b.y).y));

    for (const tile of sortedTiles) {
      this._reservations.clearStaticReservationsForTarget(targetKey({ kind: 'destructibleTile', x: tile.x, y: tile.y }), this.units);
    }
    sortedUnits.forEach((unit, index) => {
      const tile = sortedTiles[index % sortedTiles.length];
      this.combat.assignAttackTarget(unit, { kind: 'destructibleTile', x: tile.x, y: tile.y }, true);
      this._markCommandAck(unit, 'attack');
    });
    return true;
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
    const target = this.combat.ctx.resolveTarget(targetRef);
    if (!target) return false;
    const selected = this.ownedUnitsFromIds(unitIds, team).filter((u) => getUnitDef(u.type).combat.canAttack);
    if (selected.length === 0) return false;
    const key = targetKey(targetRef);
    this._reservations.clearStaticReservationsForTarget(key, this.units);
    this._reservations.clearMobileReservationsForTarget(key, this.units);
    const center = this.combat.ctx.targetCenter(target);
    const sorted = [...selected].sort((a, b) => distanceSq(a.x, a.y, center.x, center.y) - distanceSq(b.x, b.y, center.x, center.y));
    for (const unit of sorted) {
      this.combat.assignAttackTarget(unit, targetRef, true);
      this._markCommandAck(unit, 'attack');
    }
    return true;
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  getById(id) {
    return this.units.find((u) => u.id === id);
  }

  getDef(type) {
    return getUnitDef(type);
  }

  resolveTarget(ref)       { return resolveTarget(ref, this.map, (id) => this.units.find((u) => u.id === id)); }
  targetKey(ref)           { return targetKey(ref); }
  targetCenter(target)     { return targetCenter(target, this.map); }
  targetRadius(target)     { return targetRadius(target, this.map); }

  teamUnits(team) {
    return this.units.filter((u) => u.team === team && u.hp > 0);
  }

  idleTeamUnits(team, type = null) {
    return this.teamUnits(team).filter((unit) => {
      if (type && unit.type !== type) return false;
      return !unit.attackTarget &&
        unit.path.length === 0 &&
        unit.combatState.windupRemaining === 0 &&
        unit.combatState.recoveryRemaining === 0;
    });
  }

  nearestLiveUnit(sourceX, sourceY, predicate) {
    let best = null;
    let bestD2 = Infinity;
    for (const unit of this.units) {
      if (unit.hp <= 0 || !predicate(unit)) continue;
      const d2 = distanceSq(sourceX, sourceY, unit.x, unit.y);
      if (d2 < bestD2) { best = unit; bestD2 = d2; }
    }
    return best;
  }

  ownedUnitsFromIds(unitIds, team = 1) {
    const requested = new Set(unitIds);
    return this.units.filter((u) => requested.has(u.id) && u.team === team && u.hp > 0);
  }

  stateCounts() {
    const counts = new Map();
    for (const unit of this.units) counts.set(unit.state, (counts.get(unit.state) ?? 0) + 1);
    return counts;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

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
      queue.push({ x: cur.x + 1, y: cur.y }, { x: cur.x - 1, y: cur.y }, { x: cur.x, y: cur.y + 1 }, { x: cur.x, y: cur.y - 1 });
    }
    return out.length > 0 ? out : [{ x: tileX, y: tileY }];
  }

  _markCommandAck(unit, kind) {
    unit.commandAckKind = kind;
    unit.commandAckUntil = this.simTime + 0.22;
  }
}
