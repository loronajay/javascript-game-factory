function getOpponentSide(side) {
  return side === "blue" ? "red" : "blue";
}

export function getQueueStatusText({ matchmakingMode = "", selectedSide = "", queueCounts = null } = {}) {
  if (matchmakingMode !== "public") {
    return "Private room.";
  }

  if (!queueCounts) {
    return "Checking queue...";
  }

  const opponentSide = getOpponentSide(selectedSide || "blue");
  const count = Number(queueCounts[opponentSide] || 0);
  return `${count} ${opponentSide} player${count === 1 ? "" : "s"} waiting.`;
}

export function getLobbyStatusText({ lobby = null, matchReady = null, now = () => Date.now() } = {}) {
  if (!lobby) {
    return "Connecting...";
  }

  if (matchReady?.startAt) {
    const seconds = Math.max(0, Math.ceil((Number(matchReady.startAt) - Number(now())) / 1000));
    return seconds > 0 ? `Match starts in ${seconds}s...` : "Starting match...";
  }

  if (Number(lobby.playerCount || 0) < 2) {
    return "Waiting for opponent to lock in...";
  }

  return "Ready to start.";
}

export function buildLobbyActionHint({ lobby = null, isHost = false, matchReady = null } = {}) {
  if (!lobby) {
    return "Connecting to the match room...";
  }

  if (matchReady?.startAt) {
    return "Authoritative sync is live. Stand by for board reveal.";
  }

  if (Number(lobby.playerCount || 0) < 2) {
    return "Your opponent still needs to lock in and join this room.";
  }

  if (isHost) {
    return "Both players must Ready Up. Once both are locked, the host can start the match.";
  }

  return "Both players must Ready Up. The host can start once both players are locked.";
}

export function buildLobbyStartActionState({
  isHost = false,
  lobby = null,
  startRequested = false
} = {}) {
  const ready = Number(lobby?.playerCount || 0) >= 2;
  return {
    hidden: !isHost,
    disabled: !isHost || !ready || startRequested,
    text: startRequested ? "Starting..." : "Start Match"
  };
}
