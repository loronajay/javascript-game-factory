export function makeServerUrl(locationLike) {
  const secure = locationLike.protocol === "https:";
  const host = locationLike.hostname || "localhost";
  return `${secure ? "wss" : "ws"}://${host}:3000`;
}

export function deriveDisplayScreen(state) {
  if (state.match) return "match";
  if (state.lobby) return "lobby";
  return "catalog";
}

export function deriveControllerScreen(state) {
  if (state.reconnecting) return "reconnect";
  if (!state.match && !state.lobby) return "join";
  if (!state.match) return "lobby";
  if (state.match.phase?.includes("vault_action") && state.me?.status === "active") return "vault_action";
  if (state.match.phase?.includes("vote") || state.match.phase?.includes("discussion")) return "vote";
  return "waiting";
}
