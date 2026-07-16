import { findUnit, firstActorPriority } from "./state.js";
import { getUnitType } from "./unitCatalog.js";
import { ERR } from "./reducerResult.js";

export function pendingFirstActor(state, player) {
  let pending = null;
  for (const unit of state.units ?? []) {
    if (unit.hp <= 0 || unit.player !== player || unit.commandTurn === state.turnNumber) continue;
    if (!getUnitType(unit.type).actsFirst) continue;
    if (!pending || firstActorPriority(unit) < firstActorPriority(pending)) pending = unit;
  }
  return pending;
}

// True while this player owns a living, not-yet-acted acts-first unit. That unit
// must complete its activation before any of its squadmates may begin.
export function commanderPending(state, player) {
  return Boolean(pendingFirstActor(state, player));
}

export function validateOwnedLivingUnit(state, player, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit) return { error: ERR.UNIT_NOT_FOUND };
  if (unit.player !== player) return { error: ERR.UNIT_NOT_OWNED };
  if (unit.hp <= 0) return { error: ERR.UNIT_DEAD };
  return { unit };
}

export function validateOpenActivation(state, player, unitId) {
  if (player !== state.currentPlayer) return { error: ERR.NOT_ACTIVE_PLAYER };
  if (!state.activation) return { error: ERR.NO_ACTIVATION };
  if (state.activation.unitId !== unitId) return { error: ERR.WRONG_ACTIVE_UNIT };
  return validateOwnedLivingUnit(state, player, unitId);
}
