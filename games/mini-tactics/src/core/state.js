// Authoritative, serializable match state and its selectors.
//
// This is the only state the reducer mutates and the only state sent over the
// network. It deliberately excludes UI concerns (selected unit, action mode,
// legal-tile highlight set, animation lock). Those live on the controller as
// throwaway local state. Keeping them out of here is what lets the same state
// drive a headless test, a CPU search, and an online host with no DOM.

import { BOARD_SIZES, DEFAULT_BOARD_SIZE } from "../config.js";
import { createInitialUnits } from "../state/gameState.js";
import { createRoster } from "./roster.js";
import { createRngState } from "./rng.js";

export const SCHEMA_VERSION = 1;

export function createMatchState({
  size = DEFAULT_BOARD_SIZE,
  seed = 1,
  mode = "local",
  matchId = null,
  // Roster controls: supply an explicit `players` roster, or describe the match
  // and let createRoster build it. Defaults reproduce the classic two-player duel.
  players = null,
  playerCount = 2,
  format = "ffa",
  teams = null,
  colors = null,
  teamColors = null,
  // Optional display-only custom team/player names keyed by team id. Purely
  // cosmetic — naming never affects rule resolution. Falls back to "Team N" /
  // "Player N" wherever an entry is missing (see render/labels.js).
  teamNames = null,
} = {}) {
  const boardSize = Number(size);

  if (!BOARD_SIZES.includes(boardSize)) {
    throw new Error(`Unsupported board size: ${size}`);
  }

  const roster =
    players ?? createRoster({ playerCount, format, teams, colors, teamColors });

  return {
    schemaVersion: SCHEMA_VERSION,
    matchId,
    mode,
    size: boardSize,
    phase: "playing",
    revision: 0,
    turnNumber: 1,
    // `format` ("ffa" | "teams") is carried so UI surfaces can word victory as a
    // team or a player. It does not affect rule resolution — team membership does.
    format,
    teamNames: normalizeTeamNames(teamNames),
    // Authoritative seating: `players` is the roster, `turnOrder` is the seat
    // sequence the reducer walks (skipping eliminated players).
    players: roster,
    turnOrder: roster.map((slot) => slot.id),
    currentPlayer: roster[0].id,
    units: createInitialUnits(boardSize, roster),
    activation: null,
    winner: null,
    victoryReason: null,
    rngState: createRngState(seed),
  };
}

// Keep only non-empty, trimmed, length-capped names keyed by numeric team id.
// Returns null when nothing usable is supplied so the default labels apply.
const MAX_TEAM_NAME_LENGTH = 20;
function normalizeTeamNames(names) {
  if (!names || typeof names !== "object") return null;
  const cleaned = {};
  for (const [key, value] of Object.entries(names)) {
    const trimmed = String(value ?? "").trim().slice(0, MAX_TEAM_NAME_LENGTH);
    if (trimmed) cleaned[key] = trimmed;
  }
  return Object.keys(cleaned).length ? cleaned : null;
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
