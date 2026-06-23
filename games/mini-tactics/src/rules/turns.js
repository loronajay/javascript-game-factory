import { livingUnits, teamOf } from "../state/gameState.js";

export function playerHasUnspentUnits(state, player) {
  return livingUnits(state, player).some((unit) => !unit.spent);
}

export function preparePlayerTurn(state, player) {
  for (const unit of livingUnits(state, player)) {
    unit.spent = false;
  }
}

// The next player in seat order who still has living units, wrapping around.
// Eliminated players are skipped so a 3-4 player game closes ranks cleanly.
// Falls back to a 1,2 order for any state built without an explicit turnOrder.
export function nextActivePlayer(state, fromPlayer) {
  const order = Array.isArray(state.turnOrder) ? state.turnOrder : [1, 2];
  const startIndex = order.indexOf(fromPlayer);

  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(startIndex + step) % order.length];
    if (livingUnits(state, candidate).length > 0) {
      return candidate;
    }
  }

  // Only the from-player remains (the caller resolves victory separately).
  return fromPlayer;
}

// The match is decided when one team is left standing. Returns the surviving
// TEAM id (which equals the player id in free-for-all, where each player is its
// own team), or null while two or more teams remain.
export function determineWinner(state) {
  const livingTeams = new Set(
    livingUnits(state).map((unit) => teamOf(state, unit.player))
  );

  if (livingTeams.size !== 1) {
    return null;
  }

  return [...livingTeams][0];
}
