export function getLobbyStatusText(lobby, now = Date.now()) {
  if (!lobby) return "Connecting...";

  const status = lobby.status || "open";
  const startAt = Number(lobby.startAt || 0);

  if (status === "ended") {
    return "Match finished.";
  }

  if ((status === "countdown" || status === "started") && startAt > 0) {
    const seconds = Math.max(0, Math.ceil((startAt - now) / 1000));
    if (status === "started") {
      return seconds > 0 ? `Match starts in ${seconds}s...` : "Starting match...";
    }
    return seconds > 0 ? `Minimum reached. Match starts in ${seconds}s...` : "Starting match...";
  }

  if ((lobby.playerCount || 0) < lobby.minPlayers) {
    return `Waiting for ${lobby.minPlayers - lobby.playerCount} more player${lobby.minPlayers - lobby.playerCount === 1 ? "" : "s"}...`;
  }

  return "Ready to start.";
}

export function buildLobbyStartButtonState({
  lobby,
  myClientId = null,
  startRequested = false,
  now = Date.now(),
} = {}) {
  const isOwner = lobby?.ownerId === myClientId;
  const ready = Number(lobby?.playerCount || 0) >= Number(lobby?.minPlayers || 2);
  const status = lobby?.status || "open";
  const startAt = Number(lobby?.startAt || 0);
  const ended = status === "ended";
  const hasVisibleStartCountdown = (status === "countdown" || status === "started") && startAt > now;
  const starting = !ended && (startRequested || status === "countdown" || status === "started");

  let text = "Start Now";
  if (ended) {
    text = "Match Finished";
  } else if (hasVisibleStartCountdown) {
    const seconds = Math.max(0, Math.ceil((startAt - now) / 1000));
    text = `Starting in ${seconds}s...`;
  } else if (starting) {
    text = "Starting Match...";
  }

  return {
    hidden: !isOwner,
    disabled: ended || !ready || starting,
    text,
    ariaBusy: starting ? "true" : "false",
  };
}
