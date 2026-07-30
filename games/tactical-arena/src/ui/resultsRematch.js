// Results-screen rematch presentation. The online session owns the handshake;
// this adapter only maps its state onto the button/status and starts the next round.

export function createResultsRematch({
  rematchBtn,
  statusEl,
  startMatch = () => {},
} = {}) {
  let activeConfig = null;
  let activeNet = null;
  let startingRematch = false;

  function setStatus(text = "") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !text;
  }

  function syncOnlineState({
    available = false,
    localRequested = false,
    opponentRequested = false,
    declined = false,
    opponentUnavailable = false,
  } = {}) {
    if (!rematchBtn) return;
    if (declined) {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "Rematch Declined";
      setStatus("Your opponent declined the rematch.");
    } else if (opponentUnavailable) {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "Rematch Unavailable";
      setStatus("Your opponent left the results screen. Rematch is unavailable.");
    } else if (localRequested) {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "Rematch Requested";
      setStatus("Waiting for your opponent to accept the rematch...");
    } else if (opponentRequested && available) {
      rematchBtn.disabled = false;
      rematchBtn.textContent = "Accept Rematch";
      setStatus("Your opponent wants a rematch.");
    } else if (available) {
      rematchBtn.disabled = false;
      rematchBtn.textContent = "Rematch";
      setStatus();
    } else {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "Rematch";
      setStatus("Waiting for your opponent to reach the results screen...");
    }
  }

  function show(config) {
    activeConfig = config ?? null;
    activeNet = null;
    startingRematch = false;
    if (rematchBtn) {
      rematchBtn.textContent = "Rematch";
      rematchBtn.title = "";
    }
    setStatus();
    if (config?.mode !== "online") return;
    if (config.ranked) {
      if (rematchBtn) {
        rematchBtn.disabled = true;
        rematchBtn.title = "Rematches are disabled in Ranked.";
      }
      setStatus("Rematches are disabled in Ranked.");
      return;
    }
    activeNet = config.net ?? null;
    syncOnlineState();
    activeNet?.enterResults?.({
      onState: syncOnlineState,
      onAccepted: ({ seed }) => {
        if (!activeConfig || !activeNet) return;
        startingRematch = true;
        startMatch({ ...activeConfig, net: activeNet, seed });
      },
    });
  }

  function request() {
    if (!activeConfig || !rematchBtn || rematchBtn.disabled) return false;
    if (activeConfig.mode !== "online") {
      startMatch(activeConfig);
      return true;
    }
    const result = activeNet?.requestRematch?.();
    if (!result?.accepted) {
      syncOnlineState({ opponentUnavailable: true });
      return false;
    }
    syncOnlineState({ available: true, localRequested: true });
    return true;
  }

  function onExit() {
    if (activeNet && !startingRematch) activeNet.leaveResults?.();
    activeConfig = null;
    activeNet = null;
    startingRematch = false;
  }

  return { onExit, request, show };
}
