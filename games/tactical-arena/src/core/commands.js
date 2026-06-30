export const COMMANDS = Object.freeze({
  BEGIN_ACTIVATION: "BEGIN_ACTIVATION",
  MOVE_UNIT: "MOVE_UNIT",
  ATTACK: "ATTACK",
  DEFEND: "DEFEND",
  USE_ART: "USE_ART",
  FINISH_ACTIVATION: "FINISH_ACTIVATION",
  CONCEDE: "CONCEDE"
});

export const beginActivation = (player, unitId) => ({ type: COMMANDS.BEGIN_ACTIVATION, player, unitId });
export const moveUnit = (player, unitId, x, y) => ({ type: COMMANDS.MOVE_UNIT, player, unitId, position: { x, y } });
// `rolls` optionally pins the to-hit/crit draws ({ attackRoll, critRoll }) for
// deterministic tests and recorded replay; live play omits it and the reducer
// draws from the authoritative seed.
export const attack = (player, actorId, targetId, rolls = {}) => ({ type: COMMANDS.ATTACK, player, actorId, targetId, ...rolls });
// Attacking a Build Cover wall: same ATTACK command, but the target is a tile (the
// wall) rather than a unit. Walls are inert, so this never rolls to-hit.
export const attackTile = (player, actorId, x, y) => ({ type: COMMANDS.ATTACK, player, actorId, targetPosition: { x, y } });
export const defend = (player, unitId) => ({ type: COMMANDS.DEFEND, player, unitId });
export const useArt = (player, unitId, artId, options = []) => {
  const targeting = Array.isArray(options) ? { path: options } : options;
  return { type: COMMANDS.USE_ART, player, unitId, artId, ...targeting };
};
export const finishActivation = (player, unitId) => ({ type: COMMANDS.FINISH_ACTIVATION, player, unitId });
// A player resigns: every one of their living units drops out. In a duel this hands
// victory to the opponent immediately. Online, a mid-match disconnect is modelled by
// the surviving lobby owner injecting this command for the departed seat into the
// same ordered command stream, so every client resolves it deterministically.
export const concede = (player) => ({ type: COMMANDS.CONCEDE, player });
