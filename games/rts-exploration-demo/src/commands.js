export class CommandSystem {
  constructor({ units, map, getTick = () => 0 }) {
    this.units = units;
    this.map = map;
    this.getTick = getTick;
    this.queue = [];
    this.history = [];
    this.nextCommandId = 1;
    this.lastResult = null;
  }

  issueLocal(partial) {
    const command = this.normalizeCommand(partial, { team: 1, source: 'local-player' });
    return this.issueCommand(command);
  }

  issueAi(partial, team = 2) {
    const command = this.normalizeCommand(partial, { team, source: `ai-team-${team}` });
    return this.issueCommand(command);
  }

  issueCommand(command) {
    this.queue.push(command);
    this.history.push(command);
    this.lastResult = this.processCommand(command);
    return this.lastResult;
  }

  normalizeCommand(partial, defaults = {}) {
    return {
      id: `cmd_${this.nextCommandId++}`,
      issuedAtTick: this.getTick(),
      team: defaults.team ?? 1,
      source: defaults.source ?? 'local-player',
      ...partial,
      unitIds: Array.isArray(partial.unitIds) ? [...partial.unitIds] : [],
    };
  }

  processCommand(command) {
    if (!command || !command.type) return { ok: false, reason: 'invalid command' };
    if (!this.validateOwnership(command)) return { ok: false, reason: 'no owned selected units' };

    switch (command.type) {
      case 'MOVE_UNITS': {
        const ok = this.units.moveUnitsTo(command.unitIds, command.target.x, command.target.y, command.team);
        return { ok, command, marker: ok ? { kind: 'move', x: command.target.x, y: command.target.y } : null };
      }
      case 'ATTACK_UNIT': {
        const target = this.units.getById(command.targetId);
        const ok = this.units.attackUnitsUnit(command.unitIds, target, command.team);
        return { ok, command, marker: ok && target ? { kind: 'attack', x: target.x, y: target.y } : null };
      }
      case 'ATTACK_ENTITY': {
        const target = this.units.getEntityById(command.targetId);
        const ok = this.units.attackUnitsEntity(command.unitIds, command.targetId, command.team);
        return { ok, command, marker: ok && target ? { kind: 'attack', x: target.x, y: target.y } : null };
      }
      case 'ATTACK_DESTRUCTIBLE': {
        const ok = this.units.attackUnitsDestructible(command.unitIds, command.tile.x, command.tile.y, command.team);
        const center = this.map.tileCenter(command.tile.x, command.tile.y);
        return { ok, command, marker: ok ? { kind: 'attack', x: center.x, y: center.y } : null };
      }
      case 'HARVEST_RESOURCE': {
        const node = this.map.getResourceNode(command.resourceId);
        const ok = this.units.harvestUnitsResource(command.unitIds, command.resourceId, command.team);
        return { ok, command, marker: ok && node ? { kind: 'harvest', x: node.x, y: node.y } : null };
      }
      case 'ATTACK_MOVE_UNITS': {
        const ok = this.units.attackMoveUnitsTo(command.unitIds, command.target.x, command.target.y, command.team);
        return { ok, command, marker: ok ? { kind: 'attackMove', x: command.target.x, y: command.target.y } : null };
      }
      case 'STOP_UNITS': {
        const ok = this.units.stopUnits(command.unitIds, command.team);
        return { ok, command, marker: null };
      }
      default:
        return { ok: false, command, reason: `unknown command ${command.type}` };
    }
  }

  validateOwnership(command) {
    if (!command.unitIds || command.unitIds.length === 0) return false;
    return command.unitIds.some((id) => {
      const unit = this.units.getById(id);
      return unit && unit.team === command.team;
    });
  }

  serializeRecentHistory(limit = 40) {
    return this.history.slice(-limit).map((cmd) => ({ ...cmd, unitIds: [...cmd.unitIds] }));
  }
}

export function createMoveCommand(unitIds, x, y) {
  return { type: 'MOVE_UNITS', unitIds, target: { x, y } };
}

export function createAttackUnitCommand(unitIds, targetId) {
  return { type: 'ATTACK_UNIT', unitIds, targetId };
}

export function createAttackEntityCommand(unitIds, targetId) {
  return { type: 'ATTACK_ENTITY', unitIds, targetId };
}

export function createAttackDestructibleCommand(unitIds, x, y) {
  return { type: 'ATTACK_DESTRUCTIBLE', unitIds, tile: { x, y } };
}

export function createHarvestResourceCommand(unitIds, resourceId) {
  return { type: 'HARVEST_RESOURCE', unitIds, resourceId };
}

export function createAttackMoveCommand(unitIds, x, y) {
  return { type: 'ATTACK_MOVE_UNITS', unitIds, target: { x, y } };
}

export function createStopCommand(unitIds) {
  return { type: 'STOP_UNITS', unitIds };
}
