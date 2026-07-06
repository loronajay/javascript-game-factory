export const ERR = Object.freeze({
  INVALID_COMMAND: "INVALID_COMMAND",
  NOT_ACTIVE_PLAYER: "NOT_ACTIVE_PLAYER",
  UNIT_NOT_FOUND: "UNIT_NOT_FOUND",
  UNIT_NOT_OWNED: "UNIT_NOT_OWNED",
  UNIT_DEAD: "UNIT_DEAD",
  UNIT_SPENT: "UNIT_SPENT",
  ACTIVATION_ALREADY_OPEN: "ACTIVATION_ALREADY_OPEN",
  NO_ACTIVATION: "NO_ACTIVATION",
  WRONG_ACTIVE_UNIT: "WRONG_ACTIVE_UNIT",
  MOVE_ALREADY_USED: "MOVE_ALREADY_USED",
  MOVE_OUT_OF_RANGE: "MOVE_OUT_OF_RANGE",
  CANCEL_NOT_AVAILABLE: "CANCEL_NOT_AVAILABLE",
  PRIMARY_ALREADY_USED: "PRIMARY_ALREADY_USED",
  INVALID_TARGET: "INVALID_TARGET",
  TARGET_OUT_OF_RANGE: "TARGET_OUT_OF_RANGE",
  ART_NOT_AVAILABLE: "ART_NOT_AVAILABLE",
  TARGET_OBSTRUCTED: "TARGET_OBSTRUCTED",
  INVALID_ART_PATH: "INVALID_ART_PATH",
  FINISH_REQUIRES_ACTION: "FINISH_REQUIRES_ACTION",
  SUMMON_LIMIT: "SUMMON_LIMIT",
  KING_MUST_ACT_FIRST: "KING_MUST_ACT_FIRST",
  COMMANDER_CANNOT_ACT: "COMMANDER_CANNOT_ACT"
});

export const reject = (errorCode) => ({ accepted: false, errorCode });

// Surface any rollover side-effects the turn flip queued onto the state, then clear
// them so they never persist into the returned state or a clone.
export const accept = (nextState, events = []) => {
  // Every accepted command bumps the monotonic revision. This is the single increment
  // point for lockstep sequencing and is excluded from the state hash.
  nextState.revision = (nextState.revision ?? 0) + 1;
  const rollover = nextState.pendingRolloverEvents;
  if (rollover) delete nextState.pendingRolloverEvents;
  return { accepted: true, nextState, events: rollover ? [...events, ...rollover] : events };
};
