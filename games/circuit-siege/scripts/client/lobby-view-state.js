function getOpponentSide(side) {
  return side === "blue" ? "red" : "blue";
}

export function getQueueStatusText({
  matchmakingMode = "",
  selectedSide = "",
  queueCounts = null,
  lobbyPhase = "main"
} = {}) {
  if (lobbyPhase !== "main" && lobbyPhase !== "searching") {
    return "";
  }

  if (matchmakingMode !== "public") {
    return "";
  }

  if (!queueCounts) {
    return "Checking queue...";
  }

  const opponentSide = getOpponentSide(selectedSide || "blue");
  const count = Number(queueCounts[opponentSide] || 0);
  return `${count} ${opponentSide} player${count === 1 ? "" : "s"} waiting.`;
}

export function getLobbyStatusText({
  lobby = null,
  matchReady = null,
  lobbyPhase = "main",
  selectedSide = "blue",
  now = () => Date.now()
} = {}) {
  const opponentSide = getOpponentSide(selectedSide);

  if (lobbyPhase === "main") {
    return `${selectedSide === "blue" ? "Blue" : "Red"} side selected.`;
  }

  if (lobbyPhase === "searching") {
    return `Searching for a ${opponentSide} player...`;
  }

  if (lobbyPhase === "friend_options") {
    return "Choose how to connect with your opponent.";
  }

  if (lobbyPhase === "join") {
    return "Enter your friend's room code.";
  }

  if (!lobby) {
    return "Connecting...";
  }

  if (matchReady?.startAt) {
    const seconds = Math.max(0, Math.ceil((Number(matchReady.startAt) - Number(now())) / 1000));
    return seconds > 0 ? `Match starts in ${seconds}s...` : "Starting match...";
  }

  if (Number(lobby.playerCount || 0) < 2) {
    return "Waiting for opponent to join...";
  }

  return "Ready to start.";
}

export function buildLobbyActionHint({
  lobby = null,
  isHost = false,
  matchReady = null,
  lobbyPhase = "main",
  selectedSide = "blue"
} = {}) {
  const opponentSide = getOpponentSide(selectedSide);

  if (lobbyPhase === "main") {
    return `Find a public ${opponentSide} opponent or open a private room.`;
  }

  if (lobbyPhase === "searching") {
    return "You can cancel search at any time before a room is formed.";
  }

  if (lobbyPhase === "friend_options") {
    return "Create a room to share a code, or enter one you already have.";
  }

  if (lobbyPhase === "join") {
    return "Room codes are uppercase and can be up to eight characters.";
  }

  if (!lobby) {
    return "Connecting to the match room...";
  }

  if (matchReady?.startAt) {
    return "Authoritative sync is live. Stand by for board reveal.";
  }

  if (Number(lobby.playerCount || 0) < 2) {
    return "Your opponent still needs to join this room.";
  }

  if (isHost) {
    return "Both players must Ready Up. The host can start once both players are ready.";
  }

  return "Both players must Ready Up. Wait for the host to start once both players are ready.";
}

export function buildLobbyStartActionState({
  isHost = false,
  lobby = null,
  startRequested = false,
  lobbyPhase = "main"
} = {}) {
  if (lobbyPhase !== "room") {
    return {
      hidden: true,
      disabled: true,
      text: "Start Match"
    };
  }

  const ready = Number(lobby?.playerCount || 0) >= 2;
  return {
    hidden: !isHost,
    disabled: !isHost || !ready || startRequested,
    text: startRequested ? "Starting..." : "Start Match"
  };
}
