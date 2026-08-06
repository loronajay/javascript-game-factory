// Results-screen presentation for the online session's availability/consent handshake.
export function createResultsRematch({ rematchBtn, statusEl, startMatch = () => {} } = {}) {
  let activeConfig = null;
  let activeNet = null;
  let starting = false;

  function setStatus(text = "") {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !text;
  }

  function sync({
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
      setStatus("An opponent left the results screen. Rematch is unavailable.");
    } else if (localRequested) {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "Rematch Requested";
      setStatus("Waiting for every opponent to accept the rematch...");
    } else if (opponentRequested && available) {
      rematchBtn.disabled = false;
      rematchBtn.textContent = "Accept Rematch";
      setStatus("Your opponents want a rematch.");
    } else if (available) {
      rematchBtn.disabled = false;
      rematchBtn.textContent = "Rematch";
      setStatus();
    } else {
      rematchBtn.disabled = true;
      rematchBtn.textContent = "Rematch";
      setStatus("Waiting for your opponents to reach the results screen...");
    }
  }

  function show(config) {
    activeConfig = config ?? null;
    activeNet = null;
    starting = false;
    if (rematchBtn) {
      rematchBtn.textContent = "Rematch";
      rematchBtn.title = "";
    }
    setStatus();
    if (config?.mode !== "online") return;
    if (config.terminated) {
      sync({ opponentUnavailable: true });
      return;
    }
    activeNet = config.net ?? null;
    sync();
    activeNet?.enterResults?.({
      onState: sync,
      onAccepted: ({ seed }) => {
        if (!activeConfig || !activeNet) return;
        starting = true;
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
      sync({ opponentUnavailable: true });
      return false;
    }
    sync({ available: true, localRequested: true });
    return true;
  }

  function onExit() {
    if (activeNet && !starting) activeNet.leaveResults?.();
    activeConfig = null;
    activeNet = null;
    starting = false;
  }

  return { onExit, request, show };
}
