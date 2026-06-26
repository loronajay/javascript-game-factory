import { chebyshevDistance, tileKey } from "../geometry/isometric.js";
import { livingUnits, sameTeam } from "../state/gameState.js";

export function getLegalGuardTargets(state, tank) {
  const legal = new Set();
  if (!isLivingTank(tank)) return legal;

  legal.add(tileKey(tank.x, tank.y));

  for (const unit of livingUnits(state)) {
    if (unit.id === tank.id) continue;
    if (!isValidExternalGuard(state, tank, unit)) continue;
    if (getGuardingTank(state, unit, { ignoreTankId: tank.id })) continue;
    legal.add(tileKey(unit.x, unit.y));
  }

  return legal;
}

export function getGuardingTank(state, protectedUnit, { ignoreTankId = null } = {}) {
  if (!protectedUnit || protectedUnit.hp <= 0) return null;

  for (const tank of livingUnits(state)) {
    if (tank.id === ignoreTankId) continue;
    if (tank.guardTargetId !== protectedUnit.id) continue;
    if (!isValidExternalGuard(state, tank, protectedUnit)) continue;
    return tank;
  }

  return null;
}

export function isValidExternalGuard(state, tank, protectedUnit) {
  return Boolean(
    isLivingTank(tank) &&
      protectedUnit &&
      protectedUnit.hp > 0 &&
      protectedUnit.id !== tank.id &&
      sameTeam(state, tank, protectedUnit) &&
      chebyshevDistance(tank, protectedUnit) <= 1
  );
}

export function clearBrokenGuards(state) {
  for (const unit of state.units) {
    if (!unit.guardTargetId) continue;

    if (!isLivingTank(unit)) {
      clearGuard(unit);
      continue;
    }

    if (unit.guardTargetId === unit.id) {
      if (unit.hp <= 0) clearGuard(unit);
      continue;
    }

    const target = state.units.find((candidate) => candidate.id === unit.guardTargetId);
    if (!isValidExternalGuard(state, unit, target)) {
      clearGuard(unit);
    }
  }
}

export function clearGuardsForUnit(state, unitId) {
  for (const unit of state.units) {
    if (unit.id === unitId || unit.guardTargetId === unitId) {
      clearGuard(unit);
    }
  }
}

function isLivingTank(unit) {
  return Boolean(unit && unit.type === "tank" && unit.hp > 0);
}

function clearGuard(unit) {
  unit.guardTargetId = null;
  if (unit.defending) {
    unit.defending = false;
  }
}
