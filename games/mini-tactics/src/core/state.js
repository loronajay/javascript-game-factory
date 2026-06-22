// Authoritative, serializable match state and its selectors.
//
// This is the only state the reducer mutates and the only state sent over the
// network. It deliberately excludes UI concerns (selected unit, action mode,
// legal-tile highlight set, animation lock). Those live on the controller as
// throwaway local state. Keeping them out of here is what lets the same state
// drive a headless test, a CPU search, and an online host with no DOM.

import { BOARD_SIZES, DEFAULT_BOARD_SIZE } from "../config.js";
import { createInitialUnits } from "../state/gameState.js";
import { createRngState } from "./rng.js";

export const SCHEMA_VERSION = 1;

export function createMatchState({
  size = DEFAULT_BOARD_SIZE,
  seed = 1,
  mode = "local",
  matchId = null,
} = {}) {
  const boardSize = Number(size);

  if (!BOARD_SIZES.includes(boardSize)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    matchId,
    mode,
    size: boardSize,
    phase: "playing",
    revision: 0,
    turnNumber: 1,
    currentPlayer: 1,
    units: createInitialUnits(boardSize),
    activation: null,
    winner: null,
    victoryReason: null,
    rngState: createRngState(seed),
  };
}

// Deep clone of the mutable parts. The reducer always works on a clone so a
// rejected command leaves the caller's state untouched and every accepted
// result is a fresh object (no aliasing between revisions).
export function cloneState(state) {
  return {
    ...state,
    units: state.units.map((unit) => ({ ...unit })),
    activation: state.activation
      ? { ...state.activation, origin: { ...state.activation.origin } }
      : null,
  };
}

// Round-trip a state through JSON. Used for the online wire and for the
// determinism test that proves a serialized state restores without changing
// legal actions.
export function serializeState(state) {
  return JSON.stringify(state);
}

export function deserializeState(json) {
  return typeof json === "string" ? JSON.parse(json) : structuredCloneish(json);
}

function structuredCloneish(value) {
  return JSON.parse(JSON.stringify(value));
}

export function findUnit(state, id) {
  return state.units.find((unit) => unit.id === id) ?? null;
}

export function getActivationUnit(state) {
  return state.activation ? findUnit(state, state.activation.unitId) : null;
}
