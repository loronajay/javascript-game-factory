import { livingUnits } from "../state/gameState.js";

export function playerHasUnspentUnits(state, player) {
  return livingUnits(state, player).some((unit) => !unit.spent);
}

export function preparePlayerTurn(state, player) {
  for (const unit of livingUnits(state, player)) {
    unit.spent = false;
  }
}

export function determineWinner(state) {
  const player1Alive = livingUnits(state, 1).length > 0;
  const player2Alive = livingUnits(state, 2).length > 0;

  if (player1Alive && player2Alive) {
    return null;
  }

  return player1Alive ? 1 : 2;
}
