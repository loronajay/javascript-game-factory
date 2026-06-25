export function teamColor(player) {
  return player === 1 ? "#5288c6" : "#c4463f";
}

export function hpRemaining(state, player) {
  return state.units
    .filter((u) => u.player === player)
    .reduce((sum, u) => sum + Math.max(0, u.hp), 0);
}

// Map squad compositions onto the four-cell corner spawn blocks. The first two
// slots preserve the original 2v2 staging, and the extra pair fills the block.
export function buildRoster(squads, size) {
  const slots = {
    1: [
      { x: 1, y: size - 1 },
      { x: 0, y: size - 2 },
      { x: 0, y: size - 1 },
      { x: 1, y: size - 2 }
    ],
    2: [
      { x: size - 2, y: 0 },
      { x: size - 1, y: 1 },
      { x: size - 1, y: 0 },
      { x: size - 2, y: 1 }
    ]
  };
  const units = [];
  for (const player of [1, 2]) {
    squads[player].slice(0, slots[player].length).forEach((type, i) => {
      units.push({ id: `p${player}-${i}-${type}`, player, type, x: slots[player][i].x, y: slots[player][i].y });
    });
  }
  return units;
}

export function buildSummary(state, { matchStartedAt, initialHpByPlayer }) {
  const remaining = (player) => state.units
    .filter((u) => u.player === player)
    .reduce((sum, u) => sum + Math.max(0, u.hp), 0);

  const teams = [1, 2].map((player) => {
    const units = state.units.filter((u) => u.player === player);
    const opponent = player === 1 ? 2 : 1;
    return {
      player,
      label: `Player ${player}`,
      color: teamColor(player),
      isWinner: player === state.winner,
      unitsAlive: units.filter((u) => u.hp > 0).length,
      unitsTotal: units.length,
      hpRemaining: remaining(player),
      hpTotal: initialHpByPlayer[player],
      damageDealt: Math.max(0, initialHpByPlayer[opponent] - remaining(opponent)),
      kills: state.units.filter((u) => u.player === opponent && u.hp <= 0).length
    };
  }).sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

  return {
    winner: state.winner,
    size: state.size,
    turns: state.turnNumber,
    durationMs: Date.now() - matchStartedAt,
    teams
  };
}

export function readableError(errorCode) {
  return ({
    ART_NOT_AVAILABLE: "ARTS must be chosen before moving or attacking, with enough MP.",
    INVALID_ART_PATH: "Footwork must use its full unique orthogonal path and finish on empty ground.",
    MOVE_OUT_OF_RANGE: "That tile is not reachable this activation.",
    TARGET_OUT_OF_RANGE: "That target is beyond attack range.",
    PRIMARY_ALREADY_USED: "This unit has already taken its primary action.",
    FINISH_REQUIRES_ACTION: "Attack or defend before finishing this activation."
  })[errorCode] ?? "That action is not legal right now.";
}
