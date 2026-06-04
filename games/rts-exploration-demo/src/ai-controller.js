import { CONFIG } from './config.js';
import { createAttackDestructibleCommand, createAttackMoveCommand, createAttackUnitCommand, createMoveCommand } from './commands.js';
import { distanceSq } from './utils.js';

export class AiController {
  constructor({ team = 2, units, map, commands }) {
    this.team = team;
    this.units = units;
    this.map = map;
    this.commands = commands;
    this.enabled = CONFIG.aiEnabled;
    this.lastDecisionTick = -Infinity;
    this.nextScoutWaypoint = 0;
    this.nextGruntWaypoint = 0;
    this.lastIssued = new Map();
    this.scoutWaypoints = [
      { x: 108, y: 108 },
      { x: 103, y: 57 },
      { x: 84, y: 44 },
      { x: 44, y: 42 },
      { x: 31, y: 21 },
      { x: 18, y: 18 },
    ].map((p) => this.map.tileCenter(p.x, p.y));
    this.gruntWaypoints = [
      { x: 103, y: 57 },
      { x: 99, y: 53 },
      { x: 84, y: 44 },
      { x: 44, y: 42 },
      { x: 31, y: 21 },
    ].map((p) => this.map.tileCenter(p.x, p.y));
  }

  update(tick) {
    if (!this.enabled) return;
    const interval = Math.max(1, Math.round(CONFIG.simHz / CONFIG.aiDecisionHz));
    if (tick - this.lastDecisionTick < interval) return;
    this.lastDecisionTick = tick;

    this.commandIdleGrunts(tick);
    this.commandIdleScouts(tick);
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  commandIdleScouts(tick) {
    const scouts = this.units.idleTeamUnits(this.team, 'scout');
    for (const scout of scouts) {
      if (!this.canIssueForUnit(scout, tick, 90)) continue;
      const waypoint = this.scoutWaypoints[this.nextScoutWaypoint % this.scoutWaypoints.length];
      this.nextScoutWaypoint += 1;
      const result = this.commands.issueAi(createMoveCommand([scout.id], waypoint.x, waypoint.y), this.team);
      if (result.ok) this.lastIssued.set(scout.id, tick);
    }
  }

  commandIdleGrunts(tick) {
    const grunts = this.units.idleTeamUnits(this.team, 'grunt').filter((unit) => this.canIssueForUnit(unit, tick, 120));
    if (grunts.length === 0) return;

    const center = averagePosition(grunts);
    const nearbyCrawler = this.findNearestCrawler(center.x, center.y, 900);
    if (nearbyCrawler) {
      const result = this.commands.issueAi(createAttackUnitCommand(grunts.map((u) => u.id), nearbyCrawler.id), this.team);
      if (result.ok) for (const grunt of grunts) this.lastIssued.set(grunt.id, tick);
      return;
    }

    const nearbyGate = this.findNearestDestructible(center.x, center.y, 900);
    if (nearbyGate) {
      const result = this.commands.issueAi(createAttackDestructibleCommand(grunts.map((u) => u.id), nearbyGate.x, nearbyGate.y), this.team);
      if (result.ok) for (const grunt of grunts) this.lastIssued.set(grunt.id, tick);
      return;
    }

    const waypoint = this.gruntWaypoints[this.nextGruntWaypoint % this.gruntWaypoints.length];
    this.nextGruntWaypoint += 1;
    const result = this.commands.issueAi(createAttackMoveCommand(grunts.map((u) => u.id), waypoint.x, waypoint.y), this.team);
    if (result.ok) for (const grunt of grunts) this.lastIssued.set(grunt.id, tick);
  }

  canIssueForUnit(unit, tick, minTicks) {
    return tick - (this.lastIssued.get(unit.id) ?? -Infinity) >= minTicks;
  }

  findNearestCrawler(x, y, maxRange) {
    let best = null;
    let bestD2 = maxRange * maxRange;
    for (const unit of this.units.units) {
      if (unit.team !== 0 || unit.hp <= 0) continue;
      const d2 = distanceSq(x, y, unit.x, unit.y);
      if (d2 < bestD2) {
        best = unit;
        bestD2 = d2;
      }
    }
    return best;
  }

  findNearestDestructible(x, y, maxRange) {
    let best = null;
    let bestD2 = maxRange * maxRange;
    for (const wall of this.map.destructibles.values()) {
      const c = this.map.tileCenter(wall.x, wall.y);
      const d2 = distanceSq(x, y, c.x, c.y);
      if (d2 < bestD2) {
        best = wall;
        bestD2 = d2;
      }
    }
    return best;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      team: this.team,
      nextScoutWaypoint: this.nextScoutWaypoint,
      nextGruntWaypoint: this.nextGruntWaypoint,
    };
  }
}

function averagePosition(units) {
  const out = { x: 0, y: 0 };
  for (const unit of units) {
    out.x += unit.x;
    out.y += unit.y;
  }
  out.x /= units.length || 1;
  out.y /= units.length || 1;
  return out;
}
