import { PHASES } from "./config.js";

export function shouldPreserveResultsScreen({ authorityMode = null, state = null } = {}) {
  return authorityMode === "server"
    && state?.mode === "online"
    && state?.phase === PHASES.MATCH_OVER;
}

export function shouldResetStartRequest({ lobbyStatus = "", state = null } = {}) {
  return lobbyStatus === "ended" || state?.phase === PHASES.MATCH_OVER;
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
