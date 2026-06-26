// Command vocabulary shared by every mode (hot seat, CPU, online host/joiner).
//
// A command is a plain serializable object: { type, player, ...payload }.
// `player` is the side issuing the command (1 or 2). The reducer validates that
// the issuing player is allowed to act before applying anything. Selection and
// hover are NOT commands — they are local UI state and never authoritative.

export const COMMANDS = Object.freeze({
  BEGIN_ACTIVATION: "BEGIN_ACTIVATION",
  MOVE_UNIT: "MOVE_UNIT",
  CANCEL_MOVE: "CANCEL_MOVE",
  ATTACK: "ATTACK",
  HEAL: "HEAL",
  GUARD: "GUARD",
  DEFEND: "DEFEND",
  FINISH_ACTIVATION: "FINISH_ACTIVATION",
  CONCEDE: "CONCEDE",
});

export function beginActivation(player, unitId) {
  return { type: COMMANDS.BEGIN_ACTIVATION, player, unitId };
}

export function moveUnit(player, unitId, x, y) {
  return { type: COMMANDS.MOVE_UNIT, player, unitId, x, y };
}

export function cancelMove(player, unitId) {
  return { type: COMMANDS.CANCEL_MOVE, player, unitId };
}

export function attack(player, actorId, targetId) {
  return { type: COMMANDS.ATTACK, player, actorId, targetId };
}

export function heal(player, actorId, targetId) {
  return { type: COMMANDS.HEAL, player, actorId, targetId };
}

export function guard(player, unitId, targetId) {
  return { type: COMMANDS.GUARD, player, unitId, targetId };
}

export function defend(player, unitId) {
  return { type: COMMANDS.DEFEND, player, unitId };
}

export function finishActivation(player, unitId) {
  return { type: COMMANDS.FINISH_ACTIVATION, player, unitId };
}

export function concede(player) {
  return { type: COMMANDS.CONCEDE, player };
}
