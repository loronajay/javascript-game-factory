// Canonical rejection codes returned by the reducer.
//
// A rejected command never mutates state. The controller maps these codes into
// player-facing messages; the online host returns them verbatim so the joining
// client can react without trusting its own legality check.

export const ERR = Object.freeze({
  // Command envelope problems.
  INVALID_COMMAND: "INVALID_COMMAND",
  UNKNOWN_COMMAND: "UNKNOWN_COMMAND",

  // Turn / match ownership.
  NOT_ACTIVE_PLAYER: "NOT_ACTIVE_PLAYER",
  MATCH_COMPLETE: "MATCH_COMPLETE",

  // Unit / activation problems.
  UNIT_NOT_FOUND: "UNIT_NOT_FOUND",
  UNIT_DEAD: "UNIT_DEAD",
  UNIT_SPENT: "UNIT_SPENT",
  UNIT_NOT_OWNED: "UNIT_NOT_OWNED",
  ACTIVATION_ALREADY_OPEN: "ACTIVATION_ALREADY_OPEN",
  NO_ACTIVATION: "NO_ACTIVATION",
  WRONG_ACTIVE_UNIT: "WRONG_ACTIVE_UNIT",

  // Movement.
  MOVE_ALREADY_USED: "MOVE_ALREADY_USED",
  MOVE_OUT_OF_RANGE: "MOVE_OUT_OF_RANGE",
  MOVE_BLOCKED: "MOVE_BLOCKED",

  // Cancel move.
  CANCEL_NOT_AVAILABLE: "CANCEL_NOT_AVAILABLE",

  // Primary actions.
  PRIMARY_ALREADY_USED: "PRIMARY_ALREADY_USED",
  TARGET_OUT_OF_RANGE: "TARGET_OUT_OF_RANGE",
  TARGET_BLOCKED: "TARGET_BLOCKED",
  INVALID_TARGET: "INVALID_TARGET",
  GUARD_TANK_ONLY: "GUARD_TANK_ONLY",
  TARGET_ALREADY_GUARDED: "TARGET_ALREADY_GUARDED",
  DEFEND_NOT_AVAILABLE: "DEFEND_NOT_AVAILABLE",

  // Finish.
  FINISH_REQUIRES_ACTION: "FINISH_REQUIRES_ACTION",
});
