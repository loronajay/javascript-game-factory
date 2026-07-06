import { findUnit } from "./state.js";
import { getUnitType } from "./unitCatalog.js";
import { ERR } from "./reducerResult.js";

// True while this player owns a living, not-yet-commanded acts-first King. He is
// forced to issue his command before any of his squadmates may begin.
export function commanderPending(state, player) {
  return state.units.some((unit) =>
    unit.hp > 0 && unit.player === player &&
    getUnitType(unit.type).actsFirst &&
    unit.commandTurn !== state.turnNumber);
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
