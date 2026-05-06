function defaultSessionRuntimeState() {
  return {
    net: null,
    identity: null,
    connected: false,
    pendingAction: null,
    matchmakingMode: null,
    selectedSide: null,
    searching: false,
    queueCounts: null,
    lobby: null,
    isHost: false,
    profiles: {},
    matchReady: null,
    snapshot: null,
    matchEvents: [],
    lastNotice: ""
  };
}

export function createSessionRuntimeState() {
  return defaultSessionRuntimeState();
}

export function resetSessionRuntimeState(runtime) {
  Object.assign(runtime, defaultSessionRuntimeState());
  return runtime;
}
