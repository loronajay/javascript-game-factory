// Two-player result-screen handshake, kept independent from combat and rendering.
export function createRematchFlow(options = {}) {
  const sendState = options.sendState ?? (() => {});
  const sendStart = options.sendStart ?? (() => {});
  const isCoordinator = options.isCoordinator ?? (() => false);
  const buildStart = options.buildStart ?? ((round) => ({ round }));
  const onState = options.onState ?? (() => {});
  const onAccepted = options.onAccepted ?? (() => {});
  let active = false, round = 0, localAvailable = false, localRequested = false;
  let remoteAvailable = false, remoteRequested = false, declined = false, starting = false;

  const snapshot = (extra = {}) => ({
    available: active && localAvailable && remoteAvailable,
    localRequested,
    opponentRequested: remoteRequested,
    declined,
    opponentUnavailable: active && !remoteAvailable && declined,
    starting,
    disabled: false,
    ...extra,
  });
  const notify = (extra) => { const state = snapshot(extra); onState(state); return state; };
  const accept = (start) => {
    if (starting) return false;
    starting = true; active = false; notify(); onAccepted(start); return true;
  };
  const maybeStart = () => {
    if (!active || starting || !localAvailable || !remoteAvailable
        || !localRequested || !remoteRequested || !isCoordinator()) return false;
    const start = buildStart(round + 1);
    if (!start || Number(start.round) !== round + 1) return false;
    sendStart(start);
    return accept(start);
  };
  function enterResults({ round: nextRound = 0, enabled = true } = {}) {
    round = Math.max(0, Math.floor(Number(nextRound) || 0));
    active = Boolean(enabled); localAvailable = active; localRequested = false;
    remoteAvailable = false; remoteRequested = false; declined = false; starting = false;
    if (!active) { notify({ disabled: true }); return false; }
    sendState({ round, available: true, requested: false }); notify(); return true;
  }
  function receiveState(state = {}) {
    if (!active || Number(state.round) !== round
        || typeof state.available !== "boolean" || typeof state.requested !== "boolean") return false;
    remoteAvailable = state.available;
    remoteRequested = state.available && state.requested;
    if (!remoteAvailable && localRequested) declined = true;
    notify(); maybeStart(); return true;
  }
  function request() {
    if (!active || !localAvailable || !remoteAvailable || starting) {
      return { accepted: false, reason: "unavailable" };
    }
    if (!localRequested) {
      localRequested = true;
      sendState({ round, available: true, requested: true });
      notify(); maybeStart();
    }
    return { accepted: true, waiting: !starting };
  }
  function receiveStart(start = {}) {
    if (!active || starting || Number(start.round) !== round + 1
        || !localRequested || !remoteRequested || !localAvailable || !remoteAvailable) return false;
    return accept(start);
  }
  function leaveResults() {
    if (active && !starting) sendState({ round, available: false, requested: false });
    active = false; localAvailable = false; localRequested = false; notify();
  }
  return { enterResults, leaveResults, receiveStart, receiveState, request, snapshot };
}
