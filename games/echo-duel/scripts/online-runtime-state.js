function defaultOnlineRuntimeState() {
  return {
    net: null,
    lobby: null,
    profiles: {},
    identity: null,
    isHost: false,
    authorityMode: null,
    started: false,
    startRequested: false,
    outboundStateSeq: 0,
    inboundStateSeq: 0,
    lobbyCountdownTimer: null,
    pendingMatchStartTimer: null,
    pendingAction: null,
    findingPublic: false,
    publicSearchTimer: null,
  };
}

export function createOnlineRuntimeState() {
  return defaultOnlineRuntimeState();
}

export function resetOnlineRuntimeState(online) {
  Object.assign(online, defaultOnlineRuntimeState());
  return online;
}

export function mergeLobbySnapshot(currentLobby, payload) {
  return { ...(currentLobby || {}), ...(payload || {}) };
}

export function applyPlayerLeftToLobby(currentLobby, payload = {}) {
  const next = mergeLobbySnapshot(currentLobby, payload);
  next.members = Array.isArray(currentLobby?.members)
    ? currentLobby.members.filter((memberId) => memberId !== payload.clientId)
    : currentLobby?.members;
  return next;
}

export function buildPlayersFromLobby({
  lobby,
  profiles = {},
  localClientId = null,
  identity = null,
} = {}) {
  const members = Array.isArray(lobby?.members) ? lobby.members : [];
  return members.map((clientId, index) => ({
    id: clientId,
    clientId,
    name: profiles[clientId]?.displayName
      || (clientId === localClientId ? identity?.displayName : "")
      || `Player ${index + 1}`,
  }));
}

export function shouldTickLobbyCountdown(lobby, now = Date.now()) {
  if (!lobby) return false;
  const status = lobby.status;
  const startAt = Number(lobby.startAt || 0);
  return (status === "countdown" || status === "started") && startAt > now;
}
