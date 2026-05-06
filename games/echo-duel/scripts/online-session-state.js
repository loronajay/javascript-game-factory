import { PHASES } from "./config.js";

export function shouldPreserveResultsScreen({ authorityMode = null, state = null } = {}) {
  return authorityMode === "server"
    && state?.mode === "online"
    && state?.phase === PHASES.MATCH_OVER;
}

export function shouldResetStartRequest({ lobbyStatus = "", lobbyStartAt = null, state = null } = {}) {
  return lobbyStatus === "open"
    || lobbyStatus === "ended"
    || (!lobbyStartAt && lobbyStatus !== "started")
    || state?.phase === PHASES.MATCH_OVER;
}

export function shouldCloseMatchToMenuOnPlayerLeft({
  authorityMode = null,
  onlineStarted = false,
  payload = null,
  state = null,
} = {}) {
  return authorityMode === "server"
    && !!onlineStarted
    && state?.mode === "online"
    && state?.phase !== PHASES.MATCH_OVER
    && Number(payload?.playerCount || 0) < 2;
}
