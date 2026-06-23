// Event vocabulary emitted by accepted commands.
//
// Events are the authoritative record of what happened. The renderer animates
// from them, and the online host broadcasts them to the joining client so both
// sides animate identical outcomes (including the resolved die roll). Replaying
// an event log reproduces the same final state, so events double as the basis
// for future replay support.

export const EVENTS = Object.freeze({
  ACTIVATION_BEGAN: "ACTIVATION_BEGAN",
  UNIT_MOVED: "UNIT_MOVED",
  MOVE_CANCELLED: "MOVE_CANCELLED",
  ATTACK_RESOLVED: "ATTACK_RESOLVED",
  HEAL_RESOLVED: "HEAL_RESOLVED",
  UNIT_DEFENDED: "UNIT_DEFENDED",
  UNIT_ELIMINATED: "UNIT_ELIMINATED",
  ACTIVATION_FINISHED: "ACTIVATION_FINISHED",
  TURN_CHANGED: "TURN_CHANGED",
  PLAYER_CONCEDED: "PLAYER_CONCEDED",
  MATCH_COMPLETE: "MATCH_COMPLETE",
});

export const VICTORY_REASON = Object.freeze({
  SQUAD_ELIMINATED: "squad-eliminated",
  CONCEDE: "concede",
  DISCONNECT: "disconnect",
  TIMEOUT: "timeout",
});
