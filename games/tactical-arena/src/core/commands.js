export const COMMANDS = Object.freeze({
  BEGIN_ACTIVATION: "BEGIN_ACTIVATION",
  MOVE_UNIT: "MOVE_UNIT",
  ATTACK: "ATTACK",
  DEFEND: "DEFEND",
  USE_ART: "USE_ART",
  FINISH_ACTIVATION: "FINISH_ACTIVATION"
});

export const beginActivation = (player, unitId) => ({ type: COMMANDS.BEGIN_ACTIVATION, player, unitId });
export const moveUnit = (player, unitId, x, y) => ({ type: COMMANDS.MOVE_UNIT, player, unitId, position: { x, y } });
export const attack = (player, actorId, targetId) => ({ type: COMMANDS.ATTACK, player, actorId, targetId });
export const defend = (player, unitId) => ({ type: COMMANDS.DEFEND, player, unitId });
export const useArt = (player, unitId, artId, path = []) => ({ type: COMMANDS.USE_ART, player, unitId, artId, path });
export const finishActivation = (player, unitId) => ({ type: COMMANDS.FINISH_ACTIVATION, player, unitId });
